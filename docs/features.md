# Supported Features And Limitations

This file tracks the current Pages-native feature boundary. It is not a promise
of full PHP DokuWiki runtime compatibility.

## Supported

- DokuWiki-compatible page and media IDs, namespaces, and route redirects for the implemented route surface.
- Page view, source, edit, preview, save, delete-by-empty-content, revision list, diff, and revert workflows.
- Page diffs support current/previous defaults, explicit `rev2[...]`
  comparisons, side-by-side and inline output, and DokuWiki-style diff option
  forms. Media detail pages provide a native side-by-side media revision diff.
- Export actions cover raw source, code blocks, XHTML, XHTML body, HTML aliases,
  no-body metadata exports, and explicit unsupported-renderer responses for
  unavailable `export_*` modes.
- Anonymous and D1-backed native user sessions with imported `authplain` users,
  groups, native registration, DokuWiki-style generated registration passwords,
  profile updates, profile deletion, password changes, and emailed password
  resets.
- `authad`, `authldap`, and `authpdo` user/group compatibility through an
  operator-run D1 sync bridge and Cloudflare Access header authentication.
- DokuWiki-style ACL matching for pages, namespaces, media reads, uploads, deletes, aggregate views, feeds, search, and admin routes.
- Native renderer coverage for headings, paragraphs, inline formatting, links,
  imported interwiki and external-link scheme rules, media embeds, lists,
  tables, horizontal rules, code/file blocks, quotes, footnotes, typography
  replacements, smileys, acronyms, and mailguard-style email links.
- R2-backed current media and media revisions, including uploads, deletes, reverts, detail pages, and media manager browsing/search.
- D1-backed page/media changelogs, metadata, search postings, rendered cache records, sessions, drafts, ACLs, users, plugin settings, import jobs, schema versions, and audit logs.
- Recent page changes use DokuWiki-style latest-change grouping, namespace and
  minor-edit filters, configured date formatting, hidden-page filtering, and
  `first[...]` pagination controls.
- Editor/user display honors DokuWiki `showuseras` modes for login names, full
  names, user interwiki links, obfuscated email text, and mailto links.
- KV-backed rendered page cache with D1 dependency tracking, rate-limit counters, and discovery cache.
- Durable Object-backed page edit locks.
- Native admin dashboard, ACL manager, configuration manager, user manager,
  Revert Manager, audit log view, diagnostics, cache purge, and search index
  rebuild action.
- Resend-compatible outbound email adapter with fixed sender configuration,
  escaped native templates, D1 delivery logging, registration notifications,
  password resets, page-change notifications, subscriptions, and scheduled
  daily/weekly digests.
- Read-only maintenance mode controlled by `MAINTENANCE_MODE`.
- Native `/api/v1` JSON API with bearer-token write auth, configurable CORS,
  page/media/search/user read methods, and page/media write methods.
- Explicit `501 Not Implemented` responses for legacy XML-RPC, JSON-RPC, and OpenAPI entrypoints.
- DokuWiki parser instruction-cache behavior replaced by revision-aware rendered
  HTML cache entries.

## Unsupported Or Deferred

- Running PHP, arbitrary DokuWiki PHP plugins, or the DokuWiki installer in production.
- Production extension-manager installs and plugin code uploads.
- Runtime execution of DokuWiki's PHP LDAP, Active Directory, and PDO auth
  plugins. Use the native sync bridge plus Cloudflare Access instead.
- XML-RPC, JSON-RPC, and OpenAPI method compatibility.
- Full ImageMagick/GD feature parity beyond Photon-backed PNG/JPEG/WebP resize and crop derivatives.
- Raw HTML embedding. HTML-like content is escaped unless handled by an explicitly supported safe syntax form.
- Thumbnail cache and stale fallback.
- Final launch rehearsal verification.

## Plugin Compatibility

The Pages port treats bundled plugins as behavior to reimplement natively, not as
PHP modules to execute. Current decisions:

- `acl`: replaced by the native ACL manager.
- `authplain`: replaced by D1-backed native users, groups, and sessions.
- `config`: permanently read-only in Pages runtime, replaced by runtime env
  validation, `/admin/config`, and redacted configuration export.
- `extension`: unsupported for production installs on Pages; `/admin/extension`
  keeps a DokuWiki-styled disabled Extension Manager page.
- `info`: replaced by diagnostics, health endpoints, and native `~~INFO:*~~`
  output for parser/plugin lists plus Pages environment, PHP, and DokuWiki
  compatibility details.
- `logviewer`: non-equivalent replacement by Cloudflare Logs plus the native
  admin audit log; source `data/log` files are not imported.
- `popularity`: intentionally removed; the port does not collect, autosubmit,
  or phone home anonymous usage statistics.
- `revert`: replaced by native page/media revert routes plus `/admin/revert`
  for DokuWiki-style spam search and batch reversion.
- `safefnrecode`: migration-only operator script via `npm run safefn:recode`.
- `styling`: native Template Style Settings editor stores Pages-safe CSS
  variable overrides in D1 and applies them through `/theme.css`.
- `usermanager`: replaced by native `/admin/users` user management with
  search filters, per-user group editing, disabled status, validation, and
  selected-user bulk deletion.
- `authad`, `authldap`, `authpdo`: supported through the external auth sync
  bridge and Cloudflare Access header authentication.
