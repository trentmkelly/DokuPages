#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildImportPlan } from "./import-dokuwiki.mjs";

const DEFAULT_BUILD_DIR = ".wrangler/performance-build";
const DEFAULT_OUTPUT = ".wrangler/performance-measurements.json";

export async function measurePerformance(options = {}) {
  const buildDir = options.buildDir ?? DEFAULT_BUILD_DIR;
  const source = options.source ?? "../dokuwiki";

  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });

  const buildStartedAt = performance.now();
  await run("npx", [
    "wrangler",
    "pages",
    "functions",
    "build",
    "functions",
    "--outdir",
    buildDir,
    "--minify",
    "--metafile",
    path.join(buildDir, "metafile.json")
  ]);
  const buildDurationMs = performance.now() - buildStartedAt;

  const bundle = await measureFileTree(buildDir);
  const staticAssets = await measureFileTree("public");
  const coldStart = await measureColdStart(path.join(buildDir, "index.js"));
  const migration = await measureMigrationPlan(source);

  return {
    generatedAt: new Date().toISOString(),
    build: {
      durationMs: round(buildDurationMs),
      directory: buildDir
    },
    coldStart,
    migration,
    bundle,
    staticAssets
  };
}

export async function measureFileTree(root) {
  const files = await walkFiles(root);
  const entries = [];

  for (const file of files) {
    const fileStat = await stat(file);
    entries.push({
      path: normalizePath(path.relative(root, file)),
      bytes: fileStat.size
    });
  }

  entries.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

  return {
    root,
    fileCount: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    largest: entries.slice(0, 10)
  };
}

async function measureColdStart(bundlePath) {
  const startedAt = performance.now();
  await import(`${pathToFileURL(path.resolve(bundlePath)).href}?t=${Date.now()}`);

  return {
    bundlePath: normalizePath(bundlePath),
    importMs: round(performance.now() - startedAt)
  };
}

async function measureMigrationPlan(source) {
  const sourcePath = path.resolve(source);
  const startedAt = performance.now();
  const plan = await buildImportPlan(sourcePath);

  return {
    source: sourcePath,
    planMs: round(performance.now() - startedAt),
    counts: plan.counts
  };
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function parseArgs(argv) {
  const args = {
    buildDir: DEFAULT_BUILD_DIR,
    output: DEFAULT_OUTPUT,
    source: "../dokuwiki"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--build-dir") {
      args.buildDir = argv[++index];
    } else if (arg === "--out") {
      args.output = argv[++index];
    } else if (arg === "--source") {
      args.source = argv[++index];
    }
  }

  return args;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await measurePerformance(args);

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
