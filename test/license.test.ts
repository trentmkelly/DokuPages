import { describe, expect, it } from "vitest";
import { listDefaultLicenses, resolveDefaultLicense } from "../src/wiki/license";

describe("DokuWiki license mapping", () => {
  it("exposes the default DokuWiki license choices", () => {
    expect(listDefaultLicenses()).toContainEqual({
      id: "cc-by-sa",
      name: "CC Attribution-Share Alike 4.0 International",
      urlTemplate: "https://creativecommons.org/licenses/by-sa/4.0/deed.{lang}"
    });
  });

  it("resolves localized Creative Commons license URLs", () => {
    expect(resolveDefaultLicense("cc-by", "de")).toEqual({
      id: "cc-by",
      name: "CC Attribution 4.0 International",
      url: "https://creativecommons.org/licenses/by/4.0/deed.de"
    });
  });

  it("keeps non-localized license URLs intact", () => {
    expect(resolveDefaultLicense("gnufdl", "fr")).toEqual({
      id: "gnufdl",
      name: "GNU Free Documentation License 1.3",
      url: "https://www.gnu.org/licenses/fdl-1.3.html"
    });
  });

  it("returns null for unknown license ids", () => {
    expect(resolveDefaultLicense("custom")).toBeNull();
  });
});
