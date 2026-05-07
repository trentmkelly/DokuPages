# Local Development

## Setup

```sh
npm install
```

## Validate

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
```

## Run Locally

```sh
npm run dev
```

Wrangler reads `wrangler.toml` and serves static assets from `public/`.

## Seed Local D1

Apply migrations and seed a small local wiki:

```sh
npm run db:migrate:local
npm run db:seed:local
```

The seed file is `seed/local.sql`. It is idempotent and creates a welcome page, syntax page, sidebar, playground page, search postings, changelog rows, and diagnostics-visible import metadata.

## Deploy

Preview:

```sh
npm run deploy:preview
```

Production:

```sh
npm run deploy
```

The current scripts deploy to the `dokutest` Pages project.
