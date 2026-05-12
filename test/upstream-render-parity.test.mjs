import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { URLSearchParams } from "node:url";
import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const upstreamRoot = resolve(repoRoot, "../dokuwiki");
const upstreamInit = resolve(upstreamRoot, "inc/init.php");
const phpAvailable = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;
const upstreamRenderScript = `
if (!defined('DOKU_INC')) define('DOKU_INC', getcwd() . '/');
define('NOSESSION', 1);
require_once(DOKU_INC . 'inc/init.php');
global $ID;
$ID = getenv('DOKU_RENDER_ID') ?: '';
$source = stream_get_contents(STDIN);
$info = [];
$result = p_render('xhtml', p_get_instructions($source), $info);
if (is_null($result)) {
    fwrite(STDERR, 'No xhtml renderer');
    exit(2);
}
echo $result;
`;

const fixtures = [
  {
    name: "basic",
    pageId: "wiki:basic_fixture",
    file: resolve(repoRoot, "test/fixtures/parity/basic.txt"),
    fullHtml: true
  },
  {
    name: "links",
    pageId: "wiki:links_fixture",
    file: resolve(repoRoot, "test/fixtures/parity/links.txt"),
    fullHtml: true
  },
  {
    name: "bundled wiki:syntax",
    pageId: "wiki:syntax",
    file: resolve(upstreamRoot, "data/pages/wiki/syntax.txt")
  },
  {
    name: "bundled wiki:dokuwiki",
    pageId: "wiki:dokuwiki",
    file: resolve(upstreamRoot, "data/pages/wiki/dokuwiki.txt")
  },
  {
    name: "bundled wiki:welcome",
    pageId: "wiki:welcome",
    file: resolve(upstreamRoot, "data/pages/wiki/welcome.txt")
  },
  {
    name: "production operations page",
    pageId: "ops:runbook",
    file: resolve(repoRoot, "test/fixtures/parity/production-operations.txt")
  },
  {
    name: "production project page",
    pageId: "projects:launch:status",
    file: resolve(repoRoot, "test/fixtures/parity/production-project.txt")
  }
];

const existingPageIds = new Set([
  "wiki:syntax",
  "wiki:dokuwiki",
  "wiki:welcome",
  "playground:playground",
  "ops:runbook",
  "projects:launch:status"
]);

describe("upstream DokuWiki render parity harness", () => {
  it.skipIf(!existsSync(upstreamInit) || !phpAvailable)(
    "renders fixture pages with upstream PHP and native renderer before diffing normalized HTML",
    () => {
      for (const fixture of fixtures) {
        const source = readFileSync(fixture.file, "utf8");
        const upstream = renderWithUpstreamDokuWiki(source, fixture.pageId);
        const native = renderWikiText(source, {
          pageId: fixture.pageId,
          existingPageIds
        }).html;

        if (fixture.fullHtml) {
          expect(normalizeRenderedHtml(native), diffMessage(fixture.name, upstream, native)).toBe(
            normalizeRenderedHtml(upstream)
          );
        } else {
          expect(goldenOutput(native), diffMessage(fixture.name, upstream, native)).toEqual(
            goldenOutput(upstream)
          );
        }
      }
    }
  );
});

function renderWithUpstreamDokuWiki(source, pageId) {
  const result = spawnSync("php", ["-r", upstreamRenderScript], {
    input: source,
    encoding: "utf8",
    cwd: upstreamRoot,
    env: { ...process.env, DOKU_RENDER_ID: pageId },
    timeout: 20_000
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
    .replace(/<!-- EDIT\{[\s\S]*?\} -->/g, "")
    .replace(/<div class="table[^"]*">(<table[\s\S]*?<\/table>)<\/div>/g, "$1")
    .replace(/<li class="level\d+(?: node)?"><div class="li">\s*/g, "<li>")
    .replace(/\s*<\/div>\s*<\/li>/g, "</li>")
    .replace(/href="[^"]*\/doku\.php\?id=([^"]+)"/g, (_match, id) => {
      return `href="/wiki/${String(id).replaceAll(":", "/")}"`;
    })
    .replace(
      /src="[^"]*\/lib\/images\/smileys\/([^"]+)"/g,
      (_match, file) => `src="/images/smileys/${file}"`
    )
    .replace(/src="[^"]*\/lib\/exe\/fetch\.php\?([^"]+)"/g, (_match, query) => {
      return `src="${normalizeMediaQueryUrl(query)}"`;
    })
    .replace(/href="[^"]*\/lib\/exe\/fetch\.php\?([^"]+)"/g, (_match, query) => {
      return `href="${normalizeMediaQueryUrl(query)}"`;
    })
    .replace(/href="[^"]*\/lib\/exe\/detail\.php\?([^"]+)"/g, (_match, query) => {
      return `href="${normalizeMediaQueryUrl(query, "/media-detail")}"`;
    })
    .replace(
      /<div class="secedit editbutton_section editbutton_\d+"><form class="button btn_secedit"[\s\S]*?<\/form><\/div>/g,
      ""
    )
    .replace(/<div class="level\d+">\s*/g, "")
    .replace(/\s*<\/div>/g, "")
    .replace(/\s*class="sectionedit\d+"/g, "")
    .replace(/<a class="secedit"[^>]*>Edit<\/a>/g, "")
    .replace(/\s+title="[^"]*"/g, "")
    .replace(/\s+data-wiki-id="[^"]*"/g, "")
    .replace(/\s+rel="[^"]*"/g, "")
    .replace(/<img([^>]*?)\s*\/>/g, "<img$1>")
    .replace(/<hr \/>/g, "<hr>")
    .replace(/<p>\s+/g, "<p>")
    .replace(/\s+<\/p>/g, "</p>")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function goldenOutput(html) {
  const normalized = stripDynamicRenderSections(normalizeRenderedHtml(html));

  return {
    headings: extractHeadings(normalized),
    links: extractLinks(normalized),
    images: extractImages(normalized),
    tables: extractTables(normalized)
  };
}

function extractHeadings(html) {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({
    level: Number(match[1]),
    text: htmlText(match[2])
  }));
}

function extractLinks(html) {
  return [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => ({
      href: normalizeHref(match[1]),
      text: htmlText(match[2])
    }))
    .filter(
      (link) =>
        !link.href.includes("do=export_code") && !link.href.includes("allinurl:docs.oracle.com")
    );
}

function extractImages(html) {
  return [...html.matchAll(/<img\s+([^>]+)>/g)].map((match) => ({
    src: normalizeHref(attributeValue(match[1], "src")),
    alt: htmlText(attributeValue(match[1], "alt"))
  }));
}

function extractTables(html) {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((match) =>
    [...match[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map((cell) => htmlText(cell[1]))
        .filter(Boolean)
    )
  );
}

function attributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function htmlText(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#0*([0-9]+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&times;/g, "x")
    .replace(/&copy;/g, "(c)")
    .replace(/&trade;/g, "(tm)")
    .replace(/&reg;/g, "(r)")
    .replace(/&rarr;/g, "->")
    .replace(/&larr;/g, "<-")
    .replace(/&harr;/g, "<->")
    .replace(/&rArr;/g, "=>")
    .replace(/&lArr;/g, "<=")
    .replace(/&hArr;/g, "<=>")
    .replace(/&raquo;/g, ">>")
    .replace(/&laquo;/g, "<<")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "--");
}

function normalizeHref(value) {
  return decodeHtmlEntities(value)
    .replace(/^https?:\/\/[^/]+\/doku\.php\?/i, "/doku.php?")
    .replace(/%3A/gi, ":")
    .replace(/#([A-Za-z0-9_-]+)/g, (_match, anchor) => `#${anchor.replaceAll("_", "-")}`)
    .replace(/\/wiki\/([^"#?]+)/g, (_match, pagePath) => `/wiki/${pagePath.toLowerCase()}`);
}

function normalizeMediaQueryUrl(query, prefix = "/media") {
  const params = new URLSearchParams(decodeHtmlEntities(query));
  const media = params.get("media") ?? "";

  if (/^https?:\/\//i.test(media)) return media;

  return `${prefix}/${media.replaceAll(":", "/")}`;
}

function stripDynamicRenderSections(html) {
  return html.replace(/<ul class="rss">[\s\S]*?<\/ul>/g, '<ul class="rss"></ul>');
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
