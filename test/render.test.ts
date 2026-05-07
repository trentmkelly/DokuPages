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

  it("renders internal links, external links, and media embeds", () => {
    const rendered = renderWikiText(
      "[[wiki:syntax|Syntax]] [[https://example.test|Example]] {{wiki:dokuwiki.svg|Logo}}"
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki%2Fsyntax">Syntax</a>');
    expect(rendered.html).toContain('<a href="https://example.test">Example</a>');
    expect(rendered.html).toContain('<img src="/media/wiki%2Fdokuwiki.svg" alt="Logo">');
  });

  it("renders lists, code blocks, and nowiki spans", () => {
    const rendered = renderWikiText("  * first\n  * **second**\n\n  <unsafe>\n\n%%**literal**%%");

    expect(rendered.html).toContain("<ul><li>first</li><li><strong>second</strong></li></ul>");
    expect(rendered.html).toContain("<pre><code>&lt;unsafe&gt;</code></pre>");
    expect(rendered.html).toContain("<p>**literal**</p>");
  });

  it("renders simple DokuWiki tables", () => {
    const rendered = renderWikiText("^ Head ^\n| Cell |");

    expect(rendered.html).toBe("<table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>");
  });
});
