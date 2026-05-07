# Media

Media storage uses D1 for metadata and R2 for object bodies.

## Routes

- `GET /media/:id` streams the current media object from R2.
- `GET /media/:id?rev=:revisionId` streams an immutable media revision from R2.
- `GET /media-detail/:id` renders metadata and image previews.
- `GET /media-manager?ns=:namespace&q=:query` browses or searches media in a namespace and renders an upload form.
- `POST /api/media/upload` uploads a media object.
- `POST /api/media/delete` marks the current media object deleted.
- `POST /api/media/revert` restores an old media revision as current.

## Upload Semantics

`POST /api/media/upload` expects:

- `file`
- `ns` for the target namespace
- `id` when the media ID should differ from the uploaded filename
- `summary`
- `overwrite=1` to replace an existing current media object
- `sectok` matching the CSRF cookie

The upload path writes the R2 object first, then stores current media metadata, an immutable `media_revisions` row, changelog row, and technical metadata rows in D1. If the D1 write fails after the object write, the newly written R2 object is deleted.

Uploads are validated before R2 writes. The native validator enforces a 25 MiB body limit, allows only a conservative extension set, checks non-generic MIME types against the file extension, and rejects SVG content containing scripts, event handlers, doctypes, entities, foreign objects, or `javascript:` links.

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

## Delete Semantics

`POST /api/media/delete` expects `id` and optional `summary`. Deletion marks the current `media` row deleted, creates a `delete` media revision, appends a media changelog row, and records deletion metadata. R2 objects are kept so immutable old revisions remain fetchable.

## Revert Semantics

`POST /api/media/revert` expects `id`, `revisionId`, and optional `summary`. Revert points the current media row back at the selected immutable R2 object, creates a new `revert` media revision, appends a media changelog row, and records the source revision ID in metadata. Delete revisions cannot be restored directly.

## Search Semantics

Media manager search is namespace-scoped. The `q` parameter matches active media IDs and MIME types in D1 and excludes deleted media rows.

## Derivative Strategy

The Pages port does not generate thumbnail or resized image files inside Workers. Media fetches return the original R2 object and include `x-dokuwiki-thumbnail-policy`, `x-dokuwiki-resize-policy`, and `x-dokuwiki-exif-policy` headers documenting the replacement strategy. Image previews use browser-constrained originals with lazy decoding. JPEG EXIF metadata is not parsed in the request path.
