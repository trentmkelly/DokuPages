#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wranglerR2ObjectPath } from "./backup-utils.mjs";

const DEFAULT_MANIFEST = ".wrangler/dokuwiki-media-manifest.json";
const DEFAULT_STATE = ".wrangler/dokuwiki-media-upload-state.json";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bucket) {
    throw new Error("Missing --bucket.");
  }
  if (args.remote === args.local) {
    throw new Error("Pass exactly one of --remote or --local.");
  }

  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const objects = manifest.objects ?? [];
  const state = args.noResume ? createUploadState() : await loadUploadState(args.state);
  let uploaded = 0;
  let skipped = 0;

  for (const object of objects) {
    if (!args.noResume && isObjectUploaded(state, object)) {
      skipped += 1;
      console.log(`skipped ${object.objectKey}`);
      continue;
    }

    const command = [
      "wrangler",
      "r2",
      "object",
      "put",
      wranglerR2ObjectPath(args.bucket, object.objectKey),
      "--file",
      object.sourcePath,
      "--content-type",
      object.mimeType,
      "--force",
      args.remote ? "--remote" : "--local"
    ];

    if (args.dryRun) {
      console.log(["npx", ...command].map(shellQuote).join(" "));
      continue;
    }

    await run("npx", command);
    markObjectUploaded(state, object);
    await writeUploadState(args.state, state);
    uploaded += 1;
    console.log(`uploaded ${object.objectKey}`);
  }

  console.log(
    `processed ${objects.length} media object${objects.length === 1 ? "" : "s"} (${uploaded} uploaded, ${skipped} skipped)`
  );
}

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    bucket: "",
    remote: false,
    local: false,
    dryRun: false,
    state: DEFAULT_STATE,
    noResume: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      args.manifest = argv[++index];
    } else if (arg === "--bucket") {
      args.bucket = argv[++index];
    } else if (arg === "--remote") {
      args.remote = true;
    } else if (arg === "--local") {
      args.local = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--state") {
      args.state = argv[++index];
    } else if (arg === "--no-resume") {
      args.noResume = true;
    }
  }

  return args;
}

export function createUploadState() {
  return {
    version: 1,
    completed: {}
  };
}

export async function loadUploadState(file) {
  try {
    const state = JSON.parse(await readFile(file, "utf8"));
    if (state?.version !== 1 || typeof state.completed !== "object" || state.completed === null) {
      return createUploadState();
    }

    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return createUploadState();
    throw error;
  }
}

export async function writeUploadState(file, state) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function isObjectUploaded(state, object) {
  const completed = state.completed?.[object.objectKey];
  return (
    completed?.contentHash === object.contentHash &&
    completed?.byteLength === object.byteLength &&
    completed?.sourcePath === object.sourcePath
  );
}

export function markObjectUploaded(state, object) {
  state.completed[object.objectKey] = {
    sourcePath: object.sourcePath,
    contentHash: object.contentHash,
    byteLength: object.byteLength,
    uploadedAt: new Date().toISOString()
  };
  state.updatedAt = state.completed[object.objectKey].uploadedAt;
  return state;
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

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:=@%-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
