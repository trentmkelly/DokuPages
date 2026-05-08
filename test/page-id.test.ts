import { describe, expect, it } from "vitest";
import {
  cleanPageId,
  cleanRoutePageId,
  encodeDokuWikiFileName,
  pageIdToPath,
  pageIdToRoutePath,
  resolvePageLinkId
} from "../src/wiki/page-id";

describe("page id helpers", () => {
  it("matches upstream cleanID defaults", () => {
    expect(cleanPageId("Wiki/Welcome")).toBe("wiki_welcome");
    expect(cleanPageId("Café Crème")).toBe("cafe_creme");
    expect(cleanPageId("Straße")).toBe("strasse");
    expect(cleanPageId("東京:ページ")).toBe("東京:ページ");
    expect(cleanPageId("Cafe\u0301")).toBe("cafe");
  });

  it("removes control characters and trims namespace colons", () => {
    expect(cleanPageId("\u0000:Playground:Sandbox:\u0007")).toBe("playground:sandbox");
  });

  it("supports useslash route normalization separately from cleanID defaults", () => {
    expect(cleanRoutePageId("Wiki/Welcome")).toBe("wiki:welcome");
    expect(cleanRoutePageId("Wiki//Guide///Start")).toBe("wiki:guide:start");
    expect(cleanPageId("A/B;C", { useslash: true })).toBe("a:b:c");
  });

  it("honors upstream sepchar and deaccent options", () => {
    expect(cleanPageId("Syntax Page", { sepchar: "-" })).toBe("syntax-page");
    expect(cleanPageId("A/B;C", { sepchar: "-" })).toBe("a-b:c");
    expect(cleanPageId("foo__bar", { sepchar: "-" })).toBe("foo__bar");
    expect(cleanPageId("Café Crème", { deaccent: 0 })).toBe("café_crème");
    expect(cleanPageId("ä ö Straße", { deaccent: 2 })).toBe("a_o_strasse");
    expect(cleanPageId("Москва", { deaccent: 2 })).toBe("moskva");
    expect(cleanPageId("Ελλάδα", { deaccent: 2 })).toBe("ellada");
    expect(cleanPageId("Москва", { ascii: true })).toBe("moskva");
  });

  it("converts page ids to flat-file compatible paths for import tooling", () => {
    expect(pageIdToPath("wiki:welcome")).toBe("wiki/welcome.txt");
    expect(pageIdToPath("wiki:Café Crème", { deaccent: 0 })).toBe("wiki/caf%C3%A9_cr%C3%A8me.txt");
    expect(pageIdToPath("wiki:Café Crème", { deaccent: 0, fnencode: "utf-8" })).toBe(
      "wiki/café_crème.txt"
    );
    expect(pageIdToPath("wiki:Café", { deaccent: 0, fnencode: "safe" })).toBe("wiki/caf%5l].txt");
  });

  it("converts page ids to canonical route paths", () => {
    expect(pageIdToRoutePath("Wiki:Syntax Page")).toBe("/wiki/wiki/syntax_page");
  });

  it("resolves DokuWiki absolute and relative page links", () => {
    expect(resolvePageLinkId("child", "wiki:guide:page")).toBe("wiki:guide:child");
    expect(resolvePageLinkId(":start", "wiki:guide:page")).toBe("start");
    expect(resolvePageLinkId("..:root", "wiki:guide:page")).toBe("wiki:root");
    expect(resolvePageLinkId("wiki:syntax", "wiki:guide:page")).toBe("wiki:syntax");
  });

  it("covers non-ASCII page ID parity fixture inputs", () => {
    const fixtures = [
      {
        raw: "Café Crème",
        current: "cafe_creme",
        upstreamDefault: "cafe_creme",
        upstreamDeaccent: "cafe_creme",
        category: "deaccent"
      },
      {
        raw: "Straße",
        current: "strasse",
        upstreamDefault: "strasse",
        upstreamRomanized: "strasse",
        category: "romanization"
      },
      {
        raw: "東京:ページ",
        current: "東京:ページ",
        upstreamDefault: "東京:ページ",
        category: "utf8"
      },
      {
        raw: "Cafe\u0301",
        current: "cafe",
        upstreamNormalizedLike: "cafe",
        category: "normalization"
      }
    ];

    expect(fixtures.map((fixture) => fixture.category)).toEqual([
      "deaccent",
      "romanization",
      "utf8",
      "normalization"
    ]);
    for (const fixture of fixtures) {
      expect(cleanPageId(fixture.raw)).toBe(fixture.current);
    }
    expect(cleanPageId("Café")).toBe(cleanPageId("Cafe\u0301"));
  });

  it("exposes DokuWiki filename encoding modes", () => {
    expect(encodeDokuWikiFileName("wiki/café", "url")).toBe("wiki/caf%C3%A9");
    expect(encodeDokuWikiFileName("wiki/café", "utf-8")).toBe("wiki/café");
    expect(encodeDokuWikiFileName("wiki/café", "safe")).toBe("wiki/caf%5l]");
  });
});
