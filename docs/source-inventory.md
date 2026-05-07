# Source Inventory

Inventory of the current DokuWiki source tree used to scope the port.

## Entry Points

- `doku.php`
- `feed.php`
- `index.php`
- `install.php`
- `lib/exe/ajax.php`
- `lib/exe/css.php`
- `lib/exe/detail.php`
- `lib/exe/fetch.php`
- `lib/exe/indexer.php`
- `lib/exe/jquery.php`
- `lib/exe/js.php`
- `lib/exe/jsonrpc.php`
- `lib/exe/manifest.php`
- `lib/exe/mediamanager.php`
- `lib/exe/openapi.php`
- `lib/exe/opensearch.php`
- `lib/exe/taskrunner.php`
- `lib/exe/xmlrpc.php`

## Core, Plugins, Template, Vendor

- Core modules live under `inc/`.
- Bundled plugins: `acl`, `authad`, `authldap`, `authpdo`, `authplain`, `config`, `extension`, `info`, `logviewer`, `popularity`, `revert`, `safefnrecode`, `styling`, `usermanager`.
- The default template is `lib/tpl/dokuwiki/`.
- Vendor dependencies are under `vendor/`.

## Writable Data Directories

- `data/pages`
- `data/attic`
- `data/media`
- `data/media_attic`
- `data/meta`
- `data/media_meta`
- `data/cache`
- `data/index`
- `data/locks`
- `data/tmp`
- `data/log`

## Config And Scripts

- Config files live under `conf/`.
- Command line scripts live under `bin/`.

## Portability Hazards

- Filesystem reads and writes are central to pages, revisions, media, metadata, cache, index, locks, logs, and config.
- PHP sessions are used for login and transient messages.
- Headers, cookies, output buffering, gzip output, and direct static file streaming are used across request entrypoints.
- File timestamps drive revisions, cache freshness, search freshness, conflict detection, and change feeds.
- chmod, permissions, mkdir locks, touch, rename, unlink, and recursive directory operations assume a POSIX-like local filesystem.
- External commands are available through `io_exec`.
- Remote downloads and email are separate service integrations.
- Image processing and JPEG metadata handling need an R2/Workers-compatible replacement strategy.
- Gzip and bzip attic revisions need import-time decompression.
- Search index files under `data/index` need replacement.
- Plugin and extension hooks must be converted to explicit native extension points.
