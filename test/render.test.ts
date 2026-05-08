import { describe, expect, it } from "vitest";
import { extractCodeBlock, renderWikiText } from "../src/wiki/render";

describe("renderWikiText", () => {
  it("renders headings, title metadata, and a table of contents", () => {
    const rendered = renderWikiText("====== Welcome Page ======\n\nText", {
      pageId: "wiki:welcome"
    });

    expect(rendered.title).toBe("Welcome Page");
    expect(rendered.toc).toEqual([{ id: "welcome-page", level: 1, title: "Welcome Page" }]);
    expect(rendered.html).toContain(
      '<h1 id="welcome-page">Welcome Page<a class="secedit" href="/wiki/wiki/welcome?do=edit&amp;section=1" aria-label="Edit section Welcome Page">Edit</a></h1>'
    );
  });

  it("deduplicates heading anchors without rescanning the table of contents", () => {
    const content = Array.from({ length: 50 }, () => "===== Repeated =====").join("\n\n");

    const rendered = renderWikiText(content, { pageId: "wiki:repeated" });

    expect(rendered.toc).toHaveLength(50);
    expect(rendered.toc[0]).toMatchObject({ id: "repeated", title: "Repeated" });
    expect(rendered.toc[1]).toMatchObject({ id: "repeated-2", title: "Repeated" });
    expect(rendered.toc[49]).toMatchObject({ id: "repeated-50", title: "Repeated" });
    expect(rendered.html).toContain('id="repeated-50"');
  });

  it("omits section edit anchors without page context", () => {
    const rendered = renderWikiText("====== Welcome Page ======\n\nText");

    expect(rendered.html).toContain('<h1 id="welcome-page">Welcome Page</h1>');
    expect(rendered.html).not.toContain("secedit");
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

  it("honors DokuWiki TOC and section-edit level options", () => {
    const rendered = renderWikiText(
      "====== One ======\n\n===== Two =====\n\n==== Three ====\n\n=== Four ===",
      {
        pageId: "wiki:levels",
        topTocLevel: 2,
        maxTocLevel: 3,
        maxSectionEditLevel: 2
      }
    );

    expect(rendered.toc).toEqual([
      { id: "two", level: 2, title: "Two" },
      { id: "three", level: 3, title: "Three" }
    ]);
    expect(rendered.html).toContain('href="/wiki/wiki/levels?do=edit&amp;section=1"');
    expect(rendered.html).toContain('href="/wiki/wiki/levels?do=edit&amp;section=2"');
    expect(rendered.html).not.toContain('section=3"');
    expect(rendered.html).not.toContain('section=4"');
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
      'first \\\\\nsecond (c) (tm) -> <- <-> => <= <=> >> << ... --- -- 640x480 "quoted"'
    );
    const disabled = renderWikiText('"quoted" 640x480', { typographyMode: 0 });
    const singleQuotes = renderWikiText("'quoted' don't", { typographyMode: 2 });

    expect(rendered.html).toContain("first <br>second");
    expect(rendered.html).toContain("©");
    expect(rendered.html).toContain("™");
    expect(rendered.html).toContain("→");
    expect(rendered.html).toContain("←");
    expect(rendered.html).toContain("↔");
    expect(rendered.html).toContain("⇒");
    expect(rendered.html).toContain("⇐");
    expect(rendered.html).toContain("⇔");
    expect(rendered.html).toContain("»");
    expect(rendered.html).toContain("«");
    expect(rendered.html).toContain("…");
    expect(rendered.html).toContain("—");
    expect(rendered.html).toContain("–");
    expect(rendered.html).toContain("640&times;480");
    expect(rendered.html).toContain("“quoted”");
    expect(disabled.html).toContain("&quot;quoted&quot; 640x480");
    expect(singleQuotes.html).toContain("‘quoted’ don’t");
  });

  it("uses configured entity replacements when supplied", () => {
    const rendered = renderWikiText("custom ?? and default (c)", {
      entityReplacements: [
        ["??", "‽"],
        ["(c)", "COPY"]
      ]
    });

    expect(rendered.html).toContain("custom ‽ and default COPY");
  });

  it("renders horizontal rules for the DokuWiki template", () => {
    const rendered = renderWikiText("Before\n\n----\n\nAfter");

    expect(rendered.html).toBe("<p>Before</p>\n<hr>\n<p>After</p>");
  });

  it("renders default DokuWiki smileys", () => {
    const rendered = renderWikiText("Hello :-) LOL wordLOL [[wiki:syntax|LOL]]");
    const literal = renderWikiText("%%:-)%%");
    const custom = renderWikiText("Hello :-)", { smileys: { ":-)": "custom.svg" } });

    expect(rendered.html).toContain(
      '<img src="/images/smileys/smile.svg" class="icon smiley" alt=":-)">'
    );
    expect(rendered.html).toContain(
      '<img src="/images/smileys/lol.svg" class="icon smiley" alt="LOL">'
    );
    expect(rendered.html).toContain("wordLOL");
    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax" class="wikilink1">LOL</a>');
    expect(literal.html).toBe("<p>:-)</p>");
    expect(custom.html).toContain(
      '<img src="/images/smileys/custom.svg" class="icon smiley" alt=":-)">'
    );
  });

  it("renders default DokuWiki acronyms after smileys", () => {
    const rendered = renderWikiText("HTML FOSS TL;DR specification spec LOL wordHTML %%HTML%%");
    const custom = renderWikiText("API HTML", { acronyms: { API: "Custom API" } });

    expect(rendered.html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(rendered.html).toContain('<abbr title="Free &amp; Open-Source Software">FOSS</abbr>');
    expect(rendered.html).toContain('<abbr title="Too long; didn&#39;t read">TL;DR</abbr>');
    expect(rendered.html).toContain("specification");
    expect(rendered.html).toContain('<abbr title="specification">spec</abbr>');
    expect(rendered.html).toContain('<img src="/images/smileys/lol.svg"');
    expect(rendered.html).toContain("wordHTML");
    expect(rendered.html).toContain("HTML</p>");
    expect(custom.html).toContain('<abbr title="Custom API">API</abbr>');
    expect(custom.html).toContain("HTML</p>");
  });

  it("renders internal links, external links, and media embeds", () => {
    const rendered = renderWikiText(
      "[[wiki:syntax|Syntax]] [[https://example.test|Example]] [[http://www.google.com|Google]] [[irc://irc.example/channel|IRC]] {{wiki:dokuwiki.svg|Logo}}",
      { pageId: "wiki:welcome" }
    );
    const customScheme = renderWikiText("[[foo://service/path|Foo]] [[irc://irc.example|IRC]]", {
      linkSchemes: ["foo"]
    });
    const noRel = renderWikiText("[[https://example.test|No rel]]", { relNofollow: false });
    const targeted = renderWikiText("[[wiki:syntax|Syntax]] [[https://example.test|Example]]", {
      linkTargets: { wiki: "_self", extern: "_blank" }
    });

    expect(rendered.html).toContain('<a href="/wiki/wiki/syntax" class="wikilink1">Syntax</a>');
    expect(rendered.html).toContain(
      '<a href="https://example.test" class="urlextern" rel="ugc nofollow">Example</a>'
    );
    expect(rendered.html).toContain(
      '<a href="http://www.google.com" class="urlextern" rel="ugc nofollow">Google</a>'
    );
    expect(rendered.html).toContain(
      '<a href="irc://irc.example/channel" class="urlextern" rel="ugc nofollow">IRC</a>'
    );
    expect(customScheme.html).toContain(
      '<a href="foo://service/path" class="urlextern" rel="ugc nofollow">Foo</a>'
    );
    expect(customScheme.html).toContain(
      '<a href="/wiki/irc/irc.example" class="wikilink1">IRC</a>'
    );
    expect(noRel.html).toContain('<a href="https://example.test" class="urlextern">No rel</a>');
    expect(targeted.html).toContain(
      '<a href="/wiki/wiki/syntax" class="wikilink1" target="_self">Syntax</a>'
    );
    expect(targeted.html).toContain(
      '<a href="https://example.test" class="urlextern" target="_blank" rel="ugc nofollow noopener">Example</a>'
    );
    expect(rendered.html).not.toContain("http:<em>");
    expect(rendered.html).toContain(
      '<a href="/media-detail/wiki/dokuwiki.svg" class="media" title="wiki:dokuwiki.svg"><img src="/media/wiki/dokuwiki.svg" class="media" loading="lazy" title="Logo" alt="Logo"></a>'
    );
    expect(rendered.dependencies).toEqual([
      { subjectType: "media", subjectId: "wiki:dokuwiki.svg" },
      { subjectType: "page", subjectId: "wiki:syntax" }
    ]);
  });

  it("renders DokuWiki media alignment, sizing, and link options", () => {
    const rendered = renderWikiText(
      "{{ wiki:dokuwiki-128.png?200x50 |Caption}} {{wiki:dokuwiki-128.png?linkonly}} [[https://example.test|{{wiki:dokuwiki.svg?nolink|Logo}}]]"
    );
    const targeted = renderWikiText("{{wiki:dokuwiki.svg|Logo}}", {
      linkTargets: { media: "_media" }
    });

    expect(rendered.html).toContain(
      '<img src="/media/wiki/dokuwiki-128.png" class="mediacenter" loading="lazy" title="Caption" alt="Caption" width="200" height="50">'
    );
    expect(rendered.html).toContain(
      '<a href="/media/wiki/dokuwiki-128.png" class="media" title="wiki:dokuwiki-128.png">dokuwiki-128.png</a>'
    );
    expect(rendered.html).toContain(
      '<a href="https://example.test" class="urlextern" rel="ugc nofollow"><img src="/media/wiki/dokuwiki.svg" class="media" loading="lazy" title="Logo" alt="Logo"></a>'
    );
    expect(targeted.html).toContain(
      '<a href="/media-detail/wiki/dokuwiki.svg" class="media" title="wiki:dokuwiki.svg" target="_media" rel="noopener"><img src="/media/wiki/dokuwiki.svg" class="media" loading="lazy" title="Logo" alt="Logo"></a>'
    );
  });

  it("renders automatic external links", () => {
    const rendered = renderWikiText(
      "Visit http://www.google.com or www.example.org. Join irc://irc.example/channel."
    );
    const custom = renderWikiText("Visit foo://service/path and http://example.test", {
      linkSchemes: ["foo"]
    });
    const noRel = renderWikiText("Visit http://example.test", { relNofollow: false });
    const targeted = renderWikiText("Visit http://example.test", {
      linkTargets: { extern: "_blank" }
    });

    expect(rendered.html).toContain(
      '<a href="http://www.google.com" class="urlextern" rel="ugc nofollow">http://www.google.com</a>'
    );
    expect(rendered.html).toContain(
      '<a href="http://www.example.org" class="urlextern" rel="ugc nofollow">www.example.org</a>.'
    );
    expect(rendered.html).toContain(
      '<a href="irc://irc.example/channel" class="urlextern" rel="ugc nofollow">irc://irc.example/channel</a>.'
    );
    expect(custom.html).toContain(
      '<a href="foo://service/path" class="urlextern" rel="ugc nofollow">foo://service/path</a>'
    );
    expect(custom.html).toContain("http://example.test");
    expect(custom.html).not.toContain('href="http://example.test"');
    expect(noRel.html).toContain('<a href="http://example.test" class="urlextern">');
    expect(targeted.html).toContain(
      '<a href="http://example.test" class="urlextern" target="_blank" rel="ugc nofollow noopener">'
    );
  });

  it("renders namespace-relative internal links from page context", () => {
    const rendered = renderWikiText(
      "[[child|Child]] [[:start|Start]] [[..:root|Root]] [[wiki:syntax#head line|Syntax]] [[#local section|Local]]",
      { pageId: "wiki:guide:page" }
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki/guide/child" class="wikilink1">Child</a>');
    expect(rendered.html).toContain('<a href="/wiki/start" class="wikilink1">Start</a>');
    expect(rendered.html).toContain('<a href="/wiki/wiki/root" class="wikilink1">Root</a>');
    expect(rendered.html).toContain(
      '<a href="/wiki/wiki/syntax#head-line" class="wikilink1">Syntax</a>'
    );
    expect(rendered.html).toContain('<a href="#local-section" class="wikilink1">Local</a>');
    expect(rendered.dependencies).toEqual([
      { subjectType: "page", subjectId: "start" },
      { subjectType: "page", subjectId: "wiki:guide:child" },
      { subjectType: "page", subjectId: "wiki:guide:page" },
      { subjectType: "page", subjectId: "wiki:root" },
      { subjectType: "page", subjectId: "wiki:syntax" }
    ]);
  });

  it("uses DokuWiki missing-link styling when page existence is known", () => {
    const rendered = renderWikiText(
      "[[wiki:welcome|Welcome]] [[missing:page|Missing]] [[#local section|Local]]",
      { pageId: "wiki:welcome", existingPageIds: new Set(["wiki:welcome"]) }
    );

    expect(rendered.html).toContain('<a href="/wiki/wiki/welcome" class="wikilink1">Welcome</a>');
    expect(rendered.html).toContain(
      '<a href="/wiki/missing/page" class="wikilink2" title="This topic does not exist yet">Missing</a>'
    );
    expect(rendered.html).toContain('<a href="#local-section" class="wikilink1">Local</a>');
  });

  it("renders CamelCase links only when enabled", () => {
    const disabled = renderWikiText("See CamelCase and [[wiki:syntax|CamelCase]].", {
      pageId: "wiki:welcome"
    });
    const enabled = renderWikiText("See CamelCase and ExistingPage.", {
      pageId: "wiki:welcome",
      existingPageIds: new Set(["wiki:existingpage"]),
      camelCaseLinks: true
    });

    expect(disabled.html).toContain("See CamelCase and ");
    expect(disabled.html).not.toContain('href="/wiki/wiki/camelcase"');
    expect(disabled.html).toContain('<a href="/wiki/wiki/syntax" class="wikilink1">CamelCase</a>');
    expect(enabled.html).toContain(
      '<a href="/wiki/wiki/camelcase" class="wikilink2" title="This topic does not exist yet">CamelCase</a>'
    );
    expect(enabled.html).toContain(
      '<a href="/wiki/wiki/existingpage" class="wikilink1">ExistingPage</a>'
    );
    expect(enabled.dependencies).toEqual([
      { subjectType: "page", subjectId: "wiki:camelcase" },
      { subjectType: "page", subjectId: "wiki:existingpage" }
    ]);
  });

  it("renders interwiki links from the default DokuWiki map", () => {
    const rendered = renderWikiText(
      "[[doku>newsletter]] [[doku>faq:sidebar|FAQ]] [[wp>Wiki|Wiki]] [[this>doku.php?do=admin&page=config|config]]"
    );
    const custom = renderWikiText("[[docs>Quick Start|Docs]] [[wp>Custom Wiki|Wiki]]", {
      interwikiTemplates: {
        docs: "https://docs.example/{URL}",
        wp: "https://wiki.example/{NAME}"
      },
      linkTargets: { interwiki: "_blank" }
    });

    expect(rendered.html).toContain(
      '<a href="https://www.dokuwiki.org/newsletter" class="interwiki iw_doku">doku&gt;newsletter</a>'
    );
    expect(rendered.html).toContain(
      '<a href="https://www.dokuwiki.org/faq:sidebar" class="interwiki iw_doku">FAQ</a>'
    );
    expect(rendered.html).toContain(
      '<a href="https://en.wikipedia.org/wiki/Wiki" class="interwiki iw_wp">Wiki</a>'
    );
    expect(rendered.html).toContain(
      '<a href="/doku.php?do=admin&amp;page=config" class="interwiki iw_this">config</a>'
    );
    expect(custom.html).toContain(
      '<a href="https://docs.example/Quick%20Start" class="interwiki iw_docs" target="_blank" rel="noopener">Docs</a>'
    );
    expect(custom.html).toContain(
      '<a href="https://wiki.example/Custom_Wiki" class="interwiki iw_wp" target="_blank" rel="noopener">Wiki</a>'
    );
  });

  it("renders Windows share links", () => {
    const rendered = renderWikiText(String.raw`[[\\server\share|this]]`);
    const targeted = renderWikiText(String.raw`[[\\server\share|this]]`, {
      linkTargets: { windows: "_blank" }
    });

    expect(rendered.html).toContain('<a href="file://///server/share" class="windows">this</a>');
    expect(targeted.html).toContain(
      '<a href="file://///server/share" class="windows" target="_blank">this</a>'
    );
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
    const rendered = renderWikiText(
      "  * first\n  * **second**\n    * nested\n  - ordered\n\n  <unsafe>\n\n%%**literal**%%"
    );

    expect(rendered.html).toContain(
      "<ul><li>first</li><li><strong>second</strong><ul><li>nested</li></ul></li></ul><ol><li>ordered</li></ol>"
    );
    expect(rendered.html).toContain("<pre><code>&lt;unsafe&gt;</code></pre>");
    expect(rendered.html).toContain("<p>**literal**</p>");
  });

  it("renders DokuWiki file blocks, quotes, and footnotes", () => {
    const rendered = renderWikiText(
      "<file txt example.txt>\n<unsafe>\n</file>\n\n> quoted **text**\n\nText((foot **note**)).",
      { pageId: "wiki:welcome" }
    );

    expect(rendered.html).toContain(
      '<dl class="file"><dt><a href="/wiki/wiki/welcome?do=export_code&amp;codeblock=0" title="Download" class="mediafile mf_txt">example.txt</a></dt><dd><pre><code>&lt;unsafe&gt;</code></pre></dd></dl>'
    );
    expect(extractCodeBlock("<file txt example.txt>\n<unsafe>\n</file>", 0)).toEqual({
      type: "file",
      index: 0,
      text: "<unsafe>",
      language: "txt",
      filename: "example.txt"
    });
    expect(rendered.html).toContain("<blockquote><p>quoted <strong>text</strong></p></blockquote>");
    expect(rendered.html).toContain('<sup><a href="#fn__1" id="fnt__1">1)</a></sup>');
    expect(rendered.html).toContain('<div class="footnotes">');
    expect(rendered.html).toContain('<div class="fn" id="fn__1">');
    expect(rendered.html).toContain("foot <strong>note</strong>");
  });

  it("renders nested DokuWiki quotes", () => {
    const rendered = renderWikiText("> No\n>> Yes\n>>> Then\n> Really?");

    expect(rendered.html).toBe(
      "<blockquote><p>No</p><blockquote><p>Yes</p><blockquote><p>Then</p></blockquote></blockquote><p>Really?</p></blockquote>"
    );
  });

  it("keeps invalid or unclosed inline markup as escaped text", () => {
    const rendered = renderWikiText(
      "[[wiki:syntax|Syntax {{wiki:logo.png|Logo %%literal **bold <script>alert(1)</script>"
    );

    expect(rendered.html).toContain("[[wiki:syntax|Syntax");
    expect(rendered.html).toContain("{{wiki:logo.png|Logo");
    expect(rendered.html).toContain("%%literal");
    expect(rendered.html).toContain("**bold");
    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).not.toContain("<script>");
  });

  it("escapes XSS payloads in rendered wiki syntax", () => {
    const rendered = renderWikiText(
      '====== <script>alert(1)</script> ======\n\n[[https://example.test|<script>alert(2)</script>]] [[javascript:alert(3)|Jump]]\n\n{{wiki:logo.svg|"><svg onload=alert(4)>}}\n\n| <iframe src=x></iframe> |'
    );

    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(rendered.html).toContain("&lt;iframe src=x&gt;&lt;/iframe&gt;");
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).not.toContain("<iframe");
    expect(rendered.html).not.toContain("<svg");
    expect(rendered.html).not.toContain('href="javascript:');
  });

  it("escapes raw HTML and PHP-style embedded syntax", () => {
    const rendered = renderWikiText(
      "<html>\n<strong>trusted</strong>\n</html>\n\n<php>\necho '<strong>trusted</strong>';\n</php>"
    );

    expect(rendered.html).toContain("&lt;html&gt;");
    expect(rendered.html).toContain("&lt;strong&gt;trusted&lt;/strong&gt;");
    expect(rendered.html).toContain("&lt;php&gt;");
    expect(rendered.html).not.toContain("<html>");
    expect(rendered.html).not.toContain("<php>");
    expect(rendered.html).not.toContain("<strong>trusted</strong>");
  });

  it("flushes unterminated code and file blocks safely at end of input", () => {
    const code = renderWikiText("<code>\n<unsafe>\n**literal**");
    const file = renderWikiText("<file txt example.txt>\n<unsafe>", { pageId: "wiki:welcome" });

    expect(code.html).toContain('<pre class="code"><code>&lt;unsafe&gt;\n**literal**</code></pre>');
    expect(file.html).toContain(
      '<dl class="file"><dt><a href="/wiki/wiki/welcome?do=export_code&amp;codeblock=0" title="Download" class="mediafile mf_txt">example.txt</a></dt><dd><pre><code>&lt;unsafe&gt;</code></pre></dd></dl>'
    );
    expect(extractCodeBlock("<file txt example.txt>\n<unsafe>", 0)?.text).toBe("<unsafe>");
  });

  it("renders simple DokuWiki tables", () => {
    const rendered = renderWikiText("^ Head ^\n| Cell |");

    expect(rendered.html).toBe("<table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>");
  });

  it("renders DokuWiki table headers, spans, and alignment", () => {
    const rendered = renderWikiText(
      "^           Table with alignment           ^^^\n|         right|    center    |left          |\n| Row 1 Col 1 | vertical | Row 1 Col 3 |\n| Row 2 Col 1 | ::: | Row 2 Col 3 |"
    );

    expect(rendered.html).toContain(
      '<th class="centeralign" colspan="3">Table with alignment</th>'
    );
    expect(rendered.html).toContain('<td class="rightalign">right</td>');
    expect(rendered.html).toContain('<td class="centeralign">center</td>');
    expect(rendered.html).toContain('<td class="leftalign">left</td>');
    expect(rendered.html).toContain('<td rowspan="2">vertical</td>');
  });
});
