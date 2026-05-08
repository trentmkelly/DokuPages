import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const upstreamRoot = resolve(repoRoot, "../dokuwiki");
const upstreamRenderCli = resolve(upstreamRoot, "bin/render.php");
const phpAvailable = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;

const fixtures = [
  {
    name: "basic",
    pageId: "wiki:basic_fixture",
    file: resolve(repoRoot, "test/fixtures/parity/basic.txt")
  },
  {
    name: "links",
    pageId: "wiki:links_fixture",
    file: resolve(repoRoot, "test/fixtures/parity/links.txt")
  }
];

describe("upstream DokuWiki render parity harness", () => {
  it.skipIf(!existsSync(upstreamRenderCli) || !phpAvailable)(
    "renders fixture pages with upstream PHP and native renderer before diffing normalized HTML",
    () => {
      for (const fixture of fixtures) {
        const source = readFileSync(fixture.file, "utf8");
        const upstream = renderWithUpstreamDokuWiki(source);
        const native = renderWikiText(source, { pageId: fixture.pageId }).html;

        expect(normalizeRenderedHtml(native), diffMessage(fixture.name, upstream, native)).toBe(
          normalizeRenderedHtml(upstream)
        );
      }
    }
  );
});

function renderWithUpstreamDokuWiki(source) {
  const result = spawnSync("php", [upstreamRenderCli], {
    input: source,
    encoding: "utf8",
    cwd: upstreamRoot,
    timeout: 10_000
  });

  if (result.status !== 0) {
    throw new Error(
      `Upstream DokuWiki render failed with status ${result.status ?? "signal " + result.signal}:\n${result.stderr}`
    );
  }

  return result.stdout;
}

function normalizeRenderedHtml(html) {
  return html
    .replace(/href="[^"]*\/doku\.php\?id=([^"]+)"/g, (_match, id) => {
      return `href="/wiki/${String(id).replaceAll(":", "/")}"`;
    })
    .replace(/<div class="level\d+">\s*/g, "")
    .replace(/\s*<\/div>/g, "")
    .replace(/\s*class="sectionedit\d+"/g, "")
    .replace(/<a class="secedit"[^>]*>Edit<\/a>/g, "")
    .replace(/\s+title="[^"]*"/g, "")
    .replace(/\s+data-wiki-id="[^"]*"/g, "")
    .replace(/\s+rel="[^"]*"/g, "")
    .replace(/<hr \/>/g, "<hr>")
    .replace(/<p>\s+/g, "<p>")
    .replace(/\s+<\/p>/g, "</p>")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function diffMessage(name, upstream, native) {
  return [
    `Normalized render parity mismatch for ${name}.`,
    "Upstream normalized:",
    normalizeRenderedHtml(upstream),
    "Native normalized:",
    normalizeRenderedHtml(native)
  ].join("\n");
}
