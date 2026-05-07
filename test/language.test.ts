import { describe, expect, it } from "vitest";
import {
  isSupportedLanguage,
  normalizeLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES
} from "../src/wiki/language";

describe("language configuration", () => {
  it("maps bundled DokuWiki language directories", () => {
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("de-informal");
    expect(SUPPORTED_LANGUAGES).toContain("pt-br");
    expect(SUPPORTED_LANGUAGES).toContain("zh-tw");
  });

  it("normalizes configured language tags", () => {
    expect(normalizeLanguage("PT_BR")).toBe("pt-br");
    expect(normalizeLanguage(" en-US ")).toBe("en-us");
  });

  it("resolves configured languages with base-language fallback", () => {
    expect(resolveLanguage("pt_BR")).toBe("pt-br");
    expect(resolveLanguage("en-US")).toBe("en");
    expect(resolveLanguage("zz")).toBe("en");
    expect(isSupportedLanguage("pt-br")).toBe(true);
  });
});
