# Parity Gap Register

This register reviews unsupported feature requests and prioritizes remaining
DokuWiki parity gaps for the Pages-native port.

## Review Sources

Reviewed sources:

- `docs/features.md`
- `docs/plugin-compatibility.md`
- `docs/syntax-inventory.md`
- `docs/remote-api.md`
- `docs/auth.md`
- `docs/media.md`
- `docs/performance.md`
- current `../dokuwiki/data/pages` syntax inventory

No separate user-reported unsupported feature queue exists in this repository
yet. The list below therefore treats documented unsupported features, partial
syntax support, and deferred plugin/auth/runtime compatibility as the current
feature request backlog.

## Launch Blockers

None from application feature parity.

The remaining launch blockers are operational approvals and cutover actions:
source freeze, launch approval, final import, DNS or route cutover, and
post-launch monitoring.

## P1

- Production backup automation: the manual backup and restore scripts are
  implemented and verified, but a recurring production scheduler still needs an
  operator-owned runner and credential policy.
- Downloadable file block metadata: file labels render, but generated downloads
  are not emitted. Add generated attachment routes only if production content
  uses this DokuWiki behavior.

## P2

- Thumbnail cache and stale fallback: generated PNG/JPEG/WebP derivatives are
  served on demand. Persistent derivative caching remains intentionally deferred
  until measured media volume requires it.
- XML-RPC, JSON-RPC, and OpenAPI method compatibility: endpoints return explicit
  unsupported responses. Implement only if current clients require legacy remote
  method compatibility.
- Runtime styling editor: native `/admin/styling` covers DokuWiki-style template
  color replacements through D1-backed CSS variables. Full upstream popup
  preview behavior remains outside the launch surface unless operators need it.

## Not Planned

- Runtime PHP execution, arbitrary PHP plugins, and production extension-manager
  code uploads are not planned for Pages. They conflict with the serverless
  runtime and security model.
- DokuWiki installer execution is not planned for production. Provisioning is
  handled through migrations, imports, Cloudflare bindings, and deployment
  configuration.
- Raw HTML embedding is not planned without a dedicated sanitizer and explicit
  trust boundary. HTML-like wiki content remains escaped by default.

## Review Cadence

Revisit this register after launch, after the first production content import,
and whenever user-reported unsupported feature requests arrive. Promote a gap
only when there is real production content, a client integration, or an operator
workflow depending on it.
