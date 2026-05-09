# Remote APIs

Legacy DokuWiki XML-RPC, JSON-RPC, and OpenAPI compatibility is not required for
the first Pages launch. The native port keeps those legacy entrypoints explicit
so clients receive a stable `501 Not Implemented` response instead of an
ambiguous 404.

- `/lib/exe/xmlrpc.php`: `501`
- `/lib/exe/jsonrpc.php`: `501`
- `/lib/exe/openapi.php`: `501`

The supported remote API surface is the native JSON API under `/api/v1`.

## Authentication

Read API requests require either an authenticated DokuWiki session cookie, a
DokuWiki-compatible auth token, or the deployment bearer token. Write API
requests require an `Authorization: Bearer ...` token or `X-DokuWiki-Token`;
they deliberately do not accept cookie-only auth, which keeps cross-site request
forgery protections on the browser UI separate from automation access.

Users can create or rotate a DokuWiki-compatible auth token from `/profile`.
Those tokens are signed with `DOKUWIKI_COOKIE_SALT`, stored for revocation in D1
metadata, and accepted in either header shape used by upstream DokuWiki:

```http
Authorization: Bearer <user-token>
X-DokuWiki-Token: <user-token>
```

For deployment-wide automation, configure the bearer token as a Cloudflare
secret:

```sh
wrangler pages secret put API_BEARER_TOKEN --project-name dokutest
```

Use it as:

```http
Authorization: Bearer <token>
```

## CORS

Cross-origin API access is denied unless the request origin is listed in
`API_CORS_ORIGINS`. Use a comma-separated list of exact origins, or `*` only for
public bearer-token-only integrations.

Preflight responses support `GET`, `POST`, `DELETE`, and `OPTIONS` with
`authorization` and `content-type` request headers.

## Methods

- `GET /api/v1`: endpoint index.
- `GET /api/v1/pages?id=<page>`: current page content and metadata.
- `POST /api/v1/pages`: create or edit page content with JSON `id`,
  `content`, optional `summary`, optional `baseRevisionId`, and optional
  `minor`.
- `GET /api/v1/pages/revisions?id=<page>`: page revision list.
- `GET /api/v1/revisions?id=<revision>`: page revision content and metadata.
- `POST /api/v1/pages/revert`: revert a page with JSON `id`, `revisionId`,
  optional `summary`, and optional `baseRevisionId`.
- `GET /api/v1/media?id=<media>`: current media metadata and URLs.
- `POST /api/v1/media`: multipart media upload with `file`, optional `ns`,
  optional `id`, optional `summary`, and optional `overwrite`.
- `DELETE /api/v1/media?id=<media>`: delete current media. Optional JSON body
  may include `summary`.
- `GET /api/v1/media/revisions?id=<media>`: media revision list.
- `POST /api/v1/media/revert`: revert media with JSON `id`, `revisionId`, and
  optional `summary`.
- `GET /api/v1/search?q=<query>&ns=<namespace>`: ACL-filtered page search.
- `GET /api/v1/users/me`: authenticated API principal information.

All page and media methods use the same DokuWiki ID normalization, ACL checks,
wordblock checks, rate limits, changelog writes, and cache purge behavior as the
browser UI routes.
