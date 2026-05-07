#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireTargetMode, run, wranglerR2ObjectPath } from "./backup-utils.mjs";

const DEFAULT_DATABASE = "dokuwiki_pages_dev";
const DEFAULT_BUCKET = "dokuwiki-pages-dev-media";
const MANIFEST_FILE = "backup-manifest.json";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = requireTargetMode(args);

  if (!args.backup) {
    throw new Error("Missing --backup.");
  }

  if (!args.dryRun && !args.yes) {
    throw new Error("Pass --yes to restore D1 and R2 data.");
  }

  const manifestPath = path.join(args.backup, MANIFEST_FILE);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const database = args.database || manifest.source?.database || DEFAULT_DATABASE;
  const bucket = args.bucket || manifest.source?.bucket || DEFAULT_BUCKET;

  if (!args.skipD1 && manifest.d1?.path) {
    await run(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        database,
        mode,
        "--file",
        path.join(args.backup, manifest.d1.path),
        "--yes"
      ],
      { dryRun: args.dryRun }
    );
  }

  if (!args.skipMedia) {
    for (const object of manifest.objects ?? []) {
      const command = [
        "wrangler",
        "r2",
        "object",
        "put",
        wranglerR2ObjectPath(bucket, object.objectKey),
        "--file",
        path.join(args.backup, object.path),
        "--force",
        mode
      ];

      if (object.mimeType) {
        command.splice(5, 0, "--content-type", object.mimeType);
      }

      await run("npx", command, { dryRun: args.dryRun });
    }
  }

  console.log(`restore ${args.dryRun ? "dry run completed" : "completed"} from ${args.backup}`);
}

function parseArgs(argv) {
  const args = {
    backup: "",
    database: "",
    bucket: "",
    remote: false,
    local: false,
    skipD1: false,
    skipMedia: false,
    dryRun: false,
    yes: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backup") {
      args.backup = argv[++index];
    } else if (arg === "--database") {
      args.database = argv[++index];
    } else if (arg === "--bucket") {
      args.bucket = argv[++index];
    } else if (arg === "--remote") {
      args.remote = true;
    } else if (arg === "--local") {
      args.local = true;
    } else if (arg === "--skip-d1") {
      args.skipD1 = true;
    } else if (arg === "--skip-media") {
      args.skipMedia = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--yes") {
      args.yes = true;
    }
  }

  return args;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
