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
    expect(
      extractInternalPageLinks("[[syntax]] [[:start]] [[..:root]]", "wiki:guide:page")
    ).toEqual(["start", "wiki:guide:syntax", "wiki:root"]);
  });

  it("skips DokuWiki interwiki links", () => {
    expect(extractInternalPageLinks("[[doku>plugins]] [[this>doku.php?do=admin]]")).toEqual([]);
  });

  it("extracts CamelCase links only when enabled", () => {
    const content =
      "CamelCase [[wiki:syntax|LinkedCamel]] %%NoWikiCamel%% {{wiki:MediaCamel.png}} <code>CodeCamel</code>";

    expect(extractInternalPageLinks(content, "wiki:guide:page")).toEqual(["wiki:syntax"]);
    expect(extractInternalPageLinks(content, "wiki:guide:page", { camelCaseLinks: true })).toEqual([
      "wiki:guide:camelcase",
      "wiki:syntax"
    ]);
  });
});
