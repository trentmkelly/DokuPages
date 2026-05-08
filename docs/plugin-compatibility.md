# Plugin Compatibility

The Pages port does not load PHP plugins at runtime. Compatibility means native
replacement, explicit removal, migration-only handling, or a deferred integration
path.

## Bundled Plugins

| Plugin         | Pages decision                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `acl`          | Replaced by native ACL matching and `/admin/acl`.                                                 |
| `authplain`    | Replaced by D1-backed users, groups, sessions, and importer support.                              |
| `config`       | Replaced by validated runtime environment variables, `/admin/config`, and redacted config export. |
| `extension`    | Removed for production Pages runtime; plugin code upload/install is unsupported.                  |
| `info`         | Replaced by `/diagnostics`, `/api/diagnostics`, and `/api/health`.                                |
| `logviewer`    | Replaced by Cloudflare logs plus native admin audit log records.                                  |
| `popularity`   | Removed. The port does not phone home usage statistics.                                           |
| `revert`       | Replaced by native page/media revert routes and manager-level `/admin/revert` batch reversion.    |
| `safefnrecode` | Migration-only if a source wiki needs filename recoding.                                          |
| `styling`      | Replaced by build-time theme assets and checked-in CSS; no runtime styling popup is loaded.       |
| `usermanager`  | Replaced by native `/admin/users` management for users, groups, and disabled accounts.            |
| `authad`       | Deferred to an external identity or sync bridge.                                                  |
| `authldap`     | Deferred to an external identity or sync bridge.                                                  |
| `authpdo`      | Deferred to an external identity or sync bridge.                                                  |

## Extension API Boundary

Launch does not expose a runtime plugin API. The supported extension boundary is
native TypeScript code reviewed, built, tested, and deployed with the Pages
application.

Supported hook categories for launch:

- Action hooks: none at runtime.
- Syntax hooks: none at runtime; supported syntax is implemented in `src/wiki/render.ts`.
- Renderer hooks: none at runtime.
- Auth hooks: native `auth_event` handlers in `src/auth/events.ts`; external auth integrations must still be native modules or external identity bridges.
- Admin hooks: none at runtime; admin features must be native routes.

Future native extension modules need explicit packaging rules:

- Source lives in the repository and ships through the normal build.
- No uploaded PHP, shell scripts, or dynamic code execution.
- Storage access goes through D1, R2, KV, and Durable Object service boundaries.
- Admin routes require admin ACL checks and CSRF protection for writes.
- User-facing writes must use the existing ACL, rate-limit, audit, and observability helpers.
- Tests define the compatibility contract before a module is considered supported.
