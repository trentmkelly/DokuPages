#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE = "../dokuwiki";
const SAFE_FN_RECODE_DIRS = [
  "data/pages",
  "data/attic",
  "data/meta",
  "data/media",
  "data/media_attic",
  "data/media_meta"
];

export function recodeSafeFileName(name) {
  let recoded = name.replace(/(%[^\]]*?)\./g, "$1]");
  if (/%[^\]]+$/.test(recoded)) recoded += "]";
  return recoded;
}

export async function buildSafeFnRecodePlan(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const entries = [];

  for (const relativeDir of SAFE_FN_RECODE_DIRS) {
    const absoluteDir = path.join(root, relativeDir);
    for (const entry of await walkEntriesPostOrder(absoluteDir)) {
      const targetName = recodeSafeFileName(path.basename(entry.sourcePath));
      if (targetName === path.basename(entry.sourcePath)) continue;

      entries.push({
        type: entry.type,
        sourcePath: entry.sourcePath,
        targetPath: path.join(path.dirname(entry.sourcePath), targetName),
        relativeSource: path.relative(root, entry.sourcePath),
        relativeTarget: path.relative(root, path.join(path.dirname(entry.sourcePath), targetName)),
        conflict: null
      });
    }
  }

  await markConflicts(entries);
  return {
    sourceRoot: root,
    entries
  };
}

export async function applySafeFnRecodePlan(plan) {
  const conflicts = plan.entries.filter((entry) => entry.conflict);
  if (conflicts.length > 0) {
    throw new Error(
      `SafeFN recode plan has ${conflicts.length} conflict(s); rerun without --write.`
    );
  }

  for (const entry of plan.entries) {
    await fs.rename(entry.sourcePath, entry.targetPath);
  }
}

async function walkEntriesPostOrder(root) {
  let dirents;
  try {
    dirents = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const entries = [];
  for (const dirent of dirents) {
    const sourcePath = path.join(root, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...(await walkEntriesPostOrder(sourcePath)));
      entries.push({ type: "directory", sourcePath });
    } else if (dirent.isFile()) {
      entries.push({ type: "file", sourcePath });
    }
  }

  return entries;
}

async function markConflicts(entries) {
  const targetCounts = new Map();
  for (const entry of entries) {
    targetCounts.set(entry.targetPath, (targetCounts.get(entry.targetPath) ?? 0) + 1);
  }

  for (const entry of entries) {
    if ((targetCounts.get(entry.targetPath) ?? 0) > 1) {
      entry.conflict = "duplicate target in recode plan";
      continue;
    }

    try {
      await fs.stat(entry.targetPath);
      entry.conflict = "target already exists";
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    write: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--source":
        options.source = argv[++index] ?? "";
        break;
      case "--write":
        options.write = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.source) throw new Error("--source requires a path");
  return options;
}

function usage() {
  return `Usage: node scripts/safefnrecode.mjs [--source <dokuwiki-root>] [--write] [--json]

Scans DokuWiki data directories for old SafeFN names that use "." as the
encoded-character post indicator and plans the upstream recode to "]".

Default mode is dry-run. Pass --write to rename files and directories.`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const plan = await buildSafeFnRecodePlan(options.source);
  const conflicts = plan.entries.filter((entry) => entry.conflict);

  if (options.json) {
    console.log(JSON.stringify({ ...plan, dryRun: !options.write }, null, 2));
  } else {
    console.log(
      `SafeFN recode ${options.write ? "write" : "dry-run"} for ${plan.sourceRoot}: ${plan.entries.length} rename(s), ${conflicts.length} conflict(s).`
    );
    for (const entry of plan.entries) {
      const prefix = entry.conflict ? "conflict" : options.write ? "rename" : "plan";
      const suffix = entry.conflict ? ` (${entry.conflict})` : "";
      console.log(`${prefix}: ${entry.relativeSource} -> ${entry.relativeTarget}${suffix}`);
    }
  }

  if (conflicts.length > 0) {
    process.exitCode = 2;
    return;
  }

  if (options.write) {
    await applySafeFnRecodePlan(plan);
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
