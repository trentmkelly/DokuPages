import type { AuthPrincipal } from "../auth/principal";
import { formatDokuWikiDate, type DokuWikiDateFormatOptions } from "./format";
import { cleanPageId, type PageIdCleanOptions } from "./page-id";

export interface PageTemplateOptions {
  dateFormat?: string;
  language?: string;
  now?: Date;
  pageIdCleanOptions?: PageIdCleanOptions;
  principal?: AuthPrincipal;
}

const DEFAULT_DATE_FORMAT = "%Y/%m/%d %H:%M";
export function pageTemplateCandidates(
  id: string,
  pageIdCleanOptions?: PageIdCleanOptions
): string[] {
  const segments = cleanPageId(id, pageIdCleanOptions).split(":").filter(Boolean);
  const namespaceSegments = segments.slice(0, -1);
  const candidates: string[] = [];

  if (namespaceSegments.length > 0) {
    candidates.push([...namespaceSegments, "_template"].join(":"));
  }

  for (let length = namespaceSegments.length; length >= 0; length -= 1) {
    const namespace = namespaceSegments.slice(0, length);
    candidates.push([...namespace, "__template"].filter(Boolean).join(":"));
  }

  return [...new Set(candidates)];
}

export function applyPageTemplate(
  template: string,
  id: string,
  options: PageTemplateOptions = {}
): string {
  const pageId = cleanPageId(id, options.pageIdCleanOptions);
  const segments = pageId.split(":").filter(Boolean);
  const file = segments.at(-1) ?? pageId;
  const namespace = segments.slice(0, -1).join(":");
  const currentNamespace = segments.slice(0, -1).at(-1) ?? "";
  const page = pageNameFromFile(file, options.pageIdCleanOptions?.sepchar ?? "_");
  const principal = options.principal;
  const replacements: Array<[string, string]> = [
    ["@ID@", pageId],
    ["@NS@", namespace],
    ["@CURNS@", currentNamespace],
    ["@!CURNS@", upperFirst(currentNamespace)],
    ["@!!CURNS@", upperWords(currentNamespace)],
    ["@!CURNS!@", currentNamespace.toUpperCase()],
    ["@FILE@", file],
    ["@!FILE@", upperFirst(file)],
    ["@!FILE!@", file.toUpperCase()],
    ["@PAGE@", page],
    ["@!PAGE@", upperFirst(page)],
    ["@!!PAGE@", upperWords(page)],
    ["@!PAGE!@", page.toUpperCase()],
    ["@USER@", principal?.username ?? ""],
    ["@NAME@", principal?.isAuthenticated ? principal.displayName : ""],
    ["@MAIL@", principal?.isAuthenticated ? (principal.email ?? "") : ""],
    ["@DATE@", options.dateFormat ?? DEFAULT_DATE_FORMAT]
  ];

  let rendered = template;
  for (const [token, value] of replacements) {
    rendered = rendered.replaceAll(token, value);
  }

  return renderDokuWikiDateFormat(rendered, options.now ?? new Date(), {
    language: options.language,
    now: options.now
  });
}

export function renderDokuWikiDateFormat(
  format: string,
  now = new Date(),
  options: DokuWikiDateFormatOptions = {}
): string {
  return formatDokuWikiDate(format, now, options);
}

function pageNameFromFile(file: string, sepchar: string): string {
  return sepchar ? file.split(sepchar).join(" ") : file;
}

function upperFirst(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function upperWords(value: string): string {
  return value.replace(/(^|\s)(\S)/g, (_match, prefix: string, char: string) => {
    return `${prefix}${char.toUpperCase()}`;
  });
}
