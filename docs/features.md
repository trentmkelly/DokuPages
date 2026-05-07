# Supported Features And Limitations

This file tracks the current Pages-native feature boundary. It is not a promise
of full PHP DokuWiki runtime compatibility.

## Supported

- DokuWiki-compatible page and media IDs, namespaces, and route redirects for the implemented route surface.
- Page view, source, edit, preview, save, delete-by-empty-content, revision list, diff, and revert workflows.
- Anonymous and D1-backed native user sessions with imported `authplain` users,
  groups, native profile updates, and password changes.
- DokuWiki-style ACL matching for pages, namespaces, media reads, uploads, deletes, aggregate views, feeds, search, and admin routes.
- Native renderer coverage for headings, paragraphs, inline formatting, links, interwiki links, media embeds, lists, tables, code/file blocks, quotes, footnotes, typography replacements, smileys, acronyms, and mailguard-style email links.
- R2-backed current media and media revisions, including uploads, deletes, reverts, detail pages, and media manager browsing/search.
- D1-backed page/media changelogs, metadata, search postings, rendered cache records, sessions, drafts, ACLs, users, plugin settings, import jobs, schema versions, and audit logs.
- KV-backed rendered page cache, rate-limit counters, and discovery cache.
- Durable Object-backed page edit locks.
- Native admin dashboard, ACL manager, user manager, audit log view,
  diagnostics, cache purge, and search index rebuild action.
- Native `/api/v1` JSON API with bearer-token write auth, configurable CORS,
  page/media/search/user read methods, and page/media write methods.
- Explicit `501 Not Implemented` responses for legacy XML-RPC, JSON-RPC, and OpenAPI entrypoints.

## Unsupported Or Deferred

- Running PHP, arbitrary DokuWiki PHP plugins, or the DokuWiki installer in production.
- Production extension-manager installs and plugin code uploads.
- LDAP, Active Directory, and PDO auth backends at runtime.
- XML-RPC, JSON-RPC, and OpenAPI method compatibility.
- Email delivery, subscriptions, digests, password reset emails, and registration notifications.
- Server-side ImageMagick/GD thumbnail generation. The current media strategy serves originals and documents derivative policy headers.
- Raw HTML embedding. HTML-like content is escaped unless handled by an explicitly supported safe syntax form.
- Thumbnail cache, parser instruction cache, metadata cache, cache warming, stale fallback, and user-sensitive cache bypass beyond current ACL-filtered route behavior.
- Scheduled production backup automation and final launch rehearsal verification.

## Plugin Compatibility

The Pages port treats bundled plugins as behavior to reimplement natively, not as
PHP modules to execute. Current decisions:

- `acl`: replaced by the native ACL manager.
- `authplain`: replaced by D1-backed native users, groups, and sessions.
- `config`: replaced by runtime env validation and future native config UI.
- `extension`: unsupported for production installs on Pages.
- `info`: partially replaced by diagnostics and health endpoints.
- `logviewer`: replaced by Cloudflare logs plus native admin audit log.
- `popularity`: unsupported.
- `revert`: replaced by native page/media revert routes.
- `safefnrecode`: migration-only if needed.
- `styling`: build-time theme configuration unless a native styling UI is added.
- `usermanager`: replaced by native `/admin/users` user management.
- `authad`, `authldap`, `authpdo`: deferred to external identity/sync bridges.
