import { DEFAULT_LANGUAGE, normalizeLanguage } from "./language";
import { STOP_WORDS_BY_LANGUAGE, type StopWordsLanguage } from "./stopwords";

const SEARCH_MIN_WORD_BYTES = 2;
const DOKUWIKI_SPECIAL_CHARS_PATTERN = /[^\p{L}\p{N}\p{M} ]+/gu;
const DOKUWIKI_WILDCARD_SPECIAL_CHARS_PATTERN = /[^\p{L}\p{N}\p{M} *]+/gu;
const SEARCH_CORE_CHAR_PATTERN = /[\p{L}\p{N}]/u;
const ASIAN_WORD_PATTERN =
  /([\p{Script=Thai}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\u2e80-\u2eff\u3000-\u303f\u31f0-\u31ff\u3200-\u33ff\ufe30-\ufe4f])/gu;
const utf8Encoder = new TextEncoder();
const stopWordSetCache = new Map<string, ReadonlySet<string>>();

export type SearchOperator = "AND" | "OR" | "NOT";
export type SearchWildcard = "none" | "prefix" | "suffix" | "contains";
export type SearchFragment = "exact" | "starts_with" | "ends_with" | "contains";

export interface SearchWordOperand {
  kind: "word";
  term: string;
  lookupTerm: string;
  wildcard: SearchWildcard;
  highlight: boolean;
}

export interface SearchPhraseOperand {
  kind: "phrase";
  phrase: string;
  highlight: boolean;
}

export interface SearchNamespaceOperand {
  kind: "namespace";
  namespace: string;
}

export type SearchOperand = SearchWordOperand | SearchPhraseOperand | SearchNamespaceOperand;
export type SearchRpnToken = SearchOperand | SearchOperator;

export interface ParsedFulltextSearchQuery {
  rpn: SearchRpnToken[];
  words: string[];
  highlight: string[];
  namespaces: string[];
  excludedNamespaces: string[];
  simpleTerms: string[];
}

export interface SearchQueryAdjustmentOptions {
  language?: string;
  currentNamespace?: string;
  formSubmitted?: boolean;
  searchNsLimit?: number;
  searchFragment?: SearchFragment;
}

interface TokenizeSearchOptions {
  allowWildcards?: boolean;
}

type SearchInfixToken = SearchOperand | SearchOperator | "(" | ")";

export function parseSearchQuery(query: string, language = DEFAULT_LANGUAGE): string[] {
  return parseFulltextSearchQuery(query, language).highlight.slice(0, 12);
}

export function buildSearchTermFrequencies(
  content: string,
  title?: string | null,
  language = DEFAULT_LANGUAGE,
  pageId?: string | null
): Map<string, number> {
  const terms = new Map<string, number>();

  addTerms(terms, tokenizeSearchText(stripWikiSyntaxForSearch(content), language), 1);

  if (title) {
    addTerms(terms, tokenizeSearchText(title, language), 3);
  }

  if (pageId) {
    addTerms(terms, tokenizeSearchText(pageId.replace(/[:/_-]+/g, " "), language), 2);
  }

  return terms;
}

export function tokenizeSearchText(
  text: string,
  language = DEFAULT_LANGUAGE,
  options: TokenizeSearchOptions = {}
): string[] {
  const stopWords = searchStopWords(language);

  return prepareSearchText(text, options)
    .split(" ")
    .map((term) => term.toLowerCase())
    .filter((term) => isSearchToken(term, options) && !stopWords.has(term));
}

export function parseFulltextSearchQuery(
  query: string,
  language = DEFAULT_LANGUAGE
): ParsedFulltextSearchQuery {
  const infix = parseFulltextInfix(query, language);
  const rpn = toSearchRpn(infix);
  const words: string[] = [];
  const highlight: string[] = [];
  const namespaces: string[] = [];
  const excludedNamespaces: string[] = [];

  for (let index = 0; index < rpn.length; index += 1) {
    const token = rpn[index];
    if (typeof token === "string") continue;

    if (token.kind === "word") {
      words.push(token.term);
      if (token.highlight) highlight.push(token.lookupTerm);
      continue;
    }

    if (token.kind === "phrase") {
      if (token.highlight) highlight.push(token.phrase);
      continue;
    }

    const isExcluded = rpn[index + 1] === "NOT";
    if (isExcluded) {
      excludedNamespaces.push(token.namespace);
    } else {
      namespaces.push(token.namespace);
    }
  }

  return {
    rpn,
    words: uniqueStrings(words),
    highlight: uniqueStrings(highlight),
    namespaces: uniqueStrings(namespaces),
    excludedNamespaces: uniqueStrings(excludedNamespaces),
    simpleTerms: simpleConjunctionTerms(rpn)
  };
}

export function adjustSearchQuery(
  query: string,
  options: SearchQueryAdjustmentOptions = {}
): string {
  if (!query || options.formSubmitted) return query;

  const language = options.language ?? DEFAULT_LANGUAGE;
  const parsedQuery = parseFulltextSearchQuery(query, language);
  const searchNsLimit = options.searchNsLimit ?? 0;
  const searchFragment = options.searchFragment ?? "exact";
  let adjusted = query;

  if (
    searchNsLimit > 0 &&
    options.currentNamespace &&
    parsedQuery.namespaces.length === 0 &&
    parsedQuery.excludedNamespaces.length === 0
  ) {
    const namespace = options.currentNamespace.split(":").slice(0, searchNsLimit).join(":");
    if (namespace) adjusted += ` @${namespace}`;
  }

  if (searchFragment !== "exact" && !query.includes("*") && canApplySearchFragment(parsedQuery)) {
    adjusted = adjusted
      .split(" ")
      .map((part) => searchFragmentPart(part, searchFragment))
      .join(" ");
  }

  return adjusted;
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

function parseFulltextInfix(query: string, language: string): SearchInfixToken[] {
  const tokens: SearchInfixToken[] = [];
  const parts = query
    .toLowerCase()
    .split(/(-?".*?")/u)
    .filter(Boolean);

  for (const part of parts) {
    const phrase = part.match(/^(-?)"(.+)"$/u);
    if (phrase) {
      pushPhrase(tokens, phrase[2] ?? "", Boolean(phrase[1]), language);
      continue;
    }

    const normalized = part
      .replaceAll('"', " ")
      .replaceAll(")", " ) ")
      .replaceAll("(", " ( ")
      .replaceAll("- (", " -(")
      .replaceAll("|", " or ")
      .replace(/[ \u3000]+/gu, " ")
      .trim();

    if (!normalized) continue;

    for (const token of normalized.split(" ")) {
      if (token === "(") {
        pushInfixToken(tokens, "(");
      } else if (token === "-(") {
        pushInfixToken(tokens, "NOT");
        pushInfixToken(tokens, "(");
      } else if (token === ")") {
        tokens.push(")");
      } else if (token === "and") {
        continue;
      } else if (token === "or") {
        tokens.push("OR");
      } else {
        pushSearchTerm(tokens, token, language);
      }
    }
  }

  return balanceSearchParens(tokens);
}

function pushSearchTerm(tokens: SearchInfixToken[], token: string, language: string): void {
  const excludedNamespace = token.match(/^(?:\^|-ns:)(.+)$/u);
  if (excludedNamespace) {
    pushInfixToken(tokens, "NOT");
    pushInfixToken(tokens, namespaceOperand(excludedNamespace[1] ?? ""));
    return;
  }

  const includedNamespace = token.match(/^(?:@|ns:)(.+)$/u);
  if (includedNamespace) {
    pushInfixToken(tokens, namespaceOperand(includedNamespace[1] ?? ""));
    return;
  }

  const excludedWord = token.match(/^-(.+)$/u);
  if (excludedWord) {
    pushInfixToken(tokens, "NOT");
    pushWordGroup(tokens, wordOperands(excludedWord[1] ?? "", language, true));
    return;
  }

  pushWordGroup(tokens, wordOperands(token, language, true));
}

function pushPhrase(
  tokens: SearchInfixToken[],
  phrase: string,
  excluded: boolean,
  language: string
): void {
  const words = wordOperands(phrase.replace(/[()]/g, " "), language, false);
  if (words.length === 0) return;

  if (excluded) pushInfixToken(tokens, "NOT");

  const phraseOperand: SearchPhraseOperand = {
    kind: "phrase",
    phrase: phrase.normalize("NFC").toLowerCase(),
    highlight: !excluded
  };
  pushOperandGroup(tokens, [...words, phraseOperand]);
}

function pushWordGroup(tokens: SearchInfixToken[], operands: SearchWordOperand[]): void {
  pushOperandGroup(tokens, operands);
}

function pushOperandGroup(tokens: SearchInfixToken[], operands: SearchOperand[]): void {
  if (operands.length === 0) return;
  if (operands.length === 1) {
    pushInfixToken(tokens, operands[0] as SearchOperand);
    return;
  }

  pushInfixToken(tokens, "(");
  operands.forEach((operand, index) => {
    if (index > 0) tokens.push("AND");
    tokens.push(operand);
  });
  tokens.push(")");
}

function pushInfixToken(tokens: SearchInfixToken[], token: SearchInfixToken): void {
  const previous = tokens.at(-1);
  if (shouldInsertImplicitAnd(previous, token)) {
    tokens.push("AND");
  }
  tokens.push(token);
}

function shouldInsertImplicitAnd(
  previous: SearchInfixToken | undefined,
  next: SearchInfixToken
): boolean {
  if (!previous) return false;
  return endsSearchOperand(previous) && beginsSearchOperand(next);
}

function endsSearchOperand(token: SearchInfixToken): boolean {
  return token === ")" || isSearchOperand(token);
}

function beginsSearchOperand(token: SearchInfixToken): boolean {
  return token === "(" || token === "NOT" || isSearchOperand(token);
}

function isSearchOperand(token: SearchInfixToken): token is SearchOperand {
  return typeof token === "object";
}

function balanceSearchParens(tokens: SearchInfixToken[]): SearchInfixToken[] {
  let level = 0;
  const balanced: SearchInfixToken[] = [];

  for (const token of tokens) {
    if (token === "(") level += 1;
    if (token === ")") {
      if (level === 0) continue;
      level -= 1;
    }
    balanced.push(token);
  }

  while (level > 0) {
    balanced.push(")");
    level -= 1;
  }

  return balanced;
}

function toSearchRpn(tokens: SearchInfixToken[]): SearchRpnToken[] {
  const output: SearchRpnToken[] = [];
  const operators: Array<SearchOperator | "("> = [];
  const precedence: Record<SearchOperator, number> = { OR: 2, AND: 3, NOT: 4 };

  for (const token of tokens) {
    if (isSearchOperand(token)) {
      output.push(token);
      continue;
    }

    if (token === "(") {
      operators.push(token);
      continue;
    }

    if (token === ")") {
      while (operators.length > 0 && operators.at(-1) !== "(") {
        output.push(operators.pop() as SearchOperator);
      }
      if (operators.at(-1) === "(") operators.pop();
      continue;
    }

    while (
      operators.length > 0 &&
      operators.at(-1) !== "(" &&
      precedence[token] <= precedence[operators.at(-1) as SearchOperator]
    ) {
      output.push(operators.pop() as SearchOperator);
    }
    operators.push(token);
  }

  while (operators.length > 0) {
    const operator = operators.pop();
    if (operator && operator !== "(") output.push(operator);
  }

  return removeDoubleNots(output);
}

function removeDoubleNots(tokens: SearchRpnToken[]): SearchRpnToken[] {
  const output: SearchRpnToken[] = [];

  for (const token of tokens) {
    if (token === "NOT" && output.at(-1) === "NOT") {
      output.pop();
      continue;
    }
    output.push(token);
  }

  return output;
}

function simpleConjunctionTerms(tokens: SearchRpnToken[]): string[] {
  const operands = tokens.filter((token): token is SearchWordOperand => {
    return typeof token === "object" && token.kind === "word" && token.wildcard === "none";
  });
  const operators = tokens.filter((token): token is SearchOperator => typeof token === "string");
  if (operands.length === 0) return [];
  if (operators.some((operator) => operator !== "AND")) return [];
  if (operators.length !== operands.length - 1) return [];
  return uniqueStrings(operands.map((operand) => operand.lookupTerm)).slice(0, 12);
}

function canApplySearchFragment(parsedQuery: ParsedFulltextSearchQuery): boolean {
  if (parsedQuery.words.length === 0) return false;
  const highlighted = new Set(parsedQuery.highlight);
  return parsedQuery.words.every((word) => highlighted.has(word));
}

function searchFragmentPart(part: string, fragment: SearchFragment): string {
  if (
    part.startsWith("@") ||
    part.startsWith("ns:") ||
    part.startsWith("^") ||
    part.startsWith("-ns:")
  ) {
    return part;
  }

  if (fragment === "starts_with") return `${part}*`;
  if (fragment === "ends_with") return `*${part}`;
  return `*${part}*`;
}

function wordOperands(term: string, language: string, highlight: boolean): SearchWordOperand[] {
  return tokenizeSearchText(term.replace(/[()]/g, " "), language, { allowWildcards: true }).map(
    (word) => {
      const wildcard = wildcardKind(word);
      return {
        kind: "word",
        term: word,
        lookupTerm: wildcard === "none" ? word : word.replace(/^\*/, "").replace(/\*$/, ""),
        wildcard,
        highlight
      };
    }
  );
}

function wildcardKind(term: string): SearchWildcard {
  const starts = term.startsWith("*");
  const ends = term.endsWith("*");
  const core = term.replace(/^\*/, "").replace(/\*$/, "");
  if (!core || core.includes("*")) return "none";
  if (starts && ends) return "contains";
  if (starts) return "suffix";
  if (ends) return "prefix";
  return "none";
}

function namespaceOperand(namespace: string): SearchNamespaceOperand {
  return {
    kind: "namespace",
    namespace: namespace.replace(/^:+|:+$/g, "")
  };
}

function prepareSearchText(text: string, options: TokenizeSearchOptions = {}): string {
  const specialCharsPattern = options.allowWildcards
    ? DOKUWIKI_WILDCARD_SPECIAL_CHARS_PATTERN
    : DOKUWIKI_SPECIAL_CHARS_PATTERN;

  return separateAsianWords(text.normalize("NFC"))
    .replace(/[\r\n\t]/g, " ")
    .replace(/\u00ad/g, "")
    .replace(specialCharsPattern, " ");
}

function separateAsianWords(text: string): string {
  return text.replace(ASIAN_WORD_PATTERN, " $1 ");
}

function isSearchToken(term: string, options: TokenizeSearchOptions = {}): boolean {
  if (!term || !SEARCH_CORE_CHAR_PATTERN.test(term)) return false;
  if (isNumericSearchToken(term)) return true;
  if (options.allowWildcards && /^\*+$/.test(term)) return false;
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
