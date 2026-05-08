# URL Policy

The Pages port uses one canonical runtime URL shape:

- Pages are served at `/wiki/<namespace>/<page>`.
- Page IDs remain colon-separated internally and are converted to slash paths at
  the route boundary.
- Media is served at `/media/<namespace>/<file>` and media details at
  `/media-detail/<namespace>/<file>`.
- Legacy `doku.php`, `index.php`, and `lib/exe/*` entrypoints redirect or render
  compatibility responses.

## `userewrite` And `useslash`

Upstream DokuWiki can switch between query-style URLs, `.htaccess` rewrite URLs,
internal rewrite URLs, and slash-separated page IDs through `userewrite` and
`useslash`. Cloudflare Pages does not need those runtime modes because the
Worker receives already-routed request paths.

The compatibility decision is fixed:

| Upstream setting          | Pages policy                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `userewrite = 0`          | Supported through redirects from `doku.php?id=<page>`.                              |
| `userewrite = 1`          | Native Pages route shape replaces `.htaccess` rewriting.                            |
| `userewrite = 2`          | Native Pages route shape replaces internal DokuWiki rewriting.                      |
| `useslash = 0` internally | Page IDs remain colon-separated in D1, ACLs, metadata, links, and import artifacts. |
| `useslash = 1` externally | Routes expose slash path segments for Pages and browser URLs.                       |

This means the port intentionally has one public URL style and preserves legacy
DokuWiki URLs with redirects rather than switching URL mode at runtime.

## `canonical`, `baseurl`, And `basedir`

The Pages equivalents are environment variables:

| DokuWiki setting | Pages environment variable | Behavior                                                                    |
| ---------------- | -------------------------- | --------------------------------------------------------------------------- |
| `canonical`      | `CANONICAL_URLS`           | When true, canonical page links are absolute URLs.                          |
| `baseurl`        | `BASE_URL`                 | Absolute origin used for canonical URLs when `CANONICAL_URLS` is enabled.   |
| `basedir`        | `BASE_DIR`                 | Path prefix applied to generated canonical page URLs.                       |
| `send404`        | `SEND404`                  | Controls whether missing wiki pages return HTTP 404 or DokuWiki-style 200.  |
| `disableactions` | `DISABLE_ACTIONS`          | Comma-separated action names hidden from menus and rejected for `do=` URLs. |

Route matching remains bound to the deployed Pages project path. `BASE_DIR` does
not mount a second application path; it only mirrors DokuWiki's generated URL
metadata behavior for deployments that need a canonical path prefix.
