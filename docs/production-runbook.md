# Production Runbook

This runbook is the final operator path for moving a source DokuWiki flat-file
tree into the Pages-native deployment. It assumes the implementation has already
passed the pre-launch validation in `CHECKLIST.md`.

## Current PoC Target

The current proof-of-concept launch target is `https://dokutest.pages.dev`.
There is no production custom domain or DNS cutover target for this validation
project. Treat DNS switch, source production archive, and old-route retirement
steps below as no-ops until a real production hostname is selected.

The completed proof-of-concept launch evidence is recorded in
`docs/launch-audit.md`.

## Launch Inputs

Before starting the final sync, confirm:

- source tree path, usually `../dokuwiki`
- production Pages project and custom domain, if one is in scope
- production D1 database, KV namespace, R2 bucket, and `PAGE_LOCKS` binding
- DNS rollback target for the existing DokuWiki deployment, if DNS is changing
- final write-freeze window and launch approval
- GitHub Actions backup schedule enabled with Cloudflare backup credentials
- scheduler location that will call `/api/tasks/email-digests`
- Cloudflare Turnstile site key and secret if login/registration bot gating is
  required on the target

Do not run the final import or DNS cutover until these inputs are explicit.

## Pre-Freeze Backup

Create a named backup of the target Cloudflare resources:

```sh
npm run backup:export -- --output .wrangler/backups/pre-launch
```

Move launch-critical backup artifacts out of the repo workspace into durable
operator-controlled storage. Verify the manifest exists:

```sh
test -f .wrangler/backups/pre-launch/backup-manifest.json
npm run backup:verify -- --backup .wrangler/backups/pre-launch
```

## Source Freeze

Freeze writes on the PHP DokuWiki source or start the agreed final sync window.
If the Pages target must block writes during final sync, set
`MAINTENANCE_MODE=1` in Pages configuration and redeploy. Public reads continue;
page and media writes return HTTP 503.

## Final Export

Generate and review final import artifacts from the frozen source tree:

```sh
command -v bzip2 # required only when data/attic contains .txt.bz2 revisions
npm run import:dry-run
npm run import:sql
npm run import:media-manifest
npm run import:hash-manifest
```

The dry run report must match expected counts for pages, attic page revisions,
media, media revisions, ACL rules, users, metadata, config, plugin settings,
custom language files, and custom template files.
If the source wiki uses bzip2-compressed page attic files and `command -v bzip2`
does not find an executable, install the OS `bzip2` package before generating
import artifacts.

## Final Import

Apply the D1 import SQL, then upload R2 media:

```sh
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/dokuwiki-import.sql
npm run import:media-upload
```

Re-run either command if an operator-visible transient failure interrupts the
import. The generated SQL is idempotent for imported rows, and the media upload
state skips already uploaded objects by object key, source path, byte length,
and content hash.

## Validation

Verify imported content hashes:

```sh
npm run import:verify-hashes
```

Run the deployed checks:

```sh
npm run smoke -- --base-url https://dokutest.pages.dev
npm run alerts:check
npm run test:visual -- --base-url https://dokutest.pages.dev
curl https://dokutest.pages.dev/api/diagnostics
```

Spot-check representative pages, representative media, login, registration,
password reset, subscriptions, edit-save, media upload/download, search, feeds,
sitemap, admin diagnostics, admin audit, and ACL-protected content.

## Deploy And Cutover

Deploy Durable Object code when lock code or config changed:

```sh
npm run deploy:locks
```

Deploy the approved Pages commit:

```sh
npm run deploy
```

Warm important cache entries:

```sh
npm run cache:warm -- --base-url https://dokutest.pages.dev
```

After validation passes, switch DNS or the production route to the Pages target.
Keep the old DokuWiki route available for rollback until the launch watch period
ends.

## Launch Watch

During the watch period:

- monitor `npm run alerts:check`
- monitor `/api/diagnostics`
- inspect Cloudflare Pages Function logs for 5xx responses and route errors
- inspect D1, KV, R2, and Durable Object health in diagnostics
- verify user login and edit flows with a real account
- verify media reads and representative media cache headers
- verify scheduled digest calls with `Authorization: Bearer <EMAIL_TASK_TOKEN>`

Keep `MAINTENANCE_MODE=1` available for incident response.

## Rollback

Use the smallest rollback that removes the bad state:

- bad deployment only: redeploy the last known good commit or select the prior
  Pages deployment
- bad D1 writes: freeze writes, restore from the named backup, or use D1 Time
  Travel
- bad media writes: restore affected R2 objects from backup and verify matching
  D1 media rows
- severe launch blocker: route traffic back to the source DokuWiki deployment

Useful commands:

```sh
npx wrangler pages deployment list --project-name dokutest --environment production
npx wrangler d1 time-travel info dokuwiki_pages_dev
npm run backup:restore -- --backup .wrangler/backups/pre-launch --yes
```

After rollback, run smoke tests and keep the source wiki read-only until the
next final sync window is approved.

## Post-Launch

After the launch watch period:

- review production logs and reported issues
- fix launch blockers and rerun regression tests
- tune cache, database indexes, search behavior, and media delivery from real
  traffic data
- verify the scheduled backup workflow is producing retained artifacts and
  perform a test restore into a non-production target
- review Cloudflare billing and quotas
- revisit the parity gap register in `docs/parity-gaps.md`
- archive the old DokuWiki deployment after the agreed retention period
