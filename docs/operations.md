# Operations Runbook

This runbook covers the current `dokutest` Pages validation environment.

## Backup Workflow

Create an on-demand Cloudflare backup before migration rehearsals, production-like
smoke tests, or any risky data operation:

```sh
npm run backup:export
```

The export script writes a timestamped directory under `.wrangler/backups/`. Each
backup contains:

- `d1.sql`, created with `wrangler d1 export`.
- `backup-manifest.json`, recording the source database, bucket, mode, and media object metadata.
- `r2/`, containing every distinct R2 object key referenced by `media` or `media_revisions`.

Use an explicit output directory when a release needs a named restore point:

```sh
npm run backup:export -- --output .wrangler/backups/pre-launch
```

Backup directories are intentionally ignored by git. Move launch-critical
backups to durable operator-controlled storage after verifying the manifest and
object count.

## Restore Workflow

Restore into an empty preview target first when possible:

```sh
npm run backup:restore -- --backup .wrangler/backups/pre-launch --yes
```

The restore script executes the exported D1 SQL and uploads every manifest media
object back into the configured R2 bucket. It requires `--yes` for non-dry-run
restores because the operation can overwrite target database rows and media
objects.

Validate the restored target before reopening writes:

```sh
npm run test:e2e -- --base-url https://dokutest.pages.dev
curl https://dokutest.pages.dev/api/health
```

For media-heavy restores, compare representative file hashes from the backup
manifest against downloaded media responses.

## Rollback Workflow

Use the smallest rollback that removes the bad state:

- If a deployment is bad but storage is trustworthy, redeploy the last known good commit or use the previous Pages deployment URL while the main branch is fixed.
- If bad writes reached D1, freeze writes and restore from the most recent verified backup or use D1 Time Travel.
- If media uploads are bad, restore the affected R2 objects from backup and verify the D1 media rows point at the restored object keys.
- If the port cannot serve production traffic safely, route traffic back to the source DokuWiki deployment until a fixed Pages deployment passes smoke tests.

Useful inspection commands:

```sh
npx wrangler pages deployment list --project-name dokutest --environment production
npx wrangler d1 time-travel info dokuwiki_pages_dev
```

Keep the source DokuWiki read-only during rollback verification unless the
rollback plan explicitly defines a final sync window.

## Launch Checklist

- Confirm the source wiki write-freeze or final sync window.
- Run a full import dry run and review page, media, revision, user, ACL, and metadata counts.
- Export a named pre-launch backup of the target Cloudflare resources.
- Apply pending D1 migrations to the target database.
- Upload imported media to the target R2 bucket.
- Deploy the companion Page Lock Durable Object Worker when its code or config changed.
- Deploy the Pages project from the approved commit.
- Verify Pages bindings for D1, R2, KV, and `PAGE_LOCKS`.
- Verify runtime environment variables.
- Run deployed smoke tests and `/api/health`.
- Spot-check ACL-protected pages, anonymous pages, edits, media upload/download, search, feeds, sitemap, admin diagnostics, and audit logs.
- Keep rollback routing and the verified backup available through the launch watch period.
