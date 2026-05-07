# Parser And Renderer

The native TypeScript renderer lives in `src/wiki/render.ts`. It targets the
DokuWiki syntax surface needed by the port and migration tests, but it is not a
drop-in implementation of DokuWiki's PHP parser mode system.

The current source-page syntax inventory is tracked in
`docs/syntax-inventory.md` and can be regenerated with:

```sh
node scripts/inventory-syntax.mjs --source ../dokuwiki/data/pages --output docs/syntax-inventory.md
```

## Supported

- headings with title metadata and table-of-contents extraction
- paragraphs
- bold, italic, underline, monospace, subscript, superscript, and deleted text
- internal links
- external links through explicit DokuWiki link syntax
- interwiki links
- Windows share links
- email links with mailguard behavior
- media embeds
- unordered lists
- nested lists
- quote blocks
- footnotes
- indented code blocks
- file blocks
- nowiki spans
- simple tables
- acronym, entity, smiley, and typography replacement
- section edit anchors

## Still Pending

- full DokuWiki parser mode compatibility
- parser instruction caching
- plugin syntax hooks
