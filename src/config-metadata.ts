const SOURCE_FILE = "lib/plugins/config/settings/config.metadata.php";

export type DokuWikiConfigHandler =
  | ""
  | "array"
  | "authtype"
  | "compression"
  | "dirchoice"
  | "disableactions"
  | "email"
  | "fieldset"
  | "im_convert"
  | "license"
  | "multichoice"
  | "numeric"
  | "numericopt"
  | "onoff"
  | "password"
  | "regex"
  | "renderer"
  | "savedir"
  | "sepchar"
  | "string";

export type DokuWikiConfigCaution = "warning" | "danger" | "security";

export interface DokuWikiConfigMetadata {
  key: string;
  handler: DokuWikiConfigHandler;
  group: string;
  source: typeof SOURCE_FILE;
  caution?: DokuWikiConfigCaution;
  pattern?: string;
  choices?: readonly (string | number)[];
  combine?: Readonly<Record<string, readonly string[]>>;
  dir?: string;
  code?: "base64" | "uuencode" | "plain";
  min?: number;
  max?: number;
  delimiter?: string;
  pregFlags?: string;
  multiple?: boolean;
  other?: "always" | "exists" | "never";
  format?: string;
  placeholders?: boolean;
}

export type DokuWikiConfigMetadataSummary = Pick<
  DokuWikiConfigMetadata,
  "key" | "handler" | "group" | "source"
> &
  Partial<
    Pick<
      DokuWikiConfigMetadata,
      "caution" | "pattern" | "choices" | "min" | "max" | "multiple" | "code"
    >
  >;

type MetadataParams = Omit<DokuWikiConfigMetadata, "key" | "handler" | "group" | "source">;
type MetadataRow = readonly [key: string, handler: DokuWikiConfigHandler, params?: MetadataParams];

const ROWS = [
  ["_basic", "fieldset"],
  ["title", "string"],
  ["start", "string", { caution: "warning", pattern: "!^[^:;/]+$!" }],
  ["lang", "dirchoice", { dir: "inc/lang/" }],
  ["template", "dirchoice", { dir: "lib/tpl/", pattern: "/^[\\w-]+$/" }],
  ["tagline", "string"],
  ["sidebar", "string"],
  ["license", "license"],
  ["savedir", "savedir", { caution: "danger" }],
  ["basedir", "string", { caution: "danger" }],
  ["baseurl", "string", { caution: "danger" }],
  ["cookiedir", "string", { caution: "danger" }],
  ["dmode", "numeric", { pattern: "/0[0-7]{3,4}/" }],
  ["fmode", "numeric", { pattern: "/0[0-7]{3,4}/" }],
  ["allowdebug", "onoff", { caution: "security" }],
  ["_display", "fieldset"],
  ["recent", "numeric"],
  ["recent_days", "numeric"],
  ["breadcrumbs", "numeric", { min: 0 }],
  ["youarehere", "onoff"],
  ["fullpath", "onoff", { caution: "security" }],
  ["typography", "multichoice", { choices: [0, 1, 2] }],
  ["dformat", "string"],
  ["signature", "string"],
  [
    "showuseras",
    "multichoice",
    { choices: ["loginname", "username", "username_link", "email", "email_link"] }
  ],
  ["toptoclevel", "multichoice", { choices: [1, 2, 3, 4, 5] }],
  ["tocminheads", "multichoice", { choices: [0, 1, 2, 3, 4, 5, 10, 15, 20] }],
  ["maxtoclevel", "multichoice", { choices: [0, 1, 2, 3, 4, 5] }],
  ["maxseclevel", "multichoice", { choices: [0, 1, 2, 3, 4, 5] }],
  ["camelcase", "onoff", { caution: "warning" }],
  ["deaccent", "multichoice", { choices: [0, 1, 2], caution: "warning" }],
  ["useheading", "multichoice", { choices: [0, "navigation", "content", 1] }],
  ["sneaky_index", "onoff"],
  ["hidepages", "regex"],
  ["_authentication", "fieldset"],
  ["useacl", "onoff", { caution: "danger" }],
  ["autopasswd", "onoff"],
  ["authtype", "authtype", { caution: "danger" }],
  [
    "passcrypt",
    "multichoice",
    {
      choices: [
        "smd5",
        "md5",
        "apr1",
        "sha1",
        "ssha",
        "lsmd5",
        "crypt",
        "mysql",
        "my411",
        "kmd5",
        "pmd5",
        "hmd5",
        "mediawiki",
        "bcrypt",
        "djangomd5",
        "djangosha1",
        "djangopbkdf2_sha1",
        "djangopbkdf2_sha256",
        "sha512",
        "argon2i",
        "argon2id"
      ]
    }
  ],
  ["defaultgroup", "string"],
  ["superuser", "string", { caution: "danger" }],
  ["manager", "string"],
  ["profileconfirm", "onoff"],
  ["rememberme", "onoff"],
  [
    "disableactions",
    "disableactions",
    {
      choices: [
        "backlink",
        "index",
        "recent",
        "revisions",
        "search",
        "subscription",
        "register",
        "resendpwd",
        "profile",
        "profile_delete",
        "edit",
        "wikicode",
        "check",
        "rss"
      ],
      combine: {
        subscription: ["subscribe", "unsubscribe"],
        wikicode: ["source", "export_raw"]
      }
    }
  ],
  ["auth_security_timeout", "numeric"],
  ["securecookie", "onoff"],
  ["samesitecookie", "multichoice", { choices: ["", "Lax", "Strict", "None"] }],
  ["remote", "onoff", { caution: "security" }],
  ["remoteuser", "string"],
  ["remotecors", "string", { caution: "security" }],
  ["_anti_spam", "fieldset"],
  ["usewordblock", "onoff"],
  ["relnofollow", "onoff"],
  ["indexdelay", "numeric"],
  ["mailguard", "multichoice", { choices: ["visible", "hex", "none"] }],
  ["iexssprotect", "onoff", { caution: "security" }],
  ["_editing", "fieldset"],
  ["usedraft", "onoff"],
  ["locktime", "numeric"],
  ["cachetime", "numeric"],
  ["_links", "fieldset"],
  ["target____wiki", "string"],
  ["target____interwiki", "string"],
  ["target____extern", "string"],
  ["target____media", "string"],
  ["target____windows", "string"],
  ["_media", "fieldset"],
  ["mediarevisions", "onoff"],
  ["gdlib", "multichoice", { choices: [0, 1, 2] }],
  ["im_convert", "im_convert"],
  ["jpg_quality", "numeric", { pattern: "/^100$|^[1-9]?\\d$/" }],
  ["fetchsize", "numeric"],
  ["refcheck", "onoff"],
  ["_notifications", "fieldset"],
  ["subscribers", "onoff"],
  ["subscribe_time", "numeric"],
  ["notify", "email", { multiple: true }],
  ["registernotify", "email", { multiple: true }],
  ["mailfrom", "email", { placeholders: true }],
  ["mailreturnpath", "email", { placeholders: true }],
  ["mailprefix", "string"],
  ["htmlmail", "onoff"],
  ["dontlog", "disableactions", { choices: ["error", "debug", "deprecated"] }],
  ["logretain", "numeric", { min: 0, pattern: "/^\\d+$/" }],
  ["_syndication", "fieldset"],
  ["sitemap", "numeric"],
  ["rss_type", "multichoice", { choices: ["rss", "rss1", "rss2", "atom", "atom1"] }],
  ["rss_linkto", "multichoice", { choices: ["diff", "page", "rev", "current"] }],
  ["rss_content", "multichoice", { choices: ["abstract", "diff", "htmldiff", "html"] }],
  ["rss_media", "multichoice", { choices: ["both", "pages", "media"] }],
  ["rss_update", "numeric"],
  ["rss_show_summary", "onoff"],
  ["rss_show_deleted", "onoff"],
  ["_advanced", "fieldset"],
  ["updatecheck", "onoff"],
  ["userewrite", "multichoice", { choices: [0, 1, 2], caution: "danger" }],
  ["useslash", "onoff"],
  ["sepchar", "sepchar", { caution: "warning" }],
  ["canonical", "onoff"],
  ["fnencode", "multichoice", { choices: ["url", "safe", "utf-8"], caution: "warning" }],
  ["autoplural", "onoff"],
  ["compress", "onoff"],
  ["cssdatauri", "numeric", { pattern: "/^\\d+$/" }],
  ["gzip_output", "onoff"],
  ["send404", "onoff"],
  ["compression", "compression", { caution: "warning" }],
  ["broken_iua", "onoff"],
  ["xsendfile", "multichoice", { choices: [0, 1, 2, 3], caution: "warning" }],
  ["renderer_xhtml", "renderer", { format: "xhtml", choices: ["xhtml"], caution: "warning" }],
  ["readdircache", "numeric"],
  ["search_nslimit", "numeric", { min: 0 }],
  [
    "search_fragment",
    "multichoice",
    { choices: ["exact", "starts_with", "ends_with", "contains"] }
  ],
  ["_feature_flags", "fieldset"],
  ["defer_js", "onoff"],
  ["hidewarnings", "onoff"],
  ["_network", "fieldset"],
  ["dnslookups", "onoff"],
  ["jquerycdn", "multichoice", { choices: [0, "jquery", "cdnjs"] }],
  ["trustedproxies", "array", { caution: "security" }],
  ["realip", "onoff", { caution: "security" }],
  ["proxy____host", "string", { pattern: "#^(|[a-z0-9\\-\\.+]+)$#i" }],
  ["proxy____port", "numericopt"],
  ["proxy____user", "string"],
  ["proxy____pass", "password", { code: "base64" }],
  ["proxy____ssl", "onoff"],
  ["proxy____except", "string"]
] as const satisfies readonly MetadataRow[];

export const DOKUWIKI_CONFIG_METADATA: readonly DokuWikiConfigMetadata[] = buildMetadata();

const METADATA_BY_KEY = new Map(DOKUWIKI_CONFIG_METADATA.map((entry) => [entry.key, entry]));

export const RUNTIME_ENV_DOKUWIKI_KEYS: Readonly<Record<string, string>> = {
  TITLE: "title",
  SITE_NAME: "title",
  TAGLINE: "tagline",
  SIDEBAR: "sidebar",
  LICENSE: "license",
  START_PAGE: "start",
  WIKI_LANG: "lang",
  BASE_DIR: "basedir",
  BASE_URL: "baseurl",
  RECENT: "recent",
  RECENT_DAYS: "recent_days",
  BREADCRUMBS: "breadcrumbs",
  YOUAREHERE: "youarehere",
  FULLPATH: "fullpath",
  TYPOGRAPHY: "typography",
  DFORMAT: "dformat",
  SIGNATURE: "signature",
  SHOWUSERAS: "showuseras",
  TOP_TOC_LEVEL: "toptoclevel",
  TOC_MIN_HEADS: "tocminheads",
  MAX_TOC_LEVEL: "maxtoclevel",
  MAX_SECTION_EDIT_LEVEL: "maxseclevel",
  CAMELCASE: "camelcase",
  DEACCENT: "deaccent",
  USE_HEADING: "useheading",
  SNEAKY_INDEX: "sneaky_index",
  HIDE_PAGES: "hidepages",
  USEACL: "useacl",
  AUTOPASSWD: "autopasswd",
  SUPERUSER: "superuser",
  MANAGER: "manager",
  PROFILECONFIRM: "profileconfirm",
  DISABLE_ACTIONS: "disableactions",
  REL_NOFOLLOW: "relnofollow",
  IEXSSPROTECT: "iexssprotect",
  USEDRAFT: "usedraft",
  LOCKTIME: "locktime",
  CACHETIME: "cachetime",
  TARGET_WIKI: "target____wiki",
  TARGET_INTERWIKI: "target____interwiki",
  TARGET_EXTERN: "target____extern",
  TARGET_MEDIA: "target____media",
  TARGET_WINDOWS: "target____windows",
  MEDIAREVISIONS: "mediarevisions",
  FETCHSIZE: "fetchsize",
  REFCHECK: "refcheck",
  NOTIFY: "notify",
  REGISTERNOTIFY: "registernotify",
  MAILFROM: "mailfrom",
  MAILRETURNPATH: "mailreturnpath",
  MAILPREFIX: "mailprefix",
  HTMLMAIL: "htmlmail",
  EMAIL_REGISTRATION_NOTIFY: "registernotify",
  EMAIL_FROM: "mailfrom",
  EMAIL_RETURN_PATH: "mailreturnpath",
  RSS_TYPE: "rss_type",
  RSS_LINKTO: "rss_linkto",
  RSS_CONTENT: "rss_content",
  RSS_MEDIA: "rss_media",
  RSS_UPDATE: "rss_update",
  RSS_SHOW_SUMMARY: "rss_show_summary",
  RSS_SHOW_DELETED: "rss_show_deleted",
  SITEMAP: "sitemap",
  UPDATECHECK: "updatecheck",
  USESLASH: "useslash",
  SEPCHAR: "sepchar",
  CANONICAL_URLS: "canonical",
  FNENCODE: "fnencode",
  AUTOPLURAL: "autoplural",
  SEND404: "send404",
  SEARCH_NSLIMIT: "search_nslimit",
  SEARCH_FRAGMENT: "search_fragment"
};

export function dokuwikiConfigKeyForRuntimeEnv(envKey: string): string | null {
  return RUNTIME_ENV_DOKUWIKI_KEYS[envKey] ?? null;
}

export function configMetadataForDokuWikiKey(key: string): DokuWikiConfigMetadata | null {
  return METADATA_BY_KEY.get(key) ?? null;
}

export function summarizeDokuWikiConfigMetadata(
  metadata: DokuWikiConfigMetadata | null
): DokuWikiConfigMetadataSummary | null {
  if (!metadata) return null;

  const summary: DokuWikiConfigMetadataSummary = {
    key: metadata.key,
    handler: metadata.handler,
    group: metadata.group,
    source: metadata.source
  };
  if (metadata.caution) summary.caution = metadata.caution;
  if (metadata.pattern) summary.pattern = metadata.pattern;
  if (metadata.choices) summary.choices = metadata.choices;
  if (metadata.min !== undefined) summary.min = metadata.min;
  if (metadata.max !== undefined) summary.max = metadata.max;
  if (metadata.multiple !== undefined) summary.multiple = metadata.multiple;
  if (metadata.code) summary.code = metadata.code;
  return summary;
}

export function describeDokuWikiConfigMetadata(
  metadata: DokuWikiConfigMetadataSummary | null
): string {
  if (!metadata) return "";

  const parts = [`source: ${metadata.source}`, metadata.handler || "setting"];
  if (metadata.choices) parts.push(`choices: ${metadata.choices.join(", ")}`);
  if (metadata.min !== undefined) parts.push(`min: ${metadata.min}`);
  if (metadata.max !== undefined) parts.push(`max: ${metadata.max}`);
  if (metadata.pattern) parts.push(`pattern: ${metadata.pattern}`);
  if (metadata.multiple) parts.push("multiple");
  if (metadata.caution) parts.push(`caution: ${metadata.caution}`);
  return parts.join("; ");
}

export interface DokuWikiConfigMetadataValidation {
  ok: boolean;
  message?: string;
}

export function validateDokuWikiConfigMetadataValue(
  key: string,
  value: string
): DokuWikiConfigMetadataValidation {
  const metadata = configMetadataForDokuWikiKey(key);
  if (!metadata || metadata.handler === "fieldset") return { ok: true };

  const trimmed = value.trim();
  const failed = (message: string) => ({ ok: false, message });

  if (metadata.handler === "onoff") {
    return isDokuWikiBoolean(trimmed)
      ? { ok: true }
      : failed(`${key} must be an on/off value accepted by DokuWiki config metadata.`);
  }

  if (metadata.handler === "numeric" || metadata.handler === "numericopt") {
    if (metadata.handler === "numericopt" && trimmed === "") return { ok: true };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return failed(`${key} must be numeric.`);
    if (metadata.min !== undefined && parsed < metadata.min) {
      return failed(`${key} must be greater than or equal to ${metadata.min}.`);
    }
    if (metadata.max !== undefined && parsed > metadata.max) {
      return failed(`${key} must be less than or equal to ${metadata.max}.`);
    }
  }

  if (metadata.handler === "multichoice" && metadata.choices) {
    const allowed = new Set(metadata.choices.map(String));
    if (!allowed.has(trimmed)) {
      return failed(`${key} must be one of: ${metadata.choices.join(", ")}.`);
    }
  }

  if (metadata.handler === "email") {
    const values = metadata.multiple ? trimmed.split(",").map((part) => part.trim()) : [trimmed];
    const invalid = values.filter(Boolean).filter((part) => !isEmailLike(part));
    if (invalid.length > 0) return failed(`${key} must contain valid email address values.`);
  }

  if (metadata.handler === "regex") {
    try {
      new RegExp(trimmed, "iu");
    } catch {
      return failed(`${key} must be a valid regular expression.`);
    }
  }

  if (metadata.handler === "sepchar" && !/^[A-Za-z0-9_.-]$/.test(trimmed)) {
    return failed(`${key} must be a single safe separator character.`);
  }

  if (metadata.pattern) {
    const pattern = regexpFromPhpPattern(metadata.pattern);
    if (pattern && !pattern.test(trimmed)) {
      return failed(`${key} must match ${metadata.pattern}.`);
    }
  }

  return { ok: true };
}

function buildMetadata(): DokuWikiConfigMetadata[] {
  let currentGroup = "root";
  return ROWS.map(([key, handler, params]) => {
    if (handler === "fieldset") currentGroup = key.replace(/^_/, "") || key;
    return {
      key,
      handler,
      group: currentGroup,
      source: SOURCE_FILE,
      ...params
    };
  });
}

function isDokuWikiBoolean(value: string): boolean {
  return ["0", "1", "true", "false", "on", "off", "yes", "no"].includes(value.toLowerCase());
}

function isEmailLike(value: string): boolean {
  const match = value.match(/<([^<>]+)>/);
  const email = (match?.[1] ?? value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function regexpFromPhpPattern(pattern: string): RegExp | null {
  if (pattern.length < 2) return null;
  const delimiter = pattern[0];
  const end = pattern.lastIndexOf(delimiter);
  if (end <= 0) return null;
  const body = pattern.slice(1, end);
  const phpFlags = pattern.slice(end + 1);
  const flags = [...new Set(phpFlags.replace(/[^iu]/g, "").split(""))].join("");
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}
