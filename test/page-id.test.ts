import { describe, expect, it } from "vitest";
import {
  cleanPageId,
  pageIdToPath,
  pageIdToRoutePath,
  resolvePageLinkId
} from "../src/wiki/page-id";

describe("page id helpers", () => {
  it("normalizes slash paths to DokuWiki-style namespace ids", () => {
    expect(cleanPageId("Wiki/Welcome")).toBe("wiki:welcome");
  });

  it("removes control characters and trims namespace colons", () => {
    expect(cleanPageId("\u0000:Playground:Sandbox:\u0007")).toBe("playground:sandbox");
  });

  it("converts page ids to flat-file compatible paths for import tooling", () => {
    expect(pageIdToPath("wiki:welcome")).toBe("wiki/welcome.txt");
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
        current: "caf_cr_me",
        upstreamDefault: "café_crème",
        upstreamDeaccent: "cafe_creme",
        category: "deaccent"
      },
      {
        raw: "Straße",
        current: "stra_e",
        upstreamDefault: "straße",
        upstreamRomanized: "strasse",
        category: "romanization"
      },
      {
        raw: "東京:ページ",
        current: "_:_",
        upstreamDefault: "東京:ページ",
        category: "utf8"
      },
      {
        raw: "Cafe\u0301",
        current: "cafe_",
        upstreamNormalizedLike: "café",
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
    expect(cleanPageId("Café")).not.toBe(cleanPageId("Cafe\u0301"));
  });
});
