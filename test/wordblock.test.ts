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

  it("strips inline comments from configured patterns like upstream checkwordblock", () => {
    expect(
      findWordblockMatch("This contains custom forbidden text.", ["custom forbidden # local note"])
    ).toMatchObject({
      pattern: "custom forbidden",
      match: "custom forbidden"
    });
  });

  it("checks wordblock patterns in upstream-sized chunks", () => {
    const patterns = Array.from(
      { length: 225 },
      (_, index) => `blocked-${String(index).padStart(3, "0")}`
    );

    expect(findWordblockMatch("The final phrase is blocked-224.", patterns)).toMatchObject({
      pattern: "blocked-224",
      match: "blocked-224"
    });
  });

  it("ignores benign wiki text", () => {
    expect(findWordblockMatch("====== Welcome ======\n\nUseful documentation.")).toBeNull();
  });
});
