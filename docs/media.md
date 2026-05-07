# Media

Media storage uses D1 for metadata and R2 for object bodies.

## Routes

- `GET /media/:id` streams the current media object from R2.
- `GET /media/:id?rev=:revisionId` streams an immutable media revision from R2.
- `GET /media-detail/:id` renders metadata and image previews.
- `GET /media-manager?ns=:namespace` browses media in a namespace and renders an upload form.
- `POST /api/media/upload` uploads a media object.
- `POST /api/media/delete` marks the current media object deleted.

## Upload Semantics

`POST /api/media/upload` expects:

- `file`
- `ns` for the target namespace
- `id` when the media ID should differ from the uploaded filename
- `summary`
- `overwrite=1` to replace an existing current media object

The upload path writes the R2 object first, then stores current media metadata, an immutable `media_revisions` row, changelog row, and technical metadata rows in D1. If the D1 write fails after the object write, the newly written R2 object is deleted.

## Delete Semantics

`POST /api/media/delete` expects `id` and optional `summary`. Deletion marks the current `media` row deleted, creates a `delete` media revision, appends a media changelog row, and records deletion metadata. R2 objects are kept so immutable old revisions remain fetchable.
