export type DokuWikiPluginType =
  | "action"
  | "admin"
  | "auth"
  | "helper"
  | "remote"
  | "renderer"
  | "syntax";

export interface DokuWikiPluginInfo {
  base: string;
  author: string;
  email: string;
  date: string;
  name: string;
  desc: string;
  url: string;
  types: DokuWikiPluginType[];
}

export type BundledPluginPagesStatus =
  | "native_replacement"
  | "external_bridge"
  | "migration_only"
  | "unsupported_runtime"
  | "removed";

export interface BundledPluginPagesReplacement {
  base: string;
  status: BundledPluginPagesStatus;
  replacement: string;
  route: string | null;
  notes: string;
}

export const BUNDLED_DOKUWIKI_PLUGINS: DokuWikiPluginInfo[] = [
  {
    base: "acl",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-25",
    name: "ACL Manager",
    desc: "Manage Page Access Control Lists",
    url: "https://www.dokuwiki.org/plugin:acl",
    types: ["action", "admin", "remote"]
  },
  {
    base: "authad",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-13",
    name: "Active Directory Auth Plugin",
    desc: "Provides user authentication against a Microsoft Active Directory",
    url: "https://www.dokuwiki.org/plugin:authad",
    types: ["action", "auth"]
  },
  {
    base: "authldap",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-13",
    name: "LDAP Auth Plugin",
    desc: "Provides user authentication against an LDAP server",
    url: "https://www.dokuwiki.org/plugin:authldap",
    types: ["auth"]
  },
  {
    base: "authpdo",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2016-08-20",
    name: "authpdo plugin",
    desc: "Authenticate against a database via PDO",
    url: "https://www.dokuwiki.org/plugin:authpdo",
    types: ["auth"]
  },
  {
    base: "authplain",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-18",
    name: "Plain Auth Plugin",
    desc: "Provides user authentication against DokuWiki's local password storage",
    url: "https://www.dokuwiki.org/plugin:authplain",
    types: ["auth"]
  },
  {
    base: "config",
    author: "Christopher Smith",
    email: "chris@jalakai.co.uk",
    date: "2015-07-18",
    name: "Configuration Manager",
    desc: "Manage Dokuwiki's Configuration Settings",
    url: "https://dokuwiki.org/plugin:config",
    types: ["admin"]
  },
  {
    base: "extension",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2024-11-22",
    name: "Extension Manager",
    desc: "Allows managing and installing plugins and templates",
    url: "https://www.dokuwiki.org/plugin:extension",
    types: ["action", "admin", "helper", "remote"]
  },
  {
    base: "info",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2020-06-04",
    name: "Info Plugin",
    desc: "Displays information about various DokuWiki internals",
    url: "https://www.dokuwiki.org/plugin:info",
    types: ["syntax"]
  },
  {
    base: "logviewer",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2023-12-22",
    name: "logviewer plugin",
    desc: "View DokuWiki logs",
    url: "https://www.dokuwiki.org/plugin:logviewer",
    types: ["action", "admin"]
  },
  {
    base: "popularity",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-15",
    name: "Popularity Feedback Plugin",
    desc: "Send anonymous data about your wiki to the DokuWiki developers",
    url: "https://www.dokuwiki.org/plugin:popularity",
    types: ["action", "admin", "helper"]
  },
  {
    base: "revert",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2015-07-15",
    name: "Revert Manager",
    desc: "Allows you to mass revert recent edits to remove Spam or vandalism",
    url: "https://dokuwiki.org/plugin:revert",
    types: ["admin"]
  },
  {
    base: "safefnrecode",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2012-07-28",
    name: "safefnrecode plugin",
    desc: "Changes existing page and foldernames for the change in the safe filename encoding",
    url: "https://www.dokuwiki.org/plugin:safefnrecode",
    types: ["action"]
  },
  {
    base: "styling",
    author: "Andreas Gohr",
    email: "andi@splitbrain.org",
    date: "2020-06-14",
    name: "styling plugin",
    desc: "Allows to edit style.ini replacements",
    url: "https://www.dokuwiki.org/plugin:styling",
    types: ["action", "admin"]
  },
  {
    base: "usermanager",
    author: "Chris Smith",
    email: "chris@jalakai.co.uk",
    date: "2015-07-15",
    name: "User Manager",
    desc: "Manage DokuWiki user accounts",
    url: "https://www.dokuwiki.org/plugin:usermanager",
    types: ["admin", "remote"]
  }
];

export const BUNDLED_PLUGIN_PAGES_REPLACEMENTS: BundledPluginPagesReplacement[] = [
  {
    base: "acl",
    status: "native_replacement",
    replacement: "Native ACL resolver and Access Control List Management page",
    route: "/admin/acl",
    notes: "D1-backed ACL rules replace the PHP ACL plugin runtime."
  },
  {
    base: "authad",
    status: "external_bridge",
    replacement: "External auth sync bridge plus Cloudflare Access header auth",
    route: null,
    notes: "The PHP auth plugin is not loaded in Workers."
  },
  {
    base: "authldap",
    status: "external_bridge",
    replacement: "External auth sync bridge plus Cloudflare Access header auth",
    route: null,
    notes: "The PHP auth plugin is not loaded in Workers."
  },
  {
    base: "authpdo",
    status: "external_bridge",
    replacement: "External auth sync bridge plus Cloudflare Access header auth",
    route: null,
    notes: "The PHP auth plugin is not loaded in Workers."
  },
  {
    base: "authplain",
    status: "native_replacement",
    replacement: "D1-backed users, groups, password hash import, and sessions",
    route: "/admin/users",
    notes: "Legacy password hashes are verified and converted through native auth."
  },
  {
    base: "config",
    status: "native_replacement",
    replacement: "Read-only Configuration Manager with upstream metadata",
    route: "/admin/config",
    notes: "Runtime config edits remain a deployment operation."
  },
  {
    base: "extension",
    status: "unsupported_runtime",
    replacement: "DokuWiki-styled unsupported Extension Manager page",
    route: "/admin/extension",
    notes:
      "Plugin/template install, update, upload, enable, and disable actions are unsupported at runtime."
  },
  {
    base: "info",
    status: "native_replacement",
    replacement: "Diagnostics, health checks, and native info syntax macros",
    route: "/diagnostics",
    notes: "Pages equivalents are exposed without PHP runtime introspection."
  },
  {
    base: "logviewer",
    status: "native_replacement",
    replacement: "Cloudflare Logs plus native admin audit log",
    route: "/admin/audit",
    notes: "Source data/log files are not imported as a native logviewer equivalent."
  },
  {
    base: "popularity",
    status: "removed",
    replacement: "No telemetry replacement",
    route: null,
    notes: "The port does not collect or phone home anonymous usage statistics."
  },
  {
    base: "revert",
    status: "native_replacement",
    replacement: "Native page/media revert and manager-level Revert Manager",
    route: "/admin/revert",
    notes: "Batch revert is implemented against D1 revisions and changelog rows."
  },
  {
    base: "safefnrecode",
    status: "migration_only",
    replacement: "Operator migration script",
    route: null,
    notes: "Use npm run safefn:recode for old SafeFN source trees."
  },
  {
    base: "styling",
    status: "native_replacement",
    replacement: "Template Style Settings backed by D1 plugin_settings",
    route: "/admin/styling",
    notes: "Theme variables are applied through /theme.css."
  },
  {
    base: "usermanager",
    status: "native_replacement",
    replacement: "Native User Manager",
    route: "/admin/users",
    notes:
      "User, group, filter, validation, and selected-user bulk operations are implemented natively."
  }
];

const REPLACEMENTS_BY_PLUGIN = new Map(
  BUNDLED_PLUGIN_PAGES_REPLACEMENTS.map((replacement) => [replacement.base, replacement])
);

export function pagesReplacementForBundledPlugin(
  base: string
): BundledPluginPagesReplacement | null {
  return REPLACEMENTS_BY_PLUGIN.get(base) ?? null;
}
