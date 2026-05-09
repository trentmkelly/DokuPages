# DokuWiki Syntax Inventory

Source: `../dokuwiki/data/pages`

Scanned 4 page files and 572 source lines.

## Pages

| Page ID                 | Source path                 | Lines |
| ----------------------- | --------------------------- | ----: |
| `playground:playground` | `playground/playground.txt` |     2 |
| `wiki:dokuwiki`         | `wiki/dokuwiki.txt`         |    63 |
| `wiki:syntax`           | `wiki/syntax.txt`           |   476 |
| `wiki:welcome`          | `wiki/welcome.txt`          |    31 |

## Detected Syntax Features

| Feature                          | Renderer status | Occurrences | Pages                                                                   | Notes                                                                                      |
| -------------------------------- | --------------- | ----------: | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Headings                         | supported       |          38 | `playground:playground`, `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome` |                                                                                            |
| Bold                             | supported       |          10 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Italic                           | supported       |           5 | `wiki:syntax`                                                           |                                                                                            |
| Underline                        | supported       |           2 | `wiki:syntax`                                                           |                                                                                            |
| Monospace                        | supported       |          35 | `wiki:syntax`                                                           |                                                                                            |
| Subscript                        | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Superscript                      | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Deleted text                     | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Forced line breaks               | supported       |           4 | `wiki:syntax`, `wiki:welcome`                                           |                                                                                            |
| Internal links                   | supported       |          21 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Explicit external links          | supported       |          12 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Automatic external links         | supported       |          18 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Interwiki links                  | supported       |          54 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Windows share links              | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Email links                      | supported       |           2 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Media embeds                     | supported       |          11 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Media used as link labels        | supported       |           2 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Media resizing                   | supported       |           3 | `wiki:syntax`                                                           |                                                                                            |
| Media link-only option           | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Media alignment or title         | supported       |           6 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| RSS feed aggregation syntax      | supported       |           1 | `wiki:syntax`                                                           | Renderer fetches and caches remote feeds with DokuWiki-style aggregation parameters.       |
| Unordered lists                  | supported       |          54 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Ordered lists                    | supported       |           4 | `wiki:syntax`                                                           |                                                                                            |
| Tables                           | supported       |          31 | `wiki:syntax`                                                           |                                                                                            |
| Quote blocks                     | supported       |           5 | `wiki:syntax`                                                           |                                                                                            |
| Footnotes                        | supported       |           3 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Horizontal rules                 | supported       |           1 | `wiki:syntax`                                                           |                                                                                            |
| Code blocks                      | supported       |           8 | `wiki:syntax`                                                           |                                                                                            |
| File blocks                      | supported       |           4 | `wiki:syntax`                                                           |                                                                                            |
| Indented code blocks             | supported       |          41 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Code/file language metadata      | partial         |           5 | `wiki:syntax`                                                           | Renderer preserves code/file content but does not run GeSHi highlighting.                  |
| Downloadable file block metadata | partial         |           2 | `wiki:syntax`                                                           | Renderer displays file labels but does not provide generated downloads.                    |
| No-formatting spans and blocks   | supported       |          39 | `wiki:syntax`                                                           |                                                                                            |
| Smileys                          | supported       |          27 | `wiki:dokuwiki`, `wiki:syntax`                                          |                                                                                            |
| Typography replacements          | supported       |          27 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Acronym replacement              | supported       |          16 | `wiki:dokuwiki`, `wiki:syntax`, `wiki:welcome`                          |                                                                                            |
| Syntax plugin macros             | supported       |           1 | `wiki:syntax`                                                           | Current content uses the bundled INFO syntax plugin macro, which has a native replacement. |

## Follow-Up Notes

- partial: Code/file language metadata (5 occurrences) - Renderer preserves code/file content but does not run GeSHi highlighting.
- partial: Downloadable file block metadata (2 occurrences) - Renderer displays file labels but does not provide generated downloads.
- supported: Syntax plugin macros (1 occurrence) - Current content uses the bundled INFO syntax plugin macro, which has a native replacement.

The current source is mostly DokuWiki's bundled starter content. The
`wiki:syntax` page intentionally exercises broad syntax coverage, so this
inventory should be rerun after importing production content.
