# Observability

The Pages port uses structured JSON logs and native diagnostic endpoints rather
than DokuWiki's PHP logviewer. This is an intentional non-equivalent
replacement: upstream logviewer reads daily filesystem logs from
`data/log/<facility>/<date>.log`, but Pages request/runtime logs live in
Cloudflare Logs and are not imported into D1.

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
limits, logout, profile updates, and profile deletes. Admin ACL changes and
search index rebuilds also write D1 audit log rows that are visible in
`/admin/audit`. Legacy `data/log` files from a source DokuWiki install are not
part of the import surface.

DokuWiki's `dontlog` setting is available as the `DONTLOG` Pages variable. The
default is `debug`, so the production Pages wrapper suppresses request and
metric debug events unless `DONTLOG` is set to an empty value. Adding `error`
suppresses request, storage, Turnstile, custom language, and failed email
delivery error events. `deprecated` is accepted for config parity; no native
deprecation log source exists yet.

DokuWiki's `logretain` setting is available as `LOGRETAIN`, defaulting to `3`.
The port applies it to D1 `audit_log` rows when native admin actions append a
new row, with `0` retaining all rows. Cloudflare Logs and Logpush retention are
platform/operator settings, so the Worker documents but cannot enforce their
retention window.

## Metrics

The runtime emits structured metric events to Cloudflare logs:

- `cache_metric`: rendered page cache hit, miss, write, purge, bypass, and
  discovery document cache hit, miss, and write events.
- `search_metric`: search page and AJAX search result counts with query length,
  namespace, surface, and duration.
- `media_metric`: media fetch, media manager list/search, upload, delete, and
  revert operations with namespace, byte counts where relevant, result counts,
  delivery mode, R2 operation counts for fetches, and duration.
- `migration_event`: import plan and artifact generation events emitted by the
  flat-file importer.

## Health Dashboard

- `/api/health`: machine-readable health result for D1, R2, KV, Durable Objects,
  Cloudflare quota budget checks, config, migrations, and version.
- `/api/diagnostics`: full diagnostics JSON, including imported plugin
  enablement, plugin configuration, and source files when a DokuWiki source
  import supplied them. Sensitive plugin configuration values are redacted.
  Diagnostics include D1 logical payload, R2 referenced media, and rendered cache
  quota checks driven by the optional `QUOTA_*_WARN_BYTES` variables.
- `/diagnostics`: HTML diagnostics view with the same plugin enablement and
  redacted plugin configuration summary plus Cloudflare quota checks.
- `/admin`: admin dashboard linking to diagnostics, ACL management, audit logs,
  media manager, and search index rebuild.

## Alerting

Run the diagnostics alert checker from any external monitor or CI schedule:

```sh
npm run alerts:check
```

The checker fetches `/api/diagnostics`, emits a JSON alert result, and exits with
code `2` when alerts are present. It covers unhealthy runtime diagnostics,
storage check failures, migration status failures, failed import jobs, high
storage latency, configured Cloudflare quota threshold warnings, unavailable
quota calculations, and storage messages that indicate quota, rate-limit, or
limit pressure. Use `-- --base-url <url>` for a different deployment and
`-- --storage-latency-ms <ms>` to tune the latency threshold.

Recommended Cloudflare Logs alert filters:

- Error spikes: `event = "request_error"` over the production service.
- Storage failures: `event = "storage_error"`.
- Migration failures: `event = "migration_event"` with failed job output, plus
  `npm run alerts:check` against `/api/diagnostics`.
- Quota or limit pressure: `storage_error.code = "storage_rate_limited"`,
  response status `429`, `auth_event = "login_rate_limited"`, and
  `npm run alerts:check` quota warnings from `/api/diagnostics`.
