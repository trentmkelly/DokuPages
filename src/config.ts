import type { Env } from "./env";
import { APP_VERSION } from "./version";
import {
  isSupportedLanguage,
  normalizeLanguage,
  resolveLanguage,
  type SupportedLanguage
} from "./wiki/language";
import { cleanPageId, type DokuWikiFnEncode, type PageIdCleanOptions } from "./wiki/page-id";
import {
  configMetadataForDokuWikiKey,
  dokuwikiConfigKeyForRuntimeEnv,
  summarizeDokuWikiConfigMetadata,
  validateDokuWikiConfigMetadataValue,
  type DokuWikiConfigMetadataSummary
} from "./config-metadata";

const DEFAULT_SITE_NAME = "DokuWiki";
const DEFAULT_TAGLINE = "";
const DEFAULT_SIDEBAR = "sidebar";
const DEFAULT_LICENSE = "cc-by-nc-sa";
const DEFAULT_START_PAGE = "wiki:welcome";
const DEFAULT_SIGNATURE = " --- //[[@MAIL@|@NAME@]] @DATE@//";
const DEFAULT_SESSION_COOKIE_NAME = "DW_PAGES_SESSION";
const DEFAULT_SUPERUSER = "@admin";
const DEFAULT_MANAGER = "@manager";
const DEFAULT_CACHE_TIME = 60 * 60 * 24;
const DEFAULT_EXTERNAL_AUTH_EMAIL_HEADER = "cf-access-authenticated-user-email";
const COOKIE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MEMBER_LIST_ENTRY = /^@?[^\s,]+$/;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SHOW_USER_AS_VALUES = new Set([
  "loginname",
  "username",
  "username_link",
  "email",
  "email_link"
]);

export interface RuntimeConfig {
  siteName: string;
  tagline: string;
  sidebarPage: string | null;
  licenseId: string | null;
  startPage: string;
  language: SupportedLanguage;
  sessionCookieName: string;
  useAcl: boolean;
  superuser: string;
  manager: string;
  autoPassword: boolean;
  profileConfirm: boolean;
  hidePages: string | null;
  sneakyIndex: boolean;
  maintenanceMode: boolean;
  disabledActions: string[];
  send404: boolean;
  canonicalUrls: boolean;
  baseUrl: string | null;
  baseDir: string;
  recentEntries: number;
  recentDays: number;
  topTocLevel: number;
  tocMinHeads: number;
  maxTocLevel: number;
  maxSectionEditLevel: number;
  breadcrumbs: number;
  youAreHere: boolean;
  fullPath: boolean;
  dateFormat: string;
  signature: string;
  showUserAs: "loginname" | "username" | "username_link" | "email" | "email_link";
  cacheTime: number;
  lockTime: number;
  useDraft: boolean;
  useHeading: boolean;
  camelCaseLinks: boolean;
  typographyMode: number;
  autoPluralLinks: boolean;
  relNofollow: boolean;
  refcheck: boolean;
  mediaRevisions: boolean;
  ieXssProtect: boolean;
  fetchSize: number;
  rssType: "rss" | "rss1" | "rss2" | "atom" | "atom1";
  rssLinkTo: "diff" | "page" | "rev" | "current";
  rssContent: "abstract" | "diff" | "htmldiff" | "html";
  rssMedia: "pages" | "media" | "both";
  rssUpdate: number;
  rssShowSummary: boolean;
  rssShowDeleted: boolean;
  sitemapDays: number;
  updateCheck: boolean;
  searchNsLimit: number;
  searchFragment: "exact" | "starts_with" | "ends_with" | "contains";
  pageIdCleanOptions: RuntimePageIdCleanOptions;
  linkTargets: RuntimeLinkTargets;
  externalAuthMode: "off" | "cloudflare_access";
  externalAuthEmailHeader: string;
  externalAuthUsernameHeader: string | null;
  appVersion: string;
}

export interface RuntimePageIdCleanOptions extends PageIdCleanOptions {
  deaccent: 0 | 1 | 2;
  fnencode: DokuWikiFnEncode;
  sepchar: string;
  useslash: boolean;
}

export interface RuntimeLinkTargets {
  wiki: string | null;
  interwiki: string | null;
  extern: string | null;
  media: string | null;
  windows: string | null;
}

export interface RuntimeConfigEntry {
  key: string;
  value: string | null;
  effectiveValue: string | null;
  source: "environment" | "default" | "cloudflare";
  dokuwikiKey: string | null;
  metadata: DokuWikiConfigMetadataSummary | null;
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
  const pageIdCleanOptions = runtimePageIdCleanOptions(env);

  return {
    siteName: nonEmpty(env.TITLE) ?? nonEmpty(env.SITE_NAME) ?? DEFAULT_SITE_NAME,
    tagline: env.TAGLINE === undefined ? DEFAULT_TAGLINE : (nonEmpty(env.TAGLINE) ?? ""),
    sidebarPage: normalizedOptionalPageId(env.SIDEBAR, DEFAULT_SIDEBAR, pageIdCleanOptions),
    licenseId: normalizedLicenseId(env.LICENSE),
    startPage: normalizedStartPage(env.START_PAGE, pageIdCleanOptions),
    language: resolveLanguage(env.WIKI_LANG),
    sessionCookieName: normalizedSessionCookieName(env.SESSION_COOKIE_NAME),
    useAcl: booleanConfig(env.USEACL, true),
    superuser: normalizedMemberList(env.SUPERUSER, DEFAULT_SUPERUSER),
    manager: normalizedMemberList(env.MANAGER, DEFAULT_MANAGER),
    autoPassword: truthy(env.AUTOPASSWD),
    profileConfirm: booleanConfig(env.PROFILECONFIRM, true),
    hidePages: nonEmpty(env.HIDE_PAGES) ?? null,
    sneakyIndex: truthy(env.SNEAKY_INDEX),
    maintenanceMode: truthy(env.MAINTENANCE_MODE),
    disabledActions: parseActionList(env.DISABLE_ACTIONS),
    send404: booleanConfig(env.SEND404, true),
    canonicalUrls: truthy(env.CANONICAL_URLS),
    baseUrl: normalizedBaseUrl(env.BASE_URL),
    baseDir: normalizedBaseDir(env.BASE_DIR),
    recentEntries: integerConfig(env.RECENT, 20, 1, 100),
    recentDays: integerConfig(env.RECENT_DAYS, 7, 0, 3660),
    topTocLevel: integerConfig(env.TOP_TOC_LEVEL, 1, 1, 5),
    tocMinHeads: integerConfig(env.TOC_MIN_HEADS, 3, 0, 99),
    maxTocLevel: integerConfig(env.MAX_TOC_LEVEL, 3, 1, 5),
    maxSectionEditLevel: integerConfig(env.MAX_SECTION_EDIT_LEVEL, 3, 0, 5),
    breadcrumbs: integerConfig(env.BREADCRUMBS, 10, 0, 99),
    youAreHere: truthy(env.YOUAREHERE),
    fullPath: truthy(env.FULLPATH),
    dateFormat: nonEmpty(env.DFORMAT) ?? "%Y/%m/%d %H:%M",
    signature: env.SIGNATURE === undefined ? DEFAULT_SIGNATURE : (nonEmpty(env.SIGNATURE) ?? ""),
    showUserAs: showUserAsConfig(env.SHOWUSERAS),
    cacheTime: integerConfig(env.CACHETIME, DEFAULT_CACHE_TIME, 0, 365 * 24 * 60 * 60),
    lockTime: integerConfig(env.LOCKTIME, 15 * 60, 0, 604800),
    useDraft: booleanConfig(env.USEDRAFT, true),
    useHeading: truthy(env.USE_HEADING),
    camelCaseLinks: truthy(env.CAMELCASE),
    typographyMode: integerConfig(env.TYPOGRAPHY, 1, 0, 2),
    autoPluralLinks: truthy(env.AUTOPLURAL),
    relNofollow: booleanConfig(env.REL_NOFOLLOW, true),
    refcheck: booleanConfig(env.REFCHECK, true),
    mediaRevisions: booleanConfig(env.MEDIAREVISIONS, true),
    ieXssProtect: booleanConfig(env.IEXSSPROTECT, true),
    fetchSize: integerConfig(env.FETCHSIZE, 0, 0, 100 * 1024 * 1024),
    rssType: rssTypeConfig(env.RSS_TYPE),
    rssLinkTo: rssLinkToConfig(env.RSS_LINKTO),
    rssContent: rssContentConfig(env.RSS_CONTENT),
    rssMedia: rssMediaConfig(env.RSS_MEDIA),
    rssUpdate: integerConfig(env.RSS_UPDATE, 5 * 60, 0, 24 * 60 * 60),
    rssShowSummary: booleanConfig(env.RSS_SHOW_SUMMARY, true),
    rssShowDeleted: booleanConfig(env.RSS_SHOW_DELETED, true),
    sitemapDays: integerConfig(env.SITEMAP, 1, 0, 3650),
    updateCheck: false,
    searchNsLimit: integerConfig(env.SEARCH_NSLIMIT, 0, 0, 99),
    searchFragment: searchFragmentConfig(env.SEARCH_FRAGMENT),
    pageIdCleanOptions,
    linkTargets: {
      wiki: normalizedLinkTarget(env.TARGET_WIKI),
      interwiki: normalizedLinkTarget(env.TARGET_INTERWIKI),
      extern: normalizedLinkTarget(env.TARGET_EXTERN),
      media: normalizedLinkTarget(env.TARGET_MEDIA),
      windows: normalizedLinkTarget(env.TARGET_WINDOWS)
    },
    externalAuthMode: externalAuthMode(env.EXTERNAL_AUTH_MODE),
    externalAuthEmailHeader:
      normalizedHeaderName(env.EXTERNAL_AUTH_EMAIL_HEADER) ?? DEFAULT_EXTERNAL_AUTH_EMAIL_HEADER,
    externalAuthUsernameHeader: normalizedHeaderName(env.EXTERNAL_AUTH_USERNAME_HEADER),
    appVersion: nonEmpty(env.APP_VERSION) ?? APP_VERSION
  };
}

export function validateRuntimeConfig(env: Env): ConfigValidation {
  const issues: ConfigValidationIssue[] = [];
  const pageIdCleanOptions = runtimePageIdCleanOptions(env);

  validateSiteName("TITLE", env.TITLE, issues);
  validateSiteName("SITE_NAME", env.SITE_NAME, issues);
  validateOptionalPageId("SIDEBAR", env.SIDEBAR, pageIdCleanOptions, issues);
  validateStartPage(env.START_PAGE, pageIdCleanOptions, issues);
  validateLanguage(env.WIKI_LANG, issues);
  validateSessionCookieName(env.SESSION_COOKIE_NAME, issues);
  validateMemberList("SUPERUSER", env.SUPERUSER, issues);
  validateMemberList("MANAGER", env.MANAGER, issues);
  validateHidePages(env.HIDE_PAGES, issues);
  validateActionList(env.DISABLE_ACTIONS, issues);
  validateBaseUrl(env.BASE_URL, issues);
  validateBaseDir(env.BASE_DIR, issues);
  validateIntegerRange("RECENT", env.RECENT, 1, 100, issues);
  validateIntegerRange("RECENT_DAYS", env.RECENT_DAYS, 0, 3660, issues);
  validateIntegerRange("TOP_TOC_LEVEL", env.TOP_TOC_LEVEL, 1, 5, issues);
  validateIntegerRange("TOC_MIN_HEADS", env.TOC_MIN_HEADS, 0, 99, issues);
  validateIntegerRange("MAX_TOC_LEVEL", env.MAX_TOC_LEVEL, 1, 5, issues);
  validateIntegerRange("MAX_SECTION_EDIT_LEVEL", env.MAX_SECTION_EDIT_LEVEL, 0, 5, issues);
  validateIntegerRange("BREADCRUMBS", env.BREADCRUMBS, 0, 99, issues);
  validateShowUserAs(env.SHOWUSERAS, issues);
  validateIntegerRange("CACHETIME", env.CACHETIME, 0, 365 * 24 * 60 * 60, issues);
  validateIntegerRange("LOCKTIME", env.LOCKTIME, 0, 604800, issues);
  validateIntegerRange("TYPOGRAPHY", env.TYPOGRAPHY, 0, 2, issues);
  validateIntegerRange("FETCHSIZE", env.FETCHSIZE, 0, 100 * 1024 * 1024, issues);
  validateRssType(env.RSS_TYPE, issues);
  validateRssLinkTo(env.RSS_LINKTO, issues);
  validateRssContent(env.RSS_CONTENT, issues);
  validateRssMedia(env.RSS_MEDIA, issues);
  validateIntegerRange("RSS_UPDATE", env.RSS_UPDATE, 0, 24 * 60 * 60, issues);
  validateIntegerRange("SITEMAP", env.SITEMAP, 0, 3650, issues);
  validateUpdateCheckConfig(env, issues);
  validateIntegerRange("SEARCH_NSLIMIT", env.SEARCH_NSLIMIT, 0, 99, issues);
  validateSearchFragment(env.SEARCH_FRAGMENT, issues);
  validateIntegerRange("DEACCENT", env.DEACCENT, 0, 2, issues);
  validateFnEncode(env.FNENCODE, issues);
  validateSepchar(env.SEPCHAR, issues);
  validateExternalAuthMode(env.EXTERNAL_AUTH_MODE, issues);
  validateHeaderName("EXTERNAL_AUTH_EMAIL_HEADER", env.EXTERNAL_AUTH_EMAIL_HEADER, issues);
  validateHeaderName("EXTERNAL_AUTH_USERNAME_HEADER", env.EXTERNAL_AUTH_USERNAME_HEADER, issues);
  validateAppVersion(env.APP_VERSION, issues);
  validateApiBearerToken(env.API_BEARER_TOKEN, issues);
  validateEmailProvider(env.EMAIL_PROVIDER, issues);
  validateEmailAddress("EMAIL_FROM", env.EMAIL_FROM, issues);
  validateEmailAddress("EMAIL_REPLY_TO", env.EMAIL_REPLY_TO, issues);
  validateEmailAddress("EMAIL_RETURN_PATH", env.EMAIL_RETURN_PATH, issues);
  validateEmailList("EMAIL_REGISTRATION_NOTIFY", env.EMAIL_REGISTRATION_NOTIFY, issues);
  validateEmailList("EMAIL_NOTIFY", env.EMAIL_NOTIFY, issues);
  validateEmailList("NOTIFY", env.NOTIFY, issues);
  validateEmailList("REGISTERNOTIFY", env.REGISTERNOTIFY, issues);
  validateEmailAddress("MAILFROM", env.MAILFROM, issues);
  validateEmailAddress("MAILRETURNPATH", env.MAILRETURNPATH, issues);
  validateMetadataBackedRuntimeConfig(env, issues);
  validateTurnstileConfig(env, issues);

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function getRuntimeConfigEntries(env: Env): RuntimeConfigEntry[] {
  const config = getRuntimeConfig(env);

  return [
    configEntry(
      "TITLE",
      nonEmpty(env.TITLE) !== undefined ? env.TITLE : env.SITE_NAME,
      config.siteName,
      DEFAULT_SITE_NAME
    ),
    configEntry("SITE_NAME", env.SITE_NAME, nonEmpty(env.SITE_NAME) ?? null, null, "title"),
    configEntry("TAGLINE", env.TAGLINE, config.tagline, DEFAULT_TAGLINE),
    configEntry("SIDEBAR", env.SIDEBAR, config.sidebarPage, DEFAULT_SIDEBAR),
    configEntry("LICENSE", env.LICENSE, config.licenseId, DEFAULT_LICENSE),
    configEntry("START_PAGE", env.START_PAGE, config.startPage, DEFAULT_START_PAGE),
    configEntry("WIKI_LANG", env.WIKI_LANG, config.language, "en"),
    configEntry(
      "SESSION_COOKIE_NAME",
      env.SESSION_COOKIE_NAME,
      config.sessionCookieName,
      DEFAULT_SESSION_COOKIE_NAME
    ),
    configEntry("USEACL", env.USEACL, String(config.useAcl), "true"),
    configEntry("SUPERUSER", env.SUPERUSER, config.superuser, DEFAULT_SUPERUSER),
    configEntry("MANAGER", env.MANAGER, config.manager, DEFAULT_MANAGER),
    configEntry("AUTOPASSWD", env.AUTOPASSWD, String(config.autoPassword), "false"),
    configEntry("PROFILECONFIRM", env.PROFILECONFIRM, String(config.profileConfirm), "true"),
    configEntry("HIDE_PAGES", env.HIDE_PAGES, config.hidePages, null),
    configEntry("SNEAKY_INDEX", env.SNEAKY_INDEX, String(config.sneakyIndex), "false"),
    configEntry("MAINTENANCE_MODE", env.MAINTENANCE_MODE, String(config.maintenanceMode), "false"),
    configEntry("DISABLE_ACTIONS", env.DISABLE_ACTIONS, config.disabledActions.join(","), ""),
    configEntry("SEND404", env.SEND404, String(config.send404), "true"),
    configEntry("CANONICAL_URLS", env.CANONICAL_URLS, String(config.canonicalUrls), "false"),
    configEntry("BASE_URL", env.BASE_URL, config.baseUrl, null),
    configEntry("BASE_DIR", env.BASE_DIR, config.baseDir, ""),
    configEntry("RECENT", env.RECENT, String(config.recentEntries), "20"),
    configEntry("RECENT_DAYS", env.RECENT_DAYS, String(config.recentDays), "7"),
    configEntry("TOP_TOC_LEVEL", env.TOP_TOC_LEVEL, String(config.topTocLevel), "1"),
    configEntry("TOC_MIN_HEADS", env.TOC_MIN_HEADS, String(config.tocMinHeads), "3"),
    configEntry("MAX_TOC_LEVEL", env.MAX_TOC_LEVEL, String(config.maxTocLevel), "3"),
    configEntry(
      "MAX_SECTION_EDIT_LEVEL",
      env.MAX_SECTION_EDIT_LEVEL,
      String(config.maxSectionEditLevel),
      "3"
    ),
    configEntry("BREADCRUMBS", env.BREADCRUMBS, String(config.breadcrumbs), "10"),
    configEntry("YOUAREHERE", env.YOUAREHERE, String(config.youAreHere), "false"),
    configEntry("FULLPATH", env.FULLPATH, String(config.fullPath), "false"),
    configEntry("DFORMAT", env.DFORMAT, config.dateFormat, "%Y/%m/%d %H:%M"),
    configEntry("SIGNATURE", env.SIGNATURE, config.signature, DEFAULT_SIGNATURE),
    configEntry("SHOWUSERAS", env.SHOWUSERAS, config.showUserAs, "loginname"),
    configEntry("CACHETIME", env.CACHETIME, String(config.cacheTime), String(DEFAULT_CACHE_TIME)),
    configEntry("LOCKTIME", env.LOCKTIME, String(config.lockTime), String(15 * 60)),
    configEntry("USEDRAFT", env.USEDRAFT, String(config.useDraft), "true"),
    configEntry("USE_HEADING", env.USE_HEADING, String(config.useHeading), "false"),
    configEntry("CAMELCASE", env.CAMELCASE, String(config.camelCaseLinks), "false"),
    configEntry("TYPOGRAPHY", env.TYPOGRAPHY, String(config.typographyMode), "1"),
    configEntry("AUTOPLURAL", env.AUTOPLURAL, String(config.autoPluralLinks), "false"),
    configEntry("REL_NOFOLLOW", env.REL_NOFOLLOW, String(config.relNofollow), "true"),
    configEntry("REFCHECK", env.REFCHECK, String(config.refcheck), "true"),
    configEntry("MEDIAREVISIONS", env.MEDIAREVISIONS, String(config.mediaRevisions), "true"),
    configEntry("IEXSSPROTECT", env.IEXSSPROTECT, String(config.ieXssProtect), "true"),
    configEntry("FETCHSIZE", env.FETCHSIZE, String(config.fetchSize), "0"),
    configEntry("RSS_TYPE", env.RSS_TYPE, config.rssType, "rss1"),
    configEntry("RSS_LINKTO", env.RSS_LINKTO, config.rssLinkTo, "diff"),
    configEntry("RSS_CONTENT", env.RSS_CONTENT, config.rssContent, "abstract"),
    configEntry("RSS_MEDIA", env.RSS_MEDIA, config.rssMedia, "both"),
    configEntry("RSS_UPDATE", env.RSS_UPDATE, String(config.rssUpdate), String(5 * 60)),
    configEntry("RSS_SHOW_SUMMARY", env.RSS_SHOW_SUMMARY, String(config.rssShowSummary), "true"),
    configEntry("RSS_SHOW_DELETED", env.RSS_SHOW_DELETED, String(config.rssShowDeleted), "true"),
    configEntry("SITEMAP", env.SITEMAP, String(config.sitemapDays), "1"),
    configEntry("UPDATECHECK", env.UPDATECHECK, String(config.updateCheck), "false"),
    configEntry("SEARCH_NSLIMIT", env.SEARCH_NSLIMIT, String(config.searchNsLimit), "0"),
    configEntry("SEARCH_FRAGMENT", env.SEARCH_FRAGMENT, config.searchFragment, "exact"),
    configEntry("DEACCENT", env.DEACCENT, String(config.pageIdCleanOptions.deaccent), "1"),
    configEntry("FNENCODE", env.FNENCODE, config.pageIdCleanOptions.fnencode, "url"),
    configEntry("SEPCHAR", env.SEPCHAR, config.pageIdCleanOptions.sepchar, "_"),
    configEntry("USESLASH", env.USESLASH, String(config.pageIdCleanOptions.useslash), "false"),
    configEntry("TARGET_WIKI", env.TARGET_WIKI, config.linkTargets.wiki, null),
    configEntry("TARGET_INTERWIKI", env.TARGET_INTERWIKI, config.linkTargets.interwiki, null),
    configEntry("TARGET_EXTERN", env.TARGET_EXTERN, config.linkTargets.extern, null),
    configEntry("TARGET_MEDIA", env.TARGET_MEDIA, config.linkTargets.media, null),
    configEntry("TARGET_WINDOWS", env.TARGET_WINDOWS, config.linkTargets.windows, null),
    configEntry("EXTERNAL_AUTH_MODE", env.EXTERNAL_AUTH_MODE, config.externalAuthMode, "off"),
    configEntry(
      "EXTERNAL_AUTH_EMAIL_HEADER",
      env.EXTERNAL_AUTH_EMAIL_HEADER,
      config.externalAuthEmailHeader,
      DEFAULT_EXTERNAL_AUTH_EMAIL_HEADER
    ),
    configEntry(
      "EXTERNAL_AUTH_USERNAME_HEADER",
      env.EXTERNAL_AUTH_USERNAME_HEADER,
      config.externalAuthUsernameHeader,
      null
    ),
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
    configEntry("EMAIL_NOTIFY", env.EMAIL_NOTIFY, nonEmpty(env.EMAIL_NOTIFY) ?? null, null),
    configEntry(
      "EMAIL_REGISTRATION_NOTIFY",
      env.EMAIL_REGISTRATION_NOTIFY,
      nonEmpty(env.EMAIL_REGISTRATION_NOTIFY) ?? null,
      null
    ),
    configEntry("NOTIFY", env.NOTIFY, nonEmpty(env.NOTIFY) ?? null, null),
    configEntry("REGISTERNOTIFY", env.REGISTERNOTIFY, nonEmpty(env.REGISTERNOTIFY) ?? null, null),
    configEntry("MAILFROM", env.MAILFROM, nonEmpty(env.MAILFROM) ?? null, null),
    configEntry("MAILRETURNPATH", env.MAILRETURNPATH, nonEmpty(env.MAILRETURNPATH) ?? null, null),
    configEntry("MAILPREFIX", env.MAILPREFIX, nonEmpty(env.MAILPREFIX) ?? null, null),
    configEntry("HTMLMAIL", env.HTMLMAIL, nonEmpty(env.HTMLMAIL) ?? "true", "true"),
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
  const dokuwikiCookieSalt = nonEmpty(env.DOKUWIKI_COOKIE_SALT) ?? null;

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
    },
    {
      key: "DOKUWIKI_COOKIE_SALT",
      configured: Boolean(dokuwikiCookieSalt),
      redactedValue: dokuwikiCookieSalt ? "[redacted]" : null,
      purpose: "DokuWiki auth_cookiesalt-compatible secret used for media resize tokens."
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

function validateSiteName(
  key: "TITLE" | "SITE_NAME",
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  if (value !== undefined && !nonEmpty(value)) {
    issues.push({
      key,
      severity: "warning",
      message: `${key} is blank; the default site title will be used.`
    });
  }
}

function validateOptionalPageId(
  key: "SIDEBAR",
  value: string | undefined,
  pageIdCleanOptions: RuntimePageIdCleanOptions,
  issues: ConfigValidationIssue[]
): void {
  if (value === undefined || value.trim() === "") return;

  if (!cleanPageId(value, pageIdCleanOptions)) {
    issues.push({
      key,
      severity: "error",
      message: `${key} does not resolve to a valid DokuWiki page id.`
    });
  }
}

function validateStartPage(
  value: string | undefined,
  pageIdCleanOptions: RuntimePageIdCleanOptions,
  issues: ConfigValidationIssue[]
): void {
  if (value === undefined) return;

  const normalized = cleanPageId(value, pageIdCleanOptions);

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

function validateMemberList(
  key: "SUPERUSER" | "MANAGER",
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  const invalid = raw
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member.length > 0 && member !== "!!not set!!")
    .filter((member) => member === "@" || !MEMBER_LIST_ENTRY.test(member));

  if (invalid.length > 0) {
    issues.push({
      key,
      severity: "error",
      message: `${key} must be a comma-separated DokuWiki member list such as 'alice,@admin'.`
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

function validateFnEncode(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!["url", "safe", "utf-8"].includes(raw)) {
    issues.push({
      key: "FNENCODE",
      severity: "error",
      message: "FNENCODE must be one of 'url', 'safe', or 'utf-8'."
    });
  }
}

function validateSepchar(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!/^[A-Za-z0-9_.-]$/.test(raw)) {
    issues.push({
      key: "SEPCHAR",
      severity: "error",
      message: "SEPCHAR must be a single letter, digit, underscore, dash, or dot."
    });
  }
}

function validateRssMedia(value: string | undefined, issues: ConfigValidationIssue[]): void {
  validateChoice("RSS_MEDIA", value, ["pages", "media", "both"], issues);
}

function validateRssType(value: string | undefined, issues: ConfigValidationIssue[]): void {
  validateChoice("RSS_TYPE", value, ["rss", "rss1", "rss2", "atom", "atom1"], issues);
}

function validateRssLinkTo(value: string | undefined, issues: ConfigValidationIssue[]): void {
  validateChoice("RSS_LINKTO", value, ["diff", "page", "rev", "current"], issues);
}

function validateRssContent(value: string | undefined, issues: ConfigValidationIssue[]): void {
  validateChoice("RSS_CONTENT", value, ["abstract", "diff", "htmldiff", "html"], issues);
}

function validateChoice(
  key: string,
  value: string | undefined,
  choices: string[],
  issues: ConfigValidationIssue[]
): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!choices.includes(raw)) {
    issues.push({
      key,
      severity: "error",
      message: `${key} must be one of ${choices.map((choice) => `'${choice}'`).join(", ")}.`
    });
  }
}

function validateSearchFragment(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!["exact", "starts_with", "ends_with", "contains"].includes(raw)) {
    issues.push({
      key: "SEARCH_FRAGMENT",
      severity: "error",
      message: "SEARCH_FRAGMENT must be one of 'exact', 'starts_with', 'ends_with', or 'contains'."
    });
  }
}

function validateShowUserAs(value: string | undefined, issues: ConfigValidationIssue[]): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!SHOW_USER_AS_VALUES.has(raw)) {
    issues.push({
      key: "SHOWUSERAS",
      severity: "error",
      message:
        "SHOWUSERAS must be one of 'loginname', 'username', 'username_link', 'email', or 'email_link'."
    });
  }
}

function validateExternalAuthMode(
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  const raw = nonEmpty(value);
  if (!raw) return;

  if (!["off", "cloudflare_access"].includes(raw.toLowerCase())) {
    issues.push({
      key: "EXTERNAL_AUTH_MODE",
      severity: "error",
      message: "EXTERNAL_AUTH_MODE must be 'off' or 'cloudflare_access'."
    });
  }
}

function validateHeaderName(
  key: string,
  value: string | undefined,
  issues: ConfigValidationIssue[]
): void {
  const header = nonEmpty(value);
  if (!header) return;

  if (!HEADER_NAME.test(header)) {
    issues.push({
      key,
      severity: "error",
      message: `${key} must be a valid HTTP header name.`
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

  if (!EMAIL_ADDRESS.test(extractEmailAddress(emailAddressForValidation(email)))) {
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
    .filter((entry) => !EMAIL_ADDRESS.test(extractEmailAddress(emailAddressForValidation(entry))));

  if (invalid.length > 0) {
    issues.push({
      key,
      severity: "error",
      message: `${key} contains invalid email address entries.`
    });
  }
}

function emailAddressForValidation(value: string): string {
  return value
    .replaceAll("@MAIL@", "noreply@example.test")
    .replaceAll("@USER@", "noreply")
    .replaceAll("@NAME@", "DokuWiki");
}

const METADATA_VALIDATED_RUNTIME_KEYS = [
  "USEACL",
  "AUTOPASSWD",
  "PROFILECONFIRM",
  "SNEAKY_INDEX",
  "YOUAREHERE",
  "FULLPATH",
  "CAMELCASE",
  "REL_NOFOLLOW",
  "IEXSSPROTECT",
  "USEDRAFT",
  "MEDIAREVISIONS",
  "REFCHECK",
  "USESLASH",
  "CANONICAL_URLS",
  "AUTOPLURAL",
  "SEND404",
  "HTMLMAIL",
  "RSS_SHOW_SUMMARY",
  "RSS_SHOW_DELETED",
  "UPDATECHECK"
] as const satisfies readonly (keyof Env)[];

function validateMetadataBackedRuntimeConfig(env: Env, issues: ConfigValidationIssue[]): void {
  for (const envKey of METADATA_VALIDATED_RUNTIME_KEYS) {
    const value = env[envKey];
    if (value === undefined) continue;

    const dokuwikiKey = dokuwikiConfigKeyForRuntimeEnv(envKey);
    if (!dokuwikiKey) continue;

    const validation = validateDokuWikiConfigMetadataValue(dokuwikiKey, value);
    if (validation.ok) continue;

    issues.push({
      key: envKey,
      severity: "error",
      message: `${envKey} does not match upstream DokuWiki config metadata for '${dokuwikiKey}': ${validation.message}`
    });
  }
}

function validateUpdateCheckConfig(env: Env, issues: ConfigValidationIssue[]): void {
  if (!truthy(env.UPDATECHECK)) return;

  issues.push({
    key: "UPDATECHECK",
    severity: "warning",
    message:
      "DokuWiki update notices are intentionally disabled in the Pages runtime; deploy updates through git and Cloudflare Pages."
  });
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
  defaultValue: string | null,
  dokuwikiKey = dokuwikiConfigKeyForRuntimeEnv(key)
): RuntimeConfigEntry {
  const metadata = dokuwikiKey ? configMetadataForDokuWikiKey(dokuwikiKey) : null;
  return {
    key,
    value: nonEmpty(rawValue) ?? null,
    effectiveValue,
    dokuwikiKey,
    metadata: summarizeDokuWikiConfigMetadata(metadata),
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
    dokuwikiKey: null,
    metadata: null,
    source: "cloudflare"
  };
}

function normalizedStartPage(
  value: string | undefined,
  pageIdCleanOptions: RuntimePageIdCleanOptions
): string {
  const normalized = cleanPageId(value ?? DEFAULT_START_PAGE, pageIdCleanOptions);
  return normalized || DEFAULT_START_PAGE;
}

function normalizedOptionalPageId(
  value: string | undefined,
  fallback: string,
  pageIdCleanOptions: RuntimePageIdCleanOptions
): string | null {
  if (value !== undefined && value.trim() === "") return null;

  const normalized = cleanPageId(value ?? fallback, pageIdCleanOptions);
  return normalized || null;
}

function normalizedLicenseId(value: string | undefined): string | null {
  if (value === undefined) return DEFAULT_LICENSE;

  const normalized = nonEmpty(value);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  return lower === "none" || lower === "0" || lower === "false" ? null : normalized;
}

function normalizedSessionCookieName(value: string | undefined): string {
  return value && validCookieName(value) ? value : DEFAULT_SESSION_COOKIE_NAME;
}

function normalizedMemberList(value: string | undefined, fallback: string): string {
  return nonEmpty(value) ?? fallback;
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

function normalizedLinkTarget(value: string | undefined): string | null {
  return nonEmpty(value) ?? null;
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

function runtimePageIdCleanOptions(env: Env): RuntimePageIdCleanOptions {
  return {
    deaccent: integerConfig(env.DEACCENT, 1, 0, 2) as 0 | 1 | 2,
    fnencode: fnencodeConfig(env.FNENCODE),
    sepchar: sepcharConfig(env.SEPCHAR),
    useslash: booleanConfig(env.USESLASH, false)
  };
}

function fnencodeConfig(value: string | undefined): DokuWikiFnEncode {
  const raw = nonEmpty(value);
  return raw === "safe" || raw === "utf-8" ? raw : "url";
}

function sepcharConfig(value: string | undefined): string {
  const raw = nonEmpty(value);
  return raw && /^[A-Za-z0-9_.-]$/.test(raw) ? raw : "_";
}

function rssTypeConfig(value: string | undefined): RuntimeConfig["rssType"] {
  const raw = nonEmpty(value);
  return raw === "rss" || raw === "rss2" || raw === "atom" || raw === "atom1" ? raw : "rss1";
}

function rssLinkToConfig(value: string | undefined): RuntimeConfig["rssLinkTo"] {
  const raw = nonEmpty(value);
  return raw === "page" || raw === "rev" || raw === "current" ? raw : "diff";
}

function rssContentConfig(value: string | undefined): RuntimeConfig["rssContent"] {
  const raw = nonEmpty(value);
  return raw === "diff" || raw === "htmldiff" || raw === "html" ? raw : "abstract";
}

function rssMediaConfig(value: string | undefined): RuntimeConfig["rssMedia"] {
  const raw = nonEmpty(value);
  return raw === "pages" || raw === "media" || raw === "both" ? raw : "both";
}

function searchFragmentConfig(value: string | undefined): RuntimeConfig["searchFragment"] {
  const raw = nonEmpty(value);
  return raw === "starts_with" || raw === "ends_with" || raw === "contains" ? raw : "exact";
}

function showUserAsConfig(value: string | undefined): RuntimeConfig["showUserAs"] {
  const raw = nonEmpty(value);
  return SHOW_USER_AS_VALUES.has(raw ?? "") ? (raw as RuntimeConfig["showUserAs"]) : "loginname";
}

function externalAuthMode(value: string | undefined): RuntimeConfig["externalAuthMode"] {
  const raw = nonEmpty(value)?.toLowerCase();
  return raw === "cloudflare_access" ? "cloudflare_access" : "off";
}

function normalizedHeaderName(value: string | undefined): string | null {
  const header = nonEmpty(value)?.toLowerCase();
  return header && HEADER_NAME.test(header) ? header : null;
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
