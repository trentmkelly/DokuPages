# Architecture

## Runtime Strategy

The port is a native TypeScript implementation on Cloudflare Pages Functions. This avoids depending on a PHP runtime inside Workers and gives direct access to D1, R2, KV, Durable Objects, and the Cache API.

## Request Routing

`functions/[[path]].ts` is the catch-all Pages Function. It delegates to `src/app.ts`, which currently routes:

- `GET /api/health`
- `/wiki/:id` page views backed by D1 current page records and the native wiki renderer
- `/wiki/:id?do=edit` edit forms backed by D1 current page records
- `/wiki/:id?do=source` raw wiki text responses
- `/wiki/:id?do=revisions` and `/wiki/:id?do=diff` history views backed by D1 page revisions
- `/recent` recent page changes backed by the D1 changelog
- `/search` and `/wiki/:id?do=search` page search backed by D1 search postings
- `/index`, `/wiki/:id?do=index`, `/wanted`, `/orphans`, and `/wiki/:id?do=backlink` page relationship views backed by current D1 page source
- `/feed.php`, `/feed.xml`, `/atom.xml`, `/sitemap.xml`, `/robots.txt`, `/opensearch.xml`, and `/manifest.webmanifest` compatibility documents
- `POST /api/pages` page create, edit, and delete saves
- `POST /api/pages/preview` rendered preview responses
- all other paths to static asset fallback

Specific endpoint files may be added under `functions/` as the route surface expands.

## Data Access Layer

Storage contracts live in `src/storage/interfaces.ts`. D1-backed adapters in `src/storage/d1.ts` cover page records, page revisions, media metadata rows, media revision rows, metadata, ACL rules, changelog rows, users, drafts, rendered cache rows, and search postings. Higher-level wiki services still use direct D1 queries where they need page relationship or render-specific joins.

R2-backed media storage in `src/storage/r2.ts` composes a D1 metadata store with an R2 bucket. Media saves write the R2 object first, then metadata, and delete the newly written object if the metadata write fails.

## Storage Schema

The first D1 schema is `migrations/0001_initial.sql`. It models pages, page revisions, media, media revisions, metadata, changelog, ACLs, users, groups, sessions, drafts, subscriptions, search postings, rendered cache, plugin settings, audit logs, import jobs, and schema versions.

## Cache Model

Current rendered page HTML is cached in KV under `page:{id}` with revision IDs stored in the payload to reject stale entries. Old revision render output is cached under `page:{id}:{revisionId}`. The page save path purges the current page key and the new immutable revision key. Admin users can run a global purge that removes `page:` and `discovery:` KV entries and clears D1 rendered-cache rows; later dependency tracking can broaden invalidation for backlinks, feeds, and ACL-sensitive views.

## Auth And Sessions

The schema supports native users, groups, sessions, password hashes, and ACLs. Native login and logout routes issue and clear D1-backed session cookies. The ACL matcher implements DokuWiki page, namespace, wildcard, user, group, `%USER%`, and `%GROUP%` rule precedence, and subject-bearing page/media routes enforce minimum permissions before rendering or writing.

## Lock And Conflict Model

Durable Objects back edit locks. `src/storage/page-lock-object.ts` stores one expiring lock per page or media subject, `src/storage/page-lock-client.ts` talks to the namespace binding from Pages Functions, and `src/storage/page-lock-worker.ts` exports the `PageLockObject` class from the companion Worker required by Cloudflare Pages.

## Plugin Model

PHP plugin execution is out of scope. Bundled plugin behavior will be ported as native modules or explicitly removed for launch.

## Admin Model

Admin behavior will be implemented as Pages Function routes backed by D1 and R2. Extension installation from production UI is out of scope for launch.

## Build And Deployment

Wrangler is the deployment tool. Static assets are in `public/`, Functions are in `functions/`, and shared code is in `src/`.

## Observability

The app emits structured request logs with request IDs and maps known D1, KV, R2, and Durable Object failures into stable JSON responses with a storage code, service name, retry hint, and request ID. Storage failures also emit a dedicated structured `storage_error` event so Cloudflare logs can be filtered by storage service and error code. Login success, login failure, login rate-limit, and logout flows emit structured `auth_event` logs without passwords, session tokens, or cookie values.

## Migration And Rollback

Imports must be idempotent and resumable. Rollback is handled by keeping the source DokuWiki available until production smoke tests and write-path validation pass.

## Platform Review

The architecture maps persistent filesystem concerns onto Cloudflare storage primitives: D1 for relational state, R2 for blobs, KV and Cache API for rendered output, and Durable Objects for locks.

## DokuWiki Behavior Review

DokuWiki's filesystem APIs, file timestamps, local locks, PHP sessions, parser hooks, and plugin hooks are not directly portable. They become explicit service boundaries in this architecture.
