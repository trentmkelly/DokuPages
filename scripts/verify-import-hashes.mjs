#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireTargetMode, run, wranglerR2ObjectPath } from "./backup-utils.mjs";

const DEFAULT_MANIFEST = ".wrangler/dokuwiki-hash-manifest.json";
const DEFAULT_DATABASE = "dokuwiki_pages_dev";
const DEFAULT_BUCKET = "dokuwiki-pages-dev-media";

export function verifyD1Hashes(manifest, rows) {
  const pageRevisionRows = new Map(rows.pageRevisions.map((row) => [row.id, row.content_hash]));
  const mediaRows = new Map(rows.media.map((row) => [row.id, row.content_hash]));
  const mediaRevisionRows = new Map(rows.mediaRevisions.map((row) => [row.id, row.content_hash]));
  const checks = [];

  for (const page of manifest.pages ?? []) {
    checks.push(compareHash("page", page.revisionId, page.contentHash, pageRevisionRows));
  }

  for (const revision of manifest.pageRevisions ?? []) {
    checks.push(
      compareHash("page_revision", revision.revisionId, revision.contentHash, pageRevisionRows)
    );
  }

  for (const object of manifest.mediaObjects ?? []) {
    const rowMap = object.role === "current" ? mediaRows : mediaRevisionRows;
    const targetId = object.role === "current" ? object.mediaId : object.revisionId;
    checks.push(compareHash(`media_${object.role}`, targetId, object.contentHash, rowMap));
  }

  return checks;
}

export function verifyObservedR2Hashes(manifest, observedHashes) {
  const observed = new Map(observedHashes.map((row) => [row.objectKey, row.contentHash]));

  return (manifest.mediaObjects ?? []).map((object) =>
    compareHash("r2_object", object.objectKey, object.contentHash, observed)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = requireTargetMode(args);
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const rows = await readD1Rows(args.database, mode, manifest);
  const d1Checks = verifyD1Hashes(manifest, rows);
  const r2Checks = args.skipR2
    ? []
    : verifyObservedR2Hashes(manifest, await readR2Hashes(args.bucket, mode, manifest));
  const checks = [...d1Checks, ...r2Checks];
  const failures = checks.filter((check) => !check.ok);
  const summary = {
    ok: failures.length === 0,
    checked: checks.length,
    failures
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function readD1Rows(database, mode, manifest) {
  const pageRevisionIds = [
    ...(manifest.pages ?? []).map((page) => page.revisionId),
    ...(manifest.pageRevisions ?? []).map((revision) => revision.revisionId)
  ];
  const mediaIds = (manifest.mediaObjects ?? [])
    .filter((object) => object.role === "current")
    .map((object) => object.mediaId);
  const mediaRevisionIds = (manifest.mediaObjects ?? [])
    .filter((object) => object.role !== "current")
    .map((object) => object.revisionId);

  return {
    pageRevisions: await readRows(
      database,
      mode,
      "page_revisions",
      "id",
      "content_hash",
      pageRevisionIds
    ),
    media: await readRows(database, mode, "media", "id", "content_hash", mediaIds),
    mediaRevisions: await readRows(
      database,
      mode,
      "media_revisions",
      "id",
      "content_hash",
      mediaRevisionIds
    )
  };
}

async function readRows(database, mode, table, idColumn, hashColumn, ids) {
  if (ids.length === 0) return [];

  const output = await run(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      database,
      mode,
      "--json",
      "--command",
      `select ${idColumn}, ${hashColumn} from ${table} where ${idColumn} in (${ids.map(sql).join(", ")})`
    ],
    { capture: true }
  );
  const payload = JSON.parse(output);
  const result = payload[0];

  if (!result?.success) {
    throw new Error(`Unable to read ${table} hashes from D1.`);
  }

  return result.results ?? [];
}

async function readR2Hashes(bucket, mode, manifest) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "dokuwiki-r2-hash-"));

  try {
    const hashes = [];

    for (const object of manifest.mediaObjects ?? []) {
      const outputPath = path.join(
        tempDir,
        Buffer.from(object.objectKey, "utf8").toString("base64url")
      );
      await run("npx", [
        "wrangler",
        "r2",
        "object",
        "get",
        wranglerR2ObjectPath(bucket, object.objectKey),
        "--file",
        outputPath,
        mode
      ]);
      hashes.push({
        objectKey: object.objectKey,
        contentHash: sha256(await readFile(outputPath))
      });
    }

    return hashes;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function compareHash(kind, id, expected, observedMap) {
  const actual = observedMap.get(id);

  if (!actual) {
    return { ok: false, kind, id, expected, actual: null, reason: "missing" };
  }

  if (actual !== expected) {
    return { ok: false, kind, id, expected, actual, reason: "mismatch" };
  }

  return { ok: true, kind, id };
}

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    database: DEFAULT_DATABASE,
    bucket: DEFAULT_BUCKET,
    remote: false,
    local: false,
    skipR2: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      args.manifest = argv[++index];
    } else if (arg === "--database") {
      args.database = argv[++index];
    } else if (arg === "--bucket") {
      args.bucket = argv[++index];
    } else if (arg === "--remote") {
      args.remote = true;
    } else if (arg === "--local") {
      args.local = true;
    } else if (arg === "--skip-r2") {
      args.skipR2 = true;
    }
  }

  return args;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
