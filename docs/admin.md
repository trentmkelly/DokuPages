# Admin Operations

Native admin routes use D1-backed session principals and group membership.

- `/admin` is the admin dashboard and requires `manager` or `admin`.
- `/admin/acl` manages ACL rules and requires `admin`.
- `/admin/users` manages native D1 users, group membership, and disabled status
  and requires `admin`.
- `/admin/audit` shows recent admin audit log entries and requires `admin`.
- `/api/admin/search/rebuild` rebuilds D1 search terms/postings from current pages and requires `admin`.
- `/api/admin/cache/purge` purges rendered page and discovery caches from KV,
  clears D1 rendered-cache rows, and requires `admin`.
- `/doku.php?do=admin` redirects to `/admin`.
- `/doku.php?do=admin&page=acl` redirects to `/admin/acl`.

The dashboard links to diagnostics, audit logs, ACL management, user management
for admin users, and the media manager. Admin users can trigger a search index
rebuild from the dashboard and purge the rendered cache. Manager users can view
the dashboard but cannot edit ACL rules, manage users, inspect audit logs, run
rebuild actions, or purge caches unless they also belong to the `admin` group.

Admin ACL upserts, ACL deletes, user updates, cache purges, and search index
rebuilds append rows to the D1 `audit_log` table with the actor, action, target,
request IP, and action-specific JSON details.
