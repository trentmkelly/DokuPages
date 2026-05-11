# Deployment And Environment

The current validation target is the Cloudflare Pages project `dokutest`.

## Bindings

`wrangler.toml` defines the Pages deployment shape:

- `DB`: D1 database `dokuwiki_pages_dev`.
- `RENDER_CACHE`: KV namespace used for rendered/discovery cache and rate-limit counters.
- `MEDIA_BUCKET`: R2 bucket `dokuwiki-pages-dev-media`.
- `PAGE_LOCKS`: Durable Object binding to the companion `dokutest-page-locks` Worker.

`wrangler.page-locks.toml` deploys the companion Durable Object Worker that owns
the `PageLockObject` class. Deploy it before Pages when lock code or the Durable
Object config changes.

## Runtime Variables

Optional Pages environment variables:

- `TITLE`: DokuWiki-compatible wiki display title. Default: `DokuWiki`.
  `SITE_NAME` remains supported as a legacy alias.
- `TAGLINE`: optional DokuWiki default-template tagline shown below the title.
  Default: blank.
- `SIDEBAR`: DokuWiki-compatible sidebar page ID. Default: `sidebar`; set an
  empty value to disable sidebar lookup.
- `LICENSE`: DokuWiki-compatible content license ID from the bundled default
  license map, such as `cc-by-nc-sa` or `cc-by`. Default: `cc-by-nc-sa`; use
  `none`, `0`, or `false` to hide content-license text.
- `START_PAGE`: start page ID. Default: `wiki:welcome`.
- `DEACCENT`: DokuWiki-compatible page ID accent handling. `0` keeps accented
  letters, `1` deaccents, and `2` romanizes before deaccenting. Default: `1`.
- `SEPCHAR`: DokuWiki-compatible word separator for cleaned page IDs. Default:
  `_`.
- `USESLASH`: truthy value makes DokuWiki-style ID cleaning treat `/` as a
  namespace separator. Public Pages routes always use slash path segments at the
  route boundary.
- `FNENCODE`: DokuWiki-compatible filename encoding for page path helpers:
  `url`, `safe`, or `utf-8`. Default: `url`.
- `WIKI_LANG`: supported language tag. Defaults to English fallback.
- `SEARCH_NSLIMIT`: when a search is launched from a page action, append an
  `@namespace` filter from the current page's first N namespace levels unless
  the query already has namespace filters. Default: `0`.
- `SEARCH_FRAGMENT`: DokuWiki-compatible default fragment search mode for
  non-search-form queries: `exact`, `starts_with`, `ends_with`, or `contains`.
  Default: `exact`.
- `RECENT`: default number of recent-change rows shown on `/recent` and feeds
  when the request does not provide an explicit limit. Default: `20`.
- `RECENT_DAYS`: DokuWiki-compatible recent-change retention window, in days,
  used to omit older changelog rows from recent-change views and feeds. Default:
  `7`; set to `0` to show all retained D1 changelog rows.
- `BREADCRUMBS`: number of recent visited pages to keep in the DokuWiki-style
  trace. Default: `10`; set to `0` to disable the trace.
- `YOUAREHERE`: truthy value enables the DokuWiki-style hierarchical "You are
  here" trail. Default: disabled.
- `FULLPATH`: truthy value makes page info display the logical data path
  instead of the relative page file path. Default: disabled.
- `DFORMAT`: DokuWiki-style strftime date format used by page template
  `@DATE@` replacement. Default: `%Y/%m/%d %H:%M`.
- `SIGNATURE`: DokuWiki-compatible editor signature template inserted by the
  toolbar signature button. Supports `@MAIL@`, `@NAME@`, and `@DATE@`. Default:
  ` --- //[[@MAIL@|@NAME@]] @DATE@//`.
- `SHOWUSERAS`: DokuWiki-compatible editor display mode: `loginname`,
  `username`, `username_link`, `email`, or `email_link`. Default: `loginname`.
- `CACHETIME`: DokuWiki-compatible cache lifetime in seconds. Media fetches use
  `max(CACHETIME, 3600)` for normal `cache` requests and `CACHETIME` for
  `cache=recache`. Default: `86400`.
- `LOCKTIME`: maximum page edit lock age in seconds, matching DokuWiki
  `locktime`. Default: `900`; set to `0` to disable edit locks.
- `USEDRAFT`: enables DokuWiki-style edit draft autosave and recovery screens.
  Default: enabled.
- `SESSION_COOKIE_NAME`: session cookie name. Default: `DW_PAGES_SESSION`.
- `SUPERUSER`: DokuWiki-style comma-separated user/group member list for full
  admin access. Default: `@admin`.
- `MANAGER`: DokuWiki-style comma-separated user/group member list for
  manager-level admin dashboard and revert access. Default: `@manager`.
- `HIDE_PAGES`: regular expression for page IDs hidden from aggregate outputs.
- `SNEAKY_INDEX`: truthy value enables DokuWiki-style namespace hiding.
- `APP_VERSION`: display/build version override. Defaults to the package version.
  Static asset URLs append the Pages commit SHA prefix when Cloudflare provides
  it, so CSS/JS cache entries are refreshed on each deployment.
- `API_CORS_ORIGINS`: comma-separated exact origins allowed to call the native
  `/api/v1` JSON API cross-origin. Default: no cross-origin API access.
- `EMAIL_PROVIDER`: set to `resend` to enable outbound mail.
- `EMAIL_PROVIDER_ENDPOINT`: optional Resend-compatible endpoint override.
- `EMAIL_FROM`: fixed sender address for outbound mail. `MAILFROM` is the
  DokuWiki-compatible alias and supports `@MAIL@`, `@USER@`, and `@NAME@`
  placeholders, resolved to a safe noreply sender in serverless mail.
- `EMAIL_REPLY_TO`: optional fixed reply-to address.
- `EMAIL_RETURN_PATH`: optional fixed return-path header value.
  `MAILRETURNPATH` is the DokuWiki-compatible alias.
- `EMAIL_BASE_URL`: optional public base URL for email links.
- `EMAIL_REGISTRATION_NOTIFY`: optional comma-separated registration notification recipients.
- `REGISTERNOTIFY`: DokuWiki-compatible alias for registration notification
  recipients.
- `EMAIL_NOTIFY` or `NOTIFY`: optional comma-separated admin recipients for
  page change and media upload notifications.
- `MAILPREFIX`: optional DokuWiki-style subject prefix. When omitted, subjects
  are prefixed with the wiki title, matching upstream Mailer behavior.
- `HTMLMAIL`: set to `0` to send text-only provider payloads. Default: enabled.
- `EMAIL_TASK_TOKEN`: bearer token required by the scheduled email digest
  endpoint.
- `AUTOPASSWD`: set to `1` to use DokuWiki-style generated-password
  registration. Requires outbound email configuration.
- `PROFILECONFIRM`: set to `0` to disable DokuWiki-style current-password
  confirmation on profile update and own-account delete forms. Default:
  enabled.
- `TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key for login and
  registration forms.
- `DOKUWIKI_COOKIE_SALT`: Pages secret containing the upstream
  `auth_cookiesalt()` value, usually `data/meta/_htcookiesalt` from a migrated
  DokuWiki install. It signs DokuWiki-compatible media resize tokens.
- `REFCHECK`: set to `0` to disable DokuWiki-style media delete reference
  checks. Default: enabled.
- `MEDIAREVISIONS`: set to `0` to disable media revision history, restore,
  and old-revision fetches. Default: enabled.
- `IEXSSPROTECT`: set to `0` to disable DokuWiki's upstream upload XSS scan.
  Default: enabled.
- `FETCHSIZE`: maximum bytes `lib/exe/fetch.php` may download for external
  image media. Default: `0`, which disables proxy downloads and redirects to the
  original URL like upstream DokuWiki.
- `RSS_MEDIA`: controls whether recent-change feeds include `pages`, `media`,
  or `both`, matching DokuWiki's `rss_media` setting. Default: `both`.
- `RSS_TYPE`: default `/feed.php` format: `rss`, `rss1`, `rss2`, `atom`, or
  `atom1`. Default: `rss1`, matching upstream DokuWiki.
- `RSS_LINKTO`: feed item link target: `diff`, `page`, `rev`, or `current`.
  Default: `diff`.
- `RSS_CONTENT`: feed item body mode: `abstract`, `diff`, `htmldiff`, or
  `html`. Default: `abstract`.
- `RSS_SHOW_SUMMARY`: set to `0` to omit edit summaries from feed item titles.
  Default: enabled.
- `RSS_SHOW_DELETED`: set to `0` to omit deleted items from feeds. Default:
  enabled.
- `RSS_UPDATE`: feed cache lifetime in seconds. Default: `300`; set to `0` to
  bypass KV feed caching.
- `SITEMAP`: sitemap cache/regeneration frequency in days. Default: `1`; set
  to `0` to disable `/sitemap.xml` and omit the sitemap line from
  `/robots.txt`.
- `UPDATECHECK`: DokuWiki-compatible update notice switch. The Pages runtime
  always keeps upstream PHP update notices disabled; setting this to a truthy
  value produces a configuration warning instead of fetching or rendering
  `update.dokuwiki.org` messages. Update the port through git and Cloudflare
  Pages deployments.
- `EXTERNAL_AUTH_MODE`: set to `cloudflare_access` to resolve request
  principals from trusted Cloudflare Access headers after syncing users/groups
  into D1. Default: `off`.
- `EXTERNAL_AUTH_EMAIL_HEADER`: header used for external auth email matching.
  Default: `CF-Access-Authenticated-User-Email`.
- `EXTERNAL_AUTH_USERNAME_HEADER`: optional header used for external auth
  username matching when the identity layer sends one separately.

Cloudflare-provided variables such as `CF_PAGES_BRANCH`, `CF_PAGES_COMMIT_SHA`,
and `CF_PAGES_URL` are read when available.

Set `API_BEARER_TOKEN` as a Pages secret when remote API automation should be
enabled. Set `RESEND_API_KEY` or `EMAIL_API_TOKEN` as a Pages secret when
outbound email should be enabled. Set `EMAIL_TASK_TOKEN` when scheduled digest
execution is enabled. Set `TURNSTILE_SECRET_KEY` as a Pages secret when
Turnstile gating should be enforced. Set `DOKUWIKI_COOKIE_SALT` as a Pages
secret before enabling tokenized resized-media URLs. Wrangler authentication,
API bearer tokens, provider tokens, Turnstile secrets, and imported cookie salts
stay outside the repository and should never be checked in. `npm run
scan:secrets` guards tracked files for high-signal tokens.

Admins can inspect the effective runtime configuration at `/admin/config` and
download a JSON configuration backup from `/api/admin/config/export`. Secret
values are never included in the page or export; the backup records only whether
each supported secret is configured. Runtime variables that map to upstream
DokuWiki settings include their `lib/plugins/config/settings/config.metadata.php`
handler, choices, ranges, patterns, and caution level in the page and export.
Imported `conf/local.php` and `conf/local.protected.php` values are used at
request time for render-safe parser and display controls such as `camelcase`,
`typography`, `useheading`, TOC levels, section edit limits, `autoplural`,
`relnofollow`, and `target.*`. Imported upstream defaults from `dokuwiki.php`
remain metadata only so a source install's baseline file does not silently
override Pages environment variables.

Configuration editing is a permanent deployment operation for this Pages port,
not a writable runtime admin feature like DokuWiki's bundled config plugin.
Pages Functions cannot mutate their own environment variables or secrets safely
at runtime; update Cloudflare Pages variables/secrets or Wrangler configuration
and redeploy.

Set `MAINTENANCE_MODE=1` during final sync or incident response to keep the wiki
readable while blocking page/media writes, drafts, edit locks, and native API
content writes. Clear the variable and redeploy to resume writes.

After a deployment, warm important rendered/discovery cache entries:

```sh
npm run cache:warm -- --base-url https://dokutest.pages.dev
```

For `authad`, `authldap`, or `authpdo` migrations, generate a normalized
manifest and apply the sync SQL before enabling `EXTERNAL_AUTH_MODE`:

```sh
npm run auth:sync:sql -- --input .wrangler/auth-bridge-users.json --sql-out .wrangler/auth-bridge-sync.sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/auth-bridge-sync.sql
```

## Deployment Decisions

- Secrets: `API_BEARER_TOKEN` is optional and only required for native remote
  API automation. Wrangler credentials remain operator-local.
- Custom domain: not configured for `dokutest`; the validation target remains
  `dokutest.pages.dev`.
- Cache rules: no account-level Cloudflare cache rule is required. Runtime cache
  behavior is controlled by response headers, KV-rendered cache entries, and
  discovery document TTLs.
- Backup before deployment: run `npm run backup:export` before risky migrations,
  rehearsals, or production-like deploys.
- Rollback deployment: use the rollback workflow in `docs/operations.md`, either
  by redeploying a known-good commit, restoring storage, or routing back to the
  source DokuWiki deployment.

## Local Setup

```sh
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

## D1 Migration Workflow

Local migration:

```sh
npm run db:migrate:local
```

Remote migration:

```sh
npx wrangler d1 migrations apply dokuwiki_pages_dev --remote
```

For imported DokuWiki data, generate SQL and execute it against the target D1
database:

```sh
npm run import:sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/dokuwiki-import.sql
```

## Deploy

Deploy the Durable Object Worker when needed:

```sh
npm run deploy:locks
```

Deploy a Pages preview branch:

```sh
npm run deploy:preview
```

Deploy the current main branch to the validation Pages project:

```sh
npm run deploy
```

After deployment:

```sh
npm run test:e2e -- --base-url https://dokutest.pages.dev
```

When email digests are enabled, schedule an authenticated POST to the digest
task endpoint. Run the default daily task from a daily schedule, and run the
weekly interval from a weekly schedule:

```sh
curl -X POST https://dokutest.pages.dev/api/tasks/email-digests \
  -H "Authorization: Bearer $EMAIL_TASK_TOKEN"

curl -X POST 'https://dokutest.pages.dev/api/tasks/email-digests?interval=weekly' \
  -H "Authorization: Bearer $EMAIL_TASK_TOKEN"
```

## Backup And Restore

Export the validation D1 database and referenced R2 media objects:

```sh
npm run backup:export
```

Restore a backup into the configured validation resources:

```sh
npm run backup:restore -- --backup .wrangler/backups/<timestamp> --yes
```

Use `--dry-run` on either command to print the Wrangler operations before
performing writes.
