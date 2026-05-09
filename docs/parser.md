# Parser And Renderer

The native TypeScript renderer lives in `src/wiki/render.ts`. It targets the
DokuWiki syntax surface needed by the port and migration tests, but it is not a
drop-in implementation of DokuWiki's PHP parser mode system.

The current source-page syntax inventory is tracked in
`docs/syntax-inventory.md` and can be regenerated with:

```sh
node scripts/inventory-syntax.mjs --source ../dokuwiki/data/pages --output docs/syntax-inventory.md
```

## Instruction Cache Equivalent

DokuWiki's PHP parser can cache intermediate instruction arrays. The Pages port
does not preserve that internal representation. Instead, it caches deterministic
render output in KV with the page ID, revision ID, renderer version, title, HTML,
and table-of-contents payload. Current pages use `page:{id}` and immutable old
revisions use `page:{id}:{revisionId}`; stale entries are rejected when revision
or renderer version no longer match.

This avoids a second parser-specific cache format while preserving the same
runtime goal: repeated page views bypass parsing and rendering unless the source
revision, renderer version, privacy rules, or `~~NOCACHE~~` directive require a
fresh render.

## Supported

- headings with title metadata and table-of-contents extraction
- paragraphs
- bold, italic, underline, monospace, subscript, superscript, and deleted text
- internal links
- external links through explicit DokuWiki link syntax and imported scheme rules
- interwiki links with imported shortcut overrides
- Windows share links
- email links with mailguard behavior
- media embeds
- unordered lists
- nested lists
- horizontal rules
- quote blocks
- footnotes
- indented code blocks
- file blocks with filename download links through `export_code`
- nowiki spans
- simple tables
- imported acronym, entity, and smiley replacement
- typography replacement
- optional CamelCase links
- DokuWiki-style `rel="ugc nofollow"` external-link policy, including imported
  `relnofollow` disablement
- configurable link targets for wiki, interwiki, external, media, and
  Windows-share links
- optional DokuWiki autoplural lookup for missing internal links
- section edit anchors
- DokuWiki-template link classes for internal, external, interwiki, mail, media,
  and Windows-share links

## Parser Mode Compatibility Subset

This port does not embed `inc/Parsing/Parser.php` or DokuWiki's PHP parser mode
state machine. The supported subset is the native renderer behavior below,
backed by `test/render.test.ts`, `test/syntax-fixture.test.mjs`,
`test/wordblock.test.ts`, and the import/config tests named in the coverage
column. `test/parser-compatibility-doc.test.mjs` guards this table so every
upstream parser mode has an explicit status before the parser checklist can be
treated as covered.

| Upstream parser mode | Status      | Pages-native coverage or policy                                                                                          |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Acronym`            | native      | Imported/default acronym replacement, tested in `test/render.test.ts`.                                                   |
| `Camelcaselink`      | native      | Optional `CAMELCASE` internal links, tested in `test/render.test.ts`.                                                    |
| `Code`               | partial     | Code blocks and metadata are preserved; GeSHi highlighting is intentionally separate.                                    |
| `Emaillink`          | native      | Mail links and mailguard output, tested in `test/render.test.ts`.                                                        |
| `Entity`             | native      | Imported/default entity replacement, tested in `test/render.test.ts`.                                                    |
| `Eol`                | native      | Paragraph and line-break handling, tested in `test/render.test.ts`.                                                      |
| `Externallink`       | native      | Explicit and automatic external links with scheme config, tested in `test/render.test.ts`.                               |
| `File`               | partial     | File blocks render and expose `export_code`; syntax highlighting remains separate.                                       |
| `Filelink`           | native      | Media/file links, `linkonly`, sizing, tokenized fetch, and detail links in `test/render.test.ts`.                        |
| `Footnote`           | native      | Nested footnote rendering, tested in `test/render.test.ts`.                                                              |
| `Formatting`         | native      | Strong, emphasis, underline, monospace, sub, sup, and deleted text in `test/render.test.ts`.                             |
| `Header`             | native      | Heading levels, anchors, TOC, and section edit links in `test/render.test.ts`.                                           |
| `Hr`                 | native      | Horizontal rules, tested in `test/render.test.ts`.                                                                       |
| `Internallink`       | native      | Page links, missing-page classes, autoplural, and dependencies in `test/render.test.ts`.                                 |
| `Linebreak`          | native      | Forced line breaks, tested in `test/render.test.ts`.                                                                     |
| `Listblock`          | native      | Nested ordered and unordered lists, tested in `test/render.test.ts`.                                                     |
| `Media`              | native      | Image/media embeds, alignment, sizing, remote fetch links, and dependencies in `test/render.test.ts`.                    |
| `Multiplyentity`     | native      | Dimension multiplication replacement, tested in `test/render.test.ts`.                                                   |
| `Nocache`            | native      | `~~NOCACHE~~` render metadata, tested in `test/render.test.ts`.                                                          |
| `Notoc`              | native      | `~~NOTOC~~` TOC suppression, tested in `test/render.test.ts`.                                                            |
| `Plugin`             | unsupported | PHP syntax plugin hooks are not run in Workers; compatibility is tracked in plugin docs.                                 |
| `Preformatted`       | native      | Indented preformatted blocks, tested in `test/render.test.ts`.                                                           |
| `Quote`              | native      | Nested block quotes, tested in `test/render.test.ts` and `test/syntax-fixture.test.mjs`.                                 |
| `Quotes`             | native      | Configurable typography quote replacement, tested in `test/render.test.ts`.                                              |
| `Rss`                | deferred    | RSS aggregation syntax is intentionally tracked as a separate checklist item.                                            |
| `Smiley`             | native      | Imported/default smileys, tested in `test/render.test.ts`.                                                               |
| `Table`              | native      | Header cells, alignment, colspans, and rowspans, tested in `test/render.test.ts`.                                        |
| `Unformatted`        | native      | Nowiki/no-formatting spans and raw HTML escaping, tested in `test/render.test.ts`.                                       |
| `Windowssharelink`   | native      | Windows share links and target handling, tested in `test/render.test.ts`.                                                |
| `Wordblock`          | policy      | Save-time wordblock validation replaces parser-mode blocking, tested in `test/wordblock.test.ts` and `test/app.test.ts`. |

## Render Controls

The renderer accepts Pages runtime settings that mirror DokuWiki's heading and
section controls:

| DokuWiki setting | Pages environment variable | Default | Behavior                                                                                                                     |
| ---------------- | -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `toptoclevel`    | `TOP_TOC_LEVEL`            | `1`     | Lowest heading level included in generated TOCs.                                                                             |
| `tocminheads`    | `TOC_MIN_HEADS`            | `3`     | Minimum heading count required before TOC display.                                                                           |
| `maxtoclevel`    | `MAX_TOC_LEVEL`            | `3`     | Deepest heading level included in generated TOCs.                                                                            |
| `maxseclevel`    | `MAX_SECTION_EDIT_LEVEL`   | `3`     | Deepest heading level with section edit links.                                                                               |
| `useheading`     | `USE_HEADING`              | `false` | Prefer the first page heading as the display title.                                                                          |
| `camelcase`      | `CAMELCASE`                | `false` | Convert CamelCase words into internal page links.                                                                            |
| `typography`     | `TYPOGRAPHY`               | `1`     | `0` disables smart typography, `1` enables double quotes and multiply signs, `2` also enables single quotes and apostrophes. |

## Raw HTML And PHP

The Pages port intentionally does not enable DokuWiki-style trusted raw HTML or
embedded PHP execution. Raw tags, `<html>...</html>` blocks, and
`<php>...</php>` blocks are escaped as page text even if imported source content
contains them. This keeps rendered pages compatible with the Workers security
model, avoids introducing an HTML trust boundary inside shared wiki content, and
reflects that Pages has no PHP runtime for embedded snippets.

## Still Pending

- parser instruction caching
- plugin syntax hooks
