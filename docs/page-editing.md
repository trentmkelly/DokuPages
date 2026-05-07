# Page Editing

The first page editing implementation is intentionally small but exercises the real Cloudflare stack.

## Routes

- `GET /wiki/:id?do=edit` renders an HTML edit form.
- `GET /wiki/:id?do=source` returns raw wiki text.
- `POST /api/pages` saves page content.
- `POST /api/pages/preview` returns rendered preview JSON.

## Save Semantics

`POST /api/pages` expects:

- `id`
- `content`
- `summary`
- `baseRevisionId`

The save path:

- cleans the page ID
- reads the current revision from D1
- checks `baseRevisionId` against the current revision ID
- returns HTTP 409 on conflicts
- creates a page when no current revision exists
- edits a page when content is non-empty
- deletes a page when content is empty
- records immutable page revisions
- appends changelog rows
- purges page-related KV cache keys
- redirects back to the page with HTTP 303

## Verified Against Production

The deployed `dokutest.pages.dev` project was smoke tested against remote D1:

- edit form for `wiki:welcome`
- source view for `wiki:welcome`
- preview endpoint
- create `codex:smoke`
- stale revision conflict
- delete `codex:smoke`
- changelog rows for create and delete
