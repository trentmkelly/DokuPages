import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inventorySyntax, renderSyntaxInventoryMarkdown } from "../scripts/inventory-syntax.mjs";

const fixturePages = fileURLToPath(new URL("../fixtures/dokuwiki-data/pages", import.meta.url));

describe("DokuWiki syntax inventory", () => {
  it("detects syntax features used by the current DokuWiki content", () => {
    const inventory = inventorySyntax(fixturePages);
    const features = new Map(inventory.features.map((feature) => [feature.id, feature]));

    expect(inventory.pageCount).toBe(2);
    expect(inventory.pages.map((page) => page.id)).toEqual(["wiki:syntax", "wiki:welcome"]);
    expect(features.get("headings")).toMatchObject({
      status: "supported",
      pages: expect.arrayContaining(["wiki:syntax", "wiki:welcome"])
    });
    expect(features.get("tables")).toMatchObject({
      status: "supported",
      pages: ["wiki:syntax"]
    });
    expect(features.get("unordered_lists")).toMatchObject({
      status: "supported",
      pages: ["wiki:syntax"]
    });
    expect(features.get("rss_feed_aggregation")).toMatchObject({
      status: "unsupported",
      occurrences: 1,
      pages: ["wiki:syntax"]
    });
    expect(features.get("syntax_plugin_macros")).toMatchObject({
      status: "unsupported",
      occurrences: 1,
      pages: ["wiki:syntax"]
    });
    expect(features.has("control_macros")).toBe(false);
  });

  it("renders a deterministic markdown report", () => {
    const markdown = renderSyntaxInventoryMarkdown(inventorySyntax(fixturePages));

    expect(markdown).toContain("# DokuWiki Syntax Inventory");
    expect(markdown).toContain("| `wiki:syntax` | `wiki/syntax.txt` |");
    expect(markdown).toContain("| RSS feed aggregation syntax | unsupported | 1 |");
    expect(markdown).toContain(
      "- unsupported: Syntax plugin macros (1 occurrence) - Current content uses DokuWiki's INFO syntax plugin macro."
    );
  });
});
