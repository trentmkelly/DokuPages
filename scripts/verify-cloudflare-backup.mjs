#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST_FILE = "backup-manifest.json";

export async function verifyBackupDirectory(backupDir) {
  const manifestPath = path.join(backupDir, MANIFEST_FILE);
  const issues = [];
  let manifest = null;

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      backupDir,
      objectCount: 0,
      totalObjectBytes: 0,
      issues: [
        {
          path: MANIFEST_FILE,
          reason: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  if (manifest.version !== 1) {
    issues.push({
      path: MANIFEST_FILE,
      reason: "Unsupported backup manifest version."
    });
  }

  if (manifest.d1?.path) {
    await verifyFile(path.join(backupDir, manifest.d1.path), manifest.d1.path, null, issues);
  }

  const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
  if (!Array.isArray(manifest.objects)) {
    issues.push({
      path: MANIFEST_FILE,
      reason: "Backup manifest objects must be an array."
    });
  }

  const seenObjectKeys = new Set();
  let totalObjectBytes = 0;

  for (const object of objects) {
    const objectKey = typeof object.objectKey === "string" ? object.objectKey : "";
    const relativePath = typeof object.path === "string" ? object.path : "";
    const byteLength = Number.isFinite(Number(object.byteLength))
      ? Number(object.byteLength)
      : null;

    if (!objectKey) {
      issues.push({
        path: relativePath || MANIFEST_FILE,
        reason: "Backup object is missing objectKey."
      });
    } else if (seenObjectKeys.has(objectKey)) {
      issues.push({
        path: relativePath || MANIFEST_FILE,
        reason: `Duplicate objectKey '${objectKey}'.`
      });
    } else {
      seenObjectKeys.add(objectKey);
    }

    if (!relativePath) {
      issues.push({
        path: objectKey || MANIFEST_FILE,
        reason: "Backup object is missing path."
      });
      continue;
    }

    const size = await verifyFile(
      path.join(backupDir, relativePath),
      relativePath,
      byteLength,
      issues
    );
    if (size !== null) totalObjectBytes += size;
  }

  return {
    ok: issues.length === 0,
    backupDir,
    createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : null,
    source: manifest.source ?? null,
    d1: manifest.d1 ?? null,
    objectCount: seenObjectKeys.size,
    totalObjectBytes,
    issues
  };
}

async function verifyFile(absolutePath, relativePath, expectedByteLength, issues) {
  try {
    const file = await stat(absolutePath);
    if (!file.isFile()) {
      issues.push({
        path: relativePath,
        reason: "Backup path is not a file."
      });
      return null;
    }

    if (expectedByteLength !== null && file.size !== expectedByteLength) {
      issues.push({
        path: relativePath,
        reason: `Expected ${expectedByteLength} bytes but found ${file.size}.`
      });
    }

    return file.size;
  } catch (error) {
    issues.push({
      path: relativePath,
      reason: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    backup: "",
    report: "",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backup") {
      args.backup = argv[++index];
    } else if (arg === "--report") {
      args.report = argv[++index];
    } else if (arg === "--json") {
      args.json = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.backup) {
    throw new Error("Missing --backup.");
  }

  const result = await verifyBackupDirectory(args.backup);
  if (args.report) {
    await writeFile(args.report, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      `backup verified: ${result.objectCount} R2 objects, ${result.totalObjectBytes} bytes`
    );
  } else {
    for (const issue of result.issues) {
      console.error(`${issue.path}: ${issue.reason}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
