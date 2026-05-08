import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("public assets", () => {
  it("keeps the create-page action out of missing wiki-link styling", async () => {
    const css = await readFile("public/dokuwiki.css", "utf8");
    const missingLinkRule = css.indexOf(".dokuwiki a.wikilink2");
    const createActionRule = css.indexOf(".dokuwiki a.action.create,");

    expect(missingLinkRule).toBeGreaterThanOrEqual(0);
    expect(createActionRule).toBeGreaterThan(missingLinkRule);
    expect(css.slice(createActionRule, createActionRule + 220)).toContain("color: var(--dw-link)");
    expect(css.slice(createActionRule, createActionRule + 220)).toContain(
      ".dokuwiki a.action.create:visited"
    );
  });

  it("keeps DokuWiki media manager frontend hooks available", async () => {
    const js = await readFile("public/dokuwiki.js", "utf8");

    expect(js).toContain("bindMediaManager");
    expect(js).toContain("data-media-tree-toggle");
    expect(js).toContain("dokuwiki-media-select");
    expect(js).toContain("#dw__upload[data-media-upload]");
  });
});
