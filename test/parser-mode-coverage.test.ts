import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";
import { findWordblockMatch } from "../src/wiki/wordblock";

type RenderOptions = NonNullable<Parameters<typeof renderWikiText>[1]>;

function rendered(source: string, options: RenderOptions = {}): string {
  return renderWikiText(source, { pageId: "wiki:mode", ...options }).html;
}

describe("upstream parser mode coverage", () => {
  it("covers every upstream parser mode with a native fixture or explicit policy", () => {
    expect(rendered("HTML")).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(
      rendered("MissingCamelCase", { camelCaseLinks: true, existingPageIds: new Set() })
    ).toContain('class="wikilink2" title="This topic does not exist yet">MissingCamelCase</a>');
    expect(rendered("<code>\nconst x = 1;\n</code>")).toContain(
      '<pre class="code"><code>const x = 1;</code></pre>'
    );
    expect(rendered("<andi@splitbrain.org>")).toContain('class="mail"');
    expect(rendered("(c)")).toContain("©");
    expect(rendered("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
    expect(rendered("https://example.test")).toContain('class="urlextern"');
    expect(rendered("<file txt example.txt>\nbody\n</file>")).toContain(
      'class="mediafile mf_txt">example.txt</a>'
    );
    expect(rendered("{{wiki:manual.pdf?linkonly|Manual}}")).toContain(
      '<a href="/media/wiki/manual.pdf" class="media"'
    );
    expect(rendered("note((footnote))")).toContain('<div class="footnotes">');
    expect(
      rendered("**bold** //em// __under__ ''mono'' ,,sub,, <sup>sup</sup> <del>del</del>")
    ).toContain("<strong>bold</strong>");
    expect(rendered("====== Heading ======")).toContain('<h1 id="heading">Heading');
    expect(rendered("before\n\n----\n\nafter")).toContain("<hr>");
    expect(rendered("[[wiki:syntax|Syntax]]")).toContain('href="/wiki/wiki/syntax"');
    expect(rendered("one \\\\\ntwo")).toContain("one <br>two");
    expect(rendered("  * item\n    * nested")).toContain(
      "<ul><li>item<ul><li>nested</li></ul></li></ul>"
    );
    expect(rendered("{{wiki:image.png|Image}}")).toContain('<img src="/media/wiki/image.png"');
    expect(rendered("640x480")).toContain("640&times;480");

    const noCache = renderWikiText("~~NOCACHE~~");
    const noToc = renderWikiText("~~NOTOC~~\n====== Heading ======");
    expect(noCache.noCache).toBe(true);
    expect(noToc.noToc).toBe(true);

    expect(rendered("~~INFO:syntaxplugins~~")).toContain("Info Plugin");
    expect(rendered("  preformatted")).toContain("<pre><code>preformatted</code></pre>");
    expect(rendered("> quote\n>> nested")).toContain("<blockquote><p>quote</p><blockquote>");
    expect(rendered('"quote"', { typographyMode: 1 })).toContain("“quote”");
    expect(rendered("{{rss>https://example.com/feed}}")).toContain('<ul class="rss">');
    expect(rendered(":-)")).toContain("/images/smileys/smile.svg");
    expect(rendered("^ Head ^\n| Cell |")).toContain("<table>");
    expect(rendered("%%**literal**%%")).toBe("<p>**literal**</p>");
    expect(rendered(String.raw`[[\\server\share|share]]`)).toContain('class="windows"');
    expect(findWordblockMatch("zoosex spam")).toMatchObject({ pattern: "zoosex" });
  });
});
