import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";

describe("renderWikiText", () => {
  it("renders headings, title metadata, and a table of contents", () => {
    const rendered = renderWikiText("====== Welcome Page ======\n\nText");

    expect(rendered.title).toBe("Welcome Page");
    expect(rendered.toc).toEqual([{ id: "welcome-page", level: 1, title: "Welcome Page" }]);
    expect(rendered.html).toContain('<h1 id="welcome-page">Welcome Page</h1>');
  });

  it("honors standalone rendering control macros", () => {
    const rendered = renderWikiText("~~NOTOC~~\n~~NOCACHE~~\n====== One ======\n\n===== Two =====");

    expect(rendered.noToc).toBe(true);
    expect(rendered.noCache).toBe(true);
    expect(rendered.toc).toEqual([]);
    expect(rendered.html).toContain('<h1 id="one">One</h1>');
    expect(rendered.html).not.toContain("~~NOTOC~~");
    expect(rendered.html).not.toContain("~~NOCACHE~~");
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
    const rendered = renderWikiText(
      "first \\\\\nsecond (c) (tm) -> <- <-> => <= <=> >> << ... --- --"
    );

    expect(rendered.html).toContain("first <br>second");
    expect(rendered.html).toContain("&copy;");
    expect(rendered.html).toContain("&trade;");
    expect(rendered.html).toContain("&rarr;");
    expect(rendered.html).toContain("&larr;");
    expect(rendered.html).toContain("&harr;");
    expect(rendered.html).toContain("&rArr;");
    expect(rendered.html).toContain("&lArr;");
    expect(rendered.html).toContain("&hArr;");
    expect(rendered.html).toContain("&raquo;");
    expect(rendered.html).toContain("&laquo;");
    expect(rendered.html).toContain("&hellip;");
    expect(rendered.html).toContain("&mdash;");
    expect(rendered.html).toContain("&ndash;");
  });

  it("renders default DokuWiki smileys", () => {
    const rendered = renderWikiText("Hello :-) LOL wordLOL [[wiki:syntax|LOL]]");
    const literal = renderWikiText("%%:-)%%");

    expect(rendered.html).toContain(
      '<img src="/images/smileys/smile.svg" class="icon smiley" alt=":-)">'
    );
    expect(rendered.html).toContain(
      '<img src="/images/smileys/lol.svg" class="icon smiley" alt="LOL">'
    );
    expect(rendered.html).toContain("wordLOL");
    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax">LOL</a>');
    expect(literal.html).toBe("<p>:-)</p>");
  });

  it("renders default DokuWiki acronyms after smileys", () => {
    const rendered = renderWikiText("HTML FOSS TL;DR specification spec LOL wordHTML %%HTML%%");

    expect(rendered.html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(rendered.html).toContain('<abbr title="Free &amp; Open-Source Software">FOSS</abbr>');
    expect(rendered.html).toContain('<abbr title="Too long; didn&#39;t read">TL;DR</abbr>');
    expect(rendered.html).toContain("specification");
    expect(rendered.html).toContain('<abbr title="specification">spec</abbr>');
    expect(rendered.html).toContain('<img src="/images/smileys/lol.svg"');
    expect(rendered.html).toContain("wordHTML");
    expect(rendered.html).toContain("HTML</p>");
  });

  it("renders internal links, external links, and media embeds", () => {
    const rendered = renderWikiText(
      "[[wiki:syntax|Syntax]] [[https://example.test|Example]] [[http://www.google.com|Google]] {{wiki:dokuwiki.svg|Logo}}"
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax">Syntax</a>');
    expect(rendered.html).toContain(
      '<a href="https://example.test" rel="nofollow noopener noreferrer">Example</a>'
    );
    expect(rendered.html).toContain(
      '<a href="http://www.google.com" rel="nofollow noopener noreferrer">Google</a>'
    );
    expect(rendered.html).not.toContain("http:<em>");
    expect(rendered.html).toContain('<img src="/media/wiki/dokuwiki.svg" alt="Logo">');
  });

  it("renders automatic external links", () => {
    const rendered = renderWikiText("Visit http://www.google.com or www.example.org.");

    expect(rendered.html).toContain(
      '<a href="http://www.google.com" rel="nofollow noopener noreferrer">http://www.google.com</a>'
    );
    expect(rendered.html).toContain(
      '<a href="http://www.example.org" rel="nofollow noopener noreferrer">www.example.org</a>.'
    );
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

  it("renders interwiki links from the default DokuWiki map", () => {
    const rendered = renderWikiText(
      "[[doku>newsletter]] [[doku>faq:sidebar|FAQ]] [[wp>Wiki|Wiki]] [[this>doku.php?do=admin&page=config|config]]"
    );

    expect(rendered.html).toContain(
      '<a href="https://www.dokuwiki.org/newsletter" rel="nofollow noopener noreferrer">doku&gt;newsletter</a>'
    );
    expect(rendered.html).toContain(
      '<a href="https://www.dokuwiki.org/faq:sidebar" rel="nofollow noopener noreferrer">FAQ</a>'
    );
    expect(rendered.html).toContain(
      '<a href="https://en.wikipedia.org/wiki/Wiki" rel="nofollow noopener noreferrer">Wiki</a>'
    );
    expect(rendered.html).toContain('<a href="/doku.php?do=admin&amp;page=config">config</a>');
  });

  it("renders Windows share links", () => {
    const rendered = renderWikiText(String.raw`[[\\server\share|this]]`);

    expect(rendered.html).toContain('<a href="file://///server/share" class="windows">this</a>');
  });

  it("renders email links with default hex mailguard obfuscation", () => {
    const autoEmail =
      "&#97;&#110;&#100;&#105;&#64;&#115;&#112;&#108;&#105;&#116;&#98;&#114;&#97;&#105;&#110;&#46;&#111;&#114;&#103;";
    const linkedEmail =
      "&#116;&#101;&#97;&#109;&#64;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#46;&#111;&#114;&#103;";
    const rendered = renderWikiText("<andi@splitbrain.org> [[team@example.org|Team]]");

    expect(rendered.html).toContain(
      `<a href="mailto:${autoEmail}" class="mail" title="${autoEmail}">${autoEmail}</a>`
    );
    expect(rendered.html).toContain(
      `<a href="mailto:${linkedEmail}" class="mail" title="${linkedEmail}">Team</a>`
    );
    expect(rendered.html).not.toContain("andi@splitbrain.org");
    expect(rendered.html).not.toContain("team@example.org");
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
