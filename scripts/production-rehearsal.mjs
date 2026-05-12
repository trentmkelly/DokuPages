#!/usr/bin/env node
/* global fetch */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommand } from "./backup-utils.mjs";

const DEFAULT_SOURCE = "../dokuwiki";
const DEFAULT_DATABASE = "dokuwiki_pages_dev";
const DEFAULT_BUCKET = "dokuwiki-pages-dev-media";
const DEFAULT_BASE_URL = "https://dokutest.pages.dev";
const DEFAULT_WORK_DIR = ".wrangler/production-rehearsal";
const REQUIRED_STORAGE_CHECKS = ["d1", "kv", "r2", "durableObjects"];
const REQUIRED_BINDINGS = [
  ["d1", "D1"],
  ["r2", "R2"],
  ["kv", "KV"],
  ["durableObjects", "Durable Object"]
];

export function parseProductionRehearsalArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    database: DEFAULT_DATABASE,
    bucket: DEFAULT_BUCKET,
    baseUrl: DEFAULT_BASE_URL,
    workDir: DEFAULT_WORK_DIR,
    backup: "",
    report: "",
    yes: false,
    dryRun: false,
    skipAlerts: false,
    skipSmoke: false,
    skipRollback: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = argv[++index] ?? "";
    } else if (arg === "--database") {
      args.database = argv[++index] ?? "";
    } else if (arg === "--bucket") {
      args.bucket = argv[++index] ?? "";
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] ?? "";
    } else if (arg === "--work-dir") {
      args.workDir = argv[++index] ?? "";
    } else if (arg === "--backup") {
      args.backup = argv[++index] ?? "";
    } else if (arg === "--report") {
      args.report = argv[++index] ?? "";
    } else if (arg === "--yes") {
      args.yes = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-alerts") {
      args.skipAlerts = true;
    } else if (arg === "--skip-smoke") {
      args.skipSmoke = true;
    } else if (arg === "--skip-rollback") {
      args.skipRollback = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.help) {
    for (const [key, label] of [
      ["source", "--source"],
      ["database", "--database"],
      ["bucket", "--bucket"],
      ["baseUrl", "--base-url"],
      ["workDir", "--work-dir"]
    ]) {
      if (!args[key]) throw new Error(`${label} is required.`);
    }
  }

  return args;
}

export function buildProductionRehearsalPlan(args) {
  const backupDir = args.backup || path.join(args.workDir, "pre-import-backup");
  const reportPath = args.report || path.join(args.workDir, "production-rehearsal-report.json");
  const importSql = path.join(args.workDir, "dokuwiki-import.sql");
  const mediaManifest = path.join(args.workDir, "dokuwiki-media-manifest.json");
  const hashManifest = path.join(args.workDir, "dokuwiki-hash-manifest.json");
  const backupReport = path.join(args.workDir, "backup-verification.json");

  const steps = [
    commandStep(
      "final-source-import-artifacts",
      "Generate final import SQL, media manifest, and hash manifest from the frozen source tree.",
      "node",
      [
        "scripts/import-dokuwiki.mjs",
        "--source",
        args.source,
        "--dry-run",
        "--sql-out",
        importSql,
        "--media-manifest-out",
        mediaManifest,
        "--hash-manifest-out",
        hashManifest
      ],
      { validates: ["final-source-import"] }
    ),
    commandStep(
      "remote-d1-migrations",
      "Apply pending schema migrations to the remote D1 database before import.",
      "npx",
      ["wrangler", "d1", "migrations", "apply", args.database, "--remote"],
      { mutatesRemote: true, resources: ["D1"] }
    ),
    commandStep(
      "remote-pre-import-backup",
      "Export the remote D1 database and referenced R2 objects before the rehearsal import.",
      "node",
      [
        "scripts/export-cloudflare-backup.mjs",
        "--database",
        args.database,
        "--bucket",
        args.bucket,
        "--remote",
        "--output",
        backupDir
      ],
      { mutatesRemote: false, resources: ["D1", "R2"], rollbackArtifact: true }
    ),
    commandStep(
      "verify-pre-import-backup",
      "Verify the backup manifest, D1 dump, and referenced R2 object files.",
      "node",
      ["scripts/verify-cloudflare-backup.mjs", "--backup", backupDir, "--report", backupReport],
      { validates: ["rollback-artifact"] }
    ),
    commandStep(
      "remote-d1-final-import",
      "Apply the generated final-source SQL to the remote D1 database.",
      "npx",
      ["wrangler", "d1", "execute", args.database, "--remote", "--file", importSql],
      { mutatesRemote: true, resources: ["D1"], validates: ["final-source-import"] }
    ),
    commandStep(
      "remote-r2-final-import",
      "Upload final-source media objects to the remote R2 bucket.",
      "node",
      [
        "scripts/upload-r2-media.mjs",
        "--manifest",
        mediaManifest,
        "--bucket",
        args.bucket,
        "--remote"
      ],
      { mutatesRemote: true, resources: ["R2"], validates: ["final-source-import"] }
    ),
    commandStep(
      "remote-import-hash-verification",
      "Compare final-source hashes against remote D1 rows and R2 objects.",
      "node",
      [
        "scripts/verify-import-hashes.mjs",
        "--manifest",
        hashManifest,
        "--database",
        args.database,
        "--bucket",
        args.bucket,
        "--remote"
      ],
      { resources: ["D1", "R2"], validates: ["import-fidelity"] }
    ),
    {
      id: "remote-diagnostics",
      description: "Fetch /api/diagnostics and require D1, R2, KV, and Durable Object health.",
      kind: "diagnostics",
      resources: ["D1", "R2", "KV", "Durable Object"],
      url: new URL("/api/diagnostics", normalizedBaseUrl(args.baseUrl)).toString(),
      mutatesRemote: false
    }
  ];

  if (!args.skipSmoke) {
    steps.push(
      commandStep(
        "remote-smoke-tests",
        "Run deployed route smoke checks against the Pages target.",
        "node",
        ["scripts/smoke-pages.mjs", "--base-url", args.baseUrl],
        { resources: ["Pages"] }
      )
    );
  }

  if (!args.skipAlerts) {
    steps.push(
      commandStep(
        "remote-alert-checks",
        "Evaluate diagnostics-derived alerts against the Pages target.",
        "node",
        ["scripts/check-alerts.mjs", "--base-url", args.baseUrl],
        { resources: ["D1", "R2", "KV", "Durable Object"] }
      )
    );
  }

  if (!args.skipRollback) {
    steps.push(
      commandStep(
        "local-rollback-restore",
        "Restore the remote pre-import backup into the local D1/R2 target as rollback proof.",
        "node",
        [
          "scripts/restore-cloudflare-backup.mjs",
          "--backup",
          backupDir,
          "--database",
          args.database,
          "--bucket",
          args.bucket,
          "--local",
          "--yes"
        ],
        { validates: ["rollback"], mutatesLocal: true, resources: ["D1", "R2"] }
      )
    );
  }

  return {
    source: args.source,
    database: args.database,
    bucket: args.bucket,
    baseUrl: args.baseUrl,
    workDir: args.workDir,
    backupDir,
    reportPath,
    artifacts: {
      importSql,
      mediaManifest,
      hashManifest,
      backupReport
    },
    steps
  };
}

export function validateDiagnosticsForRehearsal(diagnostics) {
  const issues = [];

  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      ok: false,
      issues: ["Diagnostics response was not an object."]
    };
  }

  if (diagnostics.ok !== true) {
    issues.push("Diagnostics did not report ok=true.");
  }

  for (const [key, label] of REQUIRED_BINDINGS) {
    if (diagnostics.bindings?.[key] !== true) {
      issues.push(`${label} binding is not configured.`);
    }
  }

  for (const key of REQUIRED_STORAGE_CHECKS) {
    const check = diagnostics.storage?.[key];
    if (!check) {
      issues.push(`${key} storage check is missing.`);
      continue;
    }

    if (check.ok !== true || check.status !== "ok") {
      issues.push(`${key} storage check was ${check.status ?? "unknown"}.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

async function main() {
  const args = parseProductionRehearsalArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.dryRun && !args.yes) {
    throw new Error(
      "Pass --yes to run the production rehearsal. The rehearsal applies the final import to remote D1/R2 and restores the backup into local rollback targets."
    );
  }

  const plan = buildProductionRehearsalPlan(args);
  const report = {
    ok: false,
    dryRun: args.dryRun,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    source: path.resolve(args.source),
    database: args.database,
    bucket: args.bucket,
    baseUrl: args.baseUrl,
    workDir: args.workDir,
    backupDir: plan.backupDir,
    artifacts: plan.artifacts,
    steps: []
  };

  await mkdir(args.workDir, { recursive: true });

  try {
    for (const step of plan.steps) {
      const result = await runStep(step, { dryRun: args.dryRun });
      report.steps.push(result);
      if (!result.ok) {
        throw new Error(`${step.id} failed.`);
      }
    }

    report.ok = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(plan.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`production rehearsal report written to ${plan.reportPath}`);
  }

  if (!report.ok) process.exitCode = 1;
}

function commandStep(id, description, command, args, options = {}) {
  return {
    id,
    description,
    kind: "command",
    command,
    args,
    mutatesRemote: false,
    mutatesLocal: false,
    resources: [],
    validates: [],
    rollbackArtifact: false,
    ...options
  };
}

async function runStep(step, options) {
  const startedAt = new Date().toISOString();
  console.log(`==> ${step.id}`);

  try {
    if (step.kind === "diagnostics") {
      const result = await runDiagnosticsStep(step, options);
      return {
        id: step.id,
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...result
      };
    }

    const command = formatCommand(step.command, step.args);
    if (options.dryRun) {
      console.log(command);
      return {
        id: step.id,
        ok: true,
        dryRun: true,
        command,
        startedAt,
        finishedAt: new Date().toISOString()
      };
    }

    await spawnInherited(step.command, step.args);
    return {
      id: step.id,
      ok: true,
      command,
      startedAt,
      finishedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      id: step.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }
}

async function runDiagnosticsStep(step, options) {
  if (options.dryRun) {
    console.log(`GET ${step.url}`);
    return {
      dryRun: true,
      url: step.url
    };
  }

  const response = await fetch(step.url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Diagnostics request failed with HTTP ${response.status}.`);
  }

  const diagnostics = await response.json();
  const validation = validateDiagnosticsForRehearsal(diagnostics);
  if (!validation.ok) {
    throw new Error(validation.issues.join(" "));
  }

  return {
    url: step.url,
    deployment: diagnostics.deployment ?? null,
    generatedAt: diagnostics.generatedAt ?? null,
    storage: diagnostics.storage ?? null,
    quotas: diagnostics.quotas ?? null
  };
}

function spawnInherited(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${formatCommand(command, args)} exited with code ${code}`));
    });
  });
}

function normalizedBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function usage() {
  return `Usage: node scripts/production-rehearsal.mjs --yes [options]

Runs the final production rehearsal:
- generates final-source import artifacts
- backs up remote D1/R2
- imports final-source D1/R2 data into remote Cloudflare resources
- verifies remote D1/R2 hashes and D1/R2/KV/Durable Object diagnostics
- restores the pre-import backup into local rollback targets

Use --dry-run to print the command plan without changing remote or local data.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
