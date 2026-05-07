import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderWikiText } from "../src/wiki/render";

const syntaxSource = readFileSync(
  new URL("../fixtures/dokuwiki-data/pages/wiki/syntax.txt", import.meta.url),
  "utf8"
);

describe("DokuWiki syntax fixture", () => {
  it("renders representative syntax page features", () => {
    const rendered = renderWikiText(syntaxSource, { pageId: "wiki:syntax" });

    expect(rendered.title).toBe("Formatting Syntax");
    expect(rendered.toc.some((item) => item.id === "tables")).toBe(true);
    expect(rendered.html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(rendered.html).toContain('<img src="/images/smileys/lol.svg" class="icon smiley"');
    expect(rendered.html).toContain(
      '<a href="http://php.net" rel="nofollow noopener noreferrer"><img src="/media/wiki/dokuwiki-128.png" class="media" loading="lazy" alt=""></a>'
    );
    expect(rendered.html).toContain(
      "<ul><li>This is a list</li><li>The second item<ul><li>You may have different levels</li></ul></li><li>Another item</li></ul>"
    );
    expect(rendered.html).toContain('<td rowspan="3">this cell spans vertically</td>');
    expect(rendered.html).toContain(
      '<th class="centeralign" colspan="3">Table with alignment</th>'
    );
    expect(rendered.html).toContain(
      "<blockquote><blockquote><blockquote><p>Then lets do it!</p></blockquote></blockquote></blockquote>"
    );
  });
});
