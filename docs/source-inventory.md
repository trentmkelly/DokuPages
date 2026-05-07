# Source Inventory

Inventory of the current DokuWiki source tree used to scope the port.

## Entry Points

- `doku.php`
- `feed.php`
- `index.php`
- `install.php`
- `lib/exe/ajax.php`
- `lib/exe/css.php`
- `lib/exe/detail.php`
- `lib/exe/fetch.php`
- `lib/exe/indexer.php`
- `lib/exe/jquery.php`
- `lib/exe/js.php`
- `lib/exe/jsonrpc.php`
- `lib/exe/manifest.php`
- `lib/exe/mediamanager.php`
- `lib/exe/openapi.php`
- `lib/exe/opensearch.php`
- `lib/exe/taskrunner.php`
- `lib/exe/xmlrpc.php`

## Core, Plugins, Template, Vendor

- Core modules live under `inc/`.
- Bundled plugins: `acl`, `authad`, `authldap`, `authpdo`, `authplain`, `config`, `extension`, `info`, `logviewer`, `popularity`, `revert`, `safefnrecode`, `styling`, `usermanager`.
- The default template is `lib/tpl/dokuwiki/`.
- Vendor dependencies are under `vendor/`.

## Writable Data Directories

- `data/pages`
- `data/attic`
- `data/media`
- `data/media_attic`
- `data/meta`
- `data/media_meta`
- `data/cache`
- `data/index`
- `data/locks`
- `data/tmp`
- `data/log`

## Config And Scripts

- Config files live under `conf/`.
- Command line scripts live under `bin/`.

## Portability Hazards

- Filesystem reads and writes are central to pages, revisions, media, metadata, cache, index, locks, logs, and config.
- PHP sessions are used for login and transient messages.
- Headers, cookies, output buffering, gzip output, and direct static file streaming are used across request entrypoints.
- File timestamps drive revisions, cache freshness, search freshness, conflict detection, and change feeds.
- chmod, permissions, mkdir locks, touch, rename, unlink, and recursive directory operations assume a POSIX-like local filesystem.
- External commands are available through `io_exec`.
- Remote downloads and email are separate service integrations.
- Image processing and JPEG metadata handling need an R2/Workers-compatible replacement strategy.
- Gzip and bzip attic revisions need import-time decompression.
- Search index files under `data/index` need replacement.
- Plugin and extension hooks must be converted to explicit native extension points.

## Worker Portability Map

Inventory updated on 2026-05-07 from `../dokuwiki`. Runtime scans cover core PHP and bundled plugins/templates and exclude `vendor/` internals and translation-only language strings. Vendor dependencies are inventoried separately because the Pages port replaces them with native TypeScript or build-time behavior.

Representative scan command shape:

```sh
rg -n "<pattern>" ../dokuwiki -g '*.php' \
  -g '!../dokuwiki/vendor/**' \
  -g '!../dokuwiki/inc/lang/**' \
  -g '!../dokuwiki/lib/plugins/*/lang/**'
```

### Filesystem Reads

Direct read APIs and wrappers include `file_get_contents`, `fopen`, `readfile`, `file`, `glob`, `scandir`, `opendir`, `readdir`, `is_file`, `is_dir`, `file_exists`, `filesize`, `stat`, `lstat`, `realpath`, and SPL file/directory iterators.

Primary read ownership:

- Entry points and CLI: `doku.php`, `index.php`, `install.php`, `bin/dwpage.php`, `bin/indexer.php`, `bin/plugin.php`, `bin/render.php`, `bin/wantedpages.php`.
- Core storage wrappers: `inc/io.php`, `inc/File/PageFile.php`, `inc/File/MediaFile.php`, `inc/pageutils.php`, `inc/media.php`, `inc/changelog.php`, `inc/Draft.php`.
- Metadata, cache, and index: `inc/parser/metadata.php`, `inc/Cache/*`, `inc/Search/Indexer.php`, `inc/indexer.php`, `inc/search.php`, `inc/fulltext.php`.
- Config and localization: `conf/dokuwiki.php`, `inc/confutils.php`, `inc/load.php`, `inc/init.php`, `lib/plugins/config/core/*`.
- HTTP/media response paths: `inc/fetch.functions.php`, `lib/exe/fetch.php`, `lib/exe/detail.php`, `lib/exe/css.php`, `lib/exe/js.php`, `lib/exe/mediamanager.php`.
- Bundled plugins/templates with read paths: `acl`, `authplain`, `config`, `extension`, `logviewer`, `popularity`, `safefnrecode`, `styling`, `usermanager`, and `lib/tpl/dokuwiki/images/pagetools-build.php`.

### Filesystem Writes

Direct write APIs and wrappers include `file_put_contents`, `fwrite`, `fputs`, `mkdir`, `rename`, `unlink`, `rmdir`, `touch`, `copy`, `move_uploaded_file`, `gzopen`, `bzopen`, and permission-changing helpers.

Primary write ownership:

- Page, draft, lock, and revision writes: `inc/io.php`, `inc/File/PageFile.php`, `inc/common.php`, `inc/Draft.php`, `inc/Action/Resendpwd.php`, `bin/dwpage.php`.
- Media writes and upload handling: `inc/media.php`, `inc/Remote/ApiCore.php`.
- Cache, search, and task writes: `inc/Cache/Cache.php`, `inc/Search/Indexer.php`, `inc/indexer.php`, `inc/TaskRunner.php`.
- Logs and email/task side effects: `inc/Logger.php`, `inc/Subscriptions/BulkSubscriptionSender.php`.
- Config/plugin writes: `lib/plugins/config/core/Writer.php`, `lib/plugins/config/admin.php`, `lib/plugins/extension/*`, `lib/plugins/safefnrecode/action.php`, `lib/plugins/logviewer/action.php`, `lib/plugins/popularity/*`, `lib/plugins/usermanager/admin.php`.

### Worker-Incompatible PHP Runtime Functions

The port cannot run PHP runtime functions directly in Workers. Native replacements are required for:

- Local filesystem APIs: `file_*`, `fopen`, `fwrite`, `readfile`, directory iteration, `rename`, `unlink`, `mkdir`, `rmdir`, `touch`, `copy`, `move_uploaded_file`.
- Process APIs: `exec`, `io_exec`, shelling through Git/ImageMagick/template build helpers.
- Session/cookie APIs: `session_*`, `setcookie`, direct `$_SESSION` and `$_COOKIE`.
- Response APIs: `header`, `headers_sent`, output buffering, gzip/zlib output.
- Image and metadata APIs: GD/ImageMagick paths, `getimagesize`, EXIF/JPEG metadata parsing.
- Compression APIs: gzip and bzip page revision reads/writes.
- Mail APIs: `mail` and `DokuMailer`.

### Sessions

Session-dependent paths:

- `doku.php`, `feed.php`, `install.php`.
- `inc/init.php`, `inc/auth.php`, `inc/common.php`, `inc/Remote/ApiCore.php`.
- Request entry points under `lib/exe/`: `ajax.php`, `detail.php`, `fetch.php`, `jsonrpc.php`, `mediamanager.php`, `taskrunner.php`, `xmlrpc.php`.
- User-facing plugins: `lib/plugins/styling/popup.php`, `lib/plugins/usermanager/admin.php`.

### Headers, Cookies, And Output Buffering

Header/cookie/output-buffering paths:

- Global dispatch and exports: `doku.php`, `feed.php`, `index.php`, `inc/actions.php`, `inc/Action/Export.php`, `inc/Action/Preview.php`, `inc/Action/Sitemap.php`.
- HTTP utilities and response helpers: `inc/HTTP/Headers.php`, `inc/httputils.php`, `inc/fetch.functions.php`, `inc/template.php`, `inc/Manifest.php`, `inc/Sitemap/Mapper.php`.
- Legacy executables: `lib/exe/ajax.php`, `lib/exe/css.php`, `lib/exe/detail.php`, `lib/exe/fetch.php`, `lib/exe/jquery.php`, `lib/exe/js.php`, `lib/exe/jsonrpc.php`, `lib/exe/mediamanager.php`, `lib/exe/openapi.php`, `lib/exe/opensearch.php`.
- Template files: `lib/tpl/dokuwiki/main.php`, `lib/tpl/dokuwiki/detail.php`.
- Plugins with direct response output: `acl`, `extension`, `popularity`, `revert`, `styling`, `usermanager`.

### File Modification Times

mtime-dependent paths:

- Edit/lock freshness: `inc/Action/Edit.php`, `inc/Action/Locked.php`, `inc/Draft.php`, `inc/common.php`, `inc/io.php`.
- Revisions and feeds: `inc/File/PageFile.php`, `inc/File/MediaFile.php`, `inc/ChangeLog/ChangeLog.php`, `inc/Feed/*`, `inc/Sitemap/*`.
- Cache/search freshness: `inc/Cache/*`, `inc/Search/Indexer.php`, `inc/fulltext.php`, `inc/indexer.php`.
- Media and remote responses: `inc/media.php`, `inc/fetch.functions.php`, `inc/Remote/Response/Page.php`, `inc/Remote/Response/Media.php`.

### Permissions And Chmod

Permission/chmod-dependent paths:

- `inc/io.php`, `inc/init.php`, `inc/common.php`, `inc/auth.php`, `inc/media.php`, `inc/search.php`, `inc/template.php`.
- `inc/File/MediaFile.php`, `inc/Search/Indexer.php`, `inc/Sitemap/Mapper.php`, `inc/Subscriptions/BulkSubscriptionSender.php`.
- `install.php`, `bin/dwpage.php`.
- Bundled plugins: `authplain`, `config`, `extension`.

### Local Locks

Local lock-dependent paths:

- Edit/save/cancel/revert flow: `inc/Action/Edit.php`, `inc/Action/Save.php`, `inc/Action/Cancel.php`, `inc/Action/Revert.php`, `inc/Action/Locked.php`, `inc/Action/Show.php`.
- Core locking helpers: `inc/common.php`, `inc/io.php`, `inc/media.php`, `inc/Ajax.php`, `inc/Remote/ApiCore.php`.
- Index/task locking: `inc/Search/Indexer.php`, `inc/TaskRunner.php`, `lib/exe/js.php`.

### External Commands

Shell-out paths are limited and must be removed or replaced:

- `inc/io.php` defines `io_exec`.
- `inc/media.php` uses external media/image conversion paths.
- `inc/infoutils.php` shells for environment diagnostics.
- `bin/gittool.php` and `lib/tpl/dokuwiki/images/pagetools-build.php` are command-line/build helpers, not request-time Pages code.

### Remote Downloads

Remote network/download paths:

- HTTP client layer: `inc/HTTP/DokuHTTPClient.php`, `inc/HTTP/HTTPClient.php`, `inc/HTTP/HTTPClientException.php`, `inc/Remote/IXR/Client.php`.
- Remote media/feed/sitemap behavior: `inc/Feed/FeedParserFile.php`, `inc/fetch.functions.php`, `inc/media.php`, `inc/Sitemap/Mapper.php`.
- Extension/plugin repository behavior: `lib/plugins/extension/Extension.php`, `lib/plugins/extension/Installer.php`, `lib/plugins/extension/Repository.php`, `lib/plugins/extension/remote.php`, `lib/plugins/extension/cli.php`.
- Popularity/update behavior: `lib/plugins/popularity/helper.php`, `conf/dokuwiki.php`.
- Auth AD network behavior: `lib/plugins/authad/adLDAP/adLDAP.php`.

### Email

Email paths:

- `inc/Mailer.class.php`.
- Password and registration flows: `inc/Action/Resendpwd.php`, `inc/auth.php`, `inc/common.php`.
- Subscription senders: `inc/Subscriptions/*SubscriptionSender.php`, `inc/TaskRunner.php`.
- Parser/media notification surfaces: `inc/media.php`, `inc/parser/xhtml.php`.
- Auth AD Exchange helper: `lib/plugins/authad/adLDAP/classes/adLDAPExchange.php`.

### Image Processing

Image/media processing paths:

- Media core: `inc/media.php`, `inc/File/MediaFile.php`, `inc/fetch.functions.php`.
- JPEG metadata: `inc/JpegMeta.php`.
- Media UI and diffs: `inc/Ui/Media/DisplayRow.php`, `inc/Ui/Media/DisplayTile.php`, `inc/Ui/MediaDiff.php`.
- Rendering and search: `inc/parser/xhtml.php`, `inc/search.php`, `inc/template.php`.
- Config and extension references: `lib/plugins/config/core/Setting/SettingImConvert.php`, `lib/plugins/config/settings/config.metadata.php`, `lib/plugins/extension/*`.
- Template build helper: `lib/tpl/dokuwiki/images/pagetools-build.php`.

### Gzip And Bzip Revision Storage

Compressed revision paths:

- Global compression config: `conf/dokuwiki.php`, `lib/plugins/config/core/Setting/SettingCompression.php`, `lib/plugins/config/settings/config.metadata.php`.
- Revision read/write helpers: `inc/io.php`, `inc/pageutils.php`, `inc/DifferenceEngine.php`.
- Output/cache compression: `doku.php`, `lib/exe/css.php`, `inc/httputils.php`, `inc/init.php`, `inc/TaskRunner.php`, `inc/Sitemap/Mapper.php`.
- Extension install/package compression: `lib/plugins/extension/Installer.php`.

### Extension And Plugin Hooks

Hook inventory:

- Core event infrastructure: `inc/Extension/Event.php`, `inc/Extension/EventHandler.php`, `inc/Extension/PluginController.php`, `inc/Extension/*Plugin.php`, `inc/pluginutils.php`, `inc/load.php`.
- Plugin types: `auth`, `admin`, `syntax`, `action`, `renderer`, `helper`, `remote`, `cli`.
- Event source scan found 80 `new Event`/`Event::createAndTrigger` call sites across auth, page saves, IO, media, parser, renderer, template, feeds, search, sitemap, toolbar, menus, mail, task runner, and remote APIs.
- Bundled plugin hook registrations found 10 `register_hook` calls in `acl`, `authad`, `extension`, `logviewer`, `popularity`, `safefnrecode`, and `styling`.
- Native Pages extension support must start from explicit replacement extension points rather than loading arbitrary PHP plugin classes.
