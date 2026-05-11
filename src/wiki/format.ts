import { authLang } from "./auth-language";
import { normalizeLanguage } from "./language";

export interface DokuWikiDateFormatOptions {
  language?: string;
  now?: Date;
}

type RelativeKey = "years" | "months" | "weeks" | "days" | "hours" | "minutes" | "seconds";

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;
const DEFAULT_LANGUAGE = "en";
const UTC_TIME_ZONE = "UTC";
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;
const MONTH_SHORT = [
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
] as const;
const MONTH_LONG = [
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
] as const;

export function formatDokuWikiFileSize(size: number, decimals = 1): string {
  let value = Number.isFinite(size) ? Math.max(0, size) : 0;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${phpRound(value, decimals)}\u00A0${FILE_SIZE_UNITS[unitIndex]}`;
}

export function formatDokuWikiInteger(value: number): string {
  return String(Number.isFinite(value) ? Math.trunc(value) : 0);
}

export function formatDokuWikiDate(
  format: string,
  date = new Date(),
  options: DokuWikiDateFormatOptions = {}
): string {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const now = options.now ?? new Date();
  return format.replace(/%%|%[_#-]?[A-Za-z]/g, (token) =>
    renderDateToken(token, date, now, language)
  );
}

export function formatDokuWikiRelativeDate(
  date: Date,
  now = new Date(),
  language = DEFAULT_LANGUAGE
): string {
  const age = Math.floor((now.getTime() - date.getTime()) / 1000);
  const day = 24 * 60 * 60;
  const units: Array<[RelativeKey, number, number]> = [
    ["years", day * 30 * 12 * 2, day * 30 * 12],
    ["months", day * 30 * 2, day * 30],
    ["weeks", day * 7 * 2, day * 7],
    ["days", day * 2, day],
    ["hours", 60 * 60 * 2, 60 * 60],
    ["minutes", 60 * 2, 60]
  ];

  for (const [key, threshold, divisor] of units) {
    if (age > threshold) {
      return sprintfInteger(authLang(language, key), Math.round(age / divisor));
    }
  }

  return sprintfInteger(authLang(language, "seconds"), age);
}

function renderDateToken(token: string, date: Date, now: Date, language: string): string {
  if (token === "%%") return "%";
  const prefix = token.length === 3 ? token[1] : "";
  const pattern = token.length === 3 ? `%${token[2]}` : token;
  const raw = renderDatePattern(pattern, date, now, language);

  if (prefix === "_") return raw.replace(/\b0+(?=.)/g, (match) => " ".repeat(match.length));
  if (prefix === "#" || prefix === "-") return raw.replace(/\b[0 ]+(?=.)/g, "");
  return raw;
}

function renderDatePattern(pattern: string, date: Date, now: Date, language: string): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const hour12 = hour % 12 || 12;
  const weekday = date.getUTCDay();

  switch (pattern) {
    case "%a":
      return localizedDatePart(date, language, { weekday: "short" }, WEEKDAY_SHORT[weekday]);
    case "%A":
      return localizedDatePart(date, language, { weekday: "long" }, WEEKDAY_LONG[weekday]);
    case "%b":
    case "%h":
      return localizedDatePart(date, language, { month: "short" }, MONTH_SHORT[month]);
    case "%B":
      return localizedDatePart(date, language, { month: "long" }, MONTH_LONG[month]);
    case "%c":
      return localizedDateTime(date, language, { dateStyle: "long", timeStyle: "short" });
    case "%x":
      return localizedDateTime(date, language, { dateStyle: "short" });
    case "%X":
      return localizedDateTime(date, language, { timeStyle: "medium" });
    case "%d":
      return pad(day);
    case "%e":
      return pad(day, " ");
    case "%j":
      return pad(dayOfYear(date), "0", 3);
    case "%u":
      return String(weekday === 0 ? 7 : weekday);
    case "%w":
      return String(weekday);
    case "%U":
      return pad(weekNumber(date, 0));
    case "%V":
      return pad(isoWeekNumber(date));
    case "%W":
      return pad(weekNumber(date, 1));
    case "%m":
      return pad(month + 1);
    case "%C":
      return String(Math.floor(year / 100));
    case "%g":
      return pad(isoWeekYear(date) % 100);
    case "%G":
      return String(isoWeekYear(date));
    case "%y":
      return pad(year % 100);
    case "%Y":
      return String(year);
    case "%H":
      return pad(hour);
    case "%k":
      return pad(hour, " ");
    case "%I":
      return pad(hour12);
    case "%l":
      return pad(hour12, " ");
    case "%M":
      return pad(minute);
    case "%p":
      return hour < 12 ? "AM" : "PM";
    case "%P":
      return hour < 12 ? "am" : "pm";
    case "%r":
      return `${pad(hour12)}:${pad(minute)}:${pad(second)} ${hour < 12 ? "AM" : "PM"}`;
    case "%R":
      return `${pad(hour)}:${pad(minute)}`;
    case "%S":
      return pad(second);
    case "%T":
      return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
    case "%z":
      return "+0000";
    case "%Z":
      return "UTC";
    case "%D":
      return `${pad(month + 1)}/${pad(day)}/${year}`;
    case "%F":
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    case "%s":
      return String(Math.floor(date.getTime() / 1000));
    case "%f":
      return formatDokuWikiRelativeDate(date, now, language);
    case "%n":
      return "\n";
    case "%t":
      return "\t";
    default:
      return pattern;
  }
}

function localizedDatePart(
  date: Date,
  language: string,
  options: Intl.DateTimeFormatOptions,
  fallback: string
): string {
  try {
    return new Intl.DateTimeFormat(localeForLanguage(language), {
      ...options,
      timeZone: UTC_TIME_ZONE
    }).format(date);
  } catch {
    return fallback;
  }
}

function localizedDateTime(
  date: Date,
  language: string,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(localeForLanguage(language), {
      ...options,
      timeZone: UTC_TIME_ZONE
    }).format(date);
  } catch {
    return formatDokuWikiDate("%Y/%m/%d %H:%M", date, { language: DEFAULT_LANGUAGE });
  }
}

function localeForLanguage(language: string): string {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const candidates = [normalized, normalized.split("-")[0] || DEFAULT_LANGUAGE, DEFAULT_LANGUAGE]
    .filter(Boolean)
    .map((candidate) =>
      candidate
        .split("-")
        .map((part, index) => (index === 0 ? part : part.toUpperCase()))
        .join("-")
    );
  const supported = Intl.DateTimeFormat.supportedLocalesOf([...new Set(candidates)]);
  return supported[0] ?? DEFAULT_LANGUAGE;
}

function phpRound(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

function sprintfInteger(template: string, value: number): string {
  return template.includes("%d")
    ? template.replace("%d", formatDokuWikiInteger(value))
    : `${formatDokuWikiInteger(value)} ${template}`;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

function weekNumber(date: Date, weekStartsOn: 0 | 1): number {
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const yearStartDay = yearStart.getUTCDay();
  const offset = (7 + yearStartDay - weekStartsOn) % 7;
  return Math.floor((dayOfYear(date) + offset - 1) / 7);
}

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function isoWeekYear(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  return target.getUTCFullYear();
}

function pad(value: number, fill = "0", length = 2): string {
  return String(value).padStart(length, fill);
}
