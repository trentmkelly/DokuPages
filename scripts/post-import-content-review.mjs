#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MANIFEST = ".wrangler/dokuwiki-hash-manifest.json";
const DEFAULT_OUTPUT = ".wrangler/post-import-content-review.md";
const DEFAULT_BASE_URL = "https://dokutest.pages.dev";
const STARTER_PAGE_IDS = new Set([
  "start",
  "sidebar",
  "wiki:dokuwiki",
  "wiki:syntax",
  "wiki:welcome"
]);

export function summarizeImportManifest(manifest) {
  const mediaObjects = manifest.mediaObjects ?? [];
  return {
    sourceRoot: manifest.sourceRoot ?? "",
    generatedAt: manifest.generatedAt ?? "",
    pageCount: (manifest.pages ?? []).length,
    pageRevisionCount: (manifest.pageRevisions ?? []).length,
    pageMetadataCount: (manifest.pageMetadata ?? []).length,
    mediaObjectCount: mediaObjects.length,
    currentMediaCount: mediaObjects.filter((object) => object.role === "current").length,
    oldMediaRevisionCount: mediaObjects.filter((object) => object.role !== "current").length,
    mediaMetadataCount: (manifest.mediaMetadata ?? []).length,
    customLanguageFileCount: (manifest.customLanguageFiles ?? []).length,
    customTemplateFileCount: (manifest.customTemplateFiles ?? []).length,
    representativePages: representativePageIds(manifest),
    representativeMedia: representativeMediaIds(manifest)
  };
}

export function buildPostImportContentReview({ manifest, baseUrl, generatedAt }) {
  const summary = summarizeImportManifest(manifest);
  const reviewGeneratedAt = generatedAt ?? new Date().toISOString();
  const pageSample = summary.representativePages.length
    ? summary.representativePages.map((id) => `  - ${id}`).join("\n")
    : "  - No non-starter pages were present in the manifest.";
  const mediaSample = summary.representativeMedia.length
    ? summary.representativeMedia.map((id) => `  - ${id}`).join("\n")
    : "  - No media objects were present in the manifest.";

  return `# Post-Import Production Content Review

Generated: ${reviewGeneratedAt}
Source root: ${summary.sourceRoot || "(not recorded)"}
Import manifest generated: ${summary.generatedAt || "(not recorded)"}
Pages target: ${baseUrl || "(not recorded)"}

## Import Summary

- Current pages: ${summary.pageCount}
- Old page revisions: ${summary.pageRevisionCount}
- Page metadata records: ${summary.pageMetadataCount}
- Current media objects: ${summary.currentMediaCount}
- Old media revisions: ${summary.oldMediaRevisionCount}
- Media metadata records: ${summary.mediaMetadataCount}
- Custom language files: ${summary.customLanguageFileCount}
- Custom template files: ${summary.customTemplateFileCount}

## Representative Non-Starter Pages

${pageSample}

## Representative Media

${mediaSample}

## Review Checklist

- [ ] Open representative non-starter pages in the Pages deployment and the source DokuWiki deployment, then compare rendered content, TOC, links, page tools, section edit controls, and footer metadata.
- [ ] Open at least one old page revision, diff, deleted page, wanted page, orphan page, backlink page, namespace index, recent changes view, feed, and sitemap route that includes production content.
- [ ] Review media namespaces, media detail pages, current media downloads, old media revisions, thumbnails, metadata, and upload/delete/revert behavior for representative production files.
- [ ] Verify imported users, groups, ACL rules, hidden namespaces, sneaky index behavior, subscriptions, profile flows, login, registration, and admin/manager-only routes against production expectations.
- [ ] Review imported configuration, custom language files, custom templates, custom interwiki/MIME/scheme/acronym/entity/smiley/wordblock overrides, and plugin compatibility status.
- [ ] Run search, quick search, link wizard, backlinks, wanted, orphan, recent changes, feeds, and sitemap against production-specific terms, namespaces, and hidden pages.
- [ ] Add every confirmed parity gap to CHECKLIST_2.md or the issue tracker with the source page/media ID, route, expected upstream behavior, actual Pages behavior, screenshots when useful, and severity.
- [ ] Re-run smoke tests, hash verification, visual checks for the reviewed routes, backup verification, and rollback rehearsal after any fixes made from this review.
`;
}

function representativePageIds(manifest) {
  return (manifest.pages ?? [])
    .map((page) => page.id)
    .filter((id) => typeof id === "string" && !isStarterPageId(id))
    .slice(0, 12);
}

function representativeMediaIds(manifest) {
  return (manifest.mediaObjects ?? [])
    .filter((object) => object.role === "current")
    .map((object) => object.mediaId)
    .filter((id) => typeof id === "string")
    .slice(0, 12);
}

function isStarterPageId(id) {
  return STARTER_PAGE_IDS.has(id) || id.startsWith("playground:");
}

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    output: DEFAULT_OUTPUT,
    baseUrl: DEFAULT_BASE_URL,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      args.manifest = argv[++index] ?? "";
    } else if (arg === "--output") {
      args.output = argv[++index] ?? "";
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.help) {
    if (!args.manifest) throw new Error("--manifest is required.");
    if (!args.output) throw new Error("--output is required.");
  }

  return args;
}

function usage() {
  return `Usage: node scripts/post-import-content-review.mjs [options]

Generates a markdown review checklist from a completed DokuWiki import hash manifest.

Options:
  --manifest <file>  Import hash manifest JSON. Defaults to ${DEFAULT_MANIFEST}
  --output <file>    Markdown checklist output. Defaults to ${DEFAULT_OUTPUT}
  --base-url <url>   Pages deployment URL. Defaults to ${DEFAULT_BASE_URL}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const markdown = buildPostImportContentReview({
    manifest,
    baseUrl: args.baseUrl,
    generatedAt: new Date().toISOString()
  });

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, markdown, "utf8");
  console.log(`post-import content review written to ${args.output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
