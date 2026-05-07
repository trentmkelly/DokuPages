import { describe, expect, it } from "vitest";
import { findWordblockMatch } from "../src/wiki/wordblock";

describe("findWordblockMatch", () => {
  it("matches direct DokuWiki wordblock terms", () => {
    expect(findWordblockMatch("Plain text with zoosex in it")).toMatchObject({
      match: "zoosex"
    });
  });

  it("expands bare www URLs before matching URL patterns", () => {
    const match = findWordblockMatch("Visit www.cheap-discount-viagra.example now");

    expect(match?.match).toBe("http://www.cheap-discount-viagra");
  });

  it("ignores benign wiki text", () => {
    expect(findWordblockMatch("====== Welcome ======\n\nUseful documentation.")).toBeNull();
  });
});
