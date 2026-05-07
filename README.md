# DokuWiki Pages.dev Port

Private working repository for porting DokuWiki to the Cloudflare Pages ecosystem.

The current deployment is a Cloudflare Pages scaffold with:

- static assets in `public/`
- Pages Functions in `functions/`
- shared TypeScript modules in `src/`
- D1 schema migrations in `migrations/`
- migration planning and architecture notes in `docs/`
- a tracked migration checklist in `CHECKLIST.md`
- GPL attribution and licensing notes in `NOTICE.md` and `COPYING`

The DokuWiki-style shell and `public/dokuwiki.css` adapt the upstream DokuWiki default template under GPL-2.0. Copied template images live in `public/dokuwiki-logo.png` and `public/images/`, with upstream icon credits preserved in `NOTICE.md`.

## Common Commands

```sh
npm install
npm run typecheck
npm test
npm run lint
npm run dev
npm run deploy
```

`npm run deploy` currently targets the `dokutest` Pages project that was created for deployment validation.
