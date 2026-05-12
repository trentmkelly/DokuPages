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

  it("keeps converted upstream CSS module selectors available", async () => {
    const css = await readFile("public/dokuwiki.css", "utf8");
    const selectors = [
      ".dokuwiki label.block",
      '#dw__login label[for="remember__me"]',
      ".dokuwiki .tabs > ul",
      ".dokuwiki .search-results-form fieldset.search-form",
      ".dokuwiki form.search div.ajax_qsearch",
      "#link__wiz_result",
      "#media__popup_content label",
      "html.popup #mediamgr__aside",
      "#media__content a.mediafile",
      "#mediamanager__page .filelist .thumbs li",
      "#mediamanager__diff .imageDiff.opacity .image2",
      ".qq-upload-drop-area",
      ".dokuwiki div.ui-admin ul.admin_tasks",
      ".dokuwiki ul.admin__tools"
    ];

    for (const selector of selectors) {
      expect(css).toContain(selector);
    }

    expect(css).not.toContain("@ini_");
    expect(css).not.toContain("__highlight__");
  });

  it("ships upstream image assets referenced by converted CSS modules", async () => {
    const assets = [
      "public/images/icon-list.png",
      "public/images/icon-sort.png",
      "public/images/ns.png",
      "public/images/page.png",
      "public/images/resizecol.png",
      "public/images/throbber.gif",
      "public/images/up.png"
    ];

    for (const asset of assets) {
      await expect(readFile(asset)).resolves.toBeInstanceOf(Buffer);
    }
  });
});
