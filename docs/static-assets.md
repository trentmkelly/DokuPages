# Static Assets

Static assets live under `public/` and are served directly by Cloudflare Pages.

## Build-Time Decisions

No generated asset step is required for launch. The current port checks in the
CSS, JavaScript, DokuWiki logo, icons, and image assets that Pages serves.

Top-level HTML references use `?v=<APP_VERSION>-<CF_PAGES_COMMIT_SHA prefix>`
fingerprints for cache busting on Cloudflare Pages, falling back to
`?v=<APP_VERSION>` when the Pages commit SHA is unavailable:

- `/dokuwiki.css`
- `/dokuwiki.js`
- `/dokuwiki-logo.png`
- `/images/favicon.ico`
- `/images/apple-touch-icon.png`

DokuWiki legacy asset endpoints redirect to the versioned CSS and JavaScript
paths.

## Language Assets

The launch UI validates `WIKI_LANG` against bundled DokuWiki language tags.
Authentication pages use generated native TypeScript resources from upstream
`inc/lang/<lang>` files. Refresh those resources with `npm run lang:auth` after
updating the upstream DokuWiki checkout. Imported custom `conf/lang` files are
stored in D1 and loaded as runtime overrides for the supported auth/UI strings
and page intros.

## Plugin Assets

Supported bundled plugin behavior is native, so there are no plugin asset
directories to copy for launch. Future native modules must commit assets under
`public/` or bundle them through the normal Pages build.

## Integrity

Subresource Integrity is not required for the current launch surface because the
app does not load CSS or JavaScript from third-party origins. The security model
keeps `script-src` and `style-src` limited to `self`.
