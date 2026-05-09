import { describe, expect, it } from "vitest";
import {
  isSupportedLanguage,
  normalizeLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES
} from "../src/wiki/language";
import {
  authLang,
  AUTH_LANGUAGE_PACKS,
  AUTH_LANGUAGE_KEYS,
  AUTH_PAGE_KEYS,
  authPageText,
  authPageTitle
} from "../src/wiki/auth-language";

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

  it("provides upstream auth page text for every supported language", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(AUTH_LANGUAGE_PACKS).toHaveProperty(language);
      for (const key of AUTH_LANGUAGE_KEYS) {
        expect(authLang(language, key), `${language}:${key}`).not.toBe("");
      }
      for (const key of AUTH_PAGE_KEYS) {
        expect(authPageText(language, key), `${language}:${key}`).not.toBe("");
        expect(authPageTitle(language, key), `${language}:${key}`).not.toBe("");
      }
    }
  });

  it("uses localized auth labels when available", () => {
    expect(authPageTitle("de", "login")).toBe("Anmelden");
    expect(authLang("de", "user")).toBe("Benutzername");
    expect(authLang("pt_BR", "btn_logout")).toBe("Sair");
    expect(authPageTitle("zz", "denied")).toBe("Permission Denied");
  });
});
