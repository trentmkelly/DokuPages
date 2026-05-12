# DokuWiki Pages Port Parity Gap Checklist

This checklist tracks remaining differences found by comparing the current
Pages-native port against the upstream DokuWiki PHP source tree in
`../dokuwiki`. Checked items document audit coverage already completed for this
review. Unchecked items are parity gaps or follow-up verification tasks; they
are not fixed by this checklist.

## Audit Coverage

- [x] Reviewed the current Pages route surface in `src/app.ts`.
- [x] Reviewed the current renderer in `src/wiki/render.ts`.
- [x] Reviewed current storage, media, ACL, auth, config, import, and API modules under `src/` and `scripts/`.
- [x] Reviewed current project docs for known supported, unsupported, and deferred behavior.
- [x] Reviewed upstream DokuWiki entrypoints under `../dokuwiki/*.php` and `../dokuwiki/lib/exe/`.
- [x] Reviewed upstream DokuWiki action classes under `../dokuwiki/inc/Action/`.
- [x] Reviewed upstream DokuWiki parser modes under `../dokuwiki/inc/Parsing/ParserMode/`.
- [x] Reviewed upstream bundled plugins under `../dokuwiki/lib/plugins/`.
- [x] Reviewed upstream default template, menu, UI, JavaScript, and CSS surfaces under `../dokuwiki/lib/tpl/dokuwiki`, `../dokuwiki/inc/Menu`, `../dokuwiki/inc/Ui`, and `../dokuwiki/lib/scripts`.
- [x] Reviewed upstream default configuration keys in `../dokuwiki/conf/dokuwiki.php`.
- [x] Reviewed upstream import-relevant files under `../dokuwiki/conf`, `../dokuwiki/data`, and `../dokuwiki/bin`.

## Runtime And Architecture

- [x] Replace the no-PHP-runtime decision with a documented native extension compatibility layer if true DokuWiki plugin compatibility becomes a goal.
- [x] Recreate DokuWiki's `inc/Extension/Event.php` and `inc/Extension/EventHandler.php` event model with Pages-native hook points, or document every core event that intentionally has no equivalent.
- [x] Add a compatibility map for the upstream plugin types: action, admin, auth, cli, helper, remote, renderer, and syntax plugins.
- [x] Decide whether farm/multi-wiki behavior from `inc/farm.php` needs a Pages-native tenant model.
- [x] Decide whether DokuWiki's local filesystem semantics need a stricter compatibility layer on top of D1, R2, KV, and Durable Objects for tools that expect page files, attic files, locks, cache files, and index files.
- [x] Document every upstream vendor dependency that is replaced rather than ported, including GeSHi, IXR XML-RPC, feed creators, PHP archive libraries, and LESS/CSS helpers.
- [x] Decide whether upstream `bin/` CLI behavior should be reimplemented as npm scripts, Workers cron handlers, or operator-only tools.
- [x] Add a parity test harness that renders the same fixture pages through upstream DokuWiki and the Pages renderer, then diffs normalized HTML.

## Entry Points, Routing, And Actions

- [x] Implement or explicitly map upstream `do=check` behavior from `inc/Action/Check.php`.
- [x] Implement or explicitly map upstream `do=denied` behavior from `inc/Action/Denied.php`.
- [x] Implement or explicitly map upstream `do=locked` behavior from `inc/Action/Locked.php`.
- [x] Implement or explicitly map upstream `do=conflict` behavior from `inc/Action/Conflict.php`.
- [x] Implement or explicitly map upstream `do=cancel` behavior from `inc/Action/Cancel.php`.
- [x] Implement or explicitly map upstream `do=recover` behavior from `inc/Action/Recover.php`.
- [x] Implement or explicitly map upstream `do=draftdel` behavior from `inc/Action/Draftdel.php`.
- [x] Implement or explicitly map upstream `do=authtoken` behavior from `inc/Action/Authtoken.php`.
- [x] Implement or explicitly map upstream `do=plugin` dispatch from `inc/Action/Plugin.php`.
- [x] Match upstream `do=media` routing behavior instead of relying only on `/media-manager` and `/media-detail`.
- [x] Match upstream POST action routing for `do=save`, `do=preview`, and `do=draft` instead of only supporting native JSON/form endpoints where URLs differ.
- [x] Support the upstream `disableactions` configuration so disabled actions disappear from menus and reject requests.
- [x] Make missing-page HTTP status configurable like upstream `send404`; the port currently returns an HTML 404 for missing pages.
- [x] Match DokuWiki's `userewrite` and `useslash` modes, or document the Pages-only URL policy as intentionally fixed.
- [x] Match upstream canonical URL behavior controlled by `canonical`, `baseurl`, and `basedir`.
- [x] Support upstream `do=redirect` semantics and redirect metadata, not just route canonicalization.
- [x] Audit every legacy URL in `docs/url-compatibility.md` against upstream `doku.php`, `feed.php`, `index.php`, and `lib/exe/*` behavior with live fixture requests.
- [x] Replace placeholder `501` and `410` JSON responses with DokuWiki-template HTML where upstream would render an HTML page.
- [x] Confirm `index.php`, `doku.php`, `/wiki`, `/index`, and root redirects match upstream status codes, query preservation, and cache headers.

## Parser And Wiki Syntax

- [x] Port DokuWiki's full parser mode pipeline from `inc/Parsing/Parser.php` rather than the current regex-based renderer, or define a tested compatibility subset.
- [x] Add parity coverage for every upstream parser mode: Acronym, Camelcaselink, Code, Emaillink, Entity, Eol, Externallink, File, Filelink, Footnote, Formatting, Header, Hr, Internallink, Linebreak, Listblock, Media, Multiplyentity, Nocache, Notoc, Plugin, Preformatted, Quote, Quotes, Rss, Smiley, Table, Unformatted, Windowssharelink, and Wordblock.
- [x] Implement CamelCase link support controlled by the upstream `camelcase` setting.
- [x] Implement RSS feed aggregation syntax from upstream `ParserMode/Rss.php`.
- [x] Implement plugin syntax macros, including the bundled info plugin macro seen in `docs/syntax-inventory.md`.
- [x] Implement GeSHi-compatible code highlighting for `<code>` and `<file>` language metadata.
- [x] Implement downloadable file-block output for DokuWiki file syntax metadata.
- [x] Match DokuWiki's raw HTML behavior when `htmlok`-style trusted content is enabled, or document the security-driven mismatch explicitly.
- [x] Match DokuWiki's PHP embedding behavior policy, including explicit unsupported rendering if PHP syntax appears.
- [x] Match DokuWiki's typography modes from `typography`, including smart quotes where enabled.
- [x] Load entity replacements from `conf/entities.conf` and local overrides instead of relying only on hardcoded replacements.
- [x] Load smileys from `conf/smileys.conf` and local overrides instead of only the checked-in default map.
- [x] Load acronyms from `conf/acronyms.conf` and local overrides instead of only the checked-in default map.
- [x] Load interwiki shortcuts from imported D1 metadata at render time instead of only using the built-in TypeScript map.
- [x] Match DokuWiki's `scheme.conf` protocol handling for external links and autolinks.
- [x] Match DokuWiki's `relnofollow` behavior, including `ugc nofollow` distinctions for external user content.
- [x] Match DokuWiki's configurable link targets for wiki, interwiki, external, media, and Windows-share links.
- [x] Match DokuWiki's section edit limits from `maxseclevel`.
- [x] Match DokuWiki's TOC thresholds from `toptoclevel`, `tocminheads`, and `maxtoclevel`.
- [x] Match DokuWiki's first-heading title behavior controlled by `useheading`.
- [x] Match DokuWiki's autoplural lookup for nonexistent pages when `autoplural` is enabled.
- [x] Add parser parity fixtures for malformed nested formatting, nested lists, nested quotes, mixed tables, link labels containing media, and punctuation-heavy autolinks.
- [x] Add parser parity fixtures for non-ASCII page IDs, deaccenting, romanization, and UTF-8 normalization.

## Page Semantics

- [x] Match DokuWiki's page ID cleaning for `deaccent`, `sepchar`, `fnencode`, and `useslash` instead of the current fixed lowercase underscore normalization.
- [x] Match DokuWiki's SafeFN behavior for URL, safe, and UTF-8 filename modes during import and routing.
- [x] Support upstream `breadcrumbs` recent-page trail behavior, not only static "You are here" breadcrumbs.
- [x] Make `youarehere` configurable like upstream instead of always rendering the current breadcrumb style.
- [x] Match upstream `fullpath` display behavior.
- [x] Match upstream page template selection and namespace template inheritance exactly, including all replacement variables.
- [x] Match upstream edit conflict pages from `inc/Ui/PageConflict.php` rather than only native optimistic-concurrency messages.
- [x] Match upstream locked-page UI and lock refresh timing from `locktime`.
- [x] Match upstream draft autosave timing and recovery UI from `inc/Draft.php` and `inc/Ui/PageDraft.php`.
- [x] Match upstream section edit targeting and save behavior for section-only edits.
- [x] Match upstream old revision notices, deleted-page notices, and once-existed pages from language files such as `newpage.txt`, `norev.txt`, and `onceexisted.txt`.
- [x] Match upstream page deletion behavior and delete summaries, including attic/changelog representation.
- [x] Match upstream revert plugin behavior, messages, and revision selection edge cases.
- [x] Match upstream page metadata generation from `inc/parser/metadata.php`, including relations, contributors, date metadata, description abstracts, and backlinks.
- [x] Match upstream backlink, wanted, and orphan calculations against metadata/index behavior rather than only current D1 source scans.
- [x] Match upstream recent changes filters, grouping, date labels, pagination, and hidden-page handling.
- [x] Match upstream diff options, side-by-side output, inline output, media diff pages, and revision comparison edge cases.
- [x] Match upstream raw, XHTML, XHTML body, and other export modes from `inc/Action/Export.php`.

## Media Semantics

- [x] Implement server-side thumbnail generation compatible with DokuWiki `media.php`, `fetch.functions.php`, GD, and ImageMagick behavior.
- [x] Implement resized media responses for `w`, `h`, `tok`, and cache-busting parameters accepted by `lib/exe/fetch.php`.
- [x] Implement DokuWiki's media token and anti-hotlink checks where applicable.
- [x] Implement DokuWiki's `refcheck` behavior before media deletion.
- [x] Match upstream media overwrite, delete, and revision behavior when `mediarevisions` is disabled.
- [x] Match upstream media detail UI from `lib/tpl/dokuwiki/detail.php` and `inc/Ui/MediaRevisions.php`.
- [x] Match upstream media manager tabs, namespace tree behavior, file list behavior, upload progress, and selection callbacks from `lib/exe/mediamanager.php` and `lib/scripts/media.js`.
- [x] Match upstream row and thumbnail media-manager modes, sorting, and pagination from `inc/Ui/Media/DisplayRow.php` and `DisplayTile.php`.
- [x] Parse and display JPEG/EXIF/IPTC metadata like `inc/JpegMeta.php` and `conf/mediameta.php`.
- [x] Match upstream MIME force-download behavior from `conf/mime.conf`, including imported `mime.local.conf` metadata.
- [x] Allow configurable media extension and MIME policies rather than the current conservative validator-only policy.
- [x] Match upstream SVG handling policy and messages when `iexssprotect` is enabled or disabled.
- [x] Match upstream remote media fetch behavior and `fetchsize` where DokuWiki downloads external media.
- [x] Match upstream media search semantics, including metadata/title fields and namespace recursion.
- [x] Match upstream current media and old media revision cache headers, ETag behavior, range requests, and content-disposition details.
- [x] Match upstream media changelog display and media feed inclusion behavior.

## Search And Indexing

- [x] Match DokuWiki's fulltext index structures and tokenizer from `inc/fulltext.php`, `inc/indexer.php`, and `inc/Search/Indexer.php` more closely.
- [x] Match DokuWiki's language-specific stopword files instead of the current fixed English stopword set.
- [x] Match DokuWiki's search query operators, namespace filters, phrase behavior, exclusions, and wildcard or fragment behavior.
- [x] Implement `search_nslimit` and `search_fragment` configuration.
- [x] Match DokuWiki's ranking, title boosting, page ID matching, and snippet extraction.
- [x] Match DokuWiki's AJAX quick search and link wizard output exactly, including ACL, namespace, and title behavior.
- [x] Match upstream indexer task behavior from `lib/exe/indexer.php`, `inc/indexer.php`, and `bin/indexer.php` instead of returning `501` for the legacy endpoint.
- [x] Decide whether media text or metadata should be indexed to match upstream search-related media behavior.

## Authentication And Sessions

- [x] Support upstream `authplain` hash verification formats listed by `passcrypt`, not just native PBKDF2 and reset-based conversion.
- [x] Support imported legacy password hashes for login where safe, including bcrypt, smd5, md5, sha1, ssha, crypt, mysql, and my411 if still required.
- [x] Implement persistent remember-me tokens compatible with upstream `rememberme`, or document the permanent security replacement.
- [x] Implement `auth_security_timeout` revalidation semantics for long-lived sessions.
- [x] Map upstream `superuser` and `manager` config expressions instead of requiring fixed `admin` and `manager` groups.
- [x] Match upstream `autopasswd` registration behavior and generated-password emails.
- [x] Match upstream `profileconfirm` behavior and all profile-delete flows from `ProfileDelete.php`.
- [x] Implement or explicitly reject profile deletion with a DokuWiki-style UI.
- [x] Implement auth backend compatibility or sync bridges for `authad`, `authldap`, and `authpdo`.
- [x] Match upstream user display modes from `showuseras`, including username, full name, email, and linked variants.
- [x] Match upstream auth token behavior from `Authtoken.php`.
- [x] Match upstream login, logout, register, resend password, reset password, denied, and locked page language text for all supported locales.
- [x] Match upstream session flash messages and message stacking behavior.

## ACL And Permissions

- [x] Confirm the ACL resolver exactly matches DokuWiki precedence when multiple user, group, `%USER%`, `%GROUP%`, namespace, and root rules apply.
- [x] Match upstream disabled ACL mode when `useacl=0`; the port always evaluates native ACL data.
- [x] Match upstream `admin` and `manager` permission checks based on config values, not only groups.
- [x] Match upstream ACL plugin UI behavior, validation, sorting, wildcard handling, and page/namespace picker behavior.
- [x] Match upstream sneaky index behavior for namespace visibility in all aggregate routes.
- [x] Match upstream hidden-page behavior for feeds, search, recent changes, index, sitemap, backlinks, wanted, orphan, and media references.
- [x] Add fixtures from upstream `acl.auth.php.dist` and tricky real-world ACL combinations.

## Admin, Config, And Bundled Plugins

- [x] Implement writable config editing equivalent to the bundled config plugin, or explicitly document read-only Pages configuration as the permanent difference.
- [x] Implement extension manager parity or keep a DokuWiki-styled unsupported admin page for the bundled extension plugin.
- [x] Implement styling plugin parity or add a native theme-variable editor that writes deployment-safe configuration.
- [x] Implement info plugin parity beyond diagnostics, including environment, PHP, and DokuWiki-specific details that have Pages equivalents.
- [x] Implement logviewer parity for DokuWiki logs imported from `data/log`, or document Cloudflare logs as a non-equivalent replacement.
- [x] Implement popularity plugin behavior if usage reporting/update checks are desired, or keep it intentionally removed.
- [x] Implement safefnrecode behavior as an operator migration tool if source wikis need filename recoding after import.
- [x] Match usermanager plugin behavior for bulk operations, group editing, search, filters, validation, and messages.
- [x] Add an operator CLI script that promotes an existing username to the configured superadmin/superuser role without manually editing D1 rows.
- [x] Match ACL plugin behavior for bulk ACL edits and namespace browsing.
- [x] Match config metadata and validation from `lib/plugins/config/settings/config.metadata.php`.
- [x] Match upstream plugin enablement from `conf/plugins.php`, `plugins.local.php`, and `plugins.required.php` in UI and diagnostics.
- [x] Add an admin page showing unsupported bundled plugins with native replacement status.

## Configuration And Localization

- [x] Map every upstream `conf/dokuwiki.php` setting to one of: implemented, imported metadata only, intentionally unsupported, or not yet evaluated.
- [x] Use imported `conf/local.php` and `conf/local.protected.php` values where runtime-safe instead of only environment variables.
- [x] Support `title`, `tagline`, `sidebar`, and `license` with DokuWiki-compatible names and defaults.
- [x] Support `recent`, `recent_days`, `breadcrumbs`, `fullpath`, `typography`, `dformat`, and `signature` display settings.
- [x] Support `target` link settings for wiki, interwiki, extern, media, and windows.
- [x] Support `mailprefix`, `htmlmail`, `notify`, and upstream mail template settings more closely.
- [x] Support `rss_type`, `rss_linkto`, `rss_content`, `rss_media`, `rss_show_summary`, and `rss_show_deleted`.
- [x] Support `sitemap` frequency instead of always exposing sitemap output.
- [x] Support `updatecheck` or explicitly remove update notices from the UI.
- [x] Support `trustedproxies`, `realip`, and proxy config semantics where they differ from Cloudflare header handling.
- [x] Support custom language files imported from `conf/lang` at runtime instead of storing them only as metadata.
- [x] Port upstream language pack strings for supported locales beyond the current native English UI.
- [x] Match upstream date, time, byte-size, and number formatting rules, including locale effects.

## Template, Frontend, And Static Assets

- [x] Compare generated HTML from the Pages shell against `lib/tpl/dokuwiki/main.php` for every page mode.
- [x] Port sidebar behavior from the default template, including `sidebar` page lookup and ACL filtering.
- [x] Match upstream page tools, site tools, user tools, mobile menus, access keys, and rel/title attributes from `inc/Menu`.
- [x] Match upstream CSS modules more completely, including forms, tabs, media popups, media fullscreen views, search assistant, modals, and admin plugin pages.
- [x] Replace the hand-maintained CSS bundle with a traceable build or copy strategy from upstream `lib/tpl/dokuwiki/css`.
- [x] Port upstream JavaScript behaviors from `lib/scripts`, including toolbar, hotkeys, lock timer, qsearch, link wizard, media popup, tree expansion, search assistant, cookies, and editor helpers.
- [x] Match upstream editor toolbar buttons, picker dialogs, shortcut keys, and insertion behavior.
- [x] Match upstream section edit buttons, action icons, and disabled-action hiding.
- [x] Match upstream accessibility text, skip links, access keys, and ARIA behavior.
- [x] Match upstream validation badges, license footer behavior, and template messages.
- [x] Remove or replace the stale static `public/index.html` status page so future asset fallback cannot expose obsolete UI.
- [x] Add visual parity screenshots against a real upstream DokuWiki instance for page view, edit, revisions, diff, media manager, login, register, admin, and missing page states.

## Feeds, Sitemap, Manifest, And Discovery

- [x] Match DokuWiki RSS 0.91, RSS 1.0, RSS 2.0, Atom 0.3, and Atom 1.0 options instead of only the current RSS/Atom outputs.
- [x] Match feed item link targets controlled by `rss_linkto`.
- [x] Match feed content modes: abstract, diff, HTML diff, and full HTML.
- [x] Include or exclude media changes according to `rss_media`.
- [x] Match deleted-item feed behavior from `rss_show_deleted`.
- [x] Match feed summaries from `rss_show_summary`.
- [x] Match feed cache timing from `rss_update`.
- [x] Match sitemap frequency behavior from `sitemap`, including disabled sitemap mode.
- [x] Match OpenSearch and manifest output from upstream `inc/Manifest.php` and `lib/exe/opensearch.php`.
- [x] Match robots behavior to upstream and site configuration instead of always allowing all.

## Remote API And AJAX

- [x] Implement XML-RPC compatibility from `inc/Remote/XmlRpcServer.php` and `inc/Remote/ApiCore.php`, or keep a documented permanent `501`.
- [x] Implement JSON-RPC compatibility from `inc/Remote/JsonRpcServer.php`, or keep a documented permanent `501`.
- [x] Implement OpenAPI generation from `inc/Remote/OpenApiDoc`, or keep a documented permanent `501`.
- [x] Match upstream `remote`, `remoteuser`, and `remotecors` config semantics for legacy remote APIs.
- [x] Compare native `/api/v1` responses with upstream remote API response objects for pages, media, revisions, search, links, and users.
- [x] Match all `lib/exe/ajax.php` calls from `inc/Ajax.php`, not only qsearch, suggestions, linkwiz, and index.
- [x] Match AJAX error formats, content types, auth failures, and CSRF handling.

## Data Import And Persistence

- [x] Preserve page revision authors and summaries from changelog correlation instead of using generic attic import metadata where unavailable.
- [x] Preserve media revision authors and summaries from media changelog correlation.
- [x] Preserve deleted pages and deleted media as first-class historical records even when current files no longer exist.
- [x] Import and use subscription data from DokuWiki's metadata files if present.
- [x] Import and use page relation metadata, backlinks, contributors, description, and date metadata generated by upstream parser metadata.
- [x] Import and use media metadata from `data/media_meta` beyond storing serialized payloads.
- [x] Import and use `data/index` only if exact DokuWiki search parity is required; otherwise document deterministic rebuild differences.
- [x] Import and use custom interwiki, MIME, acronym, entity, smiley, scheme, and wordblock local overrides at runtime.
- [x] Import disabled plugin state and plugin configuration into user-visible compatibility reports.
- [x] Support bzip2 attic import without depending on an external `bzip2` process, or document the operator prerequisite.
- [x] Preserve DokuWiki filesystem mtime semantics wherever route behavior still depends on modified times.
- [x] Verify import fidelity on a non-starter real wiki with pages, old revisions, media revisions, deleted pages, users, ACLs, subscriptions, plugin settings, and custom config.

## Cache, Tasks, And Operations

- [x] Match DokuWiki parser instruction cache invalidation semantics more closely, or document rendered-HTML KV cache as intentionally different.
- [x] Implement metadata cache parity where DokuWiki stores and reuses parser metadata.
- [x] Implement stale cache fallback only if it can match DokuWiki's cache behavior safely.
- [x] Implement the upstream task runner queue behavior from `inc/TaskRunner.php` and `lib/exe/taskrunner.php`, or document all replaced scheduled jobs.
- [x] Implement indexer locking and background indexing semantics from upstream `inc/indexer.php`.
- [x] Match DokuWiki log retention and `dontlog` behavior with D1/Cloudflare logs.
- [x] Add scheduled backup automation equivalent to an operator-run production backup policy.
- [ ] Add operational checks for Cloudflare quotas that replace local disk free-space checks.
- [ ] Add a production rehearsal using final source import, remote D1/R2/KV resources, and rollback verification.

## Security And Anti-Abuse

- [ ] Match DokuWiki's wordblock behavior and config toggles exactly, including local wordblock overrides.
- [ ] Match upstream email obfuscation modes from `mailguard`: visible, hex, and none.
- [x] Match upstream external link `rel` behavior from `relnofollow`.
- [x] Match upstream upload XSS protection toggles from `iexssprotect`.
- [ ] Match upstream CSRF token names and behavior where legacy clients rely on `sectok`.
- [ ] Match upstream cookie path behavior from `cookiedir`.
- [ ] Match upstream secure cookie and SameSite settings from `securecookie` and `samesitecookie`.
- [ ] Match DokuWiki's message rendering for security and ACL denials instead of only native JSON or simplified HTML messages.
- [ ] Add parity tests for XSS, unsafe media, wordblock, ACL bypass, and CSRF cases from upstream DokuWiki test fixtures where available.

## Testing And Verification

- [ ] Add golden-output tests comparing upstream DokuWiki HTML with Pages HTML for bundled `wiki:syntax`, `wiki:dokuwiki`, `wiki:welcome`, and representative production pages.
- [ ] Add route parity tests for every upstream action class in `../dokuwiki/inc/Action`.
- [ ] Add parser parity tests for every upstream parser mode in `../dokuwiki/inc/Parsing/ParserMode`.
- [ ] Add media parity tests against upstream `lib/exe/fetch.php`, `detail.php`, and `mediamanager.php` outputs.
- [ ] Add feed parity tests for all upstream feed types and feed configuration combinations.
- [ ] Add search parity tests comparing query parsing, ranking, snippets, namespace filters, and ACL filtering.
- [ ] Add admin parity tests for every bundled plugin replacement page.
- [ ] Add auth parity tests for imported legacy users, unsupported hash types, remember-me, profile deletion, and superuser/manager config expressions.
- [ ] Add localization parity tests for at least one non-English DokuWiki language pack.
- [ ] Add visual regression baselines captured from a running upstream DokuWiki instance, not only the Pages port.
- [ ] Add a checklist review after importing production content so gaps not visible in starter pages are captured.
