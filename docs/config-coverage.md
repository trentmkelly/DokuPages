# DokuWiki Configuration Coverage

The upstream `../dokuwiki/conf/dokuwiki.php` file currently defines 115 settings.
The machine-readable coverage map lives in `src/config-coverage.ts` and is tested
against that upstream file.

Status meanings:

- `implemented`: the Pages runtime has a native equivalent or fixed policy for
  the setting.
- `imported_metadata_only`: imports preserve the setting, but runtime behavior is
  not yet driven by it.
- `intentionally_unsupported`: the setting depends on PHP, local filesystem, web
  server, or runtime mutation behavior that does not apply to Pages.
- `not_yet_evaluated`: the setting is explicitly mapped but still needs a
  follow-up implementation or rejection decision.

Current counts:

| Status                      | Count |
| --------------------------- | ----: |
| `implemented`               |    71 |
| `imported_metadata_only`    |     6 |
| `intentionally_unsupported` |    31 |
| `not_yet_evaluated`         |     7 |

Remaining not-yet-evaluated settings are `securecookie`, `samesitecookie`,
`remote`, `remoteuser`, `remotecors`, `usewordblock`, and `mailguard`.

`updatecheck` is implemented as a fixed Pages policy: upstream DokuWiki update
notices are not fetched or rendered, because code updates are deployed through
git and Cloudflare Pages instead of PHP runtime self-update flows.

`trustedproxies` and `realip` are implemented as client-IP fallback policy. The
Pages runtime always prefers Cloudflare's `CF-Connecting-IP` header when present;
`REALIP` enables `X-Real-IP` only when that Cloudflare header is absent, and
`TRUSTEDPROXIES` enables `X-Forwarded-For` only when the listed proxy hops match
trusted IP/CIDR entries.
