# Media

Media storage uses D1 for metadata and R2 for object bodies.

## Routes

- `GET /media/:id` streams the current media object from R2.
- `GET /media/:id?rev=:revisionId` streams an immutable media revision from R2.
- `GET /media-detail/:id` renders metadata and image previews.
- `GET /media-manager?ns=:namespace&q=:query` browses or searches media in a namespace, renders a DokuWiki-style namespace/sidebar browser, supports thumbnail or row display through `view=thumbs|rows`, supports `sort=name|date` with `order=asc|desc`, and includes the upload form.
- `POST /api/media/upload` uploads a media object.
- `POST /api/media/delete` marks the current media object deleted.
- `POST /api/media/revert` restores an old media revision as current.

## MIME And Download Semantics

Media fetches resolve the file extension against the imported
`config/mime:<extension>` metadata written from `conf/mime.conf` and
`conf/mime.local.conf`, falling back to the bundled DokuWiki default MIME table.
Entries whose MIME type was prefixed with `!` force
`Content-Disposition: attachment`; unknown extensions are also forced to
download, matching DokuWiki's `lib/exe/fetch.php` behavior when `mimetype()`
cannot resolve an extension. Explicit `download=1` or legacy `dl=1` query
parameters still force attachment for otherwise inline media.

## Upload Semantics

The media manager keeps the upstream popup/full-screen hook structure used by
`lib/exe/mediamanager.php` and `lib/scripts/media.js`: `mediamgr__aside`,
`mediamgr__content`, `media__tree`, `media__content`, `mediamanager__page`,
`dw__mediasearch`, `dw__upload`, `upload__file`, and `upload__name`. The
frontend script handles namespace-tree toggles, suggests the upload media ID
from the selected file and namespace, reports XMLHttpRequest upload progress,
and posts a `dokuwiki-media-select` message to opener or parent frames when a
media link with `class="select"` is chosen.

`POST /api/media/upload` expects:

- `file`
- `ns` for the target namespace
- `id` when the media ID should differ from the uploaded filename
- `summary`
- `overwrite=1` to replace an existing current media object
- `sectok` matching the CSRF cookie

The upload path writes the R2 object first, then stores current media metadata, an immutable `media_revisions` row, changelog row, and technical metadata rows in D1. If the D1 write fails after the object write, the newly written R2 object is deleted.

JPEG uploads are parsed in the Worker for the default DokuWiki
`conf/mediameta.php` field set. The parser reads SOF dimensions, EXIF TIFF
fields, IPTC APP13 records, and common XMP fields, then stores a `jpeg`
metadata row with display fields for title, date, filename, caption,
photographer, copyright, format, file size, dimensions, camera, and keywords.
`GET /media-detail/:id` renders those fields in the media detail panel. Imported
DokuWiki `data/media_meta/*.meta` rows stored under the `dokuwiki` metadata key
are adapted to the same display fields when a native `jpeg` row is not present.

Uploads are validated before R2 writes. The native validator enforces a 25 MiB body limit, allows the conservative built-in safe set plus extensions enabled through imported DokuWiki MIME configuration, checks non-generic browser MIME types against the configured extension MIME type, and rejects SVG content containing scripts, event handlers, doctypes, entities, foreign objects, or `javascript:` links.

Authorized upload submissions are rate limited in KV by client IP and actor. Twenty attempts in a 15 minute window block additional attempts for that pair and return `429` with `Retry-After: 900`.

When `MEDIAREVISIONS=0`, overwriting an existing media object requires delete
permission instead of upload permission, matching upstream DokuWiki. Upload and
delete writes still update current media metadata and changelog rows, but they
do not append new `media_revisions` rows; media history, old revision fetches,
media diff, and revert actions are disabled at the route layer.

## Rollback Semantics

Page saves, page deletes, media deletes, media reverts, search index updates, and metadata updates use D1 batches so partial SQL writes roll back together. Media uploads are the only request path that writes outside D1: the R2 object is written first, and the upload service deletes that new object if the following D1 batch fails. Existing media revision objects are immutable and are not removed during delete or revert operations.

## R2 Import Workflow

The DokuWiki importer now emits both D1 SQL and an R2 object manifest. The SQL includes current media rows and immutable `media_revisions` rows for files found under `data/media` and `data/media_attic`.

```sh
npm run import:sql
npm run import:media-manifest
npm run import:media-upload
```

`import:media-upload` reads `.wrangler/dokuwiki-media-manifest.json` and uploads each listed file to `dokuwiki-pages-dev-media` with the detected content type. Use `node scripts/upload-r2-media.mjs --manifest <path> --bucket <bucket> --remote --dry-run` to review the generated Wrangler commands before running a live import.

The upload script writes `.wrangler/dokuwiki-media-upload-state.json` after each successful object upload. If the import is interrupted, rerun the same command and already completed objects with matching key, path, byte length, and hash are skipped. Use `--state <file>` for a different journal path or `--no-resume` to force a fresh pass.

## Delete Semantics

`POST /api/media/delete` expects `id` and optional `summary`. Deletion marks the current `media` row deleted, creates a `delete` media revision, appends a media changelog row, and records deletion metadata. R2 objects are kept so immutable old revisions remain fetchable.

DokuWiki-style `refcheck` is enabled by default through `REFCHECK=1`. Before a
delete is written, the service reads page relation metadata and blocks deletion
with `409 Conflict` when a non-deleted page still references the media ID. Set
`REFCHECK=0` only when intentionally allowing deletion of media that is still
mentioned by existing pages.

## Revert Semantics

`POST /api/media/revert` expects `id`, `revisionId`, and optional `summary`. Revert points the current media row back at the selected immutable R2 object, creates a new `revert` media revision, appends a media changelog row, and records the source revision ID in metadata. Delete revisions cannot be restored directly.

## Detail And History UI

`GET /media-detail/:id` renders a DokuWiki-shaped detail page using the default
template structure from `lib/tpl/dokuwiki/detail.php`: `dokuwiki__detail`,
`img_detail`, detail tabs, media metadata, relation references, and the media
ACL warning. When media revisions are enabled, the page also renders a
`page__revisions` history form with revision checkboxes, diff links, summaries,
file sizes, and current-revision markers modelled after
`inc/Ui/MediaRevisions.php`.

## Cleanup Semantics

`GET /admin/media-cleanup?scan=1` scans R2 objects under `media/` and compares
them with distinct object keys referenced by D1 `media` and `media_revisions`
rows. The scan ignores backup and non-media prefixes.

`POST /api/admin/media/cleanup` requires an admin session, CSRF token, and
`confirm=delete`. It recalculates the scan server-side and deletes only
unreferenced R2 objects. Current media bodies and immutable media revision bodies
are preserved as long as D1 references their object keys. Each deletion run is
recorded in `audit_log` with scanned, referenced, unreferenced, and deleted
counts plus a bounded sample of deleted keys.

## Search Semantics

Media manager search is namespace-scoped. The `q` parameter matches active media IDs and MIME types in D1 and excludes deleted media rows.

## Delivery Semantics

Media fetches support `GET` and `HEAD`. Current media responses use a one-hour
shared cache lifetime; immutable revision responses use a one-year immutable
cache lifetime. Both current and revision fetches include strong ETags derived
from the imported or uploaded content hash.

Conditional requests are resolved from D1 media metadata before opening the R2
object body. Matching `If-None-Match` or `If-Modified-Since` requests return
`304 Not Modified` with zero R2 operations. `HEAD` requests verify the R2 object
with `head` and return metadata without streaming the object body.

Requests with positive `w` or `h` parameters are treated as DokuWiki resized
media requests and must include a valid six-character `tok` value. The token is
the upstream `media_get_token()` HMAC-MD5 signature over the cleaned media ID and
requested dimensions, using the `DOKUWIKI_COOKIE_SALT` Pages secret. Missing or
invalid tokens fail with `412 Precondition Failed`, matching
`lib/exe/fetch.php` anti-hotlink behavior. Legacy `lib/exe/fetch.php` redirects
preserve `w`, `h`, `tok`, and `cache` parameters. `cache=nocache` disables
client caching and bypasses conditional `304 Not Modified` responses for that
request, matching DokuWiki's explicit cache-busting path.

## Derivative Strategy

The Pages port generates DokuWiki-style resized media inside Workers with
`@cf-wasm/photon`, a WASM image pipeline. PNG, JPEG, and WebP requests with a
valid `w` or `h` token are resized server-side; requests with both dimensions
use a center crop, matching DokuWiki's `media_crop_image()` path. Requested
dimensions above DokuWiki's 2000 pixel guardrail return the original object.

SVG and unsupported image formats are served as originals because upstream
`lib/exe/fetch.php` also skips SVG modification. Responses include
`x-dokuwiki-thumbnail-policy`, `x-dokuwiki-resize-policy`, and
`x-dokuwiki-exif-policy` headers so generated, unsupported, failed, and original
paths remain observable. JPEG EXIF/IPTC metadata parsing happens during upload
and is rendered from D1 metadata on detail pages, rather than during every fetch.
