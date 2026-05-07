import { cleanPageId } from "./page-id";

const LINK_PATTERN = /\[\[([^|\]#?]+)(?:[#?][^|\]]*)?(?:\|[^\]]+)?\]\]/g;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const URI_SCHEME_TARGET = /^(?:mailto|tel|urn):/i;

export function extractInternalPageLinks(content: string, sourcePageId?: string): string[] {
  const links = new Set<string>();
  const sourceNamespace = sourcePageId?.includes(":")
    ? sourcePageId.slice(0, sourcePageId.lastIndexOf(":"))
    : "";

  for (const match of content.matchAll(LINK_PATTERN)) {
    const target = match[1].trim();
    if (isExternalOrInterwiki(target)) continue;

    const clean = cleanPageId(resolveLinkTarget(target, sourceNamespace));
    if (clean) links.add(clean);
  }

  return [...links].sort((a, b) => a.localeCompare(b));
}

function resolveLinkTarget(target: string, sourceNamespace: string): string {
  if (target.startsWith(":")) return target;
  if (target.includes(":") || !sourceNamespace) return target;
  return `${sourceNamespace}:${target}`;
}

function isExternalOrInterwiki(target: string): boolean {
  return (
    EXTERNAL_TARGET.test(target) ||
    URI_SCHEME_TARGET.test(target) ||
    target.includes(">") ||
    target.startsWith("#")
  );
}
