export type InfoRows = Array<readonly [string, string]>;

export const UPSTREAM_DOKUWIKI_VERSION = '2025-05-14b "Librarian"';
export const UPSTREAM_DOKUWIKI_UPDATE_VERSION = "56.2";

export function pagesEnvironmentInfoRows(): InfoRows {
  return [
    ["Runtime", "Cloudflare Pages Functions"],
    ["JavaScript runtime", "Cloudflare Workers V8 isolate"],
    ["Server API", "FetchEvent module worker"],
    ["Operating system", "Cloudflare managed edge runtime"],
    ["Container", "Cloudflare managed isolation"],
    ["Filesystem writes", "Unsupported at runtime; D1, R2, KV, and Durable Objects provide storage"]
  ];
}

export function phpCompatibilityInfoRows(): InfoRows {
  return [
    ["PHP runtime", "Not loaded; this is a native TypeScript/Workers port"],
    ["PHP version", "Not applicable"],
    ["PHP SAPI", "Not applicable"],
    ["PHP memory_limit", "Not applicable; Cloudflare Worker limits apply"],
    ["PHP extensions", "Not loaded; compatible behavior is implemented natively where required"]
  ];
}

export function dokuWikiCompatibilityInfoRows(): InfoRows {
  return [
    ["Upstream DokuWiki source", UPSTREAM_DOKUWIKI_VERSION],
    ["Upstream update version", UPSTREAM_DOKUWIKI_UPDATE_VERSION],
    ["Template", "DokuWiki default template, adapted under GPL-2.0"],
    [
      "Plugin runtime",
      "PHP plugins are not loaded; bundled plugins map to native Pages routes or documented unsupported pages"
    ],
    [
      "Storage model",
      "D1 for records, R2 for media objects, KV for rendered cache, Durable Objects for locks"
    ],
    [
      "Info plugin",
      "Native ~~INFO:*~~ support for parser modes, bundled plugins, environment, PHP compatibility, and DokuWiki compatibility"
    ]
  ];
}

export function infoRowsToRecord(rows: InfoRows): Record<string, string> {
  return Object.fromEntries(rows);
}
