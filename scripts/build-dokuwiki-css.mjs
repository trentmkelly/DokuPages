import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import less from "less";
import prettier from "prettier";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const upstreamRoot = path.resolve(repoRoot, "../dokuwiki/lib/tpl/dokuwiki");
const upstreamStyleIni = path.join(upstreamRoot, "style.ini");
const overridesPath = path.join(repoRoot, "src/styles/dokuwiki-pages-overrides.css");
const outputPath = path.join(repoRoot, "public/dokuwiki.css");
const publicImagesPath = path.join(repoRoot, "public/images");
const checkMode = process.argv.includes("--check");

const lessVariables = `@ini_text: var(--dw-text);
@ini_background: var(--dw-background);
@ini_text_alt: var(--dw-text-alt);
@ini_background_alt: var(--dw-background-alt);
@ini_text_neu: var(--dw-text-neutral);
@ini_background_neu: var(--dw-background-neutral);
@ini_border: var(--dw-border);
@ini_highlight: var(--dw-highlight);
@ini_link: var(--dw-link);
@ini_background_site: var(--dw-background-site);
@ini_existing: var(--dw-existing);
@ini_missing: var(--dw-missing);
@ini_site_width: var(--dw-site-width);
@ini_sidebar_width: 16em;
@ini_tablet_width: 800px;
@ini_phone_width: 520px;
@ini_theme_color: #008800;
`;

const css = await buildCss();

if (checkMode) {
  const current = await readFile(outputPath, "utf8");
  await verifyReferencedImages(css);
  if (current !== css) {
    console.error("public/dokuwiki.css is out of date. Run `npm run style:build`.");
    process.exitCode = 1;
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, css);
  await copyReferencedImages(css);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}

async function buildCss() {
  const styleIni = await readFile(upstreamStyleIni, "utf8");
  const stylesheets = parseStyleIni(styleIni);
  const screenFiles = stylesheets.filter(({ media }) => media === "screen" || media === "all");
  const printFiles = stylesheets.filter(({ media }) => media === "print");
  const [screenCss, printCss, overrides] = await Promise.all([
    compileStylesheets(screenFiles),
    compileStylesheets(printFiles),
    readFile(overridesPath, "utf8")
  ]);
  const normalizedScreenCss = normalizeUpstreamCss(screenCss);
  const normalizedPrintCss = normalizeUpstreamCss(printCss);
  const banner = await buildBanner(stylesheets, styleIni);
  const combined = `${banner}

${rootVariables()}

/* Begin upstream DokuWiki default-template CSS generated from style.ini. */
${normalizedScreenCss}

@media print {
${indentCss(normalizedPrintCss)}
}

/* Begin Pages-specific overrides. */
${overrides.trim()}
`;

  const prettierConfig = (await prettier.resolveConfig(outputPath)) ?? {};
  return prettier.format(combined, { ...prettierConfig, parser: "css" });
}

function parseStyleIni(styleIni) {
  const stylesheets = [];
  let section = "";

  for (const rawLine of styleIni.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section !== "stylesheets") continue;
    const match = line.match(/^([^=]+?)\s*=\s*(screen|all|print)\b/);
    if (!match) continue;
    stylesheets.push({ file: match[1].trim(), media: match[2] });
  }

  return stylesheets;
}

async function compileStylesheets(stylesheets) {
  if (stylesheets.length === 0) return "";
  const imports = stylesheets
    .map(({ file }) => `@import (less) "${path.join(upstreamRoot, file).replaceAll("\\", "/")}";`)
    .join("\n");
  const rendered = await less.render(`${lessVariables}\n${imports}\n`, {
    filename: path.join(upstreamRoot, "dokuwiki-pages.generated.less"),
    math: "always",
    paths: [upstreamRoot],
    rewriteUrls: "off"
  });

  return rendered.css;
}

function normalizeUpstreamCss(css) {
  const placeholders = {
    __background__: "var(--dw-background)",
    __background_alt__: "var(--dw-background-alt)",
    __background_neu__: "var(--dw-background-neutral)",
    __background_site__: "var(--dw-background-site)",
    __border__: "var(--dw-border)",
    __existing__: "var(--dw-existing)",
    __highlight__: "var(--dw-highlight)",
    __link__: "var(--dw-link)",
    __missing__: "var(--dw-missing)",
    __sidebar_width__: "var(--dw-sidebar-width)",
    __site_width__: "var(--dw-site-width)",
    __text__: "var(--dw-text)",
    __text_alt__: "var(--dw-text-alt)",
    __text_neu__: "var(--dw-text-neutral)"
  };
  let normalized = css
    .replace(/url\((["']?)(?:\.\.\/\.\.\/images\/|images\/)([^"')]+)\1\)/g, 'url("/images/$2")')
    .replace(/url\((["']?)\/images\/([^"')]+)\1\)/g, 'url("/images/$2")')
    .replace(/\/\*# sourceMappingURL=.*?\*\//g, "")
    .replaceAll("▼", "\\25BC")
    .replaceAll("▲", "\\25B2")
    .trim();
  for (const [placeholder, replacement] of Object.entries(placeholders)) {
    normalized = normalized.replaceAll(placeholder, replacement);
  }
  return normalized;
}

function rootVariables() {
  return `:root {
  --dw-text: #333;
  --dw-text-alt: #999;
  --dw-text-neutral: #666;
  --dw-link: #2b73b7;
  --dw-existing: #080;
  --dw-missing: #d30;
  --dw-border: #ccc;
  --dw-background: #fff;
  --dw-background-site: #fbfaf9;
  --dw-background-alt: #eee;
  --dw-background-neutral: #ddd;
  --dw-highlight: #ff9;
  --dw-site-width: 75em;
  --dw-sidebar-width: 16em;
  color-scheme: light;
}`;
}

async function buildBanner(stylesheets, styleIni) {
  const fingerprints = await Promise.all(
    stylesheets.map(async ({ file, media }) => {
      const fullPath = path.join(upstreamRoot, file);
      return {
        file,
        media,
        hash: digest(await readFile(fullPath, "utf8")).slice(0, 12)
      };
    })
  );
  const styleHash = digest(styleIni).slice(0, 12);
  const overrideHash = digest(await readFile(overridesPath, "utf8")).slice(0, 12);
  const sources = fingerprints
    .map(({ file, media, hash }) => ` * - ${file} (${media}) sha256:${hash}`)
    .join("\n");

  return `/*
 * Generated by scripts/build-dokuwiki-css.mjs. Do not edit public/dokuwiki.css directly.
 *
 * Upstream source: ../dokuwiki/lib/tpl/dokuwiki/style.ini sha256:${styleHash}
${sources}
 * Pages override source: src/styles/dokuwiki-pages-overrides.css sha256:${overrideHash}
 *
 * This stylesheet compiles and adapts the upstream DokuWiki default template
 * (GPL-2.0), then appends the Cloudflare Pages port overrides.
 * See NOTICE.md, COPYING, public/images/license.txt, and
 * public/images/pagetools/license.txt in this repository.
 */`;
}

function indentCss(css) {
  return css
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function copyReferencedImages(css) {
  const images = referencedImages(css);
  await mkdir(publicImagesPath, { recursive: true });
  for (const image of images) {
    const destination = path.join(publicImagesPath, image);
    if (await fileExists(destination)) continue;
    const source = await findUpstreamImage(image);
    if (!source) {
      throw new Error(`No upstream source found for /images/${image}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function verifyReferencedImages(css) {
  const missing = [];
  for (const image of referencedImages(css)) {
    if (!(await fileExists(path.join(publicImagesPath, image)))) {
      missing.push(`/images/${image}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Generated CSS references missing public assets: ${missing.join(", ")}`);
  }
}

function referencedImages(css) {
  const images = new Set();
  const pattern = /url\(["']?\/images\/([^"')]+)["']?\)/g;
  let match;
  while ((match = pattern.exec(css))) {
    images.add(match[1]);
  }
  return [...images].filter((image) => !image.startsWith("data:")).sort();
}

async function findUpstreamImage(image) {
  const candidates = [
    path.join(upstreamRoot, "images", image),
    path.resolve(repoRoot, "../dokuwiki/lib/images", image),
    path.resolve(repoRoot, "../dokuwiki/lib/plugins/acl/pix", path.basename(image))
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
