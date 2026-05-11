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
| `implemented`               |    67 |
| `imported_metadata_only`    |     8 |
| `intentionally_unsupported` |    31 |
| `not_yet_evaluated`         |     9 |

Remaining not-yet-evaluated settings are `securecookie`, `samesitecookie`,
`remote`, `remoteuser`, `remotecors`, `usewordblock`, `mailguard`,
`trustedproxies`, and `realip`.
