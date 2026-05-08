import { describe, expect, it } from "vitest";
import {
  adjustSearchQuery,
  buildSearchTermFrequencies,
  makeSearchSnippet,
  parseFulltextSearchQuery,
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

  it("parses DokuWiki boolean, namespace, phrase, and wildcard syntax", () => {
    const query = parseFulltextSearchQuery('welcome -"old page" @wiki ^private synt*', "en");

    expect(query.highlight).toEqual(["welcome", "synt"]);
    expect(query.namespaces).toEqual(["wiki"]);
    expect(query.excludedNamespaces).toEqual(["private"]);
    expect(query.words).toContain("synt*");
    expect(query.simpleTerms).toEqual([]);
  });

  it("applies DokuWiki search namespace and fragment defaults", () => {
    expect(
      adjustSearchQuery("alpha beta", {
        currentNamespace: "wiki:guides:deep",
        searchNsLimit: 2,
        searchFragment: "starts_with"
      })
    ).toBe("alpha* beta* @wiki:guides");
    expect(
      adjustSearchQuery("alpha @playground", {
        currentNamespace: "wiki:guides",
        searchNsLimit: 1,
        searchFragment: "contains"
      })
    ).toBe("*alpha* @playground");
    expect(
      adjustSearchQuery("alpha beta", {
        formSubmitted: true,
        searchFragment: "contains"
      })
    ).toBe("alpha beta");
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

  it("adds page id terms for DokuWiki-style page lookup matching", () => {
    const terms = buildSearchTermFrequencies(
      "====== Welcome ======",
      "Welcome",
      "en",
      "wiki:start"
    );

    expect(terms.get("welcome")).toBe(4);
    expect(terms.get("wiki")).toBe(2);
    expect(terms.get("start")).toBe(2);
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
