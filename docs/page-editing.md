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
- `POST /api/pages/lock` refreshes the current edit lock.
- `POST /api/pages/lock/release` releases the current edit lock.
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
- returns HTTP 409 with a DokuWiki-style conflict form and submitted/current diff on conflicts
- applies the page edit rate limit before saving
- creates a page when no current revision exists
- edits a page when content is non-empty
- deletes a page when content is empty
- reverts a page by copying an old revision into a new `revert` revision
- recovers existing anonymous drafts into the edit form
- deletes anonymous drafts after successful saves
- releases the edit lock after successful saves
- records immutable page revisions
- appends changelog rows
- updates search postings
- purges page-related KV cache keys
- redirects back to the page with HTTP 303

Authorized page save and revert submissions are rate limited in KV by client IP and actor. Thirty attempts in a 15 minute window block additional attempts for that pair and return `429` with `Retry-After: 900`.

## Edit Locks

`GET /wiki/:id?do=edit` acquires a 15-minute Durable Object-backed page lock and stores the token in a hidden form field plus an HTTP-only page lock cookie. A second editor receives HTTP 423 until the lock is released or expires. Autosave refreshes the lock with `POST /api/pages/lock`, and successful saves or draft deletion release it. The edit form also carries the CSRF `sectok` used for saves, drafts, and lock refresh/release calls.

## Section Edit Anchors

Rendered headings include DokuWiki-style section edit anchors when the renderer has a page ID. The links target the page editor with `section=N` so templates have stable section affordances while section-scoped save behavior is implemented separately.

## Page Templates

Missing-page edits look for DokuWiki page templates before rendering the editor. The resolver checks the current namespace `_template` page first, then inherited `__template` pages from the current namespace toward the root. Supported substitutions match upstream DokuWiki: `@ID@`, `@NS@`, `@CURNS@`, `@!CURNS@`, `@!!CURNS@`, `@!CURNS!@`, `@FILE@`, `@!FILE@`, `@!FILE!@`, `@PAGE@`, `@!PAGE@`, `@!!PAGE@`, `@!PAGE!@`, `@USER@`, `@NAME@`, `@MAIL@`, and `@DATE@`, plus DokuWiki-style `%` date tokens in the resulting template text.

## Verified Against Production

The deployed `dokutest.pages.dev` project was smoke tested against remote D1:

- edit form for `wiki:welcome`
- source view for `wiki:welcome`
- preview endpoint
- create `codex:smoke`
- stale revision conflict
- delete `codex:smoke`
- changelog rows for create and delete
