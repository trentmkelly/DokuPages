# Testing

The project has unit, integration, and deployed end-to-end checks.

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run audit
npm run scan:secrets
npm run test:e2e -- --base-url https://dokutest.pages.dev
```

`test:e2e` runs the Pages smoke runner against a deployed URL. It verifies health, page rendering, canonical redirects, and sitemap generation over real HTTP so Cloudflare bindings and routing are exercised outside the in-memory integration harness.

CI runs `npm run audit`, which maps to `npm audit --audit-level=high`, on every push and pull request.
CI also runs `npm run scan:secrets`, which scans tracked files for high-signal private keys and service tokens.

Security regression tests cover renderer XSS escaping, CSRF rejection, ACL denial before page render/cache/edit writes, and media upload denial before D1/R2 writes.

Native API compatibility tests cover the `/api/v1` endpoint index, page reads
and writes, page revisions, media reads and deletes, media revisions, search,
`users/me`, bearer-token authentication, and configured CORS behavior.

Plugin compatibility tests cover legacy bundled plugin admin URLs that redirect
to native replacements, plus explicit removal responses for unsupported bundled
plugins.

Storage performance tests cover D1 query plans for indexed high-cardinality
lookups, bounded query counts for paginated storage calls, search-index batch
sizes, and R2 media operation counts.
