import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("public assets", () => {
  it("keeps the create-page action out of missing wiki-link styling", async () => {
    const css = await readFile(new URL("../public/dokuwiki.css", import.meta.url), "utf8");
    const missingLinkRule = css.indexOf(".dokuwiki a.wikilink2");
    const createActionRule = css.indexOf(".dokuwiki .page a.action.create:not(.wikilink2)");

    expect(missingLinkRule).toBeGreaterThanOrEqual(0);
    expect(createActionRule).toBeGreaterThan(missingLinkRule);
    expect(css.slice(createActionRule, createActionRule + 220)).toContain("color: var(--dw-link)");
  });
});
