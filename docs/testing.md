# Testing

The project has unit, integration, and deployed end-to-end checks.

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run audit
npm run scan:secrets
npm run test:visual -- --base-url https://dokutest.pages.dev
npm run test:e2e -- --base-url https://dokutest.pages.dev
```

`test:e2e` runs the Pages smoke runner against a deployed URL. It verifies health, page rendering, canonical redirects, and sitemap generation over real HTTP so Cloudflare bindings and routing are exercised outside the in-memory integration harness.

`test/email.test.mjs` covers the Resend-compatible adapter, disabled-provider
behavior, provider failure logging, and escaped notification templates.

`test/auth-routes.test.mjs` covers registration, password reset, subscription
updates, immediate page-change notification delivery, and scheduled digest
delivery.

CI runs `npm run audit`, which maps to `npm audit --audit-level=high`, on every push and pull request.
CI also runs `npm run scan:secrets`, which scans tracked files for high-signal private keys and service tokens.

Security regression tests cover renderer XSS escaping, CSRF rejection, ACL denial before page render/cache/edit writes, and media upload denial before D1/R2 writes.

Native API compatibility tests cover the `/api/v1` endpoint index, page reads
and writes, page revisions, media reads and deletes, media revisions, search,
`users/me`, bearer-token authentication, and configured CORS behavior.

Plugin compatibility tests cover legacy bundled plugin admin URLs that redirect
to native replacements, plus explicit removal responses for unsupported bundled
plugins.

Auth event tests cover the native replacement hook boundary used by login,
logout, rate-limit, and profile-update flows.

Accessibility tests cover rendered wiki shell landmarks, the keyboard skip link,
the header search label, the mobile tools label, and accessible names for
icon-only page tools.

Responsive CSS tests cover the mobile navigation breakpoints, narrow-viewport
header controls, long-word wrapping, diagnostic/media detail overflow behavior,
and fixed-size font rules.

Visual regression checks use local Chromium to capture desktop welcome, mobile
welcome, and desktop login screenshots from a deployed Pages URL. The committed
`test/visual-baselines.json` records viewport sizes and screenshot hashes; run
`npm run test:visual -- --base-url <url> --update` only after reviewing changed
screenshots in `.wrangler/visual-regression/`.

Storage performance tests cover D1 query plans for indexed high-cardinality
lookups, bounded query counts for paginated storage calls, search-index batch
sizes, delta-based search term counts, operational import-job indexes, and R2
media operation counts.

Route performance tests cover warm page render latency, concurrent page read
load, edit-save latency, and bounded D1/KV operation counts for those request
paths. They also record local CPU time and heap deltas for representative render
and edit-save requests.

Performance measurement helper tests cover the file-tree summarizer used by
`npm run limits:measure` for bundle and static asset size baselines.

Search performance tests cover indexed page search query plans, raw posting
search result clamps, term deduplication, and one-read D1 behavior across large
fixture corpora.

Syntax inventory tests cover the scanner used to generate
`docs/syntax-inventory.md` from the current DokuWiki `data/pages` tree.
