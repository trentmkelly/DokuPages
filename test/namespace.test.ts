import { describe, expect, it } from "vitest";
import { cleanPageId, pageIdToRoutePath, resolvePageLinkId } from "../src/wiki/page-id";

describe("namespace handling", () => {
  it("normalizes root and nested namespace ids consistently", () => {
    expect(cleanPageId("Start")).toBe("start");
    expect(cleanPageId(":Wiki:Guide:Start:")).toBe("wiki:guide:start");
    expect(cleanPageId("Wiki//Guide///Start")).toBe("wiki:guide:start");
  });

  it("builds canonical routes from namespace segments", () => {
    expect(pageIdToRoutePath("start")).toBe("/wiki/start");
    expect(pageIdToRoutePath("wiki:guide:start")).toBe("/wiki/wiki/guide/start");
    expect(pageIdToRoutePath("wiki:syntax page")).toBe("/wiki/wiki/syntax_page");
  });

  it("resolves relative links inside the current namespace", () => {
    expect(resolvePageLinkId("child", "wiki:guide:start")).toBe("wiki:guide:child");
    expect(resolvePageLinkId(".:child", "wiki:guide:start")).toBe("wiki:guide:child");
    expect(resolvePageLinkId("..:sibling", "wiki:guide:start")).toBe("wiki:sibling");
    expect(resolvePageLinkId(":root", "wiki:guide:start")).toBe("root");
  });
});
