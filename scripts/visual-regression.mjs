#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://dokutest.pages.dev";
const DEFAULT_BASELINE = "test/visual-baselines.json";
const DEFAULT_OUTPUT_DIR = ".wrangler/visual-regression";
const BASELINE_VERSION = 3;
const CASES = [
  {
    name: "page-view-desktop",
    state: "page view",
    pagesPath: "/wiki/wiki/welcome",
    upstreamPath: "/doku.php?id=wiki:welcome",
    width: 1280,
    height: 900,
    hashGate: true
  },
  {
    name: "page-view-mobile",
    state: "page view",
    pagesPath: "/wiki/wiki/welcome",
    upstreamPath: "/doku.php?id=wiki:welcome",
    width: 390,
    height: 844,
    hashGate: true
  },
  {
    name: "edit-desktop",
    state: "edit",
    pagesPath: "/wiki/wiki/welcome?do=edit",
    upstreamPath: "/doku.php?id=wiki:welcome&do=edit",
    width: 1280,
    height: 900,
    hashGate: false
  },
  {
    name: "revisions-desktop",
    state: "revisions",
    pagesPath: "/wiki/wiki/welcome?do=revisions",
    upstreamPath: "/doku.php?id=wiki:welcome&do=revisions",
    width: 1280,
    height: 900,
    hashGate: false
  },
  {
    name: "diff-desktop",
    state: "diff",
    pagesPath: "/wiki/wiki/welcome?do=diff",
    upstreamPath: "/doku.php?id=wiki:welcome&do=diff",
    width: 1280,
    height: 900,
    hashGate: false
  },
  {
    name: "media-manager-desktop",
    state: "media manager",
    pagesPath: "/media-manager?ns=wiki",
    upstreamPath: "/doku.php?id=wiki:welcome&do=media&ns=wiki",
    width: 1280,
    height: 900,
    hashGate: false
  },
  {
    name: "login-desktop",
    state: "login",
    pagesPath: "/wiki/wiki/welcome?do=login",
    upstreamPath: "/doku.php?id=wiki:welcome&do=login",
    width: 1024,
    height: 768,
    hashGate: false
  },
  {
    name: "register-desktop",
    state: "register",
    pagesPath: "/wiki/wiki/welcome?do=register",
    upstreamPath: "/doku.php?id=wiki:welcome&do=register",
    width: 1024,
    height: 768,
    hashGate: false
  },
  {
    name: "admin-desktop",
    state: "admin",
    pagesPath: "/admin",
    upstreamPath: "/doku.php?id=wiki:welcome&do=admin",
    width: 1280,
    height: 900,
    hashGate: false
  },
  {
    name: "missing-page-desktop",
    state: "missing page",
    pagesPath: "/wiki/start",
    upstreamPath: "/doku.php?id=start",
    width: 1280,
    height: 900,
    hashGate: true
  }
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chromium = args.chromium || (await findChromium());

  if (!chromium) {
    throw new Error("Unable to find Chromium. Pass --chromium /path/to/chromium.");
  }

  await mkdir(args.outputDir, { recursive: true });

  const results = [];
  for (const item of CASES) {
    const pagesScreenshotPath = path.join(args.outputDir, `${item.name}.pages.png`);
    const pagesUrl = new URL(item.pagesPath, args.baseUrl);
    await captureScreenshot(chromium, pagesUrl.href, pagesScreenshotPath, item.width, item.height);
    const sources = {
      pages: await screenshotResult(item, pagesScreenshotPath)
    };

    if (args.upstreamUrl) {
      const upstreamScreenshotPath = path.join(args.outputDir, `${item.name}.upstream.png`);
      const upstreamUrl = new URL(item.upstreamPath, args.upstreamUrl);
      await captureScreenshot(
        chromium,
        upstreamUrl.href,
        upstreamScreenshotPath,
        item.width,
        item.height
      );
      sources.upstream = await screenshotResult(item, upstreamScreenshotPath);
    }

    results.push({
      name: item.name,
      state: item.state,
      paths: {
        pages: item.pagesPath,
        upstream: item.upstreamPath
      },
      viewport: {
        width: item.width,
        height: item.height
      },
      hashGate: item.hashGate,
      sources
    });
  }

  if (args.update) {
    await writeFile(args.baseline, `${JSON.stringify(baselinePayload(args, results), null, 2)}\n`);
    console.log(`updated ${args.baseline}`);
    return;
  }

  const baseline = JSON.parse(await readFile(args.baseline, "utf8"));
  compareResults(baseline.cases ?? [], results, {
    requireUpstream: Boolean(args.upstreamUrl)
  });
  const gatedCount = results.filter((item) => item.hashGate).length;
  const parityCount = results.length - gatedCount;
  const upstreamNote = args.upstreamUrl ? " with upstream parity captures" : "";
  console.log(
    `visual regression passed for ${gatedCount} gated Pages screenshot${
      gatedCount === 1 ? "" : "s"
    } and ${parityCount} parity capture${parityCount === 1 ? "" : "s"}${upstreamNote}`
  );
}

function baselinePayload(args, results) {
  return {
    version: BASELINE_VERSION,
    capture: {
      generatedAt: new Date().toISOString(),
      generatedBy: "scripts/visual-regression.mjs",
      pagesBaseUrl: args.baseUrl,
      upstreamBaseUrl: args.upstreamUrl || null,
      upstreamSource: args.upstreamUrl ? "running-upstream-dokuwiki" : "not-captured"
    },
    cases: results
  };
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL,
    baseline: DEFAULT_BASELINE,
    outputDir: DEFAULT_OUTPUT_DIR,
    chromium: process.env.CHROMIUM_BIN || "",
    upstreamUrl: process.env.UPSTREAM_BASE_URL || "",
    update: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      args.baseUrl = argv[++index];
    } else if (arg === "--baseline") {
      args.baseline = argv[++index];
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++index];
    } else if (arg === "--chromium") {
      args.chromium = argv[++index];
    } else if (arg === "--upstream-url") {
      args.upstreamUrl = argv[++index];
    } else if (arg === "--update") {
      args.update = true;
    }
  }

  return args;
}

async function findChromium() {
  const candidates = ["chromium", "chromium-browser", "google-chrome", "/snap/bin/chromium"];

  for (const candidate of candidates) {
    try {
      await execFilePromise(candidate, ["--version"]);
      return candidate;
    } catch {
      // Try the next common executable name.
    }
  }

  return "";
}

async function captureScreenshot(chromium, url, screenshotPath, width, height) {
  await execFilePromise(chromium, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${width},${height}`,
    `--screenshot=${screenshotPath}`,
    url
  ]);
}

async function screenshotResult(item, screenshotPath) {
  const buffer = await readFile(screenshotPath);
  const dimensions = pngDimensions(buffer);

  if (dimensions.width !== item.width || dimensions.height !== item.height) {
    throw new Error(
      `${item.name} dimensions were ${dimensions.width}x${dimensions.height}; expected ${item.width}x${item.height}`
    );
  }

  return {
    byteLength: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
}

function pngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Screenshot was not a PNG.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function compareResults(expectedCases, actualCases, options = { requireUpstream: false }) {
  const expectedByName = new Map(expectedCases.map((item) => [item.name, item]));

  for (const actual of actualCases) {
    const expected = expectedByName.get(actual.name);
    if (!expected) {
      throw new Error(`Missing visual baseline for ${actual.name}.`);
    }

    if (JSON.stringify(expected.viewport) !== JSON.stringify(actual.viewport)) {
      throw new Error(`Viewport changed for ${actual.name}.`);
    }

    if (JSON.stringify(expected.paths) !== JSON.stringify(actual.paths)) {
      throw new Error(`Paths changed for ${actual.name}.`);
    }

    if (Boolean(expected.hashGate) !== Boolean(actual.hashGate)) {
      throw new Error(`Hash gate changed for ${actual.name}.`);
    }

    compareSourcePresence(actual.name, "pages", actual.sources.pages);
    if (actual.hashGate) {
      compareSourceHash(actual.name, "pages", expected.sources?.pages, actual.sources.pages);
    }
    if (options.requireUpstream)
      compareSourcePresence(actual.name, "upstream", actual.sources.upstream);
  }
}

function compareSourcePresence(caseName, sourceName, actual) {
  if (!actual) {
    throw new Error(`Missing ${sourceName} visual capture for ${caseName}.`);
  }
}

function compareSourceHash(caseName, sourceName, expected, actual) {
  if (!expected || !actual) {
    throw new Error(`Missing ${sourceName} visual baseline for ${caseName}.`);
  }

  if (expected.sha256 !== actual.sha256) {
    throw new Error(
      `Visual hash changed for ${caseName}. Run npm run test:visual -- --update after reviewing the screenshot.`
    );
  }
}

function execFilePromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(" ")} failed\n${stderr || stdout}`));
        return;
      }

      resolve(stdout);
    });
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
