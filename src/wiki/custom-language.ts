import {
  AUTH_LANGUAGE_KEYS,
  AUTH_PAGE_KEYS,
  authLang,
  authPageText,
  authPageTitle,
  type AuthLanguageKey,
  type AuthPageKey
} from "./auth-language";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "./language";

interface CustomAuthLanguageOverrides {
  strings: Partial<Record<AuthLanguageKey, string>>;
  pages: Partial<Record<AuthPageKey, string>>;
}

interface ImportedLanguageFileRow {
  subject_id: string;
  value_json: string;
}

interface ImportedLanguageFile {
  language?: unknown;
  path?: unknown;
  encoding?: unknown;
  content?: unknown;
}

const AUTH_LANGUAGE_KEY_SET = new Set<string>(AUTH_LANGUAGE_KEYS);
const AUTH_PAGE_KEY_SET = new Set<string>(AUTH_PAGE_KEYS);
const EMPTY_OVERRIDES: CustomAuthLanguageOverrides = { strings: {}, pages: {} };
const OVERRIDE_CACHE = new WeakMap<D1Database, Map<string, CustomAuthLanguageOverrides>>();

export function clearCustomAuthLanguageOverrideCache(db: D1Database): void {
  OVERRIDE_CACHE.delete(db);
}

export async function refreshCustomAuthLanguageOverrides(
  db: D1Database,
  language: string
): Promise<void> {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const overrides = await readCustomAuthLanguageOverrides(db, normalized);
  let byLanguage = OVERRIDE_CACHE.get(db);
  if (!byLanguage) {
    byLanguage = new Map();
    OVERRIDE_CACHE.set(db, byLanguage);
  }
  byLanguage.set(normalized, overrides);
}

export async function ensureCustomAuthLanguageOverrides(
  db: D1Database,
  language: string
): Promise<void> {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  if (OVERRIDE_CACHE.get(db)?.has(normalized)) return;
  await refreshCustomAuthLanguageOverrides(db, normalized);
}

export function customAuthLang(language: string, key: AuthLanguageKey, db: D1Database): string {
  return cachedOverrides(db, language).strings[key] ?? authLang(language, key);
}

export function customAuthPageText(language: string, key: AuthPageKey, db: D1Database): string {
  return cachedOverrides(db, language).pages[key] ?? authPageText(language, key);
}

export function customAuthPageTitle(language: string, key: AuthPageKey, db: D1Database): string {
  const customText = cachedOverrides(db, language).pages[key];
  if (customText) {
    return (
      customText.match(/^={2,}\s*(.*?)\s*=+\s*$/m)?.[1] ??
      customAuthLang(language, pageTitleButtonKey(key), db)
    );
  }
  return authPageTitle(language, key);
}

async function readCustomAuthLanguageOverrides(
  db: D1Database,
  language: string
): Promise<CustomAuthLanguageOverrides> {
  const candidates = languageCandidates(language);
  const candidateSet = new Set(candidates);
  const result = await db
    .prepare(
      `select subject_id, value_json
       from metadata
       where subject_type = ?
         and key = ?`
    )
    .bind("config", "dokuwiki_language_file")
    .all<ImportedLanguageFileRow>();
  const rowsByLanguage = new Map<string, ImportedLanguageFileRow[]>();

  for (const row of result.results) {
    const path = row.subject_id.replace(/^language:/, "");
    const [rowLanguage] = path.split("/");
    const normalized = normalizeLanguage(rowLanguage ?? "");
    if (!candidateSet.has(normalized)) continue;
    const rows = rowsByLanguage.get(normalized) ?? [];
    rows.push(row);
    rowsByLanguage.set(normalized, rows);
  }

  const overrides: CustomAuthLanguageOverrides = { strings: {}, pages: {} };
  for (const candidate of [...candidates].reverse()) {
    for (const row of rowsByLanguage.get(candidate) ?? []) {
      applyLanguageFileOverride(overrides, row);
    }
  }

  return overrides;
}

function applyLanguageFileOverride(
  overrides: CustomAuthLanguageOverrides,
  row: ImportedLanguageFileRow
): void {
  const parsed = parseLanguageFile(row.value_json);
  if (!parsed) return;

  if (parsed.path === "lang.php") {
    for (const [key, value] of Object.entries(parsePhpLangAssignments(parsed.content))) {
      if (AUTH_LANGUAGE_KEY_SET.has(key)) {
        overrides.strings[key as AuthLanguageKey] = value;
      }
    }
    return;
  }

  const pageKey = parsed.path.replace(/\.txt$/, "");
  if (AUTH_PAGE_KEY_SET.has(pageKey)) {
    overrides.pages[pageKey as AuthPageKey] = parsed.content;
  }
}

function parseLanguageFile(value: string): { path: string; content: string } | null {
  try {
    const parsed = JSON.parse(value) as ImportedLanguageFile;
    if (parsed.encoding !== "utf8") return null;
    if (typeof parsed.path !== "string" || typeof parsed.content !== "string") return null;
    return { path: parsed.path, content: parsed.content };
  } catch {
    return null;
  }
}

function parsePhpLangAssignments(source: string): Record<string, string> {
  const assignments: Record<string, string> = {};
  const assignment =
    /\$lang\[\s*(['"])(?<key>(?:\\.|(?!\1).)+)\1\s*\]\s*=\s*(['"])(?<value>(?:\\.|(?!\3).)*)\3\s*;/gs;

  for (const match of source.matchAll(assignment)) {
    const keyQuote = match[1] ?? "'";
    const valueQuote = match[3] ?? "'";
    const key = unescapePhpString(match.groups?.key ?? "", keyQuote);
    const value = unescapePhpString(match.groups?.value ?? "", valueQuote);
    assignments[key] = value;
  }

  return assignments;
}

function unescapePhpString(value: string, quote: string): string {
  if (quote === "'") {
    return value.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function cachedOverrides(db: D1Database, language: string): CustomAuthLanguageOverrides {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  return OVERRIDE_CACHE.get(db)?.get(normalized) ?? EMPTY_OVERRIDES;
}

function languageCandidates(language: string): string[] {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const base = normalized.split("-")[0] || DEFAULT_LANGUAGE;
  return [...new Set([normalized, base, DEFAULT_LANGUAGE])];
}

function pageTitleButtonKey(key: AuthPageKey): AuthLanguageKey {
  switch (key) {
    case "login":
      return "btn_login";
    case "register":
      return "btn_register";
    case "resendpwd":
    case "resetpwd":
      return "btn_resendpwd";
    case "denied":
      return "accessdenied";
    case "locked":
      return "lockedby";
  }
}
