#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireTargetMode, run, wranglerR2ObjectPath } from "./backup-utils.mjs";

const DEFAULT_DATABASE = "dokuwiki_pages_dev";
const DEFAULT_BUCKET = "dokuwiki-pages-dev-media";
const DEFAULT_OUTPUT_ROOT = ".wrangler/backups";
const MANIFEST_FILE = "backup-manifest.json";

const MEDIA_OBJECT_SQL = `
select object_key as objectKey,
       max(mime_type) as mimeType,
       max(byte_length) as byteLength,
       max(content_hash) as contentHash
from (
  select object_key, mime_type, byte_length, content_hash
  from media
  where object_key is not null and object_key <> ''
  union all
  select object_key, mime_type, byte_length, content_hash
  from media_revisions
  where object_key is not null and object_key <> ''
)
group by object_key
order by object_key asc
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = requireTargetMode(args);
  const outputDir = args.output || path.join(DEFAULT_OUTPUT_ROOT, timestampForPath(new Date()));
  const manifestPath = path.join(outputDir, MANIFEST_FILE);
  const d1Path = path.join(outputDir, "d1.sql");
  const objectDir = path.join(outputDir, "r2");

  if (!args.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      database: args.database,
      bucket: args.bucket,
      mode: mode.slice(2)
    },
    d1: args.skipD1 ? null : { path: "d1.sql" },
    objects: []
  };

  if (!args.skipD1) {
    await run(
      "npx",
      ["wrangler", "d1", "export", args.database, mode, "--output", d1Path, "--skip-confirmation"],
      { dryRun: args.dryRun }
    );
  }

  if (!args.skipMedia) {
    const objects = await readMediaObjects(args.database, mode);

    if (!args.dryRun) {
      await mkdir(objectDir, { recursive: true });
    }

    for (const object of objects) {
      const relativePath = path.posix.join("r2", fileNameForObjectKey(object.objectKey));
      const outputPath = path.join(outputDir, relativePath);

      await run(
        "npx",
        [
          "wrangler",
          "r2",
          "object",
          "get",
          wranglerR2ObjectPath(args.bucket, object.objectKey),
          "--file",
          outputPath,
          mode
        ],
        { dryRun: args.dryRun }
      );

      manifest.objects.push({
        objectKey: object.objectKey,
        path: relativePath,
        mimeType: object.mimeType ?? "application/octet-stream",
        byteLength: Number(object.byteLength ?? 0),
        contentHash: object.contentHash ?? ""
      });
    }
  }

  if (args.dryRun) {
    console.log(`would write ${manifestPath}`);
    return;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`backup written to ${outputDir}`);
}

async function readMediaObjects(database, mode) {
  const output = await run(
    "npx",
    ["wrangler", "d1", "execute", database, mode, "--json", "--command", MEDIA_OBJECT_SQL],
    { capture: true }
  );
  const payload = JSON.parse(output);
  const result = payload[0];

  if (!result?.success) {
    throw new Error("Unable to read media object keys from D1.");
  }

  return (result.results ?? []).filter((object) => object.objectKey);
}

function parseArgs(argv) {
  const args = {
    database: DEFAULT_DATABASE,
    bucket: DEFAULT_BUCKET,
    output: "",
    remote: false,
    local: false,
    skipD1: false,
    skipMedia: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database") {
      args.database = argv[++index];
    } else if (arg === "--bucket") {
      args.bucket = argv[++index];
    } else if (arg === "--output") {
      args.output = argv[++index];
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
    }
  }

  return args;
}

function timestampForPath(date) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "");
}

function fileNameForObjectKey(objectKey) {
  return Buffer.from(objectKey, "utf8").toString("base64url");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
