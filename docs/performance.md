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
