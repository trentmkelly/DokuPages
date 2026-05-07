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
});
