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
logout, rate-limit, profile-update, and profile-delete flows.

Accessibility tests cover rendered wiki shell landmarks, document direction,
the keyboard skip link, upstream search form access keys, localized breadcrumb
and sidebar text, the mobile tools label, search assistant ARIA state hooks,
and accessible names for icon-only page tools.

Template shell parity tests compare the Pages shell landmarks and `mode_$ACT`
classes with upstream `lib/tpl/dokuwiki/main.php`, `tpl_header.php`, and
`tpl_footer.php` across representative page modes. They also cover default
template sidebar propagation, `showSidebar`/`hasSidebar` class behavior, and
ACL-filtered sidebar fallback for anonymous and authenticated principals.
Menu parity assertions cover DokuWiki-style page, site, user, and mobile tool
entries, including upstream access-key, `rel`, and `title` attributes.

Responsive CSS tests cover the mobile navigation breakpoints, narrow-viewport
header controls, long-word wrapping, diagnostic/media detail overflow behavior,
and fixed-size font rules.

Asset tests cover converted upstream CSS module selectors for forms, tabs,
media popup and fullscreen manager views, search assistant UI, modal/link
wizard surfaces, uploader hooks, and admin task pages. They also verify that
the upstream image assets referenced by those converted rules are shipped.
They also keep stale static fallback pages such as `public/index.html` out of
the deployed asset set. They pin native browser hooks for upstream-style
cookies, hotkeys, quick search, search assistant toggles, link wizard insertion,
media popups, editor helpers, toolbar insertion, picker toggles, lock warnings,
and media manager uploads. Asset tests also verify the upstream editor toolbar
icons are present.
Renderer and app-route tests cover upstream-style section edit forms, section
marker classes, page-tool actions, disabled-action hiding, footer license text,
validation badges, external footer targets, disabled-license behavior, and edit
license notices.
`npm run format:check` runs `npm run style:check` before Prettier so generated
`public/dokuwiki.css` cannot drift from upstream `style.ini`, upstream template
CSS modules, or `src/styles/dokuwiki-pages-overrides.css`.

Visual regression checks use local Chromium to capture Pages screenshots for
page view, edit, revisions, diff, media manager, login, register, admin, and
missing-page states. Pass `--upstream-url <url>` to capture matching screenshots
from a real DokuWiki instance beside the Pages images. The committed
`test/visual-baselines.json` records viewport sizes, paths, screenshot hashes,
and whether a state is hash-gated. Stable page-view and missing-page Pages
screenshots are enforced as the regression gate; edit, history, media, auth, and
admin screens are captured as parity references because lock, token, and session
state can emit byte-different browser captures. Upstream screenshots are also
captured as parity references. Run
`npm run test:visual -- --base-url <url> --upstream-url <url> --update` only
after reviewing changed `.pages.png` and `.upstream.png` screenshots in
`.wrangler/visual-regression/`.

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
