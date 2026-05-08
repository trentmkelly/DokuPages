import { DEFAULT_LANGUAGE, normalizeLanguage } from "./language";
import { STOP_WORDS_BY_LANGUAGE, type StopWordsLanguage } from "./stopwords";

const SEARCH_MIN_WORD_BYTES = 2;
const DOKUWIKI_SPECIAL_CHARS_PATTERN = /[^\p{L}\p{N}\p{M} ]+/gu;
const SEARCH_CORE_CHAR_PATTERN = /[\p{L}\p{N}]/u;
const ASIAN_WORD_PATTERN =
  /([\p{Script=Thai}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\u2e80-\u2eff\u3000-\u303f\u31f0-\u31ff\u3200-\u33ff\ufe30-\ufe4f])/gu;
const utf8Encoder = new TextEncoder();
const stopWordSetCache = new Map<string, ReadonlySet<string>>();

export function parseSearchQuery(query: string, language = DEFAULT_LANGUAGE): string[] {
  return [...new Set(tokenizeSearchText(query, language))].slice(0, 12);
}

export function buildSearchTermFrequencies(
  content: string,
  title?: string | null,
  language = DEFAULT_LANGUAGE
): Map<string, number> {
  const terms = new Map<string, number>();

  addTerms(terms, tokenizeSearchText(stripWikiSyntaxForSearch(content), language), 1);

  if (title) {
    addTerms(terms, tokenizeSearchText(title, language), 3);
  }

  return terms;
}

export function tokenizeSearchText(text: string, language = DEFAULT_LANGUAGE): string[] {
  const stopWords = searchStopWords(language);

  return prepareSearchText(text)
    .split(" ")
    .map((term) => term.toLowerCase())
    .filter((term) => isSearchToken(term) && !stopWords.has(term));
}

export function searchIndexWordLength(term: string): number {
  const bytes = utf8Encoder.encode(term);
  let length = bytes.length;

  for (const byte of bytes) {
    if (byte >= 0xe2 && byte <= 0xef) {
      length += byte - 0xe1;
    }
  }

  return length;
}

export function makeSearchSnippet(content: string, terms: string[], maxLength = 180): string {
  const text = stripWikiSyntaxForSearch(content).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const normalized = text.toLowerCase();
  const firstMatch = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return `${text.slice(0, maxLength).trim()}...`;
  }

  const start = Math.max(0, firstMatch - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function searchStopWords(language = DEFAULT_LANGUAGE): ReadonlySet<string> {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const key = isStopWordsLanguage(normalized) ? normalized : null;
  const cacheKey = key ?? `empty:${normalized}`;
  const cached = stopWordSetCache.get(cacheKey);
  if (cached) return cached;

  const words = new Set<string>(key ? STOP_WORDS_BY_LANGUAGE[key] : []);
  stopWordSetCache.set(cacheKey, words);
  return words;
}

function stripWikiSyntaxForSearch(content: string): string {
  return content
    .replace(/^={2,6}\s*(.*?)\s*={2,6}$/gm, "$1")
    .replace(/\[\[[^\]|]+?\|([^\]]+?)\]\]/g, "$1")
    .replace(/\[\[([^\]]+?)\]\]/g, "$1")
    .replace(/\{\{[^|}]+?\|([^}]+?)\}\}/g, "$1")
    .replace(/\{\{([^}]+?)\}\}/g, "$1")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<file[\s\S]*?<\/file>/gi, " ")
    .replace(/%%[\s\S]*?%%/g, " ")
    .replace(/[=*_/`~[\]{}|<>#]/g, " ");
}

function isStopWordsLanguage(language: string): language is StopWordsLanguage {
  return Object.hasOwn(STOP_WORDS_BY_LANGUAGE, language);
}

function prepareSearchText(text: string): string {
  return separateAsianWords(text.normalize("NFC"))
    .replace(/[\r\n\t]/g, " ")
    .replace(/\u00ad/g, "")
    .replace(DOKUWIKI_SPECIAL_CHARS_PATTERN, " ");
}

function separateAsianWords(text: string): string {
  return text.replace(ASIAN_WORD_PATTERN, " $1 ");
}

function isSearchToken(term: string): boolean {
  if (!term || !SEARCH_CORE_CHAR_PATTERN.test(term)) return false;
  if (isNumericSearchToken(term)) return true;
  return utf8Encoder.encode(term).length >= SEARCH_MIN_WORD_BYTES;
}

function isNumericSearchToken(term: string): boolean {
  if (term.trim() === "") return false;
  return Number.isFinite(Number(term));
}

function addTerms(target: Map<string, number>, terms: string[], weight: number): void {
  for (const term of terms) {
    target.set(term, (target.get(term) ?? 0) + weight);
  }
}
