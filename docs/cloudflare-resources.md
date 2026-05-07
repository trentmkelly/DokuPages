# Cloudflare Resources

Provisioned resources for the `dokutest` Pages project.

## Pages

- Project: `dokutest`
- Production URL: `https://dokutest.pages.dev/`
- Production branch: `main`
- Preview branch script: `preview`

## D1

- Binding: `DB`
- Database name: `dokuwiki_pages_dev`
- Database ID: `bb1c5614-9eb2-4f06-9727-fb41cfb1786b`
- Applied schema: D1 migrations under `migrations/`
- Imported seed pages: 4
- Production smoke test: created and deleted `codex:smoke`, verified stale-revision conflict and changelog rows.

## KV

- Binding: `RENDER_CACHE`
- Namespace ID: `ecc7148dc3264d2cb4d9e67283c6fbfd`

## R2

- Binding: `MEDIA_BUCKET`
- Bucket name: `dokuwiki-pages-dev-media`
- Created: `2026-05-07T18:11:44.584Z`
- Location: `EEUR`
- Default storage class: `Standard`
- Lifecycle policy: Cloudflare default multipart abort rule, aborting incomplete multipart uploads after 7 days.

## Durable Objects

- Pages binding: `PAGE_LOCKS`
- Durable Object Worker: `dokutest-page-locks`
- Class: `PageLockObject`
- Config: `wrangler.page-locks.toml`

Cloudflare Pages binds to the Durable Object class through the companion Worker because Pages Functions cannot define Durable Object classes directly.
