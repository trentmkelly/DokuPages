# Cloudflare Platform Baseline

This baseline was captured for the initial port scaffold on 2026-05-07.

## Runtime

Cloudflare Pages Functions run on the Workers runtime. The scaffold uses TypeScript compiled by Wrangler instead of attempting to execute PHP.

Primary references:

- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/
- Pages bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Pages Wrangler configuration: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/

## Binding Decisions

- D1 stores relational wiki data: page records, revisions, users, ACLs, metadata, search postings, imports, and audit logs.
- R2 is the target for media bodies, old media revisions, and large exported archives.
- KV stores rendered cache entries that can be invalidated by key.
- Durable Objects coordinate page edit locks where concurrent writes need coordination. Pages binds to the external `dokutest-page-locks` Worker because Pages Functions cannot define Durable Object classes directly.
- The Cache API remains available for public rendered pages and immutable derived assets once cache policy is implemented.

## Development And Deployment Workflow

- Local development uses `wrangler pages dev public`.
- Preview deployment uses `wrangler pages deploy public --project-name dokutest --branch preview`.
- Production deployment uses `wrangler pages deploy public --project-name dokutest --branch main`.
- D1 migrations live under `migrations/` and are referenced from `wrangler.toml`.
- D1 and KV bindings are declared in `wrangler.toml` with provisioned resource IDs.
- R2 bucket binding is declared as `MEDIA_BUCKET`.
- Durable Object configuration uses `wrangler.page-locks.toml` for the companion Worker and `PAGE_LOCKS` in the Pages `wrangler.toml`.

## Security And Anti-Abuse

Cloudflare Access and Turnstile are candidates for production hardening. Native CSRF and upload validation are implemented; ACL enforcement and rate limiting remain pending.
