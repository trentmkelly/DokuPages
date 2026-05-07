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
