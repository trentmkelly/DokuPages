# Plugin Compatibility

The Pages port does not load PHP plugins at runtime. Compatibility means native
replacement, explicit removal, migration-only handling, or a deferred integration
path.

## Bundled Plugins

| Plugin         | Pages decision                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `acl`          | Replaced by native ACL matching and `/admin/acl`.                                                                                             |
| `authplain`    | Replaced by D1-backed users, groups, sessions, and importer support.                                                                          |
| `config`       | Permanently read-only in Pages runtime; replaced by validated environment variables, `/admin/config`, and redacted config export.             |
| `extension`    | DokuWiki-styled `/admin/extension` unsupported page; plugin code upload/install is unavailable in production Pages runtime.                   |
| `info`         | Replaced by `/diagnostics`, `/api/diagnostics`, `/api/health`, and native `~~INFO:*~~` output including environment/PHP/DokuWiki equivalents. |
| `logviewer`    | Non-equivalent replacement by Cloudflare Logs plus native `/admin/audit`; source `data/log` files are not imported.                           |
| `popularity`   | Intentionally removed. The port does not collect, autosubmit, or phone home anonymous usage statistics.                                       |
| `revert`       | Replaced by native page/media revert routes and manager-level `/admin/revert` batch reversion.                                                |
| `safefnrecode` | Migration-only if a source wiki needs filename recoding.                                                                                      |
| `styling`      | Replaced by native `/admin/styling` CSS-variable editor backed by D1 `plugin_settings` and `/theme.css`.                                      |
| `usermanager`  | Replaced by native `/admin/users` management for users, groups, and disabled accounts.                                                        |
| `authad`       | Supported through the external auth sync bridge plus Cloudflare Access header auth.                                                           |
| `authldap`     | Supported through the external auth sync bridge plus Cloudflare Access header auth.                                                           |
| `authpdo`      | Supported through the external auth sync bridge plus Cloudflare Access header auth.                                                           |

## Extension API Boundary

Launch does not expose a runtime plugin API. The supported extension boundary is
native TypeScript code reviewed, built, tested, and deployed with the Pages
application.

Supported hook categories for launch:

- Action hooks: none at runtime.
- Syntax hooks: none at runtime; supported syntax is implemented in `src/wiki/render.ts`.
- Renderer hooks: none at runtime.
- Auth hooks: native `auth_event` handlers in `src/auth/events.ts`; `authad`,
  `authldap`, and `authpdo` compatibility uses the committed sync bridge and
  Cloudflare Access header auth rather than PHP plugin hooks.
- Admin hooks: none at runtime; admin features must be native routes.

Future native extension modules need explicit packaging rules:

- Source lives in the repository and ships through the normal build.
- No uploaded PHP, shell scripts, or dynamic code execution.
- Storage access goes through D1, R2, KV, and Durable Object service boundaries.
- Admin routes require admin ACL checks and CSRF protection for writes.
- User-facing writes must use the existing ACL, rate-limit, audit, and observability helpers.
- Tests define the compatibility contract before a module is considered supported.
