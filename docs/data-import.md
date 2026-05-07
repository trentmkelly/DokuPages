# Data Import

The importer reads a flat-file DokuWiki tree and emits D1 SQL plus an R2 media manifest. It preserves current page bodies, search postings, current media rows, media revision rows, parsed page/media `.meta` data, ACL rules, authplain users/groups, and page/media changelog rows.

## Dry Run

```sh
npm run import:dry-run
```

The dry run prints the import plan and counts discovered pages, page revisions, media, media revisions, metadata, ACL rules, users, config values, plugin settings, interwiki templates, MIME mappings, and wordblock patterns.

## D1 SQL

```sh
npm run import:sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/dokuwiki-import.sql
```

The generated SQL is idempotent for imported pages, search postings, current media metadata, media revisions, metadata rows, changelog rows, ACL rules, users, groups, and group memberships.

## R2 Media

```sh
npm run import:media-manifest
npm run import:media-upload -- --dry-run
npm run import:media-upload
```

The manifest maps each `data/media` and `data/media_attic` file to the R2 object key stored in D1. The upload script requires either `--remote` or `--local`; the package script targets the remote `dokuwiki-pages-dev-media` bucket.

## Validation

After importing, run:

```sh
npm run smoke -- --base-url https://dokutest.pages.dev
```

For media-specific checks, fetch representative media paths from rendered pages and compare status, content type, byte length, and body hash against the manifest.
