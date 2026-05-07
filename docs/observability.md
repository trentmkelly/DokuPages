# Observability

The Pages port uses structured JSON logs and native diagnostic endpoints rather
than DokuWiki's PHP logviewer.

## Structured Logs

`withRequestObservability` wraps Pages Functions and emits one `request` event
per handled request with:

- `requestId`
- HTTP method
- path
- response status
- `durationMs`

Unhandled errors emit `request_error` events. Storage failures are mapped through
`src/storage/errors.ts` and also emit dedicated `storage_error` events with the
storage service, error code, retry hint, and request ID.

Auth flows emit `auth_event` logs for login success, login failure, login rate
limits, and logout. Admin ACL changes and search index rebuilds also write D1
audit log rows that are visible in `/admin/audit`.

## Metrics

The runtime emits structured metric events to Cloudflare logs:

- `cache_metric`: rendered page cache hit, miss, write, purge, bypass, and
  discovery document cache hit, miss, and write events.
- `search_metric`: search page and AJAX search result counts with query length,
  namespace, surface, and duration.
- `media_metric`: media fetch, media manager list/search, upload, delete, and
  revert operations with namespace, byte counts where relevant, result counts,
  and duration.
- `migration_event`: import plan and artifact generation events emitted by the
  flat-file importer.

## Health Dashboard

- `/api/health`: machine-readable health result for D1, R2, KV, Durable Objects,
  config, migrations, and version.
- `/api/diagnostics`: full diagnostics JSON.
- `/diagnostics`: HTML diagnostics view.
- `/admin`: admin dashboard linking to diagnostics, ACL management, audit logs,
  media manager, and search index rebuild.

## Remaining Work

Open observability items are production alerting, quota/limit-pressure alerts,
and deeper per-route storage operation counts.
