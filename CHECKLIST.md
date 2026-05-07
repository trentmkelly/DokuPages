# DokuWiki to Cloudflare Pages Checklist

This checklist tracks the full migration from the current PHP and flat-file DokuWiki codebase to a deployment that works on Cloudflare Pages with Pages Functions.

## Project Definition

- [x] Confirm the target deployment model: Cloudflare Pages static assets plus Pages Functions.
- [x] Confirm whether the goal is full DokuWiki feature parity or a compatible Pages-native implementation of the current site needs.
- [x] Define the minimum viable launch feature set.
- [x] Define the long-term feature parity target.
- [x] List features that are explicitly out of scope for the first release.
- [x] Decide whether existing DokuWiki URLs must remain stable.
- [x] Decide whether existing DokuWiki page IDs, media IDs, and namespace syntax must remain byte-for-byte compatible.
- [x] Decide whether plugin compatibility is required, partially required, or replaced by a new extension model.
- [x] Decide whether admin UI compatibility is required.
- [x] Decide whether DokuWiki remote APIs must be preserved.
- [x] Decide whether pages.dev is the only deployment target or whether custom domains are in scope.
- [x] Define production success criteria.
- [x] Define rollback criteria.
- [x] Define launch ownership and maintenance ownership.

## Cloudflare Platform Baseline

- [x] Confirm current Cloudflare Pages Functions runtime capabilities.
- [x] Confirm current Workers runtime limits for bundle size, CPU time, memory, request body size, response size, and subrequests.
- [x] Confirm current Pages limits for project size, file count, build output, and deployments.
- [x] Confirm available Cloudflare bindings for Pages Functions.
- [x] Confirm whether D1 is appropriate for relational wiki data.
- [x] Confirm whether R2 is appropriate for media files, old media revisions, and exported archives.
- [x] Confirm whether KV is appropriate for rendered page cache, config snapshots, or lightweight lookup data.
- [x] Confirm whether Durable Objects are needed for page edit locks, write serialization, or session coordination.
- [x] Confirm whether the Cache API is suitable for public rendered pages and static derived assets.
- [x] Confirm whether Cloudflare Access, Turnstile, or another Cloudflare service should be used for auth or anti-abuse.
- [x] Confirm local development workflow with Wrangler and Pages Functions.
- [x] Confirm preview deployment workflow.
- [x] Confirm production deployment workflow.
- [x] Confirm environment variable and secret management.
- [x] Confirm database migration workflow for D1.
- [ ] Confirm R2 bucket creation and lifecycle policy workflow.

## Repository Orientation

- [x] Inventory all PHP entrypoints: `doku.php`, `feed.php`, `index.php`, `install.php`, and files under `lib/exe/`.
- [x] Inventory all DokuWiki core modules under `inc/`.
- [x] Inventory bundled plugins under `lib/plugins/`.
- [x] Inventory the default template under `lib/tpl/dokuwiki/`.
- [x] Inventory static assets under `lib/`, `conf/`, and `data/media/`.
- [x] Inventory vendor dependencies under `vendor/`.
- [x] Inventory writable data directories under `data/`.
- [x] Inventory configuration files under `conf/`.
- [x] Inventory command line scripts under `bin/`.
- [ ] Identify all PHP filesystem read paths.
- [ ] Identify all PHP filesystem write paths.
- [ ] Identify all PHP functions that cannot run directly in Workers.
- [ ] Identify all code paths that depend on PHP sessions.
- [ ] Identify all code paths that depend on headers, cookies, and output buffering.
- [ ] Identify all code paths that depend on file modification times.
- [ ] Identify all code paths that depend on file permissions or chmod.
- [ ] Identify all code paths that depend on local locks.
- [ ] Identify all code paths that shell out to external commands.
- [ ] Identify all code paths that download remote content.
- [ ] Identify all code paths that send email.
- [ ] Identify all image processing paths.
- [ ] Identify all gzip and bzip revision storage paths.
- [x] Identify all search index paths.
- [x] Identify all cache invalidation paths.
- [ ] Identify all extension and plugin hook points.

## Architecture Decision

- [x] Decide final implementation language for Pages Functions.
- [x] Decide whether to port core behavior to TypeScript, run a PHP runtime in Wasm, or split static export plus native editing services.
- [x] Document why the selected runtime strategy is viable on Pages.
- [x] Define the new request routing model.
- [x] Define the new data access layer.
- [x] Define the new storage schema.
- [x] Define the new cache model.
- [x] Define the new auth and session model.
- [x] Define the new lock and conflict model.
- [x] Define the new plugin or extension model.
- [x] Define the new admin model.
- [x] Define the new build and deployment model.
- [x] Define the new observability model.
- [x] Define the migration and rollback model.
- [x] Review architecture against Cloudflare limits.
- [x] Review architecture against existing DokuWiki behavior.

## Project Scaffold

- [x] Create the Pages application scaffold.
- [x] Add Wrangler configuration.
- [x] Add Pages Functions routing.
- [x] Add local dev scripts.
- [x] Add preview deployment scripts.
- [x] Add production deployment scripts.
- [x] Add type checking.
- [x] Add linting.
- [x] Add formatting.
- [x] Add unit test framework.
- [ ] Add integration test framework.
- [ ] Add end-to-end test framework.
- [x] Add CI workflow.
- [x] Add environment configuration templates.
- [x] Add D1 migration directory.
- [ ] Add R2 bucket binding configuration.
- [x] Add KV namespace binding configuration if used.
- [ ] Add Durable Object binding configuration if used.
- [ ] Add local seed data for development.
- [x] Add local fixture data migrated from current `data/`.

## Data Model

- [x] Design page table or storage objects.
- [x] Design page revision table or storage objects.
- [x] Design namespace representation.
- [x] Design media table or storage objects.
- [x] Design media revision table or storage objects.
- [x] Design metadata table or storage objects.
- [x] Design changelog table.
- [x] Design media changelog table.
- [x] Design ACL table.
- [x] Design user table.
- [x] Design group table.
- [x] Design user-group membership table.
- [x] Design session or token table if needed.
- [x] Design lock table or Durable Object state.
- [x] Design draft table.
- [x] Design subscription table.
- [x] Design search index tables or external index integration.
- [x] Design rendered cache keys.
- [x] Design config storage.
- [x] Design plugin setting storage.
- [x] Design audit log storage.
- [x] Design import job tracking.
- [x] Design schema version tracking.
- [x] Define how timestamps replace `filemtime`.
- [x] Define how content hashes are calculated.
- [x] Define how old compressed revisions are represented.
- [x] Define how deleted pages are represented.
- [x] Define how deleted media files are represented.
- [x] Define how large media uploads are handled.
- [x] Define how attachment MIME metadata is stored.

## Data Access Layer

- [x] Implement a storage interface for pages.
- [x] Implement a storage interface for page revisions.
- [x] Implement a storage interface for media.
- [x] Implement a storage interface for media revisions.
- [x] Implement a storage interface for metadata.
- [x] Implement a storage interface for changelogs.
- [x] Implement a storage interface for ACLs.
- [x] Implement a storage interface for users and groups.
- [x] Implement a storage interface for drafts.
- [x] Implement a storage interface for locks.
- [x] Implement a storage interface for rendered cache.
- [x] Implement a storage interface for search.
- [ ] Implement D1-backed adapters.
- [ ] Implement R2-backed adapters.
- [x] Implement KV-backed adapters if used.
- [ ] Implement Durable Object-backed locking if used.
- [x] Implement transactional page save behavior.
- [x] Implement optimistic concurrency checks.
- [ ] Implement rollback behavior for partially failed writes.
- [ ] Implement pagination helpers for large namespaces, revisions, logs, and media lists.
- [ ] Implement storage error mapping.
- [ ] Implement storage performance tests.

## Request Routing

- [x] Implement route handling for page views.
- [x] Implement route handling for edit pages.
- [x] Implement route handling for saves.
- [x] Implement route handling for preview.
- [x] Implement route handling for revisions.
- [x] Implement route handling for diffs.
- [x] Implement route handling for backlinks.
- [x] Implement route handling for search.
- [x] Implement route handling for namespace index.
- [x] Implement route handling for recent changes.
- [x] Implement route handling for media fetches.
- [x] Implement route handling for media details.
- [x] Implement route handling for media manager.
- [ ] Implement route handling for uploads.
- [x] Implement route handling for feeds.
- [x] Implement route handling for sitemap.
- [x] Implement route handling for manifest and opensearch.
- [x] Implement route handling for CSS and JavaScript assets.
- [ ] Implement route handling for AJAX endpoints.
- [ ] Implement route handling for login and logout.
- [ ] Implement route handling for registration if supported.
- [ ] Implement route handling for profile updates if supported.
- [ ] Implement route handling for admin pages.
- [ ] Implement route handling for remote APIs if supported.
- [x] Implement 404 behavior compatible with DokuWiki settings.
- [x] Implement redirects compatible with DokuWiki actions.
- [ ] Implement canonical URL behavior.
- [x] Implement pretty URL support.
- [x] Implement compatibility for query parameter based DokuWiki URLs.

## DokuWiki Syntax Parser

- [ ] Inventory DokuWiki syntax features used by current content.
- [x] Decide whether to port DokuWiki's parser or implement a compatible parser.
- [x] Implement headings.
- [x] Implement paragraphs and line breaks.
- [x] Implement bold, italic, underline, monospace, subscript, superscript, and deleted text.
- [x] Implement internal links.
- [x] Implement namespace-relative links.
- [x] Implement media links.
- [x] Implement media sizing, alignment, and link options.
- [x] Implement external links.
- [x] Implement interwiki links.
- [x] Implement Windows share links if supported.
- [x] Implement email links and mailguard behavior.
- [x] Implement lists.
- [x] Implement tables.
- [x] Implement code blocks.
- [x] Implement file blocks.
- [x] Implement nowiki blocks.
- [x] Implement quotes.
- [x] Implement footnotes.
- [x] Implement acronym replacement.
- [x] Implement entity replacement.
- [x] Implement smileys.
- [x] Implement typography replacements.
- [x] Implement table of contents extraction.
- [x] Implement control macros.
- [ ] Implement section edit anchors.
- [x] Implement metadata extraction.
- [ ] Implement instruction caching or equivalent.
- [ ] Implement renderer output compatible with current templates.
- [x] Add parser conformance fixtures from existing pages.
- [x] Add parser tests for each supported syntax mode.
- [ ] Add parser tests for invalid and edge-case markup.

## Page Behavior

- [x] Implement page ID cleaning.
- [x] Implement namespace resolution.
- [x] Implement start page resolution.
- [x] Implement page existence checks.
- [x] Implement raw page reads.
- [x] Implement page creation.
- [x] Implement page edits.
- [x] Implement page deletion through empty content.
- [x] Implement page revert.
- [x] Implement edit summaries.
- [x] Implement minor edits.
- [x] Implement conflict detection.
- [ ] Implement edit locks.
- [x] Implement draft autosave.
- [x] Implement draft recovery.
- [ ] Implement page templates.
- [x] Implement breadcrumbs.
- [x] Implement "you are here" navigation if supported.
- [x] Implement backlinks.
- [x] Implement orphan pages if supported.
- [x] Implement wanted pages if supported.
- [x] Implement recent changes.
- [x] Implement old revisions.
- [x] Implement page diff.
- [x] Implement source view.
- [x] Implement export modes that remain in scope.
- [x] Implement page metadata updates.
- [x] Implement changelog updates.
- [x] Implement purge behavior.
- [x] Implement cache invalidation after save.

## Media Behavior

- [x] Implement media ID cleaning.
- [x] Implement media namespace resolution.
- [x] Implement media MIME detection.
- [ ] Implement media ACL checks.
- [ ] Implement media upload.
- [ ] Implement media overwrite rules.
- [ ] Implement media deletion.
- [ ] Implement media revisions.
- [ ] Implement media revert.
- [ ] Implement media changelog.
- [ ] Implement media metadata.
- [x] Implement media detail pages.
- [x] Implement media manager browsing.
- [ ] Implement media search.
- [ ] Implement thumbnail generation or a replacement strategy.
- [ ] Implement image resizing or a replacement strategy.
- [ ] Implement EXIF/JPEG metadata behavior if supported.
- [x] Implement download headers.
- [x] Implement cache headers for immutable media revisions.
- [x] Implement cache headers for current media files.
- [ ] Implement large upload limits and validation.
- [ ] Implement SVG safety checks.
- [ ] Implement upload content safety checks.

## Authentication

- [ ] Decide which DokuWiki auth backends will be supported.
- [ ] Implement anonymous user behavior.
- [ ] Implement login.
- [ ] Implement logout.
- [ ] Implement password hashing.
- [ ] Implement password verification.
- [ ] Implement password reset if supported.
- [ ] Implement registration if supported.
- [ ] Implement profile update if supported.
- [ ] Implement remember-me behavior or a secure replacement.
- [ ] Implement session cookie behavior.
- [ ] Implement CSRF tokens.
- [ ] Implement bearer token auth if remote APIs are supported.
- [ ] Implement admin and manager role checks.
- [ ] Implement default group assignment.
- [ ] Implement user manager behavior.
- [ ] Implement account disable behavior if supported.
- [ ] Implement auth migration from `users.auth.php`.
- [ ] Implement auth event hooks or replacement extension points.
- [ ] Add auth rate limiting.
- [ ] Add brute force protection.

## ACL

- [ ] Implement ACL config import from `acl.auth.php`.
- [ ] Implement ACL matching rules.
- [ ] Implement namespace ACL inheritance.
- [ ] Implement user ACL checks.
- [ ] Implement group ACL checks.
- [ ] Implement wildcard ACL rules.
- [ ] Implement special `%USER%` rules.
- [ ] Implement special `%GROUP%` rules.
- [ ] Implement minimum permission checks for every action.
- [ ] Implement hidden page behavior.
- [ ] Implement sneaky index behavior if supported.
- [ ] Implement ACL admin UI.
- [ ] Add ACL test fixtures.
- [ ] Add ACL regression tests for page, namespace, and media access.

## Search And Indexing

- [x] Decide whether to port DokuWiki fulltext search, use D1 FTS, use an external service, or implement a simpler search.
- [x] Implement tokenizer compatibility.
- [x] Implement stopword handling.
- [x] Implement page indexing.
- [x] Implement metadata indexing.
- [x] Implement title indexing.
- [x] Implement page deletion from index.
- [ ] Implement media indexing if supported.
- [x] Implement search query parsing.
- [x] Implement search result ranking.
- [x] Implement namespace-limited search.
- [ ] Implement ACL filtering for search results.
- [ ] Implement index rebuild job.
- [x] Implement incremental index updates on save.
- [ ] Implement index migration from existing `data/index` if needed.
- [ ] Add search performance tests.
- [x] Add search correctness tests.

## Cache And Rendering Performance

- [x] Define rendered page cache key structure.
- [ ] Define cache dependency tracking.
- [x] Implement rendered HTML cache.
- [ ] Implement parser instruction cache if needed.
- [ ] Implement metadata cache if needed.
- [x] Implement CSS cache or prebuilt CSS.
- [x] Implement JavaScript cache or prebuilt JavaScript.
- [x] Implement feed cache.
- [x] Implement sitemap cache.
- [x] Implement page purge behavior.
- [ ] Implement global purge behavior.
- [ ] Implement user-sensitive cache bypass for private pages.
- [ ] Implement cache warming for important pages.
- [ ] Implement stale cache fallback if appropriate.
- [ ] Add cache hit and miss metrics.
- [x] Add cache invalidation tests.

## Template And Frontend

- [ ] Port the default DokuWiki template.
- [x] Preserve current HTML structure where compatibility matters.
- [x] Preserve current CSS behavior where compatibility matters.
- [x] Port template navigation.
- [x] Port page tools.
- [x] Port site tools.
- [ ] Port user tools.
- [x] Port mobile navigation.
- [x] Port breadcrumbs.
- [x] Port table of contents rendering.
- [x] Port editor UI.
- [x] Port preview UI.
- [x] Port conflict UI.
- [x] Port revision UI.
- [x] Port diff UI.
- [x] Port search UI.
- [ ] Port media manager UI.
- [ ] Port admin UI.
- [ ] Port login UI.
- [ ] Port profile UI if supported.
- [ ] Port user manager UI if supported.
- [ ] Port styling plugin behavior if supported.
- [ ] Port configuration UI if supported.
- [ ] Ensure responsive behavior.
- [ ] Ensure keyboard accessibility.
- [ ] Ensure screen reader accessibility.
- [ ] Ensure text does not overflow in common layouts.
- [x] Verify desktop rendering with screenshots.
- [x] Verify mobile rendering with screenshots.

## Static Assets

- [x] Decide which existing static assets are copied directly to Pages output.
- [x] Decide which assets are bundled.
- [ ] Decide which assets are generated at build time.
- [x] Port image assets.
- [x] Port icon assets.
- [x] Port CSS assets.
- [x] Port JavaScript assets.
- [ ] Port language assets needed by the selected locales.
- [x] Port template assets.
- [ ] Port plugin assets for supported plugins.
- [ ] Add asset fingerprinting.
- [x] Add asset cache headers.
- [ ] Add asset integrity checks if needed.
- [x] Verify all asset references resolve under pages.dev.

## Configuration

- [ ] Map `conf/dokuwiki.php` defaults to the new configuration model.
- [ ] Map `conf/local.php` overrides to the new configuration model.
- [ ] Map plugin configuration to the new configuration model.
- [x] Map MIME configuration.
- [x] Map interwiki configuration.
- [x] Map acronym configuration.
- [x] Map entity configuration.
- [x] Map smiley configuration.
- [x] Map wordblock configuration.
- [x] Map license configuration.
- [x] Map manifest configuration.
- [ ] Map language configuration.
- [ ] Implement environment-specific config.
- [ ] Implement secret-specific config.
- [ ] Implement config validation.
- [ ] Implement admin config editing if supported.
- [ ] Implement config export and backup.

## Plugins And Extension Compatibility

- [ ] Decide support level for bundled plugins.
- [ ] Port the ACL plugin or replace it with native admin UI.
- [ ] Port the authplain plugin or replace it with native auth.
- [ ] Port the config plugin or replace it with native admin UI.
- [ ] Port the extension manager plugin or remove it for Pages.
- [ ] Port the info plugin or replace it with native diagnostics.
- [ ] Port the logviewer plugin or replace it with Cloudflare logs.
- [ ] Port the popularity plugin or remove it.
- [ ] Port the revert plugin.
- [ ] Port the safefnrecode plugin or make it migration-only.
- [ ] Port the styling plugin or replace it with build-time theme configuration.
- [ ] Port the usermanager plugin or replace it with native user management.
- [ ] Decide support for authad.
- [ ] Decide support for authldap.
- [ ] Decide support for authpdo.
- [ ] Define a Pages-compatible extension API.
- [ ] Define supported action hooks.
- [ ] Define supported syntax hooks.
- [ ] Define supported renderer hooks.
- [ ] Define supported auth hooks.
- [ ] Define supported admin hooks.
- [ ] Define plugin packaging rules for Pages.
- [ ] Define plugin security boundaries.
- [ ] Add plugin compatibility tests for supported plugins.

## Admin And Maintenance

- [ ] Implement admin dashboard.
- [ ] Implement configuration management.
- [ ] Implement user management.
- [ ] Implement ACL management.
- [ ] Implement page index rebuild.
- [ ] Implement search index rebuild.
- [x] Implement cache purge.
- [ ] Implement media cleanup.
- [ ] Implement orphaned revision cleanup if needed.
- [ ] Implement diagnostics.
- [ ] Implement version display.
- [ ] Implement storage health checks.
- [ ] Implement migration status display.
- [ ] Implement audit log view.
- [ ] Implement maintenance mode if needed.
- [ ] Implement backup export.
- [ ] Implement restore import.

## Feeds, Sitemap, And Discovery

- [x] Implement RSS feed.
- [x] Implement Atom feed if supported.
- [ ] Implement feed ACL filtering.
- [x] Implement feed cache.
- [x] Implement sitemap generation.
- [x] Implement sitemap cache.
- [x] Implement `robots.txt` behavior.
- [x] Implement OpenSearch document.
- [x] Implement web app manifest.
- [x] Implement favicon behavior.
- [x] Preserve existing feed URLs if required.
- [x] Preserve existing sitemap URLs if required.

## Remote APIs

- [ ] Decide whether XML-RPC compatibility is required.
- [ ] Decide whether JSON-RPC compatibility is required.
- [ ] Decide whether OpenAPI output is required.
- [ ] Implement API auth.
- [ ] Implement API CORS behavior.
- [ ] Implement page read API methods.
- [ ] Implement page write API methods.
- [ ] Implement revision API methods.
- [ ] Implement media read API methods.
- [ ] Implement media write API methods.
- [ ] Implement search API methods.
- [ ] Implement user API methods if supported.
- [ ] Add API compatibility tests.
- [ ] Add API security tests.

## Email And Notifications

- [ ] Decide whether email features are in scope.
- [ ] Choose an email provider compatible with Workers.
- [ ] Implement mail sending adapter.
- [ ] Implement registration notifications.
- [ ] Implement password reset emails.
- [ ] Implement page change notifications.
- [ ] Implement subscriptions.
- [ ] Implement digest scheduling.
- [ ] Implement bounce-safe sender configuration.
- [ ] Add email template tests.
- [ ] Add email delivery failure handling.

## Anti-Abuse And Security

- [ ] Implement CSRF protection for all state-changing actions.
- [ ] Implement upload validation.
- [ ] Implement MIME validation.
- [ ] Implement XSS protections for rendered wiki syntax.
- [ ] Implement SVG safety policy.
- [ ] Implement HTML embedding policy.
- [x] Implement external link rel policy.
- [x] Implement wordblock checks.
- [x] Implement IP extraction through Cloudflare headers.
- [x] Implement trusted proxy behavior appropriate for Cloudflare.
- [ ] Implement rate limits for login.
- [ ] Implement rate limits for edits.
- [ ] Implement rate limits for uploads.
- [ ] Implement audit logging for admin actions.
- [x] Implement security headers.
- [ ] Implement cookie security flags.
- [x] Implement dependency vulnerability scanning.
- [ ] Implement secret scanning.
- [ ] Perform threat model review.
- [ ] Perform permissions review.

## Data Migration

- [x] Write importer for `data/pages`.
- [x] Write importer for `data/attic`.
- [ ] Write importer for compressed old page revisions.
- [x] Write importer for `data/media`.
- [x] Write importer for `data/media_attic`.
- [ ] Write importer for `data/meta`.
- [ ] Write importer for `data/media_meta`.
- [ ] Write importer for page changelogs.
- [ ] Write importer for media changelogs.
- [x] Write importer for `conf/acl.auth.php`.
- [x] Write importer for `conf/users.auth.php`.
- [ ] Write importer for plugin settings.
- [x] Write importer for interwiki configuration.
- [x] Write importer for MIME configuration.
- [x] Write importer for wordblock configuration.
- [ ] Write importer for custom language files if present.
- [ ] Write importer for custom template files if present.
- [ ] Write importer for custom media metadata if present.
- [x] Preserve original timestamps.
- [ ] Preserve author information.
- [ ] Preserve edit summaries.
- [ ] Preserve delete events.
- [ ] Preserve media revision history.
- [x] Validate imported page counts.
- [ ] Validate imported media counts.
- [ ] Validate imported revision counts.
- [ ] Validate imported user counts.
- [ ] Validate imported ACL counts.
- [ ] Validate content hashes before and after import.
- [x] Produce migration report.
- [ ] Make migration idempotent.
- [ ] Make migration resumable.
- [x] Add dry-run mode.
- [ ] Add rollback or restore plan.

## URL Compatibility And Redirects

- [ ] Inventory existing URL patterns.
- [x] Preserve `doku.php?id=...` routes if required.
- [x] Preserve nice URL routes if required.
- [x] Preserve media fetch URLs if required.
- [x] Preserve feed URLs if required.
- [x] Preserve sitemap URLs if required.
- [x] Preserve revision URLs if required.
- [x] Preserve diff URLs if required.
- [ ] Preserve admin URLs where possible.
- [ ] Implement redirect rules for unsupported legacy endpoints.
- [x] Implement canonical URL generation.
- [x] Add URL compatibility tests.
- [ ] Generate redirect audit report.

## Build And Deployment

- [x] Define build output directory.
- [x] Define Pages project settings.
- [x] Define production branch.
- [x] Define preview branch behavior.
- [x] Configure Pages build command.
- [x] Configure Pages Functions output.
- [x] Configure D1 bindings.
- [ ] Configure R2 bindings.
- [x] Configure KV bindings if used.
- [ ] Configure Durable Object bindings if used.
- [x] Configure environment variables.
- [ ] Configure secrets.
- [ ] Configure custom domain if used.
- [ ] Configure cache rules if needed.
- [x] Configure security headers.
- [ ] Configure redirects.
- [x] Configure preview deployments.
- [x] Configure production deployments.
- [x] Configure database migration deployment.
- [ ] Configure backup before deployment.
- [ ] Configure rollback deployment.

## Testing

- [x] Add unit tests for page ID handling.
- [x] Add unit tests for namespace handling.
- [x] Add unit tests for parser behavior.
- [x] Add unit tests for renderer behavior.
- [ ] Add unit tests for ACL behavior.
- [ ] Add unit tests for auth behavior.
- [ ] Add unit tests for storage adapters.
- [x] Add unit tests for cache behavior.
- [x] Add unit tests for search behavior.
- [ ] Add unit tests for media behavior.
- [ ] Add integration tests for page view.
- [ ] Add integration tests for page edit.
- [ ] Add integration tests for page delete.
- [x] Add integration tests for page revert.
- [x] Add integration tests for revisions.
- [x] Add integration tests for diff.
- [x] Add integration tests for search.
- [ ] Add integration tests for media upload.
- [x] Add integration tests for media fetch.
- [ ] Add integration tests for login.
- [ ] Add integration tests for logout.
- [ ] Add integration tests for admin actions.
- [x] Add migration tests using fixture wiki data.
- [x] Add URL compatibility tests.
- [ ] Add API compatibility tests if APIs are supported.
- [ ] Add accessibility tests.
- [ ] Add visual regression tests.
- [ ] Add mobile viewport tests.
- [ ] Add performance tests.
- [ ] Add load tests within Workers limits.
- [ ] Add security tests for XSS.
- [ ] Add security tests for CSRF.
- [ ] Add security tests for ACL bypass.
- [ ] Add security tests for upload bypass.
- [ ] Add dependency scanning.
- [ ] Add smoke tests for preview deployments.
- [ ] Add smoke tests for production deployments.

## Performance And Limits

- [ ] Measure cold start time.
- [ ] Measure warm request time.
- [ ] Measure page render time.
- [ ] Measure edit save time.
- [ ] Measure media fetch time.
- [ ] Measure search time.
- [ ] Measure migration time.
- [ ] Measure D1 query counts per route.
- [ ] Measure R2 operation counts per route.
- [ ] Measure KV operation counts per route if used.
- [ ] Measure Worker CPU usage per route.
- [ ] Measure Worker memory usage per route.
- [ ] Measure bundle size.
- [ ] Measure static asset size.
- [ ] Optimize parser hot paths.
- [ ] Optimize rendered page caching.
- [ ] Optimize search indexing.
- [ ] Optimize media delivery.
- [ ] Optimize database indexes.
- [ ] Add alerts for limit pressure.

## Observability

- [x] Define structured log format.
- [x] Add request IDs.
- [x] Add error logging.
- [ ] Add storage error logging.
- [ ] Add auth event logging.
- [ ] Add admin action logging.
- [ ] Add migration logging.
- [ ] Add performance timing logs.
- [ ] Add cache metrics.
- [ ] Add search metrics.
- [ ] Add media metrics.
- [ ] Add dashboard for production health.
- [ ] Add alerting for error spikes.
- [ ] Add alerting for storage failures.
- [ ] Add alerting for migration failures.
- [ ] Add alerting for quota or limit pressure.

## Documentation

- [ ] Document architecture decisions.
- [ ] Document supported DokuWiki features.
- [ ] Document unsupported DokuWiki features.
- [ ] Document storage schema.
- [ ] Document local development setup.
- [ ] Document deployment setup.
- [ ] Document environment variables.
- [ ] Document D1 migration workflow.
- [ ] Document R2 bucket workflow.
- [ ] Document data import workflow.
- [ ] Document backup workflow.
- [ ] Document restore workflow.
- [ ] Document rollback workflow.
- [ ] Document plugin compatibility.
- [ ] Document admin operations.
- [ ] Document security model.
- [ ] Document known limitations.
- [ ] Document launch checklist.

## Pre-Launch

- [ ] Freeze writes on the source DokuWiki or define a final sync window.
- [ ] Run full migration dry run.
- [ ] Review migration report.
- [ ] Fix migration errors.
- [ ] Run full migration rehearsal.
- [ ] Run full test suite.
- [ ] Run preview deployment smoke tests.
- [ ] Run production-like load tests.
- [ ] Verify redirects.
- [ ] Verify auth and ACL behavior.
- [ ] Verify page rendering for representative content.
- [ ] Verify media rendering for representative media.
- [x] Verify search results.
- [ ] Verify admin workflows.
- [ ] Verify backup and restore.
- [ ] Verify rollback.
- [ ] Review security headers.
- [ ] Review secrets.
- [ ] Review observability.
- [ ] Approve launch.

## Launch

- [ ] Put source wiki into maintenance or read-only mode.
- [ ] Run final export from source DokuWiki.
- [ ] Run final import into Cloudflare storage.
- [ ] Validate final import counts.
- [ ] Validate final content hashes.
- [ ] Deploy production Pages project.
- [ ] Apply production D1 migrations.
- [ ] Verify production bindings.
- [ ] Verify production environment variables and secrets.
- [ ] Run production smoke tests.
- [ ] Switch DNS or route traffic to Pages.
- [ ] Monitor errors.
- [ ] Monitor performance.
- [ ] Monitor storage operations.
- [ ] Monitor user login and edit flows.
- [ ] Keep rollback path available.

## Post-Launch

- [ ] Review production logs after launch.
- [ ] Review user-reported issues.
- [ ] Fix launch blockers.
- [ ] Re-run regression tests after fixes.
- [ ] Tune cache settings.
- [ ] Tune database indexes.
- [ ] Tune search behavior.
- [ ] Tune media delivery.
- [ ] Verify backups are running.
- [ ] Verify restore procedure with a test restore.
- [ ] Review Cloudflare billing and quotas.
- [ ] Review unsupported feature requests.
- [ ] Prioritize remaining feature parity gaps.
- [ ] Archive old DokuWiki deployment after retention period.
- [ ] Document final production runbook.
