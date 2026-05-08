# Data Model

The D1 migrations under `migrations/` are the source of truth for the relational model. `0001_initial.sql` creates the core tables, and later migrations add operational indexes or compatible schema extensions.

## Pages

`pages` stores the current page pointer and namespace information. `page_revisions` stores immutable content versions, summaries, change types, author information, size changes, timestamps, and content hashes.

Deleted pages are represented by `pages.is_deleted = 1` and a `page_revisions.change_type = 'delete'` row. This preserves history without relying on missing files.

## Media

`media` stores metadata for the current media object and points at R2 object keys. `media_revisions` stores historical object keys and metadata for old revisions.

Deleted media is represented by `media.is_deleted = 1` with corresponding media changelog rows.

## Revision Retention

Page and media revisions are canonical wiki history, not derived cache files.
They are intentionally retained for old-revision views, diffs, reverts, audits,
backups, and import hash verification. The D1 schema stores revision rows with
parent page/media references, and write paths create the parent/current pointer,
revision row, changelog row, and metadata rows together.

The Pages port therefore does not run a separate orphaned-revision cleanup job.
Deleting revision rows would break DokuWiki history semantics. Storage cleanup is
limited to unreferenced R2 media objects under `media/`; D1 revision integrity is
handled by migrations, import validation, backups, and restore rehearsal checks.

## Namespaces

Namespaces are stored as colon-separated IDs in page and media records. They can be queried by the `namespace` columns and reconstructed for URL compatibility.

## Metadata

`metadata` stores JSON metadata for pages, media, config, and plugin subjects. This replaces `.meta` files, media metadata files, and imported DokuWiki `$conf` values that are not first-class runtime environment variables.

## Changelogs

`changelog` stores both page and media change events with subject type, subject ID, revision ID, user, IP, summary, change type, size change, and timestamp.

## ACL And Auth

`acl_rules`, `users`, `groups`, and `user_groups` replace `acl.auth.php` and `users.auth.php`. Sessions are represented by `sessions` with hashed tokens and expiration timestamps.

## Drafts And Locks

`drafts` stores autosave state. Runtime locks are coordinated through Durable Objects rather than D1 polling; D1 may still receive lock audit records later.

## Search

`search_terms` and `search_postings` model a D1-backed inverted index. The first implementation tokenizes rendered wiki source into normalized terms, applies a small stopword list, weights title matches above body matches, and updates postings during flat-file import plus page save and delete operations.

D1 postings are the launch search backend. DokuWiki's legacy `data/index` files are not read directly because they encode PHP filesystem assumptions; a rebuild importer can be added later if production data requires exact legacy ranking.

Media search does not use a separate full-text index. The media manager searches current D1 media metadata by namespace, media ID, and MIME type, backed by the namespace/deleted/id index used for media browsing. This keeps media search tied to canonical media rows instead of migrating DokuWiki's filesystem index files.

## Rendered Cache

`rendered_cache` stores render metadata and HTML for deterministic cache rebuilds. Hot cache entries may be mirrored into KV. `cache_dependencies` maps rendered cache keys to page and media subjects referenced by the rendered output so saves, uploads, deletes, and reverts can purge dependent page HTML.

## Config, Plugins, Audit, And Imports

`plugin_settings`, `audit_log`, `import_jobs`, and `schema_versions` provide first-class records for operational data that was previously spread across PHP config files, logs, and local files. The import planner reports plugin enablement separately from plugin-specific `$conf['plugin'][...]` settings so the Pages port can decide which plugins are native, migration-only, or unsupported.

## Timestamp Replacement

All former `filemtime` and `touch` semantics are modeled as ISO 8601 timestamp columns. Revision identity should use original DokuWiki timestamps during import when available.

## Content Hashes

Content hashes are stored explicitly on page and media revisions. SHA-256 is the default hash algorithm unless compatibility tooling requires a legacy hash.

## Compression

Compressed DokuWiki attic files are decompressed during import and stored as normal revision content. Original compression metadata can be retained in import reports if needed.

## Large Media

Large media bodies live in R2. D1 stores object keys, hashes, byte lengths, MIME types, and revision pointers.

## MIME Metadata

Attachment MIME metadata is stored on `media` and `media_revisions`, with extended parsed metadata in `metadata`.
