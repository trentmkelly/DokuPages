import { describe, expect, it } from "vitest";
import {
  buildSearchTermFrequencies,
  makeSearchSnippet,
  parseSearchQuery,
  tokenizeSearchText
} from "../src/wiki/search";

describe("wiki search helpers", () => {
  it("tokenizes wiki text with stopword filtering", () => {
    expect(tokenizeSearchText("The Quick brown fox and DokuWiki pages")).toEqual([
      "quick",
      "brown",
      "fox",
      "dokuwiki",
      "pages"
    ]);
  });

  it("parses unique query terms", () => {
    expect(parseSearchQuery("welcome welcome syntax +the")).toEqual(["welcome", "syntax"]);
  });

  it("weights title terms above body terms", () => {
    const terms = buildSearchTermFrequencies("====== Welcome ======\n\nWelcome body.", "Welcome");

    expect(terms.get("welcome")).toBe(5);
    expect(terms.get("body")).toBe(1);
  });

  it("builds snippets around matching terms", () => {
    const snippet = makeSearchSnippet(
      "Intro text ".repeat(12) + "DokuWiki serverless search result " + "tail text ".repeat(12),
      ["serverless"],
      80
    );

    expect(snippet).toContain("serverless search");
    expect(snippet.startsWith("...")).toBe(true);
  });
});
