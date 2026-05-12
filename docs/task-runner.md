# Task Runner Replacement Map

DokuWiki runs background work opportunistically through
`lib/exe/taskrunner.php`, with the deprecated `lib/exe/indexer.php` including
the same entrypoint. `inc/TaskRunner.php` sends a 1x1 GIF by default, supports a
debug text mode when debugging is allowed, and attempts one task per request in
this order:

1. `INDEXER_TASKS_RUN` plugin event
2. `runIndexer()`
3. `runSitemapper()`
4. `sendDigest()`
5. `runTrimRecentChanges(false)`
6. `runTrimRecentChanges(true)`

The Pages port does not keep a browser-driven PHP task queue. Work is either
handled by the compatibility route that already received the request, by a
token-protected scheduled endpoint, or by an operator script. This avoids
depending on a user's browser request to finish background work in a serverless
runtime.

| Upstream task runner job      | Pages replacement                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INDEXER_TASKS_RUN`           | Native plugin hooks for task-runner interception are not implemented. The compatibility map in `docs/runtime-compatibility.md` marks this event as a native HTTP task runner with plugin hooks deferred.                                                                                                   |
| `runIndexer()`                | `/lib/exe/taskrunner.php?id=<page>` and `/lib/exe/indexer.php?id=<page>` call the native D1 search indexer for that page and return DokuWiki's GIF response by default. `debug=1` returns text, and JSON clients receive a JSON task result. Admins can rebuild the full search index from the admin page. |
| `runSitemapper()`             | `/sitemap.xml` and `/sitemap` generate sitemap XML from current D1 pages at request time, honor `SITEMAP`, and cache the discovery document in KV. Search-engine pinging is not reproduced; operators can warm sitemap generation with `npm run cache:warm -- --base-url <url>`.                           |
| `sendDigest()`                | Immediate subscription mail is sent from page save/revert workflows. Daily and weekly digest delivery is handled by the token-protected `/api/tasks/email-digests` endpoint, intended for Cloudflare Cron Triggers or another scheduler using `Authorization: Bearer <EMAIL_TASK_TOKEN>`.                  |
| `runTrimRecentChanges(false)` | Page recent changes are not destructively trimmed by a background job. `/recent`, feeds, and admin views filter D1 changelog rows with `RECENT` and `RECENT_DAYS` at query time so page history, backups, and auditability remain intact.                                                                  |
| `runTrimRecentChanges(true)`  | Media recent changes use the same D1 changelog and query-time `RECENT`/`RECENT_DAYS` filtering as page changes. The port does not rewrite media changelog storage in the background.                                                                                                                       |

Operational scheduled work that replaces task-runner behavior:

- Schedule `/api/tasks/email-digests` daily.
- Schedule `/api/tasks/email-digests?interval=weekly` weekly when weekly
  subscriptions are used.
- Optionally warm rendered pages, feeds, and sitemap after deploys with
  `npm run cache:warm -- --base-url <url>`.
- Use the admin search-index rebuild or `/lib/exe/taskrunner.php?id=<page>` for
  explicit reindexing instead of relying on browser-triggered PHP tasks.
