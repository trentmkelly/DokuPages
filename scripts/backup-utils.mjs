import { spawn } from "node:child_process";

export function requireTargetMode(args) {
  if (args.remote === args.local) {
    throw new Error("Pass exactly one of --remote or --local.");
  }

  return args.remote ? "--remote" : "--local";
}

export function run(command, args, options = {}) {
  const { capture = false, dryRun = false } = options;

  if (dryRun && !capture) {
    console.log(formatCommand(command, args));
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    let stdout = "";
    let stderr = "";

    if (capture && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    if (capture && child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      const suffix = details ? `\n${details}` : "";
      reject(new Error(`${formatCommand(command, args)} exited with code ${code}${suffix}`));
    });
  });
}

export function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

export function wranglerR2ObjectPath(bucket, objectKey) {
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${encodedKey}`;
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:=@%-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
