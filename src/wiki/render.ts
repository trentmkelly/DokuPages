import { cleanPageId } from "./page-id";

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

export function renderWikiText(source: string): RenderedWikiText {
  const blocks: string[] = [];
  const toc: TocItem[] = [];
  const title: { value: string | null } = { value: null };
  const state: ParserState = {
    paragraph: [],
    list: [],
    code: [],
    table: []
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = parseHeading(line);

    if (heading) {
      flushAll(blocks, state);
      const id = uniqueAnchor(slugify(heading.title), toc);
      toc.push({ id, level: heading.level, title: heading.title });
      title.value ??= heading.title;
      blocks.push(
        `<h${heading.level} id="${id}">${renderInline(heading.title)}</h${heading.level}>`
      );
      continue;
    }

    const listItem = line.match(/^\s{2,}[*-]\s+(.*)$/);
    if (listItem) {
      flushParagraph(blocks, state);
      flushCode(blocks, state);
      flushTable(blocks, state);
      state.list.push(listItem[1]);
      continue;
    }

    if (line.startsWith("  ")) {
      flushParagraph(blocks, state);
      flushList(blocks, state);
      flushTable(blocks, state);
      state.code.push(line.slice(2));
      continue;
    }

    if (/^[|^].*[|^]\s*$/.test(line)) {
      flushParagraph(blocks, state);
      flushList(blocks, state);
      flushCode(blocks, state);
      state.table.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushAll(blocks, state);
      continue;
    }

    flushList(blocks, state);
    flushCode(blocks, state);
    flushTable(blocks, state);
    state.paragraph.push(line.trim());
  }

  flushAll(blocks, state);

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
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
  if (!match) return null;

  return {
    level: 7 - match[1].length,
    title: match[2].trim()
  };
}

function flushAll(blocks: string[], state: ParserState): void {
  flushParagraph(blocks, state);
  flushList(blocks, state);
  flushCode(blocks, state);
  flushTable(blocks, state);
}

function flushParagraph(blocks: string[], state: ParserState): void {
  if (state.paragraph.length === 0) return;

  blocks.push(`<p>${renderInline(state.paragraph.join(" "))}</p>`);
  state.paragraph = [];
}

function flushList(blocks: string[], state: ParserState): void {
  if (state.list.length === 0) return;

  const items = state.list.map((item) => `<li>${renderInline(item)}</li>`).join("");
  blocks.push(`<ul>${items}</ul>`);
  state.list = [];
}

function flushCode(blocks: string[], state: ParserState): void {
  if (state.code.length === 0) return;

  blocks.push(`<pre><code>${escapeHtml(state.code.join("\n"))}</code></pre>`);
  state.code = [];
}

function flushTable(blocks: string[], state: ParserState): void {
  if (state.table.length === 0) return;

  const rows = state.table.map((row) => {
    const headerRow = row.startsWith("^");
    const separator = headerRow ? "^" : "|";
    const cells = row
      .split(separator)
      .slice(1, -1)
      .map((cell) => cell.trim());
    const tag = headerRow ? "th" : "td";

    return `<tr>${cells.map((cell) => `<${tag}>${renderInline(cell)}</${tag}>`).join("")}</tr>`;
  });

  blocks.push(`<table>${rows.join("")}</table>`);
  state.table = [];
}

function renderInline(source: string): string {
  const nowiki: string[] = [];
  let rendered = source.replace(/%%([\s\S]*?)%%/g, (_match, literal: string) => {
    const token = `\uE000${nowiki.length}\uE001`;
    nowiki.push(escapeHtml(literal));
    return token;
  });

  rendered = escapeHtml(rendered);
  rendered = renderMedia(rendered);
  rendered = renderLinks(rendered);
  rendered = rendered
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\/\/([^/]+)\/\//g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/&#39;&#39;([^]+?)&#39;&#39;/g, "<code>$1</code>")
    .replace(/,,([^,]+),,/g, "<sub>$1</sub>")
    .replace(/&lt;sub&gt;([^]+?)&lt;\/sub&gt;/g, "<sub>$1</sub>")
    .replace(/&lt;sup&gt;([^]+?)&lt;\/sup&gt;/g, "<sup>$1</sup>")
    .replace(/&lt;del&gt;([^]+?)&lt;\/del&gt;/g, "<del>$1</del>");

  for (const [index, literal] of nowiki.entries()) {
    rendered = rendered.replace(`\uE000${index}\uE001`, literal);
  }

  return rendered;
}

function renderMedia(source: string): string {
  return source.replace(
    /\{\{([^}|?]+)(?:\?[^}|]+)?(?:\|([^}]*))?\}\}/g,
    (_match, rawId, rawAlt) => {
      const id = cleanPageId(rawId);
      const src = `/media/${encodeURIComponent(id.replaceAll(":", "/"))}`;
      const alt = rawAlt ? rawAlt.trim() : id;
      return `<img src="${src}" alt="${escapeAttribute(alt)}">`;
    }
  );
}

function renderLinks(source: string): string {
  return source.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = rawTarget.trim();
    const label = rawLabel?.trim() || target;
    const external = /^https?:\/\//i.test(target);
    const href = external
      ? target
      : `/wiki/${encodeURIComponent(cleanPageId(target).replaceAll(":", "/"))}`;

    return `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
  });
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
