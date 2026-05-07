import { resolveInterwikiLink } from "./interwiki";
import { cleanPageId, pageIdToRoutePath, resolvePageLinkId } from "./page-id";
import { mediaPath } from "./media-service";

export interface TocItem {
  id: string;
  level: number;
  title: string;
}

export interface RenderedWikiText {
  html: string;
  title: string | null;
  toc: TocItem[];
}

export interface RenderWikiTextOptions {
  pageId?: string;
}

export function renderWikiText(
  source: string,
  options: RenderWikiTextOptions = {}
): RenderedWikiText {
  const blocks: string[] = [];
  const toc: TocItem[] = [];
  const context: RenderContext = {
    footnotes: [],
    pageId: options.pageId ? cleanPageId(options.pageId) : undefined
  };
  const title: { value: string | null } = { value: null };
  const state: ParserState = {
    paragraph: [],
    list: [],
    code: [],
    table: [],
    quote: [],
    specialBlock: null
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (state.specialBlock) {
      if (line.trim().toLowerCase() === `</${state.specialBlock.type}>`) {
        flushSpecialBlock(blocks, state);
      } else {
        state.specialBlock.lines.push(line);
      }
      continue;
    }

    const specialBlockStart = line.match(/^<(code|file)(?:\s+([^>]+))?>\s*$/i);
    if (specialBlockStart) {
      flushAll(blocks, state, context);
      const type = specialBlockStart[1].toLowerCase() as "code" | "file";
      const meta = specialBlockStart[2]?.trim() || "";
      const metaParts = meta.split(/\s+/).filter(Boolean);
      state.specialBlock = {
        type,
        title:
          type === "file" && metaParts.length > 1 ? metaParts.slice(1).join(" ") : meta || null,
        lines: []
      };
      continue;
    }

    const heading = parseHeading(line);

    if (heading) {
      flushAll(blocks, state, context);
      const id = uniqueAnchor(slugify(heading.title), toc);
      toc.push({ id, level: heading.level, title: heading.title });
      title.value ??= heading.title;
      blocks.push(
        `<h${heading.level} id="${id}">${renderInline(heading.title, context)}</h${heading.level}>`
      );
      continue;
    }

    const listItem = line.match(/^\s{2,}[*-]\s+(.*)$/);
    if (listItem) {
      flushParagraph(blocks, state, context);
      flushCode(blocks, state);
      flushTable(blocks, state, context);
      flushQuote(blocks, state, context);
      state.list.push(listItem[1]);
      continue;
    }

    if (line.startsWith("  ")) {
      flushParagraph(blocks, state, context);
      flushList(blocks, state, context);
      flushTable(blocks, state, context);
      flushQuote(blocks, state, context);
      state.code.push(line.slice(2));
      continue;
    }

    if (/^[|^].*[|^]\s*$/.test(line)) {
      flushParagraph(blocks, state, context);
      flushList(blocks, state, context);
      flushCode(blocks, state);
      flushQuote(blocks, state, context);
      state.table.push(line);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph(blocks, state, context);
      flushList(blocks, state, context);
      flushCode(blocks, state);
      flushTable(blocks, state, context);
      state.quote.push(quote[1]);
      continue;
    }

    if (line.trim() === "") {
      flushAll(blocks, state, context);
      continue;
    }

    flushList(blocks, state, context);
    flushCode(blocks, state);
    flushTable(blocks, state, context);
    flushQuote(blocks, state, context);
    state.paragraph.push(line.trim());
  }

  flushAll(blocks, state, context);
  flushSpecialBlock(blocks, state);
  flushFootnotes(blocks, context);

  return {
    html: blocks.join("\n"),
    title: title.value,
    toc
  };
}

interface ParserState {
  paragraph: string[];
  list: string[];
  code: string[];
  table: string[];
  quote: string[];
  specialBlock: SpecialBlock | null;
}

interface SpecialBlock {
  type: "code" | "file";
  title: string | null;
  lines: string[];
}

interface RenderContext {
  footnotes: string[];
  pageId?: string;
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
  if (!match) return null;

  return {
    level: 7 - match[1].length,
    title: match[2].trim()
  };
}

function flushAll(blocks: string[], state: ParserState, context: RenderContext): void {
  flushParagraph(blocks, state, context);
  flushList(blocks, state, context);
  flushCode(blocks, state);
  flushTable(blocks, state, context);
  flushQuote(blocks, state, context);
}

function flushParagraph(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.paragraph.length === 0) return;

  blocks.push(`<p>${renderInline(state.paragraph.join(" "), context)}</p>`);
  state.paragraph = [];
}

function flushList(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.list.length === 0) return;

  const items = state.list.map((item) => `<li>${renderInline(item, context)}</li>`).join("");
  blocks.push(`<ul>${items}</ul>`);
  state.list = [];
}

function flushCode(blocks: string[], state: ParserState): void {
  if (state.code.length === 0) return;

  blocks.push(`<pre><code>${escapeHtml(state.code.join("\n"))}</code></pre>`);
  state.code = [];
}

function flushTable(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.table.length === 0) return;

  const rows = state.table.map((row) => {
    const headerRow = row.startsWith("^");
    const separator = headerRow ? "^" : "|";
    const cells = row
      .split(separator)
      .slice(1, -1)
      .map((cell) => cell.trim());
    const tag = headerRow ? "th" : "td";

    return `<tr>${cells.map((cell) => `<${tag}>${renderInline(cell, context)}</${tag}>`).join("")}</tr>`;
  });

  blocks.push(`<table>${rows.join("")}</table>`);
  state.table = [];
}

function flushQuote(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.quote.length === 0) return;

  blocks.push(`<blockquote><p>${renderInline(state.quote.join(" "), context)}</p></blockquote>`);
  state.quote = [];
}

function flushSpecialBlock(blocks: string[], state: ParserState): void {
  if (!state.specialBlock) return;

  const block = state.specialBlock;
  const code = `<pre><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;

  if (block.title) {
    blocks.push(
      `<dl class="${block.type}"><dt>${escapeHtml(block.title)}</dt><dd>${code}</dd></dl>`
    );
  } else {
    blocks.push(
      `<pre class="${block.type}"><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`
    );
  }

  state.specialBlock = null;
}

function flushFootnotes(blocks: string[], context: RenderContext): void {
  if (context.footnotes.length === 0) return;

  const notes = context.footnotes
    .map(
      (note, index) =>
        `<div class="fn" id="fn__${index + 1}"><sup><a href="#fnt__${index + 1}">${index + 1})</a></sup> ${renderInline(note, { footnotes: [], pageId: context.pageId })}</div>`
    )
    .join("");

  blocks.push(`<div class="footnotes">${notes}</div>`);
}

function renderInline(source: string, context: RenderContext): string {
  const nowiki: string[] = [];
  const footnotes: string[] = [];
  let rendered = source.replace(/%%([\s\S]*?)%%/g, (_match, literal: string) => {
    const token = `\uE000${nowiki.length}\uE001`;
    nowiki.push(escapeHtml(literal));
    return token;
  });

  rendered = rendered.replace(/\(\(([\s\S]+?)\)\)/g, (_match, note: string) => {
    const token = `\uE002${footnotes.length}\uE003`;
    footnotes.push(note);
    return token;
  });

  rendered = escapeHtml(rendered);
  rendered = renderTypography(rendered);
  rendered = renderMedia(rendered);
  rendered = renderLinks(rendered, context);
  rendered = rendered
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\/\/([^/]+)\/\//g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/&#39;&#39;([^]+?)&#39;&#39;/g, "<code>$1</code>")
    .replace(/,,([^,]+),,/g, "<sub>$1</sub>")
    .replace(/&lt;sub&gt;([^]+?)&lt;\/sub&gt;/g, "<sub>$1</sub>")
    .replace(/&lt;sup&gt;([^]+?)&lt;\/sup&gt;/g, "<sup>$1</sup>")
    .replace(/&lt;del&gt;([^]+?)&lt;\/del&gt;/g, "<del>$1</del>")
    .replace(/\\\\(?:\s|$)/g, "<br>");

  for (const [index, note] of footnotes.entries()) {
    const number = context.footnotes.push(note);
    rendered = rendered.replace(
      `\uE002${index}\uE003`,
      `<sup><a href="#fn__${number}" id="fnt__${number}">${number})</a></sup>`
    );
  }

  for (const [index, literal] of nowiki.entries()) {
    rendered = rendered.replace(`\uE000${index}\uE001`, literal);
  }

  return rendered;
}

function renderTypography(source: string): string {
  return source
    .replace(/&lt;-&gt;/g, "&harr;")
    .replace(/-&gt;/g, "&rarr;")
    .replace(/&lt;-/g, "&larr;")
    .replace(/=&gt;/g, "&rArr;")
    .replace(/&lt;=/g, "&lArr;")
    .replace(/\(c\)/gi, "&copy;")
    .replace(/\(r\)/gi, "&reg;")
    .replace(/\(tm\)/gi, "&trade;")
    .replace(/\.\.\./g, "&hellip;")
    .replace(/---/g, "&mdash;")
    .replace(/--/g, "&ndash;");
}

function renderMedia(source: string): string {
  return source.replace(
    /\{\{([^}|?]+)(?:\?[^}|]+)?(?:\|([^}]*))?\}\}/g,
    (_match, rawId, rawAlt) => {
      const id = cleanPageId(rawId);
      const alt = rawAlt ? rawAlt.trim() : id;
      return `<img src="${mediaPath(id)}" alt="${escapeAttribute(alt)}">`;
    }
  );
}

function renderLinks(source: string, context: RenderContext): string {
  return source.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = decodeHtmlEntities(rawTarget.trim());
    const label = decodeHtmlEntities(rawLabel?.trim() || target);
    const external = /^https?:\/\//i.test(target);
    const interwiki = external ? null : resolveInterwikiLink(target);
    const href = external
      ? target
      : interwiki
        ? interwiki.href
        : internalLinkPath(target, context.pageId);
    const rel = external || interwiki?.external ? ' rel="nofollow noopener noreferrer"' : "";

    return `<a href="${escapeAttribute(href)}"${rel}>${escapeHtml(label)}</a>`;
  });
}

function internalLinkPath(target: string, currentPageId: string | undefined): string {
  const [rawPageId = "", rawFragment] = target.split("#", 2);
  const fragment = rawFragment ? `#${slugify(rawFragment)}` : "";

  if (!rawPageId) {
    return fragment || "#";
  }

  return `${pageIdToRoutePath(resolvePageLinkId(rawPageId, currentPageId))}${fragment}`;
}

function uniqueAnchor(base: string, toc: TocItem[]): string {
  const existing = new Set(toc.map((item) => item.id));
  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function slugify(value: string): string {
  const slug = cleanPageId(value).replaceAll(":", "-").replaceAll("_", "-");
  return slug || "section";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
