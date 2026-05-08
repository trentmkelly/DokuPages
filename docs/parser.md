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
- section edit anchors
- DokuWiki-template link classes for internal, external, interwiki, mail, media,
  and Windows-share links

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

- full DokuWiki parser mode compatibility
- parser instruction caching
- plugin syntax hooks
