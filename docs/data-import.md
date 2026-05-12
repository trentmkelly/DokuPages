# Data Import

The importer reads a flat-file DokuWiki tree and emits D1 SQL plus an R2 media manifest. It preserves current page bodies, search postings, current media rows, media revision rows, parsed page/media `.meta` data, custom language files, custom template files, ACL rules, authplain users/groups, page/media subscriptions, and page/media changelog rows. Imported custom `conf/lang/<lang>/lang.php` strings and auth page `.txt` files are used at runtime for supported auth/UI text. It intentionally does not import `data/log` PHP runtime log files; Cloudflare Logs are the Pages runtime source for request and error events, and D1 `audit_log` rows cover native admin actions.

## Dry Run

```sh
npm run import:dry-run
```

The dry run prints the import plan and counts discovered pages, page revisions,
media, media revisions, metadata, custom language files, custom template files,
subscriptions, ACL rules, users, config values, plugin settings, interwiki
templates, MIME mappings, scheme protocols, and wordblock patterns.

The importer reads `fnencode` from the source wiki's DokuWiki configuration
before walking `data/pages`, `data/attic`, `data/media`, `data/media_attic`, and
metadata trees. URL-encoded, SafeFN-encoded, and UTF-8 file names are decoded
back to DokuWiki page/media IDs during import.

Older SafeFN source trees may still use DokuWiki's pre-2012 `.` post-indicator
inside encoded media and metadata names. Run `npm run safefn:recode` for a dry
run, then `npm run safefn:recode -- --write` to rename the source tree before
generating import SQL and media manifests.

## Compression Prerequisite

The importer decompresses `.txt.gz` attic revisions with Node's built-in zlib
support. Source wikis that contain `.txt.bz2` page attic revisions require the
operator machine to have a `bzip2` executable on `PATH`; the importer shells out
to `bzip2 -dc` for those files. Verify the prerequisite before dry runs with:

```sh
command -v bzip2
```

If `bzip2` is unavailable, install the OS package before running
`npm run import:dry-run`, `npm run import:sql`, or
`npm run import:hash-manifest` against a source tree with bzip2-compressed
attic revisions.

## D1 SQL

```sh
npm run import:sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/dokuwiki-import.sql
```

The generated SQL is idempotent for imported pages, search postings, current media metadata, media revisions, metadata rows, custom language/template file rows, DokuWiki config metadata, plugin settings, changelog rows, subscriptions, ACL rules, users, groups, and group memberships. Plugin enablement records preserve the effective source and layer from `conf/plugins.php`, `conf/plugins.local.php`, and `conf/plugins.required.php` so diagnostics and the Extension Manager replacement can show which file won. Interrupted D1 imports can be rerun with the same generated SQL after fixing the underlying failure.

Local override files for interwiki shortcuts, MIME mappings, link schemes,
entity replacements, smileys, acronyms, and wordblock patterns are folded into
the generated config metadata. Runtime rendering, media validation, fetch
headers, external-link parsing, and save-time wordblock checks read those D1
rows before falling back to bundled defaults.

Page revisions imported from `data/pages` and `data/attic` are correlated with
`data/meta/_dokuwiki.changes` by page ID and revision timestamp. When a matching
changelog row exists, the importer preserves the DokuWiki username, edit
summary, change type, and size delta on the D1 `page_revisions` row.
Filesystem mtimes are normalized to DokuWiki `filemtime()` precision, so current
page and media revision IDs, `updated_at` route timestamps, and changelog
correlation use whole Unix seconds even when the operator filesystem exposes
subsecond mtimes.
Media revisions imported from `data/media` and `data/media_attic` use the same
timestamp correlation against `data/meta/_media.changes` to preserve the
DokuWiki username, upload summary, and media change type on `media_revisions`.
Delete changelog rows for subjects that no longer have a current file are
imported as deleted D1 page/media tombstones with delete revisions, so old
history and recent-change views can still reference those IDs after migration.

DokuWiki `.mlist` subscription files in `data/meta` are imported for users
present in imported authplain records. Page `.mlist` files become page
subscriptions; namespace `.mlist` files become namespace subscriptions.
DokuWiki `every` delivery maps to immediate delivery, while digest/list styles
map to daily digest delivery.

DokuWiki page `.meta` files are also expanded from their raw `current` and
`persistent` payloads into the runtime metadata keys used by the Pages port:
title, description, relation references, date values, and contributors. The
importer derives `backlinks` metadata from imported relation references so
backlink, wanted-page, and orphan-page reports can use upstream parser metadata
immediately after migration.

For current JPEG media, DokuWiki `data/media_meta/*.meta` payloads are converted
into the same `jpeg` metadata row shape written by native media uploads. Media
detail pages and media searches can then use imported titles, captions,
dimensions, author/copyright fields, dates, and keywords directly while the raw
DokuWiki payload remains preserved under the `dokuwiki` metadata key.

Imported DokuWiki config metadata preserves whether a value came from
`conf/dokuwiki.php`, `conf/local.php`, or `conf/local.protected.php`. The
runtime only applies local/protected values for settings that are safe to use
without mutating the Cloudflare deployment, including parser/render controls
such as TOC levels, `camelcase`, `typography`, `useheading`, `autoplural`,
`relnofollow`, and `target.*`.

Legacy `data/index` files are not migrated directly. They are derived cache
artifacts that can be stale, language-dependent, and tied to DokuWiki's PHP
filesystem index layout. The importer rebuilds search postings from canonical
page source during import, which gives the Pages port deterministic D1 search
state. A future importer should read `data/index` only for a production wiki
that requires byte-for-byte legacy ranking parity with an existing, trusted
DokuWiki index; otherwise operators should expect equivalent searchable content
with deterministic term counts and ranking that may differ from an old on-disk
index.

## R2 Media

```sh
npm run import:media-manifest
npm run import:media-upload -- --dry-run
npm run import:media-upload
```

The manifest maps each `data/media` and `data/media_attic` file to the R2 object key stored in D1. The upload script requires either `--remote` or `--local`; the package script targets the remote `dokuwiki-pages-dev-media` bucket.

Media uploads are resumable. Successful uploads are written to `.wrangler/dokuwiki-media-upload-state.json` with object key, source path, byte length, and content hash. Rerunning `npm run import:media-upload` skips matching completed objects and continues with pending media. Use `-- --state <file>` for a custom journal path or `-- --no-resume` to ignore an existing journal while writing a fresh one.

## Hash Manifest

```sh
npm run import:hash-manifest
```

The hash manifest records expected SHA-256 hashes for current pages, attic page
revisions, page/media metadata files, custom language/template files, current
media, and media attic objects. Use it after import to compare D1
`page_revisions.content_hash`, D1 media hash columns, and downloaded R2 object
hashes against the source flat-file hashes.

Verify a completed import:

```sh
npm run import:verify-hashes
npm run import:review
```

Use `-- --skip-r2` when only D1 hashes need to be checked.

## Validation

After importing, run:

```sh
npm run smoke -- --base-url https://dokutest.pages.dev
```

For media-specific checks, fetch representative media paths from rendered pages and compare status, content type, byte length, and body hash against the manifest.

The post-import review command writes `.wrangler/post-import-content-review.md`
from the final hash manifest. Treat it as the human review checklist for
production-only content gaps that starter pages cannot expose: representative
non-starter pages, old revisions, deleted pages, media namespaces, ACL/user
flows, imported custom config, plugin compatibility, search, feeds, sitemap,
and any gaps that must be added back to `CHECKLIST_2.md` or the issue tracker.

The automated importer suite also includes a non-starter wiki fixture that
executes generated SQL against the real migrations and verifies pages, old page
revisions, media revisions, deleted pages, users, ACLs, subscriptions, imported
plugin settings, media metadata, and local configuration rows.
