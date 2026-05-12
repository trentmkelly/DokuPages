import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";
import { findWordblockMatch } from "../src/wiki/wordblock";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const upstreamRoot = resolve(repoRoot, "../dokuwiki");
const upstreamParserModeDir = resolve(upstreamRoot, "inc/Parsing/ParserMode");
const upstreamInit = resolve(upstreamRoot, "inc/init.php");
const phpAvailable = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;
const upstreamRenderScript = `
if (!defined('DOKU_INC')) define('DOKU_INC', getcwd() . '/');
define('NOSESSION', 1);
require_once(DOKU_INC . 'inc/init.php');
global $ID, $conf;
$ID = getenv('DOKU_RENDER_ID') ?: '';
$overrides = json_decode(getenv('DOKU_RENDER_CONF') ?: '{}', true);
if (is_array($overrides)) {
    foreach ($overrides as $key => $value) {
        $conf[$key] = $value;
    }
}
$source = stream_get_contents(STDIN);
$info = [];
$result = p_render('xhtml', p_get_instructions($source), $info);
if (is_null($result)) {
    fwrite(STDERR, 'No xhtml renderer');
    exit(2);
}
echo $result;
`;

const existingPageIds = new Set(["wiki:syntax", "wiki:dokuwiki", "wiki:welcome"]);

const parserModeCases = [
  {
    mode: "Acronym",
    source: "HTML",
    feature: extractAbbreviations
  },
  {
    mode: "Camelcaselink",
    source: "MissingCamelCase",
    upstreamConfig: { camelcase: 1 },
    nativeOptions: { camelCaseLinks: true, existingPageIds: new Set() },
    feature: extractLinks
  },
  {
    mode: "Code",
    source: "<code>\nconst x = 1;\n</code>",
    feature: extractPreTexts
  },
  {
    mode: "Emaillink",
    source: "<andi@splitbrain.org>",
    feature: (html) => ({
      mailLinkCount: countMatches(html, /class="[^"]*\bmail\b[^"]*"/g)
    })
  },
  {
    mode: "Entity",
    source: "(c) (tm) -> <- <->",
    feature: normalizedText
  },
  {
    mode: "Eol",
    source: "one\n\ntwo",
    feature: extractParagraphTexts
  },
  {
    mode: "Externallink",
    source: "https://example.test",
    feature: extractLinks
  },
  {
    mode: "File",
    source: "<file txt example.txt>\nbody\n</file>",
    feature: (html) => ({
      pre: extractPreTexts(html),
      text: normalizedText(html).replace(/\s+/g, " ").trim()
    })
  },
  {
    mode: "Filelink",
    source: "{{wiki:manual.pdf?linkonly|Manual}}",
    feature: extractLinks
  },
  {
    mode: "Footnote",
    source: "note((footnote))",
    feature: (html) => extractClassTexts(html, "fn")
  },
  {
    mode: "Formatting",
    source: "**bold** //em// __under__ ''mono'' <sub>sub</sub> <sup>sup</sup> <del>del</del>",
    feature: (html) => ({
      bold: tagText(html, "strong"),
      emphasis: tagText(html, "em"),
      underline: underlineText(html),
      code: tagText(html, "code"),
      subscript: tagText(html, "sub"),
      superscript: tagText(html, "sup"),
      deleted: tagText(html, "del")
    })
  },
  {
    mode: "Header",
    source: "====== Heading ======",
    feature: extractHeadings
  },
  {
    mode: "Hr",
    source: "before\n\n----\n\nafter",
    feature: (html) => ({ horizontalRules: countMatches(html, /<hr\b/g) })
  },
  {
    mode: "Internallink",
    source: "[[wiki:syntax|Syntax]]",
    nativeOptions: { existingPageIds },
    feature: extractLinks
  },
  {
    mode: "Linebreak",
    source: "one \\\\\ntwo",
    feature: (html) => ({ forcedBreaks: countMatches(html, /<br\b/g) })
  },
  {
    mode: "Listblock",
    source: "  * item\n    * nested",
    feature: extractListTexts
  },
  {
    mode: "Media",
    source: "{{wiki:image.png|Image}}",
    feature: extractImages
  },
  {
    mode: "Multiplyentity",
    source: "640x480",
    feature: normalizedText
  },
  {
    mode: "Nocache",
    source: "~~NOCACHE~~\ntext",
    nativeDirective: (rendered) => rendered.noCache === true,
    feature: normalizedText
  },
  {
    mode: "Notoc",
    source: "~~NOTOC~~\n====== Heading ======",
    nativeDirective: (rendered) => rendered.noToc === true,
    feature: extractHeadings
  },
  {
    mode: "Plugin",
    source: "~~INFO:syntaxplugins~~",
    feature: (html) => ({
      hasInfoPluginOutput: /syntax\s+plugins|info\s+plugin/i.test(normalizedText(html))
    })
  },
  {
    mode: "Preformatted",
    source: "  preformatted",
    feature: extractPreTexts
  },
  {
    mode: "Quote",
    source: "> quote\n>> nested",
    feature: (html) => ({
      blockquotes: countMatches(html, /<blockquote\b/g),
      text: normalizedText(html)
    })
  },
  {
    mode: "Quotes",
    source: '"quote"',
    nativeOptions: { typographyMode: 1 },
    feature: normalizedText
  },
  {
    mode: "Rss",
    source: "{{rss>http://127.0.0.1:9/feed.xml 1}}",
    nativeDirective: (rendered) => rendered.noCache === true,
    feature: (html) => ({
      rssList: countMatches(html, /class="[^"]*\brss\b[^"]*"/g) > 0
    })
  },
  {
    mode: "Smiley",
    source: ":-)",
    feature: (html) => extractImages(html).map((image) => image.alt)
  },
  {
    mode: "Table",
    source: "^ Head ^\n| Cell |",
    feature: extractTables
  },
  {
    mode: "Unformatted",
    source: "%%**literal**%%",
    feature: normalizedText
  },
  {
    mode: "Windowssharelink",
    source: String.raw`[[\\server\share|share]]`,
    feature: (html) => ({
      links: extractLinks(html),
      windowsClassCount: countMatches(html, /class="[^"]*\bwindows\b[^"]*"/g)
    })
  },
  {
    mode: "Wordblock",
    policy: () => {
      expect(findWordblockMatch("zoosex spam")).toMatchObject({ pattern: "zoosex" });
    }
  }
];

describe("upstream parser mode parity", () => {
  it("has one parity or policy fixture for every upstream parser mode class", () => {
    expect(parserModeCases.map((entry) => entry.mode).sort()).toEqual(upstreamParserModeNames());
  });

  it.skipIf(!existsSync(upstreamInit) || !phpAvailable)(
    "matches upstream parser-mode fixtures after mode-specific normalization",
    () => {
      for (const testCase of parserModeCases) {
        if (testCase.policy) {
          testCase.policy();
          continue;
        }

        const upstream = renderWithUpstreamDokuWiki(testCase);
        const nativeResult = renderWikiText(testCase.source, {
          pageId: "wiki:mode",
          existingPageIds,
          ...(testCase.nativeOptions ?? {})
        });
        const native = nativeResult.html;

        if (testCase.nativeDirective) {
          expect(testCase.nativeDirective(nativeResult), testCase.mode).toBe(true);
        }

        expect(testCase.feature(normalizeModeHtml(native)), testCase.mode).toEqual(
          testCase.feature(normalizeModeHtml(upstream))
        );
      }
    }
  );
});

function upstreamParserModeNames() {
  return readdirSync(upstreamParserModeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.replace(/\.php$/, ""))
    .filter((name) => !["AbstractMode", "Base", "ModeInterface"].includes(name))
    .sort();
}

function renderWithUpstreamDokuWiki(testCase) {
  const result = spawnSync("php", ["-r", upstreamRenderScript], {
    input: testCase.source,
    encoding: "utf8",
    cwd: upstreamRoot,
    env: {
      ...process.env,
      DOKU_RENDER_ID: "wiki:mode",
      DOKU_RENDER_CONF: JSON.stringify(testCase.upstreamConfig ?? {})
    },
    timeout: 10_000
  });

  if (result.status !== 0) {
    throw new Error(
      `Upstream DokuWiki render failed for ${testCase.mode} with status ${
        result.status ?? "signal " + result.signal
      }:\n${result.stderr}`
    );
  }

  return result.stdout;
}

function normalizeModeHtml(html) {
  return html
    .replace(/<!-- EDIT\{[\s\S]*?\} -->/g, "")
    .replace(/<div class="table[^"]*">(<table[\s\S]*?<\/table>)<\/div>/g, "$1")
    .replace(/<li class="level\d+(?: node)?"><div class="li">\s*/g, "<li>")
    .replace(/\s*<\/div>\s*<\/li>/g, "</li>")
    .replace(/<div class="level\d+">\s*/g, "")
    .replace(/\s*<\/div>/g, "")
    .replace(/\s*class="sectionedit\d+"/g, "")
    .replace(/<img([^>]*?)\s*\/>/g, "<img$1>")
    .replace(/<hr \/>/g, "<hr>")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function extractAbbreviations(html) {
  return [...html.matchAll(/<abbr\s+[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/abbr>/g)].map(
    (match) => ({
      title: decodeHtmlEntities(match[1]),
      text: htmlText(match[2])
    })
  );
}

function extractParagraphTexts(html) {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((match) => htmlText(match[1]));
}

function extractPreTexts(html) {
  return [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => htmlText(match[1]));
}

function extractHeadings(html) {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({
    level: Number(match[1]),
    text: htmlText(match[2])
  }));
}

function extractLinks(html) {
  return [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: normalizeHref(match[1]),
    text: htmlText(match[2])
  }));
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

function extractListTexts(html) {
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) => htmlText(match[1]));
}

function extractClassTexts(html, className) {
  return [
    ...html.matchAll(
      new RegExp(
        `<[^>]+class="[^"]*\\\\b${className}\\\\b[^"]*"[^>]*>([\\\\s\\\\S]*?)<\\/[^>]+>`,
        "g"
      )
    )
  ].map((match) => htmlText(match[1]));
}

function tagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? htmlText(match[1]) : "";
}

function underlineText(html) {
  return tagText(html, "u") || tagTextWithClass(html, "em", "u");
}

function tagTextWithClass(html, tag, className) {
  const match = html.match(
    new RegExp(`<${tag}[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`)
  );
  return match ? htmlText(match[1]) : "";
}

function normalizedText(html) {
  return htmlText(html).replace(/\u00d7/g, "x");
}

function htmlText(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function normalizeHref(value) {
  return decodeHtmlEntities(value)
    .replace(/^https?:\/\/[^/]+\/doku\.php\?/i, "/doku.php?")
    .replace(/^\/doku\.php\?id=([^&]+).*$/i, (_match, id) => {
      return `/wiki/${decodeURIComponent(id).replaceAll(":", "/").toLowerCase()}`;
    })
    .replace(/\/lib\/exe\/fetch\.php\?media=([^"&]+)[^"]*/g, (_match, media) => {
      return `/media/${decodeURIComponent(media).replaceAll(":", "/")}`;
    })
    .replace(/\/lib\/exe\/detail\.php\?media=([^"&]+)[^"]*/g, (_match, media) => {
      return `/media-detail/${decodeURIComponent(media).replaceAll(":", "/")}`;
    })
    .replace(/%3A/gi, ":")
    .replace(/&amp;/g, "&")
    .replace(/\/wiki\/([^"#?]+)/g, (_match, pagePath) => `/wiki/${pagePath.toLowerCase()}`)
    .replace(/[?&]rev=$/, "");
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
    .replace(/&copy;/g, "©")
    .replace(/&trade;/g, "™")
    .replace(/&reg;/g, "®")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&harr;/g, "↔");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}
