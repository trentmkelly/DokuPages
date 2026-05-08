import type { AuthPrincipal } from "../auth/principal";
import { cleanPageId, type PageIdCleanOptions } from "./page-id";

export interface PageTemplateOptions {
  dateFormat?: string;
  now?: Date;
  pageIdCleanOptions?: PageIdCleanOptions;
  principal?: AuthPrincipal;
}

const DEFAULT_DATE_FORMAT = "%Y/%m/%d %H:%M";
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

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

  return renderDokuWikiDateFormat(rendered, options.now ?? new Date());
}

export function renderDokuWikiDateFormat(format: string, now = new Date()): string {
  return format.replace(/%./g, (token) => renderDateToken(token, now));
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

function renderDateToken(token: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  const hour12 = hour % 12 || 12;
  const weekday = now.getUTCDay();

  switch (token) {
    case "%%":
      return "%";
    case "%Y":
      return String(year);
    case "%y":
      return pad(year % 100);
    case "%m":
      return pad(month + 1);
    case "%d":
      return pad(day);
    case "%e":
      return pad(day, " ");
    case "%H":
      return pad(hour);
    case "%k":
      return pad(hour, " ");
    case "%I":
      return pad(hour12);
    case "%l":
      return pad(hour12, " ");
    case "%M":
      return pad(now.getUTCMinutes());
    case "%S":
      return pad(now.getUTCSeconds());
    case "%p":
      return hour < 12 ? "AM" : "PM";
    case "%P":
      return hour < 12 ? "am" : "pm";
    case "%F":
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    case "%T":
      return `${pad(hour)}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    case "%R":
      return `${pad(hour)}:${pad(now.getUTCMinutes())}`;
    case "%D":
      return `${pad(month + 1)}/${pad(day)}/${pad(year % 100)}`;
    case "%a":
      return SHORT_WEEKDAYS[weekday];
    case "%A":
      return WEEKDAYS[weekday];
    case "%b":
    case "%h":
      return SHORT_MONTHS[month];
    case "%B":
      return MONTHS[month];
    case "%u":
      return String(weekday === 0 ? 7 : weekday);
    case "%w":
      return String(weekday);
    case "%j":
      return pad(dayOfYear(now), "0", 3);
    case "%s":
      return String(Math.floor(now.getTime() / 1000));
    case "%f":
      return "0 seconds";
    default:
      return token;
  }
}

function dayOfYear(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  return Math.floor((now.getTime() - start) / 86400000) + 1;
}

function pad(value: number, fill = "0", length = 2): string {
  return String(value).padStart(length, fill);
}
