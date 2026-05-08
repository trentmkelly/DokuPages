# Launch Audit

This audit records the proof-of-concept launch state for the Pages-native
DokuWiki port on `https://dokutest.pages.dev`.

## Scope

- Target: Cloudflare Pages project `dokutest`.
- Production branch: `main`.
- Current production deployment: `9602bd18-f59a-4acb-847e-aad78dc196b7`.
- Current source commit: `fc43dcaaf4d704573f191588a9b6ed4b45b8963e`.
- Custom DNS: not configured for this proof of concept.
- Source DokuWiki cutover: no production traffic cutover was requested, so
  source read-only mode, DNS switching, and old deployment archiving are no-op
  launch steps for this target.

## Final Sync Evidence

- Final import window: 2026-05-08 02:33-02:35 UTC.
- Pre-import backup: `.wrangler/backups/2026-05-08T023343491Z`.
- Backup contents: `d1.sql`, `backup-manifest.json`, and 7 referenced R2
  objects.
- Remote D1 migrations: `npx wrangler d1 migrations apply dokuwiki_pages_dev
--remote` reported no migrations to apply.
- Remote D1 import: `.wrangler/dokuwiki-import.sql` executed 2392 queries and
  wrote 5687 rows.
- Remote R2 import: `npm run import:media-upload` processed 2 import media
  objects; both matched the resume state and were skipped as already uploaded.
- Hash verification: `npm run import:verify-hashes` returned `ok: true` with 8
  checks and no failures.

Expected imported source rows were present after import:

| Check                    | Count |
| ------------------------ | ----: |
| Imported pages           |     4 |
| Imported page revisions  |     4 |
| Imported media rows      |     2 |
| Imported media revisions |     2 |
| Plugin settings          |     7 |
| Metadata rows            |   364 |

Post-flow remote totals after launch verification:

| Table           | Count |
| --------------- | ----: |
| Pages           |     7 |
| Page revisions  |    10 |
| Media           |     7 |
| Media revisions |    11 |
| Users           |     5 |
| Metadata        |   378 |

## Runtime Verification

- `npm run smoke -- --base-url https://dokutest.pages.dev`: health, page
  render, canonical redirect, and sitemap passed.
- `npm run alerts:check`: diagnostics alert list was empty.
- `/api/diagnostics`: `ok: true`, D1/KV/R2/Durable Object bindings healthy,
  latest schema version 7, and no config issues.
- `npm run test:visual -- --base-url https://dokutest.pages.dev`: passed for
  welcome desktop, welcome mobile, and login desktop after updating baselines for
  the final imported welcome content.
- `npm run cache:warm -- --base-url https://dokutest.pages.dev`: warmed root,
  welcome, syntax, sitemap, and feed.
- Wrangler Pages tail on deployment `9602bd18-f59a-4acb-847e-aad78dc196b7`
  connected for a live error-only watch window; no error events were emitted
  while health, page, and media routes were exercised.
- Deployed auth/content flow: fresh registration, password login, session
  inspection, page edit/save, media upload, and media fetch all passed for test
  user `codexflowmowb3xnu`.

## Performance And Quota Review

Measured remote route timings during the launch watch:

| Route                      | Status |  Time |
| -------------------------- | -----: | ----: |
| `/wiki/wiki/welcome`       |    200 | 0.68s |
| `/search?q=DokuWiki`       |    200 | 0.66s |
| `/media/wiki/dokuwiki.svg` |    200 | 0.73s |
| `/media-manager?ns=wiki`   |    200 | 0.72s |

Resource usage from Wrangler:

| Resource | Usage                                                               |
| -------- | ------------------------------------------------------------------- |
| Pages    | Project `dokutest`, direct upload, production deployment on `main`. |
| D1       | 26 tables, 880640 bytes, 2218 reads and 507 writes in the last 24h. |
| R2       | Bucket `dokuwiki-pages-dev-media`, 38.5 kB reported bucket size.    |
| KV       | Namespace `RENDER_CACHE` present.                                   |

Current Cloudflare reference checks used for quota review:

- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Workers limits for Pages Functions quota context:
  https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare R2 pricing and free-tier billing units:
  https://developers.cloudflare.com/r2/pricing/

The proof-of-concept usage is far below the documented Pages file limits, static
asset size limits, D1 storage limits, and R2 storage scale. Account billing plan
details are not exposed by Wrangler in this workspace; no quota or billing
warning appeared during deployment, D1, KV, R2, backup, or restore operations.

## Backup And Restore

- Backup export completed against remote D1 and R2.
- A restore rehearsal was run against a clean local D1/R2 target with
  `node scripts/restore-cloudflare-backup.mjs --backup
.wrangler/backups/2026-05-08T023343491Z --local --yes`.
- Restored local counts matched the backup snapshot: 6 pages, 9 page revisions,
  6 media rows, 10 media revisions, and 4 users.
- The previous local D1 state was moved aside before the test and restored after
  the rehearsal.

## Regression And Security

- `npm run test`: 221 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- `npm run scan:secrets`: passed.
- `npm run audit`: found 0 high-severity vulnerabilities.

## Follow-Up Notes

- Turnstile support is implemented, but the `dokutest` environment currently
  renders login and registration without a Turnstile widget because no
  Turnstile site key is configured there.
- DNS cutover and source DokuWiki archival remain intentionally deferred until a
  real production hostname and retention policy exist.
