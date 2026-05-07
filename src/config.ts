import type { Env } from "./env";
import { APP_VERSION } from "./version";
import { cleanPageId } from "./wiki/page-id";

const DEFAULT_SITE_NAME = "DokuWiki Pages";
const DEFAULT_START_PAGE = "wiki:welcome";
const DEFAULT_SESSION_COOKIE_NAME = "DW_PAGES_SESSION";
const COOKIE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface RuntimeConfig {
  siteName: string;
  startPage: string;
  sessionCookieName: string;
  appVersion: string;
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
    sessionCookieName: normalizedSessionCookieName(env.SESSION_COOKIE_NAME),
    appVersion: nonEmpty(env.APP_VERSION) ?? APP_VERSION
  };
}

export function validateRuntimeConfig(env: Env): ConfigValidation {
  const issues: ConfigValidationIssue[] = [];

  validateSiteName(env.SITE_NAME, issues);
  validateStartPage(env.START_PAGE, issues);
  validateSessionCookieName(env.SESSION_COOKIE_NAME, issues);
  validateAppVersion(env.APP_VERSION, issues);

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
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
