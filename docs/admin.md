# Admin Operations

Native admin routes use D1-backed session principals and DokuWiki-style
`SUPERUSER`/`MANAGER` member-list matching. The default launch mapping is
`SUPERUSER=@admin` and `MANAGER=@manager`.

- `/admin` is the admin dashboard and requires a `MANAGER` or `SUPERUSER` match.
- `/admin/acl` manages ACL rules and requires a `SUPERUSER` match.
- `/admin/config` shows validated read-only runtime configuration, secret
  status, and export links and requires a `SUPERUSER` match.
- `/admin/users` manages native D1 users, group membership, and disabled status
  and requires a `SUPERUSER` match.
- `/admin/audit` shows recent admin audit log entries and requires a
  `SUPERUSER` match.
- `/admin/media-cleanup` scans R2 media objects against D1 media metadata and
  requires a `SUPERUSER` match.
- `/api/admin/config/export` downloads a JSON configuration backup with secrets
  redacted and requires a `SUPERUSER` match.
- `/api/admin/search/rebuild` rebuilds D1 search terms/postings from current pages and requires a `SUPERUSER` match.
- `/api/admin/cache/purge` purges rendered page and discovery caches from KV,
  clears D1 rendered-cache rows, and requires a `SUPERUSER` match.
- `/api/admin/media/cleanup` deletes R2 media objects that are not referenced by
  current media rows or immutable media revision rows and requires a `SUPERUSER`
  match.
- `MAINTENANCE_MODE=1` keeps read routes available while blocking page/media
  writes, drafts, locks, and native API content writes with HTTP 503.
- `/doku.php?do=admin` redirects to `/admin`.
- `/doku.php?do=admin&page=acl` redirects to `/admin/acl`.

The dashboard links to diagnostics, audit logs, ACL management, user management,
configuration management, media cleanup, and the media manager for admin users.
Admin users can trigger a search index rebuild from the dashboard and purge the
rendered cache. Manager users can view the dashboard but cannot edit ACL rules,
manage users, inspect audit logs, inspect/export configuration, run rebuild
actions, clean up media, or purge caches unless they also match `SUPERUSER`.

Admin ACL upserts, ACL deletes, user updates, cache purges, media cleanups, and
search index rebuilds append rows to the D1 `audit_log` table with the actor,
action, target, request IP, and action-specific JSON details.
