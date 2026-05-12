# DokuWiki Pages.dev Port

A proof-of-concept port of DokuWiki to Cloudflare Pages, Pages Functions, D1,
KV, R2, and Durable Objects.

This repository was based on DokuWiki `2025-05-14b "Librarian"`. It was built
primarily with `gpt-5.5-xhigh`, with some supporting work done with
`gpt-5.5-low`. The project is mainly a demonstration of long-term goal pursuit
by an AI coding agent against a real legacy application. It is not intended to
be a maintained DokuWiki fork and will likely not receive ongoing updates.

The DokuWiki-style shell and `public/dokuwiki.css` adapt the upstream DokuWiki
default template under GPL-2.0. Copied template images live in
`public/dokuwiki-logo.png` and `public/images/`, with upstream icon credits
preserved in `NOTICE.md`.

## Repository Layout

- `public/`: static assets deployed by Cloudflare Pages
- `functions/`: Pages Functions entry points
- `src/`: shared TypeScript application, storage, parser, auth, and rendering code
- `migrations/`: D1 schema migrations
- `seed/`: starter seed data for a new D1 database
- `scripts/`: import, deploy, backup, test, admin, and maintenance scripts
- `docs/`: detailed notes for deployment, operations, security, parity, and testing
- `CHECKLIST.md`: tracked porting checklist
- `NOTICE.md` and `COPYING`: GPL attribution and licensing notes

## Launch On A New Pages.dev URL

These commands assume you are creating a new Cloudflare Pages project named
`<project>`. The site URL will be `https://<project>.pages.dev`.

1. Install dependencies and authenticate Wrangler.

   ```sh
   npm install
   npx wrangler login
   ```

2. Create the Cloudflare resources.

   ```sh
   npx wrangler d1 create <database>
   npx wrangler kv namespace create RENDER_CACHE
   npx wrangler r2 bucket create <bucket>
   ```

3. Edit `wrangler.toml`.

   Set:
   - `name = "<project>"`
   - `database_name = "<database>"`
   - `database_id = "<database_id from wrangler d1 create>"`
   - the `RENDER_CACHE` namespace `id`
   - `bucket_name = "<bucket>"`
   - `script_name = "<project>-page-locks"`

4. Edit `wrangler.page-locks.toml`.

   Set:
   - `name = "<project>-page-locks"`

5. Apply the D1 schema to Cloudflare.

   ```sh
   npx wrangler d1 migrations apply <database> --remote
   ```

6. Optionally seed the starter wiki content.

   ```sh
   npx wrangler d1 execute <database> --remote --file seed/local.sql
   ```

7. Configure runtime secrets and optional integrations.

   ```sh
   npx wrangler pages secret put DOKUWIKI_COOKIE_SALT --project-name <project>
   npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name <project>
   ```

   Add `TURNSTILE_SITE_KEY` as a Pages environment variable if registration or
   login should use Cloudflare Turnstile. Email configuration and other runtime
   settings are covered in `docs/deployment.md`.

8. Deploy the companion Durable Object Worker used for page edit locks.

   ```sh
   npx wrangler deploy --config wrangler.page-locks.toml
   ```

9. Deploy the Pages site.

   ```sh
   npx wrangler pages deploy public --project-name <project> --branch main
   ```

10. Run a smoke check.

    ```sh
    npm run smoke -- --base-url https://<project>.pages.dev
    ```

The package scripts currently target the original validation deployment at
`dokutest.pages.dev`. For a different Pages project, either update the scripts in
`package.json` or use the explicit `wrangler` commands above.

## Importing An Existing DokuWiki

The import scripts expect an upstream DokuWiki checkout or install at
`../dokuwiki` by default. Generate SQL and media manifests first, then apply the
SQL to D1 and upload media to R2.

```sh
npm run import:dry-run
npm run import:sql
npm run import:media-manifest
npm run import:hash-manifest
```

See `docs/data-import.md` for the full import workflow, verification steps, and
known compatibility limits.

## Common Commands

```sh
npm run dev
npm run typecheck
npm test
npm run lint
npm run format:check
npm run deploy:locks
npm run deploy
```

`npm run deploy` currently targets the `dokutest` Pages project that was created
for deployment validation. `npm run deploy:locks` publishes the companion
Durable Object Worker used by Pages edit locks.

## Additional Documentation

- Admin operations: `docs/admin.md`
- Deployment and environment setup: `docs/deployment.md`
- Features and limitations: `docs/features.md`
- Observability: `docs/observability.md`
- Backup, restore, rollback, and launch operations: `docs/operations.md`
- Performance notes: `docs/performance.md`
- Plugin compatibility decisions: `docs/plugin-compatibility.md`
- Security notes: `docs/security.md`
- Testing workflow: `docs/testing.md`
- URL compatibility and redirect audit: `docs/url-compatibility.md`
