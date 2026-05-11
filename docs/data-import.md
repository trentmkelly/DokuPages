# Data Import

The importer reads a flat-file DokuWiki tree and emits D1 SQL plus an R2 media manifest. It preserves current page bodies, search postings, current media rows, media revision rows, parsed page/media `.meta` data, custom language files, custom template files, ACL rules, authplain users/groups, and page/media changelog rows. It intentionally does not import `data/log` PHP runtime log files; Cloudflare Logs are the Pages runtime source for request and error events, and D1 `audit_log` rows cover native admin actions.

## Dry Run

```sh
npm run import:dry-run
```

The dry run prints the import plan and counts discovered pages, page revisions,
media, media revisions, metadata, custom language files, custom template files,
ACL rules, users, config values, plugin settings, interwiki templates, MIME
mappings, scheme protocols, and wordblock patterns.

The importer reads `fnencode` from the source wiki's DokuWiki configuration
before walking `data/pages`, `data/attic`, `data/media`, `data/media_attic`, and
metadata trees. URL-encoded, SafeFN-encoded, and UTF-8 file names are decoded
back to DokuWiki page/media IDs during import.

Older SafeFN source trees may still use DokuWiki's pre-2012 `.` post-indicator
inside encoded media and metadata names. Run `npm run safefn:recode` for a dry
run, then `npm run safefn:recode -- --write` to rename the source tree before
generating import SQL and media manifests.

## D1 SQL

```sh
npm run import:sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/dokuwiki-import.sql
```

The generated SQL is idempotent for imported pages, search postings, current media metadata, media revisions, metadata rows, custom language/template file rows, DokuWiki config metadata, plugin settings, changelog rows, ACL rules, users, groups, and group memberships. Interrupted D1 imports can be rerun with the same generated SQL after fixing the underlying failure.

Legacy `data/index` files are not migrated directly. The importer rebuilds
search postings from canonical page source during import, which avoids carrying
over PHP filesystem index formats and gives the Pages port deterministic D1
search state.

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
```

Use `-- --skip-r2` when only D1 hashes need to be checked.

## Validation

After importing, run:

```sh
npm run smoke -- --base-url https://dokutest.pages.dev
```

For media-specific checks, fetch representative media paths from rendered pages and compare status, content type, byte length, and body hash against the manifest.
