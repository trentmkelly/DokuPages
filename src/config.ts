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

export interface RuntimeConfig {
  siteName: string;
  startPage: string;
  language: SupportedLanguage;
  sessionCookieName: string;
  hidePages: string | null;
  sneakyIndex: boolean;
  maintenanceMode: boolean;
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
  validateAppVersion(env.APP_VERSION, issues);
  validateApiBearerToken(env.API_BEARER_TOKEN, issues);

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
    configEntry("APP_VERSION", env.APP_VERSION, config.appVersion, APP_VERSION),
    configEntry(
      "API_CORS_ORIGINS",
      env.API_CORS_ORIGINS,
      nonEmpty(env.API_CORS_ORIGINS) ?? null,
      null
    ),
    cloudflareEntry("CF_PAGES_BRANCH", env.CF_PAGES_BRANCH),
    cloudflareEntry("CF_PAGES_COMMIT_SHA", env.CF_PAGES_COMMIT_SHA),
    cloudflareEntry("CF_PAGES_URL", env.CF_PAGES_URL)
  ];
}

export function getSecretConfigStatus(env: Env): SecretConfigStatus[] {
  const apiToken = nonEmpty(env.API_BEARER_TOKEN) ?? null;

  return [
    {
      key: "API_BEARER_TOKEN",
      configured: Boolean(apiToken),
      redactedValue: apiToken ? "[redacted]" : null,
      purpose: "Native API bearer-token authentication for automation writes."
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

function validateApiBearerToken(value: string | undefined, issues: ConfigValidationIssue[]): void {
  if (value !== undefined && !nonEmpty(value)) {
    issues.push({
      key: "API_BEARER_TOKEN",
      severity: "warning",
      message: "API_BEARER_TOKEN is blank; bearer-token API writes will remain disabled."
    });
  }
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
