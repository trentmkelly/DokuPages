# Runtime Compatibility Map

This document is the compatibility contract for upstream DokuWiki runtime
features that cannot be executed directly inside Cloudflare Pages Functions.
The Pages port remains a native TypeScript implementation; compatibility is
provided by explicit service boundaries, native modules, import-time
translations, and operator tooling.

## PHP Runtime And Native Extension Boundary

Workers do not execute PHP, and this port does not embed a PHP interpreter. True
DokuWiki plugin compatibility therefore means mapping each upstream extension
point to a native TypeScript boundary:

| Upstream concern              | Pages-native boundary                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Action dispatch               | `src/app.ts` route handlers and DokuWiki-compatible query dispatch.                 |
| Renderer and syntax extension | `src/wiki/render.ts` and renderer fixtures; no runtime syntax plugin loading.       |
| Auth extension                | Native auth modules plus `src/auth/events.ts` for non-sensitive auth events.        |
| Admin extension               | Native admin routes guarded by ACL and CSRF helpers.                                |
| Remote API extension          | Native API routes; legacy XML-RPC/JSON-RPC remain separate compatibility targets.   |
| Helper classes                | Shared TypeScript services under `src/`; no arbitrary plugin helper autoloading.    |
| CLI extension                 | npm scripts, migration scripts, and Worker cron/admin routes.                       |
| Runtime uploaded code         | Unsupported; all executable code must be reviewed, tested, committed, and deployed. |

The extension boundary deliberately favors deterministic deployments over
DokuWiki's runtime PHP class loading. A future native plugin system would need a
manifest format, typed hook contracts, storage capability declarations, and test
fixtures before any module is considered compatible.

## Core Event Map

DokuWiki's `inc/Extension/Event.php` and `EventHandler.php` allow plugins to
observe or replace core behavior. Pages does not recreate that generic mutable
event bus. Each upstream event is mapped below to a native equivalent,
replacement surface, or explicit unsupported status.

| Upstream event                 | Pages status                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `ACTION_ACT_PREPROCESS`        | Native route dispatch in `src/app.ts`; no generic preprocessing hook.           |
| `ACTION_DENIED_TPLCONTENT`     | Native denied-page renderer; no plugin hook.                                    |
| `ACTION_EXPORT_POSTPROCESS`    | Deferred with export-mode parity.                                               |
| `ACTION_HANDLE_SUBSCRIBE`      | Native subscription handlers; no plugin hook.                                   |
| `ACTION_HEADERS_SEND`          | Native `Response` construction; no global header hook.                          |
| `ACTION_SHOW_REDIRECT`         | Deferred with redirect metadata parity.                                         |
| `ADMINPLUGIN_ACCESS_CHECK`     | Native admin ACL checks.                                                        |
| `AJAX_CALL_UNKNOWN`            | Native AJAX router; unknown calls return compatibility errors.                  |
| `AUTH_ACL_CHECK`               | Native ACL resolver in `src/wiki/acl.ts`.                                       |
| `AUTH_LOGIN_CHECK`             | Native auth validation and `auth_event` logs.                                   |
| `AUTH_PASSWORD_GENERATE`       | Native DokuWiki-style generated passwords for `AUTOPASSWD=1`; no plugin hook.   |
| `AUTH_USER_CHANGE`             | Native user manager, profile update, and profile delete writes.                 |
| `COMMON_PAGETPL_LOAD`          | Deferred with page-template parity.                                             |
| `COMMON_USER_LINK`             | Native user display rendering; no plugin hook.                                  |
| `COMMON_WIKIPAGE_SAVE`         | Native page save service, changelog, cache purge, and notifications.            |
| `COMMON_WORDBLOCK_BLOCKED`     | Native wordblock validator; no plugin hook.                                     |
| `CONFUTIL_CDN_SELECT`          | Not applicable; static assets are Pages assets.                                 |
| `DOKUWIKI_DONE`                | Not applicable; request lifecycle handled by Workers runtime.                   |
| `DOKUWIKI_INIT_DONE`           | Not applicable; module initialization is build/runtime initialization.          |
| `DOKUWIKI_STARTED`             | Not applicable; request lifecycle handled by Workers runtime.                   |
| `DRAFT_SAVE`                   | Native draft storage and save routes.                                           |
| `EDIT_FORM_ADDTEXTAREA`        | Native editor UI; no plugin hook.                                               |
| `FEED_DATA_PROCESS`            | Deferred with feed parity.                                                      |
| `FEED_ITEM_ADD`                | Deferred with feed parity.                                                      |
| `FEED_MODE_UNKNOWN`            | Native unsupported feed-mode response.                                          |
| `FEED_OPTS_POSTPROCESS`        | Deferred with feed parity.                                                      |
| `FORM_LOGIN_OUTPUT`            | Native login form; no plugin hook.                                              |
| `FULLTEXT_PHRASE_MATCH`        | Deferred with search-query parity.                                              |
| `FULLTEXT_SNIPPET_CREATE`      | Native snippets; exact upstream hook deferred.                                  |
| `HTML_*FORM_OUTPUT`            | Native forms; dynamic plugin form hooks are unsupported.                        |
| `HTML_EDIT_FORMSELECTION`      | Deferred with exact editor form parity.                                         |
| `HTML_SECEDIT_BUTTON`          | Native section edit links; no plugin hook.                                      |
| `HTML_SHOWREV_OUTPUT`          | Native old-revision notice; no plugin hook.                                     |
| `HTTPCLIENT_REQUEST_SEND`      | Native `fetch`; extension interception unsupported.                             |
| `INDEXER_PAGE_ADD`             | Native search posting writer.                                                   |
| `INDEXER_TASKS_RUN`            | Native HTTP task runner for per-page D1 search indexing; plugin hooks deferred. |
| `INDEXER_TEXT_PREPARE`         | Native tokenizer; exact upstream hook deferred.                                 |
| `INDEXER_VERSION_GET`          | Not applicable; native search schema versions replace index version hooks.      |
| `INFOUTIL_MSG_SHOW`            | Native diagnostics; no plugin hook.                                             |
| `INIT_LANG_LOAD`               | Native generated language packs plus imported `conf/lang` auth/UI overrides.    |
| `IO_NAMESPACE_CREATED`         | Native D1/R2 namespace materialization; no plugin hook.                         |
| `IO_NAMESPACE_DELETED`         | Native D1/R2 namespace cleanup; no plugin hook.                                 |
| `IO_WIKIPAGE_READ`             | Native page reads through D1 services; no plugin hook.                          |
| `IO_WIKIPAGE_WRITE`            | Native page writes through D1 services; no plugin hook.                         |
| `LOGGER_DATA_FORMAT`           | Native structured logs and audit rows.                                          |
| `MAIL_MESSAGE_SEND`            | Native email adapter; no plugin hook.                                           |
| `MANIFEST_SEND`                | Native manifest route; no plugin hook.                                          |
| `MEDIAMANAGER_CONTENT_OUTPUT`  | Native media-manager renderer; no plugin hook.                                  |
| `MEDIA_DELETE_FILE`            | Native media delete service; no plugin hook.                                    |
| `MEDIA_SEARCH`                 | Native recursive D1 media search over IDs, MIME types, and stored metadata.     |
| `MEDIA_UPLOAD_FINISH`          | Native upload service, audit, cache purge, and validation.                      |
| `MENU_ITEMS_ASSEMBLY`          | Native menu builder; no plugin hook.                                            |
| `PAGEUTILS_ID_HIDEPAGE`        | Native hidden-page filtering.                                                   |
| `PARSER_HANDLER_DONE`          | Native renderer; no PHP instruction handler hook.                               |
| `PARSER_LOCALE_XHTML`          | Deferred with localization parity.                                              |
| `PARSER_METADATA_RENDER`       | Native metadata rows cover core page metadata; renderer hooks unsupported.      |
| `PARSER_WIKITEXT_PREPROCESS`   | Native renderer input; generic preprocessing hook unsupported.                  |
| `PLUGIN_CONFIG_PLUGINLIST`     | Native plugin compatibility report; no runtime plugin loading.                  |
| `PLUGIN_POPULARITY_DATA_SETUP` | Removed; popularity usage collection and phone-home are unsupported.            |
| `RENDERER_CONTENT_POSTPROCESS` | Native renderer output; generic postprocess hook unsupported.                   |
| `SEARCH_QUERY_FULLPAGE`        | Native search service; exact query hook deferred.                               |
| `SEARCH_QUERY_PAGELOOKUP`      | Native search service; exact query hook deferred.                               |
| `SEARCH_RESULT_FULLPAGE`       | Native search result renderer; exact result hook deferred.                      |
| `SEARCH_RESULT_PAGELOOKUP`     | Native search result renderer; exact result hook deferred.                      |
| `SITEMAP_GENERATE`             | Native sitemap route; no plugin hook.                                           |
| `SITEMAP_PING`                 | Unsupported; Pages does not ping search engines from request handlers.          |
| `TASK_RECENTCHANGES_TRIM`      | Deferred with task-runner parity.                                               |
| `TOOLBAR_DEFINE`               | Deferred with editor toolbar parity.                                            |
| `TPL_ACTION_GET`               | Native template action mapping; no plugin hook.                                 |
| `TPL_ACT_RENDER`               | Native page shell renderer; no plugin hook.                                     |
| `TPL_ACT_UNKNOWN`              | Native unsupported action response.                                             |
| `TPL_CONTENT_DISPLAY`          | Native page shell renderer; no plugin hook.                                     |
| `TPL_IMG_DISPLAY`              | Native media rendering; no plugin hook.                                         |
| `TPL_METAHEADER_OUTPUT`        | Native head rendering; no plugin hook.                                          |
| `TPL_TOC_RENDER`               | Native TOC renderer; no plugin hook.                                            |

Bundled plugins currently register hooks for `AJAX_CALL_UNKNOWN`,
`AUTH_LOGIN_CHECK`, `FORM_LOGIN_OUTPUT`, `INDEXER_TASKS_RUN`, and
`TPL_METAHEADER_OUTPUT`. Those registrations are not loaded at runtime; the
native replacements above are the compatibility surface.

## Upstream Plugin Type Map

| Plugin type | Upstream role                              | Pages compatibility decision                                              |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `action`    | Observe/modify request actions and output. | Native route code only; no runtime action plugins.                        |
| `admin`     | Add admin pages.                           | Native admin routes; unsupported plugins appear in compatibility reports. |
| `auth`      | Replace auth backend.                      | Native users/sessions plus `authad`/`authldap`/`authpdo` sync bridge.     |
| `cli`       | Add command-line commands.                 | npm scripts or operator scripts committed with the port.                  |
| `helper`    | Provide PHP utility classes.               | Rewritten as TypeScript services when required by supported behavior.     |
| `remote`    | Extend XML-RPC/JSON-RPC APIs.              | Deferred until legacy remote APIs are implemented natively.               |
| `renderer`  | Provide alternate renderers.               | Native render/export modes only.                                          |
| `syntax`    | Add wiki syntax modes.                     | Native parser support only; no runtime syntax plugins.                    |

## Update Notices

Upstream `checkUpdateMessages()` downloads manager-only release and security
messages from `update.dokuwiki.org` when `$conf['updatecheck']` is enabled. The
Pages port deliberately does not fetch or render those PHP runtime notices.
`UPDATECHECK` is accepted for DokuWiki config compatibility, but the effective
runtime policy remains disabled and validation warns operators to update through
git-reviewed Cloudflare Pages deployments.

## Proxy And Client IP Policy

Cloudflare Pages does not expose PHP's `REMOTE_ADDR`. The native client-IP
policy therefore prefers Cloudflare's trusted `CF-Connecting-IP` header. When
that header is absent, `REALIP=1` enables the DokuWiki `X-Real-IP` fallback, and
`TRUSTEDPROXIES` enables `X-Forwarded-For` only when each listed proxy hop is in
the configured IP/CIDR allowlist. DokuWiki's outbound `proxy.*` settings remain
intentionally unsupported because Workers `fetch` does not route through an
operator-specified HTTP proxy.

## Farm And Multi-Wiki Decision

Upstream `inc/farm.php` supports named and virtual animals by changing config
and data roots before initialization. The Pages port does not emulate that file
layout. Launch uses one Cloudflare Pages project and one set of D1/R2/KV/DO
bindings per wiki.

If farm behavior becomes required, the compatible model is a tenant router that
selects a tenant record from hostname/path, then scopes D1 rows, R2 prefixes, KV
keys, cache dependencies, sessions, ACLs, and email settings by tenant ID. That
is a future architecture extension, not a hidden filesystem compatibility mode.

## Filesystem Semantics Map

| Upstream filesystem area | Pages-native storage                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `data/pages`             | D1 `pages` plus `page_revisions`.                                                        |
| `data/attic`             | D1 `page_revisions`, including imported compressed revisions after decompression.        |
| `data/media`             | R2 media objects plus D1 current media metadata.                                         |
| `data/media_attic`       | R2 old media objects plus D1 `media_revisions`.                                          |
| `data/meta`              | D1 metadata rows with DokuWiki-shaped page metadata plus compatibility helper keys.      |
| `data/media_meta`        | D1 metadata rows plus native JPEG EXIF/IPTC/XMP display metadata for uploaded media.     |
| `data/cache`             | KV rendered payloads, Cache API candidates, and D1 cache dependency rows.                |
| `data/index`             | D1 search postings and term tables, including DokuWiki-style term lengths and stopwords. |
| `data/locks`             | Durable Object edit/media locks.                                                         |
| `data/tmp`               | Request-local memory or short-lived Cloudflare storage only when explicitly required.    |
| `data/log`               | D1 audit rows plus Cloudflare structured logs.                                           |
| `conf/*.php`             | Imported metadata plus validated env/config surfaces.                                    |
| `conf/*.conf`            | Imported metadata and native parsers where implemented.                                  |
| `lib/plugins/*`          | Native replacement modules or unsupported compatibility reports.                         |

The compatibility layer does not expose POSIX timestamps, chmod, path traversal,
rename, or direct file handles. Code that depends on those APIs must be mapped to
service methods that define ownership, concurrency, cache invalidation, and ACL
behavior explicitly.

## Vendor Dependency Replacement Map

| Upstream package                     | Upstream use                          | Pages replacement                                    |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| `aziraphale/email-address-validator` | Email syntax validation.              | Native validation in auth/user flows.                |
| `geshi/geshi`                        | Code highlighting.                    | Native JS highlighter with GeSHi-compatible classes. |
| `kissifrot/php-ixr`                  | XML-RPC client/server support.        | Deferred native XML-RPC compatibility.               |
| `openpsa/universalfeedcreator`       | RSS/Atom generation.                  | Native feed routes.                                  |
| `paragonie/constant_time_encoding`   | Constant-time encoding helpers.       | Web Crypto and native JS helpers.                    |
| `paragonie/random_compat`            | PHP random byte polyfill.             | Web Crypto random values.                            |
| `php81_bc/strftime`                  | Locale date formatting compatibility. | Native DokuWiki formatter backed by `Intl`.          |
| `phpseclib/phpseclib`                | Crypto/SSH/SFTP utilities.            | Not used at request runtime.                         |
| `simplepie/simplepie`                | RSS feed parsing.                     | Deferred RSS syntax/feed parsing replacement.        |
| `splitbrain/lesserphp`               | LESS compilation.                     | Build-time CSS assets.                               |
| `splitbrain/php-archive`             | Archive read/write.                   | Operator tooling or JS archive libraries if needed.  |
| `splitbrain/php-cli`                 | CLI framework.                        | npm scripts and Node operator scripts.               |
| `splitbrain/php-jsstrip`             | JavaScript minimization.              | Build tooling and checked-in assets.                 |
| `splitbrain/slika`                   | Image resizing.                       | Deferred Worker-compatible derivative pipeline.      |

## CLI Compatibility Map

| Upstream command      | Pages-native path                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `bin/dwpage.php`      | Native page API, import/export scripts, and future operator write tools.                  |
| `bin/indexer.php`     | Native admin search-index rebuild action; future npm script can wrap the same D1 service. |
| `bin/plugin.php`      | Unsupported for runtime PHP plugins; native admin/operator scripts only.                  |
| `bin/render.php`      | Vitest parity harness in `test/upstream-render-parity.test.mjs`.                          |
| `bin/wantedpages.php` | Native `/wanted` route and future operator report script.                                 |
| `bin/striplangs.php`  | Not required at runtime; language packs are build/import artifacts.                       |
| `bin/gittool.php`     | Not ported; plugin/template repository operations are outside production runtime.         |

Operator tooling should be written as repeatable npm scripts or Workers cron/admin
jobs. Scripts may call the upstream PHP tree only in local parity tests, never in
the deployed Pages runtime.
