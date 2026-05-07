#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { gunzip } from "node:zlib";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const gunzipAsync = promisify(gunzip);

export async function buildImportPlan(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const dataRoot = path.join(root, "data");
  const confRoot = path.join(root, "conf");

  const pages = await discoverPages(path.join(dataRoot, "pages"));
  const pageRevisions = await discoverPageRevisions(path.join(dataRoot, "attic"));
  const media = await discoverMedia(path.join(dataRoot, "media"));
  const mediaRevisions = await discoverMediaRevisions(path.join(dataRoot, "media_attic"));
  const aclRules = await discoverAclRules(path.join(confRoot, "acl.auth.php"));
  const users = await discoverUsers(path.join(confRoot, "users.auth.php"));

  return {
    sourceRoot: root,
    generatedAt: new Date().toISOString(),
    counts: {
      pages: pages.length,
      pageRevisions: pageRevisions.length,
      media: media.length,
      mediaRevisions: mediaRevisions.length,
      aclRules: aclRules.length,
      users: users.length
    },
    pages,
    pageRevisions,
    media,
    mediaRevisions,
    aclRules,
    users
  };
}

export async function discoverPages(pagesRoot) {
  const files = await walkFiles(pagesRoot);
  const pages = [];

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const id = fileToPageId(pagesRoot, file, ".txt");

    pages.push({
      id,
      sourcePath: file,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return pages.sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverPageRevisions(atticRoot) {
  const files = await walkFiles(atticRoot);
  const revisions = [];

  for (const file of files) {
    const match = file.match(/\.([0-9]{10,})\.txt(\.gz|\.bz2)?$/);
    if (!match) continue;

    const compression = match[2]?.slice(1) ?? "none";
    const pagePath = file
      .slice(atticRoot.length + 1)
      .replace(/\.([0-9]{10,})\.txt(\.gz|\.bz2)?$/, "");
    const id = pathWithoutExtensionToId(pagePath);
    const stat = await fs.stat(file);
    const raw = await readMaybeCompressed(file, compression);

    revisions.push({
      pageId: id,
      revision: match[1],
      sourcePath: file,
      compression,
      byteLength: raw.byteLength,
      contentHash: sha256(raw),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return revisions.sort((a, b) =>
    `${a.pageId}:${a.revision}`.localeCompare(`${b.pageId}:${b.revision}`)
  );
}

export async function discoverMedia(mediaRoot) {
  const files = await walkFiles(mediaRoot);
  const media = [];

  for (const file of files) {
    if (path.basename(file).startsWith("_")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const id = pathWithoutExtensionToId(path.relative(mediaRoot, file));

    media.push({
      id,
      sourcePath: file,
      objectKey: `media/current/${id.replaceAll(":", "/")}`,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return media.sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverMediaRevisions(mediaAtticRoot) {
  const files = await walkFiles(mediaAtticRoot);
  const revisions = [];

  for (const file of files) {
    if (path.basename(file).startsWith("_")) continue;

    const content = await fs.readFile(file);
    const stat = await fs.stat(file);
    const relative = path.relative(mediaAtticRoot, file);
    const parsed = parseMediaRevisionPath(relative);

    revisions.push({
      mediaId: parsed.mediaId,
      revision: parsed.revision,
      sourcePath: file,
      objectKey: `media/revisions/${parsed.mediaId.replaceAll(":", "/")}/${parsed.revision}`,
      byteLength: content.byteLength,
      contentHash: sha256(content),
      modifiedAt: stat.mtime.toISOString()
    });
  }

  return revisions.sort((a, b) =>
    `${a.mediaId}:${a.revision}`.localeCompare(`${b.mediaId}:${b.revision}`)
  );
}

export async function discoverAclRules(file) {
  const text = await readTextIfExists(file);
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const [scope, principal, permission] = line.split(/\s+/);
      return {
        id: `acl:${index + 1}`,
        scope,
        principal,
        permission: Number.parseInt(permission, 10)
      };
    });
}

export async function discoverUsers(file) {
  const text = await readTextIfExists(file);
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [username, passwordHash, displayName, email, groups = ""] = line.split(":");
      return {
        username,
        passwordHash,
        displayName,
        email,
        groups: groups.split(",").filter(Boolean)
      };
    });
}

async function walkFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
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
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readMaybeCompressed(file, compression) {
  const content = await fs.readFile(file);
  if (compression === "gz") return gunzipAsync(content);
  if (compression === "bz2") {
    return Buffer.from("");
  }
  return content;
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function fileToPageId(root, file, extension) {
  const relative = path.relative(root, file).slice(0, -extension.length);
  return pathWithoutExtensionToId(relative);
}

function pathWithoutExtensionToId(relative) {
  return relative.split(path.sep).join(":").replaceAll("/", ":").toLowerCase();
}

function parseMediaRevisionPath(relative) {
  const id = pathWithoutExtensionToId(relative);
  const match = id.match(/^(.*)\.([0-9]{10,})\.([^.]+)$/);
  if (!match) {
    return {
      mediaId: id,
      revision: "current"
    };
  }

  return {
    mediaId: `${match[1]}.${match[3]}`,
    revision: match[2]
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function parseArgs(argv) {
  const args = {
    source: "../dokuwiki",
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = argv[++index];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await buildImportPlan(args.source);

  console.log(JSON.stringify(plan, null, 2));

  if (!args.dryRun) {
    process.exitCode = 2;
    console.error("Only --dry-run mode is implemented in the import planner so far.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
