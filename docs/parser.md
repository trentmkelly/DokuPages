# Parser And Renderer

The initial parser is a native TypeScript renderer in `src/wiki/render.ts`. It is intentionally scoped to syntax needed by the bundled seed pages and early migration tests, not full DokuWiki compatibility.

## Supported In This Slice

- headings with title metadata and table-of-contents extraction
- paragraphs
- bold, italic, underline, monospace, subscript, superscript, and deleted text
- internal links
- external links through explicit DokuWiki link syntax
- media embeds
- unordered lists
- indented code blocks
- nowiki spans
- simple tables

## Still Pending

- full DokuWiki parser mode compatibility
- nested lists
- footnotes
- quotes
- file blocks
- interwiki links
- Windows share links
- email links and mailguard behavior
- acronym, entity, smiley, and typography replacement
- section edit anchors
- parser instruction caching
- plugin syntax hooks
