# Performance Notes

This document records measurable runtime limits and the current mitigation work.

## Media Fetch

Media fetch time is measured in two places:

- `media_metric.durationMs` records server-side route time for every media fetch.
- External `curl` checks against `https://dokutest.pages.dev/media/...` record
  end-to-end time through Cloudflare.

Initial remote R2 baseline on May 7, 2026:

| Route                                      | Status | Bytes | External time |
| ------------------------------------------ | -----: | ----: | ------------: |
| `/media/wiki/dokuwiki.svg`                 |    200 |  9317 |        0.755s |
| `/media/wiki/dokuwiki-128.png`             |    200 | 27895 |        0.887s |
| `HEAD /media/wiki/dokuwiki.svg`            |    200 |     0 |        0.731s |
| conditional `GET /media/wiki/dokuwiki.svg` |    304 |     0 |        0.667s |

Media delivery is tuned to avoid unnecessary R2 body reads. Current route-level
R2 operation counts:

| Route path                  | Delivery case      | R2 operations |
| --------------------------- | ------------------ | ------------: |
| `GET /media/<id>`           | body response      |             1 |
| `HEAD /media/<id>`          | metadata response  |             1 |
| conditional `/media/<id>`   | `304 Not Modified` |             0 |
| `GET /media-manager?ns=...` | manager browse     |             0 |

Current media responses use one-hour caching for mutable media IDs and one-year
immutable caching for revision URLs. ETags are content hashes, so conditional
requests can be resolved from D1 metadata before opening the R2 object body.

## Storage Query Guardrails

Storage performance tests assert that high-cardinality D1 lookups use explicit
indexes and that paginated reads stay bounded to one D1 query per route/storage
call. Covered query families include page and media revision pagination, recent
changes, namespace page/media listings, rendered-cache purges, audit-log
pagination, session cleanup, and search reindex lookups.

`migrations/0002_storage_performance_indexes.sql` adds the supporting indexes
for these access patterns, including `search_postings(page_id)` so page
reindex/delete work does not scan the full inverted index.

R2 media storage tests assert that metadata-only reads do not open R2 objects and
that object body/head/delete operations each map to one bucket call.

## Search

Search time is measured in two places:

- `search_metric.durationMs` records server-side route time for search pages,
  API search, and AJAX quick search.
- External `curl` checks against `https://dokutest.pages.dev/search` record
  end-to-end time through Cloudflare.

Initial remote search baseline on May 7, 2026:

| Route                                   | Status | Bytes | External time |
| --------------------------------------- | -----: | ----: | ------------: |
| `/search?q=DokuWiki`                    |    200 |  4961 |        0.992s |
| `/search?q=syntax&ns=wiki`              |    200 |  4992 |        0.973s |
| `/lib/exe/ajax.php?call=qsearch&q=wiki` |    200 |   269 |        0.948s |

Search performance tests assert that page search uses the page namespace or
deleted-page indexes, page revision primary-key lookups, and search posting
primary-key lookups. They also assert one D1 read per search call and clamp raw
posting searches to 100 results.

## Parser Cache Equivalent

The port uses revision-aware rendered HTML cache entries instead of DokuWiki's
PHP parser instruction cache. Cache entries store the renderer version, revision
ID, page title, rendered HTML, table of contents, and extracted page/media
dependencies. Current page entries are invalidated on save, private ACL pages
bypass the shared cache, and old revision entries are immutable until
renderer-version invalidation.

Cache dependency tracking is mirrored in D1 `cache_dependencies` rows with an
index on `(dependency_type, dependency_id, cache_key)`. Page saves and media
uploads/deletes/reverts use that index to purge rendered pages that reference
the changed subject.

Important pages can be warmed after deployment with:

```sh
npm run cache:warm -- --base-url https://dokutest.pages.dev
```

The default warming set requests the site root, welcome page, syntax page,
sitemap, and RSS feed. Operators can add `--path /wiki/custom/page` arguments
for release-specific pages.

## Stale Fallback Decision

The Pages port does not serve stale rendered page HTML after cache validation
fails. Rendered cache entries include revision ID and renderer version checks,
and private pages bypass shared cache entirely. Falling back to stale HTML after
edits, ACL changes, or renderer updates could expose outdated content or the
wrong visibility state, so the safer behavior is to re-render or return the
storage error mapped by the route.

## Metadata Cache Decision

No separate metadata cache is used for launch. Page and media saves write
metadata rows in the same D1 batches as their canonical records, but hot routes
read current page/media rows directly instead of issuing repeated metadata
lookups. The `metadata(subject_type, subject_id, key)` primary key remains the
bounded access path for admin, import, backup, and diagnostic uses.
