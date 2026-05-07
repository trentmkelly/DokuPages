const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "to",
  "was",
  "will",
  "with",
  "you",
  "your"
]);

const TERM_PATTERN = /[a-z0-9][a-z0-9_-]{1,63}/g;

export function parseSearchQuery(query: string): string[] {
  return [...new Set(tokenizeSearchText(query))].slice(0, 12);
}

export function buildSearchTermFrequencies(
  content: string,
  title?: string | null
): Map<string, number> {
  const terms = new Map<string, number>();

  addTerms(terms, tokenizeSearchText(stripWikiSyntaxForSearch(content)), 1);

  if (title) {
    addTerms(terms, tokenizeSearchText(title), 3);
  }

  return terms;
}

export function tokenizeSearchText(text: string): string[] {
  const normalized = text.toLowerCase().normalize("NFKD");
  const matches = normalized.match(TERM_PATTERN) ?? [];

  return matches.filter((term) => !STOP_WORDS.has(term));
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

function addTerms(target: Map<string, number>, terms: string[], weight: number): void {
  for (const term of terms) {
    target.set(term, (target.get(term) ?? 0) + weight);
  }
}
