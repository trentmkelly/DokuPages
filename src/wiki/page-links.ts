import { resolvePageLinkId, type PageIdCleanOptions } from "./page-id";

const LINK_PATTERN = /\[\[([^|\]#?]+)(?:[#?][^|\]]*)?(?:\|[^\]]+)?\]\]/g;
const CAMEL_CASE_LINK_PATTERN = /\b[A-Z]+[a-z]+[A-Z][A-Za-z]*\b/g;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const URI_SCHEME_TARGET = /^(?:mailto|tel|urn):/i;

export interface ExtractInternalPageLinksOptions {
  camelCaseLinks?: boolean;
  pageIdCleanOptions?: PageIdCleanOptions;
}

export function extractInternalPageLinks(
  content: string,
  sourcePageId?: string,
  options: ExtractInternalPageLinksOptions = {}
): string[] {
  const links = new Set<string>();

  for (const match of content.matchAll(LINK_PATTERN)) {
    const target = match[1].trim();
    if (isExternalOrInterwiki(target)) continue;

    const clean = resolvePageLinkId(target, sourcePageId, options.pageIdCleanOptions);
    if (clean) links.add(clean);
  }

  if (options.camelCaseLinks) {
    for (const match of maskExplicitSyntax(content).matchAll(CAMEL_CASE_LINK_PATTERN)) {
      const clean = resolvePageLinkId(match[0], sourcePageId, options.pageIdCleanOptions);
      if (clean) links.add(clean);
    }
  }

  return [...links].sort((a, b) => a.localeCompare(b));
}

function isExternalOrInterwiki(target: string): boolean {
  return (
    EXTERNAL_TARGET.test(target) ||
    URI_SCHEME_TARGET.test(target) ||
    target.includes(">") ||
    target.startsWith("#")
  );
}

function maskExplicitSyntax(content: string): string {
  return content
    .replace(/%%[\s\S]*?%%/g, " ")
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, " ")
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, " ")
    .replace(/^\s{2,}.*$/gm, " ")
    .replace(LINK_PATTERN, " ")
    .replace(/\{\{[^}]+\}\}/g, " ");
}
