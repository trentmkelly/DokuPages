import { resolvePageLinkId } from "./page-id";

const LINK_PATTERN = /\[\[([^|\]#?]+)(?:[#?][^|\]]*)?(?:\|[^\]]+)?\]\]/g;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const URI_SCHEME_TARGET = /^(?:mailto|tel|urn):/i;

export function extractInternalPageLinks(content: string, sourcePageId?: string): string[] {
  const links = new Set<string>();

  for (const match of content.matchAll(LINK_PATTERN)) {
    const target = match[1].trim();
    if (isExternalOrInterwiki(target)) continue;

    const clean = resolvePageLinkId(target, sourcePageId);
    if (clean) links.add(clean);
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
