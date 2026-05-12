import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTH_LANGUAGE_KEYS,
  AUTH_PAGE_KEYS,
  authLang,
  authPageText,
  authPageTitle
} from "../src/wiki/auth-language.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const upstreamLangRoot = resolve(repoRoot, "../dokuwiki/inc/lang");

describe("upstream DokuWiki localization parity", () => {
  it("matches the upstream German auth language pack", () => {
    const upstream = readUpstreamLanguagePack("de");
    const comparedStringKeys = AUTH_LANGUAGE_KEYS.filter((key) => upstream.strings[key]);
    const comparedPageKeys = AUTH_PAGE_KEYS.filter((key) => upstream.pages[key]);

    expect(comparedStringKeys.length).toBeGreaterThan(50);
    expect(comparedPageKeys).toEqual([...AUTH_PAGE_KEYS]);

    for (const key of comparedStringKeys) {
      expect(authLang("de", key), key).toBe(upstream.strings[key]);
    }

    for (const key of comparedPageKeys) {
      expect(authPageText("de", key), key).toBe(upstream.pages[key]);
      expect(authPageTitle("de", key), key).toBe(pageTitle(upstream.pages[key]));
    }
  });
});

function readUpstreamLanguagePack(language) {
  const languageRoot = resolve(upstreamLangRoot, language);
  const strings = parseLangPhp(readFileSync(resolve(languageRoot, "lang.php"), "utf8"));
  const pages = {};

  for (const key of AUTH_PAGE_KEYS) {
    pages[key] = readFileSync(resolve(languageRoot, `${key}.txt`), "utf8").trim();
  }

  return { strings, pages };
}

function parseLangPhp(source) {
  const values = {};
  const pattern = /\$lang\[['"]([^'"]+)['"]\]\s*=\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*;/g;

  for (const match of source.matchAll(pattern)) {
    values[match[1]] = decodePhpString(match[2]);
  }

  return values;
}

function decodePhpString(value) {
  const quote = value[0];
  const body = value.slice(1, -1);

  if (quote === "'") {
    return body.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function pageTitle(text) {
  return text.match(/^={2,}\s*(.*?)\s*=+\s*$/m)?.[1] ?? "";
}
