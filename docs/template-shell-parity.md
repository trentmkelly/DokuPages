# Template Shell Parity

The Pages shell is compared against DokuWiki's GPL-2.0 default template files:

- `../dokuwiki/lib/tpl/dokuwiki/main.php`
- `../dokuwiki/lib/tpl/dokuwiki/tpl_header.php`
- `../dokuwiki/lib/tpl/dokuwiki/tpl_footer.php`

`test/template-shell-parity.test.mjs` verifies that the upstream template still
contains the shell landmarks the port mirrors, then renders representative
Pages routes for DokuWiki page modes and checks the generated landmark order and
`mode_$ACT` class.

Covered mode routes:

| DokuWiki mode    | Pages route                       |
| ---------------- | --------------------------------- |
| `mode_show`      | `/wiki/wiki/welcome`              |
| `mode_edit`      | `/wiki/wiki/welcome?do=edit`      |
| `mode_revisions` | `/wiki/wiki/welcome?do=revisions` |
| `mode_diff`      | `/wiki/wiki/welcome?do=diff`      |
| `mode_recent`    | `/recent`                         |
| `mode_search`    | `/search?q=welcome`               |
| `mode_index`     | `/index?ns=wiki`                  |
| `mode_backlink`  | `/wiki/wiki/welcome?do=backlink`  |
| `mode_login`     | `/login`                          |
| `mode_register`  | `/register`                       |
| `mode_media`     | `/media-manager?ns=wiki`          |

The comparison is structural rather than byte-for-byte. Dynamic values such as
URLs, generated metadata, localization, omitted PHP indexer web bugs, and
Pages-specific asset paths are covered by focused route and visual tests instead
of this shell parity check.
