# Threat Model And Permissions Review

This review covers the current Pages-native validation build.

## Trust Boundaries

- Browser to Pages Functions: untrusted requests, cookies, form bodies, uploads,
  and query strings.
- Pages Functions to D1: trusted application code with untrusted wiki content and
  imported metadata.
- Pages Functions to R2: trusted media object access through ACL-checked routes.
- Pages Functions to KV: trusted cache and rate-limit state that must not become
  an authorization source.
- Pages Functions to Durable Objects: trusted page-lock coordination, not an ACL
  authority.
- Wrangler/operator access: privileged deployment, backup, restore, and migration
  path outside end-user request handling.

## Primary Risks And Controls

| Risk                          | Current control                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored XSS in wiki syntax     | Renderer escapes HTML by default; XSS regression tests cover headings, links, media titles, and table cells.                                |
| CSRF on state-changing routes | Page, media, login, logout, admin ACL, and admin rebuild writes require CSRF tokens.                                                        |
| ACL bypass                    | Page, media, search, feeds, sitemap, indexes, backlinks, wanted/orphan reports, admin pages, and aggregate results apply native ACL checks. |
| Unauthorized media access     | Media fetch/detail/manager/upload/delete/revert routes resolve ACL permissions before D1/R2 operations.                                     |
| Brute-force login             | KV-backed login rate limit by client IP and username.                                                                                       |
| Edit/upload abuse             | KV-backed page edit and media upload rate limits by client IP and actor.                                                                    |
| Partial R2/D1 write failure   | Media upload rolls back the newly written R2 object if D1 metadata writes fail.                                                             |
| Session theft impact          | Session cookies are HTTP-only, `SameSite=Lax`, and `Secure` on HTTPS; only token hashes are stored in D1.                                   |
| Secret leakage                | No runtime secret is required; `npm run scan:secrets` and CI scan tracked files for high-signal secrets.                                    |
| Storage outage ambiguity      | Storage errors map to stable JSON and emit structured `storage_error` logs with service and retry hints.                                    |

## Permissions Review

Runtime bindings:

- `DB`: required for wiki content, revisions, ACLs, users, sessions, metadata,
  search, audit logs, and import status.
- `MEDIA_BUCKET`: required for current media and media revision bodies.
- `RENDER_CACHE`: required for rendered/discovery cache and rate-limit counters.
- `PAGE_LOCKS`: required for page/media edit lock coordination.

Admin route permissions:

- `/admin`: configured `MANAGER` or `SUPERUSER` member-list match.
- `/admin/acl`: configured `SUPERUSER` member-list match.
- `/admin/audit`: configured `SUPERUSER` member-list match.
- `/api/admin/rebuild-search`: configured `SUPERUSER` member-list match plus CSRF.

Operational permissions:

- `npm run deploy` and `npm run deploy:locks` require Wrangler account access.
- `npm run backup:export` reads remote D1 and R2 through Wrangler.
- `npm run backup:restore` writes D1 and R2 and requires explicit `--yes`.
- Remote D1 migrations require Wrangler access to `dokuwiki_pages_dev`.

## Residual Risks

- Password reset, email delivery, and runtime plugin execution are not in launch
  scope.
- Runtime PHP plugin hooks are intentionally unsupported; future native modules
  need their own review.
- Production alerting and quota pressure alerts remain open checklist items.
- Full production launch still needs a migration rehearsal, representative
  content review, redirect verification, and backup/restore verification.
