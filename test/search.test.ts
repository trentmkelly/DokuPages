import { describe, expect, it } from "vitest";
import {
  buildSearchTermFrequencies,
  makeSearchSnippet,
  parseSearchQuery,
  searchIndexWordLength,
  searchStopWords,
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

  it("uses DokuWiki language-specific stopword files", () => {
    expect(tokenizeSearchText("aber welcome wiki", "en")).toEqual(["aber", "welcome", "wiki"]);
    expect(tokenizeSearchText("aber welcome wiki", "de")).toEqual(["welcome", "wiki"]);
  });

  it("uses an empty stopword set when DokuWiki has no file for the language", () => {
    expect(searchStopWords("af").size).toBe(0);
    expect(tokenizeSearchText("about wiki", "af")).toEqual(["about", "wiki"]);
  });

  it("matches DokuWiki special-character stripping and numeric short terms", () => {
    expect(tokenizeSearchText("Café wiki:start foo-bar docs.v1 under_score x 7")).toEqual([
      "café",
      "wiki",
      "start",
      "foo",
      "bar",
      "docs",
      "v1",
      "under",
      "score",
      "7"
    ]);
  });

  it("separates Asian search words like DokuWiki", () => {
    expect(tokenizeSearchText("漢字かな")).toEqual(["漢", "字", "か", "な"]);
  });

  it("stores DokuWiki-style index word lengths", () => {
    expect(searchIndexWordLength("wiki:start")).toBe(10);
    expect(searchIndexWordLength("é")).toBe(2);
    expect(searchIndexWordLength("漢")).toBeGreaterThan(2);
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
