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

- `SITE_NAME`: wiki display name. Default: `DokuWiki Pages`.
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
- `BREADCRUMBS`: number of recent visited pages to keep in the DokuWiki-style
  trace. Default: `10`; set to `0` to disable the trace.
- `YOUAREHERE`: truthy value enables the DokuWiki-style hierarchical "You are
  here" trail. Default: disabled.
- `FULLPATH`: truthy value makes page info display the logical data path
  instead of the relative page file path. Default: disabled.
- `DFORMAT`: DokuWiki-style strftime date format used by page template
  `@DATE@` replacement. Default: `%Y/%m/%d %H:%M`.
- `LOCKTIME`: maximum page edit lock age in seconds, matching DokuWiki
  `locktime`. Default: `900`; set to `0` to disable edit locks.
- `USEDRAFT`: enables DokuWiki-style edit draft autosave and recovery screens.
  Default: enabled.
- `SESSION_COOKIE_NAME`: session cookie name. Default: `DW_PAGES_SESSION`.
- `HIDE_PAGES`: regular expression for page IDs hidden from aggregate outputs.
- `SNEAKY_INDEX`: truthy value enables DokuWiki-style namespace hiding.
- `APP_VERSION`: display/build version override. Defaults to the package version.
  Static asset URLs append the Pages commit SHA prefix when Cloudflare provides
  it, so CSS/JS cache entries are refreshed on each deployment.
- `API_CORS_ORIGINS`: comma-separated exact origins allowed to call the native
  `/api/v1` JSON API cross-origin. Default: no cross-origin API access.
- `EMAIL_PROVIDER`: set to `resend` to enable outbound mail.
- `EMAIL_PROVIDER_ENDPOINT`: optional Resend-compatible endpoint override.
- `EMAIL_FROM`: fixed sender address for outbound mail.
- `EMAIL_REPLY_TO`: optional fixed reply-to address.
- `EMAIL_RETURN_PATH`: optional fixed return-path header value.
- `EMAIL_BASE_URL`: optional public base URL for email links.
- `EMAIL_REGISTRATION_NOTIFY`: optional comma-separated registration notification recipients.
- `EMAIL_TASK_TOKEN`: bearer token required by the scheduled email digest
  endpoint.
- `TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key for login and
  registration forms.

Cloudflare-provided variables such as `CF_PAGES_BRANCH`, `CF_PAGES_COMMIT_SHA`,
and `CF_PAGES_URL` are read when available.

Set `API_BEARER_TOKEN` as a Pages secret when remote API automation should be
enabled. Set `RESEND_API_KEY` or `EMAIL_API_TOKEN` as a Pages secret when
outbound email should be enabled. Set `EMAIL_TASK_TOKEN` when scheduled digest
execution is enabled. Set `TURNSTILE_SECRET_KEY` as a Pages secret when
Turnstile gating should be enforced. Wrangler authentication, API bearer tokens,
provider tokens, and Turnstile secrets stay outside the repository and should
never be checked in. `npm run scan:secrets` guards tracked files for
high-signal tokens.

Admins can inspect the effective runtime configuration at `/admin/config` and
download a JSON configuration backup from `/api/admin/config/export`. Secret
values are never included in the page or export; the backup records only whether
each supported secret is configured.

Configuration editing remains a deployment operation. Pages Functions cannot
mutate their own environment variables or secrets safely at runtime; update
Cloudflare Pages variables/secrets or Wrangler configuration and redeploy.

Set `MAINTENANCE_MODE=1` during final sync or incident response to keep the wiki
readable while blocking page/media writes, drafts, edit locks, and native API
content writes. Clear the variable and redeploy to resume writes.

After a deployment, warm important rendered/discovery cache entries:

```sh
npm run cache:warm -- --base-url https://dokutest.pages.dev
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
