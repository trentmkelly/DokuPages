import { describe, expect, it } from "vitest";
import { extractInternalPageLinks } from "../src/wiki/page-links";

describe("page link extraction", () => {
  it("extracts unique internal page links", () => {
    expect(
      extractInternalPageLinks(
        "[[wiki:syntax|Syntax]] [[wiki:syntax]] [[https://example.test|External]]"
      )
    ).toEqual(["wiki:syntax"]);
  });

  it("resolves relative links in the source namespace", () => {
    expect(extractInternalPageLinks("[[syntax]] [[:start]]", "wiki:welcome")).toEqual([
      "start",
      "wiki:syntax"
    ]);
  });

  it("skips DokuWiki interwiki links", () => {
    expect(extractInternalPageLinks("[[doku>plugins]] [[this>doku.php?do=admin]]")).toEqual([]);
  });
});
