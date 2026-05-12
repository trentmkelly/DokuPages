# Admin Operations

Native admin routes use D1-backed session principals and DokuWiki-style
`SUPERUSER`/`MANAGER` member-list matching. The default launch mapping is
`SUPERUSER=@admin` and `MANAGER=@manager`.

- `/admin` is the admin dashboard and requires a `MANAGER` or `SUPERUSER` match.
- `/admin/acl` manages ACL rules, supports namespace browsing, supports
  current-rule bulk permission edits/deletes, and requires a `SUPERUSER` match.
- `/admin/config` shows validated read-only runtime configuration, upstream
  DokuWiki config metadata from `lib/plugins/config/settings/config.metadata.php`,
  secret status, and export links and requires a `SUPERUSER` match. Unlike
  DokuWiki's bundled config plugin, this route is permanently read-only in the
  Pages runtime because configuration edits must update Cloudflare Pages
  variables, secrets, or Wrangler configuration followed by a redeploy.
- `/admin/extension` keeps a DokuWiki-styled Extension Manager page with the
  upstream tab labels and imported plugin enablement from `conf/plugins.php`,
  `conf/plugins.local.php`, and `conf/plugins.required.php`, but it returns
  `501` and explains that runtime plugin and template install/update/uninstall
  actions are unsupported on Pages. Imported plugin-specific configuration from
  `$conf['plugin'][...]` is shown for compatibility review with sensitive values
  redacted.
- `/admin/plugin-compatibility` shows every bundled upstream plugin, imported
  enablement state when present, imported plugin configuration counts and
  redacted details, and the Pages native replacement, external bridge,
  migration-only, removed, or unsupported-runtime status.
- `/admin/styling` provides a native Template Style Settings editor for the
  DokuWiki-style CSS variables. It writes deployment-safe D1 `plugin_settings`
  rows and applies them through `/theme.css` without mutating checked-in assets.
- `/admin/users` manages native D1 users, group membership, disabled status,
  upstream-style filters, and selected-user bulk deletion and requires a
  `SUPERUSER` match.
- `/admin/audit` shows recent native admin audit log entries and requires a
  `SUPERUSER` match. This is a non-equivalent replacement for DokuWiki's
  bundled logviewer: upstream logviewer reads daily PHP filesystem logs from
  `data/log/<facility>/<date>.log`, while Pages request/runtime logs stay in
  Cloudflare Logs and are not imported into D1.
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
configuration management, bundled plugin compatibility, media cleanup, and the
media manager for admin users. Admin users can trigger a search index rebuild
from the dashboard and purge the rendered cache. Manager users can view the
dashboard but cannot edit ACL rules, manage users, inspect audit logs,
inspect/export configuration, run rebuild actions, clean up media, or purge
caches unless they also match `SUPERUSER`.

Admin ACL upserts, ACL deletes, ACL bulk edits/deletes, user updates, cache
purges, media cleanups, and search index rebuilds append rows to the D1
`audit_log` table with the actor, action, target, request IP, and
action-specific JSON details. Legacy `data/log` files from a source DokuWiki
install are intentionally not imported or displayed by this page.

Operators can promote an existing native user to the configured DokuWiki
`SUPERUSER` role without hand-editing D1 rows:

```sh
npm run user:promote-superuser -- --username testuser
```

The script reads `SUPERUSER` from the environment, defaulting to `@admin`, and
adds the user to the first configured superuser group. Use `--group <group>` when
the deployment uses a literal-user `SUPERUSER` list that has no group entry.
