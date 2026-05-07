import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";

describe("renderWikiText", () => {
  it("renders headings, title metadata, and a table of contents", () => {
    const rendered = renderWikiText("====== Welcome Page ======\n\nText");

    expect(rendered.title).toBe("Welcome Page");
    expect(rendered.toc).toEqual([{ id: "welcome-page", level: 1, title: "Welcome Page" }]);
    expect(rendered.html).toContain('<h1 id="welcome-page">Welcome Page</h1>');
  });

  it("renders paragraphs and inline formatting", () => {
    const rendered = renderWikiText(
      "**bold** //italic// __under__ ''code'' ,,sub,, <sup>sup</sup> <del>gone</del>"
    );

    expect(rendered.html).toContain("<strong>bold</strong>");
    expect(rendered.html).toContain("<em>italic</em>");
    expect(rendered.html).toContain("<u>under</u>");
    expect(rendered.html).toContain("<code>code</code>");
    expect(rendered.html).toContain("<sub>sub</sub>");
    expect(rendered.html).toContain("<sup>sup</sup>");
    expect(rendered.html).toContain("<del>gone</del>");
  });

  it("renders forced line breaks, entities, and typography replacements", () => {
    const rendered = renderWikiText("first \\\\\nsecond (c) (tm) -> <- <-> => <= ... --- --");

    expect(rendered.html).toContain("first <br>second");
    expect(rendered.html).toContain("&copy;");
    expect(rendered.html).toContain("&trade;");
    expect(rendered.html).toContain("&rarr;");
    expect(rendered.html).toContain("&larr;");
    expect(rendered.html).toContain("&harr;");
    expect(rendered.html).toContain("&rArr;");
    expect(rendered.html).toContain("&lArr;");
    expect(rendered.html).toContain("&hellip;");
    expect(rendered.html).toContain("&mdash;");
    expect(rendered.html).toContain("&ndash;");
  });

  it("renders internal links, external links, and media embeds", () => {
    const rendered = renderWikiText(
      "[[wiki:syntax|Syntax]] [[https://example.test|Example]] {{wiki:dokuwiki.svg|Logo}}"
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax">Syntax</a>');
    expect(rendered.html).toContain(
      '<a href="https://example.test" rel="nofollow noopener noreferrer">Example</a>'
    );
    expect(rendered.html).toContain('<img src="/media/wiki/dokuwiki.svg" alt="Logo">');
  });

  it("renders namespace-relative internal links from page context", () => {
    const rendered = renderWikiText(
      "[[child|Child]] [[:start|Start]] [[..:root|Root]] [[wiki:syntax#head line|Syntax]] [[#local section|Local]]",
      { pageId: "wiki:guide:page" }
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki/guide/child">Child</a>');
    expect(rendered.html).toContain('<a href="/wiki/start">Start</a>');
    expect(rendered.html).toContain('<a href="/wiki/wiki/root">Root</a>');
    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax#head-line">Syntax</a>');
    expect(rendered.html).toContain('<a href="#local-section">Local</a>');
  });

  it("renders lists, code blocks, and nowiki spans", () => {
    const rendered = renderWikiText("  * first\n  * **second**\n\n  <unsafe>\n\n%%**literal**%%");

    expect(rendered.html).toContain("<ul><li>first</li><li><strong>second</strong></li></ul>");
    expect(rendered.html).toContain("<pre><code>&lt;unsafe&gt;</code></pre>");
    expect(rendered.html).toContain("<p>**literal**</p>");
  });

  it("renders DokuWiki file blocks, quotes, and footnotes", () => {
    const rendered = renderWikiText(
      "<file txt example.txt>\n<unsafe>\n</file>\n\n> quoted **text**\n\nText((foot **note**))."
    );

    expect(rendered.html).toContain(
      '<dl class="file"><dt>example.txt</dt><dd><pre><code>&lt;unsafe&gt;</code></pre></dd></dl>'
    );
    expect(rendered.html).toContain("<blockquote><p>quoted <strong>text</strong></p></blockquote>");
    expect(rendered.html).toContain('<sup><a href="#fn__1" id="fnt__1">1)</a></sup>');
    expect(rendered.html).toContain('<div class="footnotes">');
    expect(rendered.html).toContain('<div class="fn" id="fn__1">');
    expect(rendered.html).toContain("foot <strong>note</strong>");
  });

  it("renders simple DokuWiki tables", () => {
    const rendered = renderWikiText("^ Head ^\n| Cell |");

    expect(rendered.html).toBe("<table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>");
  });
});
