import { describe, expect, it } from "vitest";
import { cleanPageId, pageIdToPath } from "../src/wiki/page-id";

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
});
