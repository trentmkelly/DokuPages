# Data Model

The D1 schema in `migrations/0001_initial.sql` is the source of truth for the initial relational model.

## Pages

`pages` stores the current page pointer and namespace information. `page_revisions` stores immutable content versions, summaries, change types, author information, size changes, timestamps, and content hashes.

Deleted pages are represented by `pages.is_deleted = 1` and a `page_revisions.change_type = 'delete'` row. This preserves history without relying on missing files.

## Media

`media` stores metadata for the current media object and points at R2 object keys. `media_revisions` stores historical object keys and metadata for old revisions.

Deleted media is represented by `media.is_deleted = 1` with corresponding media changelog rows.

## Namespaces

Namespaces are stored as colon-separated IDs in page and media records. They can be queried by the `namespace` columns and reconstructed for URL compatibility.

## Metadata

`metadata` stores JSON metadata for pages, media, config, and plugin subjects. This replaces `.meta` files and media metadata files.

## Changelogs

`changelog` stores both page and media change events with subject type, subject ID, revision ID, user, IP, summary, change type, size change, and timestamp.

## ACL And Auth

`acl_rules`, `users`, `groups`, and `user_groups` replace `acl.auth.php` and `users.auth.php`. Sessions are represented by `sessions` with hashed tokens and expiration timestamps.

## Drafts And Locks

`drafts` stores autosave state. Runtime locks are coordinated through Durable Objects rather than D1 polling; D1 may still receive lock audit records later.

## Search

`search_terms` and `search_postings` model a D1-backed inverted index. This may later be replaced with D1 FTS or an external search service if performance requires it.

## Rendered Cache

`rendered_cache` stores render metadata and HTML for deterministic cache rebuilds. Hot cache entries may be mirrored into KV.

## Config, Plugins, Audit, And Imports

`plugin_settings`, `audit_log`, `import_jobs`, and `schema_versions` provide first-class records for operational data that was previously spread across PHP config files, logs, and local files.

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
