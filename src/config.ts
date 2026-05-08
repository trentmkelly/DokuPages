import type { Env } from "./env";
import { APP_VERSION } from "./version";
import {
  isSupportedLanguage,
  normalizeLanguage,
  resolveLanguage,
  type SupportedLanguage
} from "./wiki/language";
import { cleanPageId } from "./wiki/page-id";

const DEFAULT_SITE_NAME = "DokuWiki Pages";
const DEFAULT_START_PAGE = "wiki:welcome";
const DEFAULT_SESSION_COOKIE_NAME = "DW_PAGES_SESSION";
const COOKIE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export interface RuntimeConfig {
  siteName: string;
  startPage: string;
  language: SupportedLanguage;
  sessionCookieName: string;
  hidePages: string | null;
  sneakyIndex: boolean;
  maintenanceMode: boolean;
  disabledActions: string[];
  send404: boolean;
  canonicalUrls: boolean;
  baseUrl: string | null;
  baseDir: string;
  topTocLevel: number;
  tocMinHeads: number;
  maxTocLevel: number;
  maxSectionEditLevel: number;
  useHeading: boolean;
  appVersion: string;
}

export interface RuntimeConfigEntry {
  key: string;
  value: string | null;
  effectiveValue: string | null;
  source: "environment" | "default" | "cloudflare";
}

export interface SecretConfigStatus {
  key: string;
  configured: boolean;
  redactedValue: string | null;
  purpose: string;
}

export interface ConfigExport {
  exportedAt: string;
  runtime: RuntimeConfig;
  variables: RuntimeConfigEntry[];
  secrets: SecretConfigStatus[];
  validation: ConfigValidation;
}

export interface ConfigValidation {
  ok: boolean;
  issues: ConfigValidationIssue[];
}

export interface ConfigValidationIssue {
  key: string;
  severity: "error" | "warning";
  message: string;
}

export function getRuntimeConfig(env: Env): RuntimeConfig {
  return {
    siteName: nonEmpty(env.SITE_NAME) ?? DEFAULT_SITE_NAME,
    startPage: normalizedStartPage(env.START_PAGE),
    language: resolveLanguage(env.WIKI_LANG),
    sessionCookieName: normalizedSessionCookieName(env.SESSION_COOKIE_NAME),
    hidePages: nonEmpty(env.HIDE_PAGES) ?? null,
    sneakyIndex: truthy(env.SNEAKY_INDEX),
    maintenanceMode: truthy(env.MAINTENANCE_MODE),
    disabledActions: parseActionList(env.DISABLE_ACTIONS),
    send404: booleanConfig(env.SEND404, true),
    canonicalUrls: truthy(env.CANONICAL_URLS),
    baseUrl: normalizedBaseUrl(env.BASE_URL),
    baseDir: normalizedBaseDir(env.BASE_DIR),
    topTocLevel: integerConfig(env.TOP_TOC_LEVEL, 1, 1, 5),
    tocMinHeads: integerConfig(env.TOC_MIN_HEADS, 3, 0, 99),
    maxTocLevel: integerConfig(env.MAX_TOC_LEVEL, 3, 1, 5),
    maxSectionEditLevel: integerConfig(env.MAX_SECTION_EDIT_LEVEL, 3, 0, 5),
    useHeading: truthy(env.USE_HEADING),
    appVersion: nonEmpty(env.APP_VERSION) ?? APP_VERSION
  };
}

export function validateRuntimeConfig(env: Env): ConfigValidation {
  const issues: ConfigValidationIssue[] = [];

  validateSiteName(env.SITE_NAME, issues);
  validateStartPage(env.START_PAGE, issues);
  validateLanguage(env.WIKI_LANG, issues);
  validateSessionCookieName(env.SESSION_COOKIE_NAME, issues);
  validateHidePages(env.HIDE_PAGES, issues);
  validateActionList(env.DISABLE_ACTIONS, issues);
  validateBaseUrl(env.BASE_URL, issues);
  validateBaseDir(env.BASE_DIR, issues);
  validateIntegerRange("TOP_TOC_LEVEL", env.TOP_TOC_LEVEL, 1, 5, issues);
  validateIntegerRange("TOC_MIN_HEADS", env.TOC_MIN_HEADS, 0, 99, issues);
  validateIntegerRange("MAX_TOC_LEVEL", env.MAX_TOC_LEVEL, 1, 5, issues);
  validateIntegerRange("MAX_SECTION_EDIT_LEVEL", env.MAX_SECTION_EDIT_LEVEL, 0, 5, issues);
  validateAppVersion(env.APP_VERSION, issues);
  validateApiBearerToken(env.API_BEARER_TOKEN, issues);
  validateEmailProvider(env.EMAIL_PROVIDER, issues);
  validateEmailAddress("EMAIL_FROM", env.EMAIL_FROM, issues);
  validateEmailAddress("EMAIL_REPLY_TO", env.EMAIL_REPLY_TO, issues);
  validateEmailAddress("EMAIL_RETURN_PATH", env.EMAIL_RETURN_PATH, issues);
  validateEmailList("EMAIL_REGISTRATION_NOTIFY", env.EMAIL_REGISTRATION_NOTIFY, issues);
  validateTurnstileConfig(env, issues);

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function getRuntimeConfigEntries(env: Env): RuntimeConfigEntry[] {
  const config = getRuntimeConfig(env);

  return [
    configEntry("SITE_NAME", env.SITE_NAME, config.siteName, DEFAULT_SITE_NAME),
    configEntry("START_PAGE", env.START_PAGE, config.startPage, DEFAULT_START_PAGE),
    configEntry("WIKI_LANG", env.WIKI_LANG, config.language, "en"),
    configEntry(
      "SESSION_COOKIE_NAME",
      env.SESSION_COOKIE_NAME,
      config.sessionCookieName,
      DEFAULT_SESSION_COOKIE_NAME
    ),
    configEntry("HIDE_PAGES", env.HIDE_PAGES, config.hidePages, null),
    configEntry("SNEAKY_INDEX", env.SNEAKY_INDEX, String(config.sneakyIndex), "false"),
    configEntry("MAINTENANCE_MODE", env.MAINTENANCE_MODE, String(config.maintenanceMode), "false"),
    configEntry("DISABLE_ACTIONS", env.DISABLE_ACTIONS, config.disabledActions.join(","), ""),
    configEntry("SEND404", env.SEND404, String(config.send404), "true"),
    configEntry("CANONICAL_URLS", env.CANONICAL_URLS, String(config.canonicalUrls), "false"),
    configEntry("BASE_URL", env.BASE_URL, config.baseUrl, null),
    configEntry("BASE_DIR", env.BASE_DIR, config.baseDir, ""),
    configEntry("TOP_TOC_LEVEL", env.TOP_TOC_LEVEL, String(config.topTocLevel), "1"),
    configEntry("TOC_MIN_HEADS", env.TOC_MIN_HEADS, String(config.tocMinHeads), "3"),
    configEntry("MAX_TOC_LEVEL", env.MAX_TOC_LEVEL, String(config.maxTocLevel), "3"),
    configEntry(
      "MAX_SECTION_EDIT_LEVEL",
      env.MAX_SECTION_EDIT_LEVEL,
      String(config.maxSectionEditLevel),
      "3"
    ),
    configEntry("USE_HEADING", env.USE_HEADING, String(config.useHeading), "false"),
    configEntry("APP_VERSION", env.APP_VERSION, config.appVersion, APP_VERSION),
    configEntry(
      "API_CORS_ORIGINS",
      env.API_CORS_ORIGINS,
      nonEmpty(env.API_CORS_ORIGINS) ?? null,
      null
    ),
    configEntry("EMAIL_PROVIDER", env.EMAIL_PROVIDER, nonEmpty(env.EMAIL_PROVIDER) ?? null, null),
    configEntry(
      "EMAIL_PROVIDER_ENDPOINT",
      env.EMAIL_PROVIDER_ENDPOINT,
      nonEmpty(env.EMAIL_PROVIDER_ENDPOINT) ?? null,
      null
    ),
    configEntry("EMAIL_FROM", env.EMAIL_FROM, nonEmpty(env.EMAIL_FROM) ?? null, null),
    configEntry("EMAIL_REPLY_TO", env.EMAIL_REPLY_TO, nonEmpty(env.EMAIL_REPLY_TO) ?? null, null),
    configEntry(
      "EMAIL_RETURN_PATH",
      env.EMAIL_RETURN_PATH,
      nonEmpty(env.EMAIL_RETURN_PATH) ?? null,
      null
    ),
    configEntry("EMAIL_BASE_URL", env.EMAIL_BASE_URL, nonEmpty(env.EMAIL_BASE_URL) ?? null, null),
    configEntry(
      "EMAIL_REGISTRATION_NOTIFY",
      env.EMAIL_REGISTRATION_NOTIFY,
      nonEmpty(env.EMAIL_REGISTRATION_NOTIFY) ?? null,
      null
    ),
    configEntry(
      "TURNSTILE_SITE_KEY",
      env.TURNSTILE_SITE_KEY,
      nonEmpty(env.TURNSTILE_SITE_KEY) ?? null,
      null
    ),
    cloudflareEntry("CF_PAGES_BRANCH", env.CF_PAGES_BRANCH),
    cloudflareEntry("CF_PAGES_COMMIT_SHA", env.CF_PAGES_COMMIT_SHA),
    cloudflareEntry("CF_PAGES_URL", env.CF_PAGES_URL)
  ];
}

export function getSecretConfigStatus(env: Env): SecretConfigStatus[] {
  const apiToken = nonEmpty(env.API_BEARER_TOKEN) ?? null;
  const resendApiKey = nonEmpty(env.RESEND_API_KEY) ?? null;
  const emailApiToken = nonEmpty(env.EMAIL_API_TOKEN) ?? null;
  const emailTaskToken = nonEmpty(env.EMAIL_TASK_TOKEN) ?? null;
  const turnstileSecretKey = nonEmpty(env.TURNSTILE_SECRET_KEY) ?? null;

  return [
    {
      key: "API_BEARER_TOKEN",
      configured: Boolean(apiToken),
      redactedValue: apiToken ? "[redacted]" : null,
      purpose: "Native API bearer-token authentication for automation writes."
    },
    {
      key: "RESEND_API_KEY",
      configured: Boolean(resendApiKey),
      redactedValue: resendApiKey ? "[redacted]" : null,
      purpose: "Resend API authentication for outbound email delivery."
    },
    {
      key: "EMAIL_API_TOKEN",
      configured: Boolean(emailApiToken),
      redactedValue: emailApiToken ? "[redacted]" : null,
      purpose: "Generic outbound email provider token fallback."
    },
    {
      key: "EMAIL_TASK_TOKEN",
      configured: Boolean(emailTaskToken),
      redactedValue: emailTaskToken ? "[redacted]" : null,
      purpose: "Bearer token for scheduled email digest task execution."
    },
    {
      key: "TURNSTILE_SECRET_KEY",
      configured: Boolean(turnstileSecretKey),
      redactedValue: turnstileSecretKey ? "[redacted]" : null,
      purpose: "Cloudflare Turnstile Siteverify secret for login and registration forms."
    }
  ];
}

export function createConfigExport(env: Env, now = new Date()): ConfigExport {
  return {
    exportedAt: now.toISOString(),
    runtime: getRuntimeConfig(env),
    variables: getRuntimeConfigEntries(env),
    secrets: getSecretConfigStatus(env),
    validation: validateRuntimeConfig(env)
  };
}

function validateSiteName(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value !== undefined && !nonEmpty(value)) {
    issues.push({
      key: "SITE_NAME",
      severity: "warning",
      message: "SITE_NAME is blank; the default site name will be used."
    });
  }
}

function validateStartPage(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value === undefined) return;

  const normalized = cleanPageId(value);

  if (!normalized) {
    issues.push({
      key: "START_PAGE",
      severity: "error",
      message: "START_PAGE does not resolve to a valid DokuWiki page id."
    });
    return;
  }

  if (normalized !== value) {
    issues.push({
      key: "START_PAGE",
      severity: "warning",
      message: `START_PAGE will be normalized to '${normalized}'.`
    });
  }
}

function validateLanguage(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value === undefined) return;

  const normalized = normalizeLanguage(value);

  if (!normalized) {
    issues.push({
      key: "WIKI_LANG",
      severity: "error",
      message: "WIKI_LANG does not resolve to a supported DokuWiki language."
    });
    return;
  }

  if (isSupportedLanguage(normalized)) {
    if (normalized !== value) {
      issues.push({
        key: "WIKI_LANG",
        severity: "warning",
        message: `WIKI_LANG will be normalized to '${normalized}'.`
      });
    }
    return;
  }

  const baseLanguage = normalized.split("-")[0];

  if (baseLanguage && isSupportedLanguage(baseLanguage)) {
    issues.push({
      key: "WIKI_LANG",
      severity: "warning",
      message: `WIKI_LANG '${normalized}' is not bundled; '${baseLanguage}' will be used.`
    });
    return;
  }

  issues.push({
    key: "WIKI_LANG",
    severity: "error",
    message: `WIKI_LANG '${normalized}' is not a bundled DokuWiki language.`
  });
}

function validateSessionCookieName(
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  if (value !== undefined && !validCookieName(value)) {
    issues.push({
      key: "SESSION_COOKIE_NAME",
      severity: "error",
      message: "SESSION_COOKIE_NAME must be a valid HTTP cookie token."
    });
  }
}

function validateAppVersion(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value !== undefined && !nonEmpty(value)) {
    issues.push({
      key: "APP_VERSION",
      severity: "warning",
      message: "APP_VERSION is blank; the build-time version will be used."
    });
  }
}

function validateHidePages(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const pattern = nonEmpty(value);
  if (!pattern) return;

  try {
    new RegExp(pattern, "iu");
  } catch {
    issues.push({
      key: "HIDE_PAGES",
      severity: "error",
      message: "HIDE_PAGES must be a valid JavaScript-compatible regular expression."
    });
  }
}

function validateActionList(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  const invalid = raw
    .split(",")
    .map((action) => action.trim())
    .filter(Boolean)
    .filter((action) => !/^[a-z][a-z0-9_]*$/i.test(action));

  if (invalid.length > 0) {
    issues.push({
      key: "DISABLE_ACTIONS",
      severity: "error",
      message: `DISABLE_ACTIONS contains invalid action names: ${invalid.join(", ")}.`
    });
  }
}

function validateBaseUrl(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const baseUrl = nonEmpty(value);
  if (!baseUrl) return;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    issues.push({
      key: "BASE_URL",
      severity: "error",
      message: "BASE_URL must be an absolute http(s) URL."
    });
  }
}

function validateBaseDir(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const baseDir = nonEmpty(value);
  if (!baseDir) return;

  if (!baseDir.startsWith("/") || baseDir.includes("..")) {
    issues.push({
      key: "BASE_DIR",
      severity: "error",
      message: "BASE_DIR must be an absolute path prefix without '..'."
    });
  }
}

function validateIntegerRange(
  key: string,
  value: string | undefined,
  min: number,
  max: number,
  issues: ConfigValidationIssue[]
): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    issues.push({
      key,
      severity: "error",
      message: `${key} must be an integer from ${min} to ${max}.`
    });
  }
}

function validateApiBearerToken(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value !== undefined && !nonEmpty(value)) {
    issues.push({
      key: "API_BEARER_TOKEN",
      severity: "warning",
      message: "API_BEARER_TOKEN is blank; bearer-token API writes will remain disabled."
    });
  }
}

function validateEmailProvider(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const provider = nonEmpty(value);
  if (!provider) return;

  if (provider !== "resend") {
    issues.push({
      key: "EMAIL_PROVIDER",
      severity: "error",
      message: "EMAIL_PROVIDER must be 'resend' when outbound email is enabled."
    });
  }
}

function validateEmailAddress(
  key: string,
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  const email = nonEmpty(value);
  if (!email) return;

  if (!EMAIL_ADDRESS.test(extractEmailAddress(email))) {
    issues.push({
      key,
      severity: "error",
      message: `${key} must be a valid email address or 'Name <address@example.test>' sender.`
    });
  }
}

function validateEmailList(
  key: string,
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  const invalid = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => !EMAIL_ADDRESS.test(extractEmailAddress(entry)));

  if (invalid.length > 0) {
    issues.push({
      key,
      severity: "error",
      message: `${key} contains invalid email address entries.`
    });
  }
}

function validateTurnstileConfig(env: Env, issues: ConfigValidationIssue[]): void {
  const siteKey = nonEmpty(env.TURNSTILE_SITE_KEY);
  const secretKey = nonEmpty(env.TURNSTILE_SECRET_KEY);

  if (env.TURNSTILE_SITE_KEY !== undefined && !siteKey) {
    issues.push({
      key: "TURNSTILE_SITE_KEY",
      severity: "warning",
      message: "TURNSTILE_SITE_KEY is blank; Turnstile will be disabled."
    });
  }

  if (env.TURNSTILE_SECRET_KEY !== undefined && !secretKey) {
    issues.push({
      key: "TURNSTILE_SECRET_KEY",
      severity: "warning",
      message: "TURNSTILE_SECRET_KEY is blank; Turnstile will be disabled."
    });
  }

  if (siteKey && !secretKey) {
    issues.push({
      key: "TURNSTILE_SECRET_KEY",
      severity: "error",
      message: "TURNSTILE_SECRET_KEY is required when TURNSTILE_SITE_KEY is configured."
    });
  }

  if (secretKey && !siteKey) {
    issues.push({
      key: "TURNSTILE_SITE_KEY",
      severity: "error",
      message: "TURNSTILE_SITE_KEY is required when TURNSTILE_SECRET_KEY is configured."
    });
  }
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^<>]+)>/);
  return (match?.[1] ?? value).trim();
}

function configEntry(
  key: string,
  rawValue: string | undefined,
  effectiveValue: string | null,
  defaultValue: string | null
): RuntimeConfigEntry {
  return {
    key,
    value: nonEmpty(rawValue) ?? null,
    effectiveValue,
    source:
      nonEmpty(rawValue) === undefined && effectiveValue === defaultValue
        ? "default"
        : "environment"
  };
}

function cloudflareEntry(key: string, value: string | undefined): RuntimeConfigEntry {
  return {
    key,
    value: nonEmpty(value) ?? null,
    effectiveValue: nonEmpty(value) ?? null,
    source: "cloudflare"
  };
}

function normalizedStartPage(value: string | undefined): string {
  const normalized = cleanPageId(value ?? DEFAULT_START_PAGE);
  return normalized || DEFAULT_START_PAGE;
}

function normalizedSessionCookieName(value: string | undefined): string {
  return value && validCookieName(value) ? value : DEFAULT_SESSION_COOKIE_NAME;
}

function parseActionList(value: string | undefined): string[] {
  return [
    ...new Set(
      (nonEmpty(value) ?? "")
        .split(",")
        .map((action) => action.trim().toLowerCase())
        .filter((action) => /^[a-z][a-z0-9_]*$/i.test(action))
    )
  ].sort();
}

function normalizedBaseUrl(value: string | undefined): string | null {
  const baseUrl = nonEmpty(value);
  if (!baseUrl) return null;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizedBaseDir(value: string | undefined): string {
  const baseDir = nonEmpty(value);
  if (!baseDir || !baseDir.startsWith("/") || baseDir.includes("..")) return "";
  return `/${baseDir.split("/").filter(Boolean).join("/")}`;
}

function validCookieName(value: string): boolean {
  return COOKIE_TOKEN.test(value);
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function booleanConfig(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (truthy(value)) return true;
  const normalized = value.toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
    return false;
  }
  return fallback;
}

function integerConfig(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(nonEmpty(value));
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
