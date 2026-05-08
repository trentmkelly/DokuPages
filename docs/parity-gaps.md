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
- RSS feed aggregation syntax: current source has one occurrence in
  `wiki:syntax`; implement a Pages-native safe fetch/cache policy only if
  production content depends on feed aggregation.
- Code highlighting metadata: code and file blocks render safely, but language
  metadata is not passed through a highlighter. Add a static highlighter only if
  production content relies on highlighted snippets.
- Downloadable file block metadata: file labels render, but generated downloads
  are not emitted. Add generated attachment routes only if production content
  uses this DokuWiki behavior.
- Syntax plugin INFO macro: current starter content has one occurrence. Replace
  with a native informational block if production content uses syntax plugin
  macros outside the starter syntax page.

## P2

- Server-side thumbnail generation: current media strategy serves originals and
  documents derivative policy headers. Add a Worker-compatible derivative
  pipeline only if production media volume and layout require thumbnails.
- Thumbnail cache and stale fallback: intentionally deferred until there is
  measured demand for generated derivatives.
- XML-RPC, JSON-RPC, and OpenAPI method compatibility: endpoints return explicit
  unsupported responses. Implement only if current clients require legacy remote
  method compatibility.
- LDAP, Active Directory, and PDO auth backends: replace with an external
  identity sync bridge or SSO path rather than runtime PHP auth plugins.
- Runtime styling editor: build-time checked-in CSS replaces the DokuWiki
  styling plugin. Revisit only if operators need browser-based theme edits.

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
