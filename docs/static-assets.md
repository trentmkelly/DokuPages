# Static Assets

Static assets live under `public/` and are served directly by Cloudflare Pages.

## Build-Time Decisions

No generated asset step is required for launch. The current port checks in the
CSS, JavaScript, DokuWiki logo, icons, and image assets that Pages serves.

Top-level HTML references use `?v=<APP_VERSION>` fingerprints for cache busting:

- `/dokuwiki.css`
- `/dokuwiki.js`
- `/dokuwiki-logo.png`
- `/images/favicon.ico`
- `/images/apple-touch-icon.png`

DokuWiki legacy asset endpoints redirect to the versioned CSS and JavaScript
paths.

## Language Assets

The launch UI is native English copy with `WIKI_LANG` validation for DokuWiki
language tags. No PHP language packs are loaded at runtime. Additional localized
UI strings should be added as native TypeScript resources rather than copied as
PHP language files.

## Plugin Assets

Supported bundled plugin behavior is native, so there are no plugin asset
directories to copy for launch. Future native modules must commit assets under
`public/` or bundle them through the normal Pages build.

## Integrity

Subresource Integrity is not required for the current launch surface because the
app does not load CSS or JavaScript from third-party origins. The security model
keeps `script-src` and `style-src` limited to `self`.
