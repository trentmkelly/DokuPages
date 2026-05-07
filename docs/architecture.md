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
- `POST /api/pages` page create, edit, and delete saves
- `POST /api/pages/preview` rendered preview responses
- all other paths to static asset fallback

Specific endpoint files may be added under `functions/` as the route surface expands.

## Data Access Layer

Storage contracts live in `src/storage/interfaces.ts`. D1-backed page reads, history, recent changes, search, namespace indexes, backlinks, wanted pages, orphan pages, and saves begin in `src/wiki/page-service.ts` and `src/storage/d1.ts`; future adapters should implement the same contracts for media, ACLs, users, metadata, drafts, locks, and rendered cache.

## Storage Schema

The first D1 schema is `migrations/0001_initial.sql`. It models pages, page revisions, media, media revisions, metadata, changelog, ACLs, users, groups, sessions, drafts, subscriptions, search postings, rendered cache, plugin settings, audit logs, import jobs, and schema versions.

## Cache Model

Rendered page cache entries are modeled in D1 for metadata and can be mirrored into KV or the Cache API. Cache invalidation must be keyed by subject type, subject ID, revision ID, and content hash.

## Auth And Sessions

The schema supports native users, groups, sessions, password hashes, and ACLs. The scaffold does not yet implement login or cookie handling.

## Lock And Conflict Model

Durable Objects are reserved for edit locks and write serialization. `src/storage/page-lock-object.ts` contains the first object class stub.

## Plugin Model

PHP plugin execution is out of scope. Bundled plugin behavior will be ported as native modules or explicitly removed for launch.

## Admin Model

Admin behavior will be implemented as Pages Function routes backed by D1 and R2. Extension installation from production UI is out of scope for launch.

## Build And Deployment

Wrangler is the deployment tool. Static assets are in `public/`, Functions are in `functions/`, and shared code is in `src/`.

## Observability

The app should emit structured logs with request IDs, storage errors, auth events, migration status, and performance timings. The initial scaffold includes no production logging beyond HTTP responses.

## Migration And Rollback

Imports must be idempotent and resumable. Rollback is handled by keeping the source DokuWiki available until production smoke tests and write-path validation pass.

## Platform Review

The architecture maps persistent filesystem concerns onto Cloudflare storage primitives: D1 for relational state, R2 for blobs, KV and Cache API for rendered output, and Durable Objects for locks.

## DokuWiki Behavior Review

DokuWiki's filesystem APIs, file timestamps, local locks, PHP sessions, parser hooks, and plugin hooks are not directly portable. They become explicit service boundaries in this architecture.
