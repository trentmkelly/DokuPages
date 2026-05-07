# Page Editing

The first page editing implementation is intentionally small but exercises the real Cloudflare stack.

## Routes

- `GET /wiki/:id?do=edit` renders an HTML edit form.
- `GET /wiki/:id?do=draft` shows an anonymous draft when one exists.
- `GET /wiki/:id?do=source` returns raw wiki text.
- `GET /wiki/:id?do=revert&rev=:revisionId` renders a revert confirmation form.
- `POST /api/pages` saves page content.
- `POST /api/pages/draft` stores the current edit form as an anonymous draft.
- `POST /api/pages/draft/delete` deletes the anonymous draft.
- `POST /api/pages/revert` restores an old revision through the save path.
- `POST /api/pages/preview` returns rendered preview JSON.

## Save Semantics

`POST /api/pages` expects:

- `id`
- `content`
- `summary`
- `baseRevisionId`
- `minor` for existing-page edits that should be recorded as minor changes

The save path:

- cleans the page ID
- reads the current revision from D1
- checks `baseRevisionId` against the current revision ID
- returns HTTP 409 on conflicts
- creates a page when no current revision exists
- edits a page when content is non-empty
- deletes a page when content is empty
- reverts a page by copying an old revision into a new `revert` revision
- recovers existing anonymous drafts into the edit form
- deletes anonymous drafts after successful saves
- records immutable page revisions
- appends changelog rows
- updates search postings
- purges page-related KV cache keys
- redirects back to the page with HTTP 303

## Section Edit Anchors

Rendered headings include DokuWiki-style section edit anchors when the renderer has a page ID. The links target the page editor with `section=N` so templates have stable section affordances while section-scoped save behavior is implemented separately.

## Verified Against Production

The deployed `dokutest.pages.dev` project was smoke tested against remote D1:

- edit form for `wiki:welcome`
- source view for `wiki:welcome`
- preview endpoint
- create `codex:smoke`
- stale revision conflict
- delete `codex:smoke`
- changelog rows for create and delete
