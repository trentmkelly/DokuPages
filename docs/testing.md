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

Security regression tests cover CSRF rejection, ACL denial before page render/cache/edit writes, and media upload denial before D1/R2 writes.
