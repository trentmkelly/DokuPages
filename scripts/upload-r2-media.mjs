#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const DEFAULT_MANIFEST = ".wrangler/dokuwiki-media-manifest.json";

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

  for (const object of objects) {
    const command = [
      "wrangler",
      "r2",
      "object",
      "put",
      `${args.bucket}/${object.objectKey}`,
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
    console.log(`uploaded ${object.objectKey}`);
  }

  console.log(`processed ${objects.length} media object${objects.length === 1 ? "" : "s"}`);
}

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    bucket: "",
    remote: false,
    local: false,
    dryRun: false
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
    }
  }

  return args;
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

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
