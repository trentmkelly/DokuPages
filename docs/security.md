# Security

## CSRF

State-changing POST routes require a DokuWiki-style `sectok` value or `x-csrf-token` header that matches the `DW_CSRF_TOKEN` cookie. The cookie is HTTP-only, `SameSite=Lax`, and marked `Secure` on HTTPS. Server-rendered forms include the hidden token, and editor JavaScript forwards it for draft autosave and edit-lock refresh or release requests.

Preview rendering is exempt because it does not write storage.

The native `/api/v1` JSON API keeps automation writes separate from browser form
CSRF protections. API reads accept either an authenticated same-origin session or
the configured `API_BEARER_TOKEN`. API writes require `Authorization: Bearer ...`
and do not accept cookie-only auth.

## Media Tokens

Resized media fetches with positive `w` or `h` parameters require DokuWiki's
six-character `tok` signature. The Pages port signs and verifies these tokens
with the `DOKUWIKI_COOKIE_SALT` secret, matching upstream `media_get_token()`.
Invalid or unsigned resized-media requests return `412 Precondition Failed`
before R2 is opened.

## Session Cookies

The Pages port does not issue upstream DokuWiki `rememberme` sticky cookies.
Login always creates an opaque D1-backed session token with a 24 hour
HTTP-only, `SameSite=Lax` cookie, and the database stores only the token's
SHA-256 hash. Longer-lived identity should be provided by an external layer
such as Cloudflare Access or by a future session policy change that preserves
server-side revocation; encrypted password-derived persistent cookies are not
part of the port.

Session resolution revalidates current account state on every request instead
of using DokuWiki's cached-auth window from `auth_security_timeout`. User
disablement and group changes in D1 therefore affect existing sessions
immediately.

## Rendered Content

The native wiki renderer escapes raw HTML in headings, paragraphs, link labels,
media titles, tables, code, file blocks, and malformed syntax. External links are
limited to HTTP(S), FTP autolinks, mail links, interwiki mappings, and internal
wiki routes; JavaScript URLs are not emitted as external hrefs.

Raw HTML embedding is not enabled in the Pages port. DokuWiki content that uses
HTML tags renders as escaped text unless the syntax is one of the native,
explicitly supported safe formatting forms such as `sup`, `sub`, or `del`.

## Rate Limits

Failed login attempts are rate limited by client IP and username in KV. Five failed attempts in a 15 minute window block further attempts for that pair and return `429` with `Retry-After: 900`; a successful login clears the counter.

When Cloudflare Turnstile is configured with both `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY`, login and registration forms render the Turnstile widget
and the POST handlers validate `cf-turnstile-response` with Cloudflare
Siteverify before accepting the auth action.

Authorized page save and revert submissions are rate limited by client IP and actor in KV. Thirty attempts in a 15 minute window block additional edit attempts for that pair and return `429` with `Retry-After: 900` before the request writes page revisions.

Authorized media upload submissions are rate limited by client IP and actor in KV. Twenty attempts in a 15 minute window block additional upload attempts for that pair and return `429` with `Retry-After: 900` before the request writes to R2.

Media uploads also honor DokuWiki's `iexssprotect` scan by default. With
`IEXSSPROTECT=1`, the first 256 bytes are checked for the upstream IE-XSS tag
pattern before any R2 write; matching uploads are rejected with the DokuWiki
`uploadxss` message. `IEXSSPROTECT=0` disables that scan for trusted
installations that deliberately allow active SVG or HTML media.

External media proxying follows DokuWiki's token gate. Requests for external
`lib/exe/fetch.php?media=<url>` media require the HMAC token generated from the
remote URL, and `FETCHSIZE=0` keeps proxy downloads disabled by default. When a
positive `FETCHSIZE` is configured, the Worker only serves remote JPEG, GIF, or
PNG responses that fit within the configured byte limit.

## ACL

ACL records use DokuWiki permission levels: none `0`, read `1`, edit `2`, create `4`,
upload `8`, and delete `16`. Imported `acl.auth.php` rules are normalized with a
principal type of `all`, `group`, or `user` before they are stored in D1.

The ACL matcher follows DokuWiki's precedence model: exact page or media rules are
checked first, then namespace wildcard rules from the nearest namespace outward,
then the root `*` rule. If multiple rules match within the same scope, the highest
applicable permission wins. `%USER%` and `%GROUP%` rules are expanded for the
active principal before matching.

Route enforcement applies the matcher to page reads, page edit/create saves, page
revision/diff/source/revert actions, drafts, edit locks, media reads, media
manager access, media uploads, media deletes, and media reverts. Search, recent
changes, namespace indexes, backlinks, wanted/orphan reports, sitemap, RSS, and
Atom responses filter out pages that are hidden by `HIDE_PAGES` or unreadable by
the active principal. `SNEAKY_INDEX=1` prevents namespace indexes from listing a
namespace that lacks namespace-level read permission.

`/admin/acl` provides a native ACL manager for users in the `admin` group. It can
add, update, and delete D1-backed ACL rules and uses the same CSRF protection as
other state-changing routes.

Admin ACL changes and search index rebuilds are recorded in D1 `audit_log` rows.
The admin-only `/admin/audit` page exposes the recent entries for operational
review.

The repository includes a tracked-file secret scanner at `scripts/secret-scan.mjs`.
CI runs it on every push and pull request to catch high-signal private keys and
service tokens before deployment.

## Outbound Email

Outbound email uses fixed sender configuration from environment variables. The
runtime does not allow user input to become the sender, reply-to, or return-path
address. Provider tokens are reported only as redacted secret status in the admin
configuration export.
