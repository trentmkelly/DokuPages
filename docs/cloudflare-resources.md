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
- Applied schema: `migrations/0001_initial.sql`
- Imported seed pages: 4

## KV

- Binding: `RENDER_CACHE`
- Namespace ID: `ecc7148dc3264d2cb4d9e67283c6fbfd`

## R2

R2 is not enabled for the Cloudflare account. Wrangler returned Cloudflare API error code `10042` when listing buckets:

```text
Please enable R2 through the Cloudflare Dashboard.
```

Media object storage and the `MEDIA_BUCKET` binding are blocked until R2 is enabled.

## Durable Objects

Durable Object binding is planned for page locks, but the first Pages Functions binding attempt failed local compile validation. The implementation class remains in `src/storage/page-lock-object.ts`; active binding configuration is pending.
