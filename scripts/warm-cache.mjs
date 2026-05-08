import { pathToFileURL } from "node:url";

export const DEFAULT_WARM_PATHS = [
  "/",
  "/wiki/wiki/welcome",
  "/wiki/wiki/syntax",
  "/sitemap.xml",
  "/feed.xml"
];

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function normalizeWarmPaths(paths) {
  const normalized = new Set();

  for (const path of paths) {
    const trimmed = String(path ?? "").trim();
    if (!trimmed) continue;
    normalized.add(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
  }

  return [...normalized];
}

export async function warmCache({
  baseUrl,
  paths = DEFAULT_WARM_PATHS,
  fetchImpl = globalThis.fetch
}) {
  const base = normalizeBaseUrl(baseUrl);
  const warmPaths = normalizeWarmPaths(paths);
  const results = [];

  for (const path of warmPaths) {
    const url = new URL(path, base);
    const startedAt = Date.now();
    const response = await fetchImpl(url);

    results.push({
      path,
      url: url.href,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt
    });
  }

  return results;
}

async function main(argv) {
  const { baseUrl, paths } = parseArgs(argv);

  if (!baseUrl) {
    throw new Error("Usage: node scripts/warm-cache.mjs --base-url <url> [--path /wiki/id ...]");
  }

  const results = await warmCache({
    baseUrl,
    paths: paths.length > 0 ? paths : DEFAULT_WARM_PATHS
  });
  let failed = false;

  for (const result of results) {
    const status = result.ok ? "ok" : "fail";
    console.log(`${status} ${result.status} ${result.path} ${result.durationMs}ms`);
    failed ||= !result.ok;
  }

  if (failed) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const paths = [];
  let baseUrl = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url") {
      baseUrl = argv[++index] ?? "";
      continue;
    }

    if (arg === "--path") {
      paths.push(argv[++index] ?? "");
      continue;
    }

    if (arg.startsWith("--path=")) {
      paths.push(arg.slice("--path=".length));
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length);
    }
  }

  return { baseUrl, paths };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
