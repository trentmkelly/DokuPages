# Product Scope

## Target Deployment Model

The target is Cloudflare Pages static assets plus Pages Functions. Static files live in `public/`; dynamic wiki behavior lives in `functions/` and shared TypeScript modules under `src/`.

## Feature Strategy

The long-term goal is a Pages-native implementation that preserves DokuWiki content semantics and operational workflows. The first viable release is narrower:

- page view and edit
- page revisions and diffs
- media fetch and upload
- authplain-compatible users
- ACL checks
- search
- import from the current `data/` and `conf/` trees

## Compatibility Decisions

- Existing DokuWiki URLs must remain stable where they identify pages, media, revisions, feeds, or search.
- Existing DokuWiki page IDs, media IDs, and namespace syntax are compatibility requirements for migration and redirects.
- Plugin compatibility is not PHP runtime compatibility. Supported bundled plugin behavior will be reimplemented as native modules; arbitrary PHP plugin execution is out of scope for launch.
- Admin UI compatibility is behavioral, not byte-for-byte HTML compatibility.
- XML-RPC and JSON-RPC compatibility are post-MVP unless current users depend on them before launch.
- The first deployment target is `pages.dev`; custom domains remain a deployment configuration task.

## Out Of Scope For First Release

- Running PHP plugins directly.
- Running DokuWiki's installer in production.
- LDAP, Active Directory, and PDO auth backends.
- ImageMagick-style server-side image conversion.
- Extension manager installs from the production UI.

## Success Criteria

- Imported pages render with compatible links, headings, lists, tables, code blocks, media references, and ACL behavior.
- Authenticated users can edit pages without lost updates.
- Media files are served from Cloudflare storage with correct access checks.
- Search returns ACL-filtered results.
- A full import can be rerun idempotently.
- The project deploys through Cloudflare Pages with repeatable tests.

## Rollback Criteria

Rollback means routing traffic back to the source DokuWiki deployment or a previous Pages deployment if production smoke tests fail, ACL checks are incorrect, imports are incomplete, or data writes cannot be trusted.

## Ownership

Launch and maintenance ownership remains with the repository owner until a separate production runbook delegates operational responsibilities.
