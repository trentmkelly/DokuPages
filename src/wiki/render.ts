import { resolveInterwikiLink, type InterwikiTemplates } from "./interwiki";
import {
  cleanPageId,
  pageIdToRoutePath,
  resolvePageLinkId,
  type PageIdCleanOptions
} from "./page-id";
import { cleanMediaId, mediaDetailPath, mediaName, mediaPath } from "./media-service";

export interface TocItem {
  id: string;
  level: number;
  title: string;
}

export interface CacheDependency {
  subjectType: "page" | "media";
  subjectId: string;
}

export interface RenderedWikiText {
  html: string;
  title: string | null;
  toc: TocItem[];
  dependencies: CacheDependency[];
  noCache: boolean;
  noToc: boolean;
}

export interface ExtractedCodeBlock {
  type: "code" | "file";
  index: number;
  text: string;
  language: string | null;
  filename: string | null;
}

export type LinkTargetKind = "wiki" | "interwiki" | "extern" | "media" | "windows";
export type LinkTargets = Readonly<Partial<Record<LinkTargetKind, string | null>>>;

export interface RenderWikiTextOptions {
  pageId?: string;
  existingPageIds?: ReadonlySet<string>;
  entityReplacements?: ReadonlyArray<readonly [string, string]>;
  smileys?: Readonly<Record<string, string>>;
  acronyms?: Readonly<Record<string, string>>;
  interwikiTemplates?: InterwikiTemplates;
  linkSchemes?: ReadonlyArray<string> | ReadonlySet<string>;
  relNofollow?: boolean;
  linkTargets?: LinkTargets;
  autoPluralLinks?: boolean;
  sectionEdit?: boolean;
  topTocLevel?: number;
  maxTocLevel?: number;
  maxSectionEditLevel?: number;
  camelCaseLinks?: boolean;
  typographyMode?: number;
  pageIdCleanOptions?: PageIdCleanOptions;
  directives?: {
    noCache: boolean;
    noToc: boolean;
  };
}

const SMILEY_IMAGE_BASE = "/images/smileys";
const DEFAULT_ENTITY_REPLACEMENTS: Array<readonly [string, string]> = [
  ["<->", "↔"],
  ["->", "→"],
  ["<-", "←"],
  ["<=>", "⇔"],
  ["=>", "⇒"],
  ["<=", "⇐"],
  [">>", "»"],
  ["<<", "«"],
  ["---", "—"],
  ["--", "–"],
  ["(c)", "©"],
  ["(tm)", "™"],
  ["(r)", "®"],
  ["...", "…"]
];
// Default mapping from DokuWiki's conf/smileys.conf.
const DEFAULT_SMILEYS: Record<string, string> = {
  "8-)": "cool.svg",
  "8-O": "eek.svg",
  "8-o": "eek.svg",
  ":-(": "sad.svg",
  ":-)": "smile.svg",
  "=)": "smile2.svg",
  ":-/": "doubt.svg",
  ":-\\": "doubt2.svg",
  ":-?": "confused.svg",
  ":-D": "biggrin.svg",
  ":-P": "razz.svg",
  ":-o": "surprised.svg",
  ":-O": "surprised.svg",
  ":-x": "silenced.svg",
  ":-X": "silenced.svg",
  ":-|": "neutral.svg",
  ";-)": "wink.svg",
  "m(": "facepalm.svg",
  "^_^": "fun.svg",
  ":?:": "question.svg",
  ":!:": "exclaim.svg",
  LOL: "lol.svg",
  FIXME: "fixme.svg",
  DELETEME: "deleteme.svg"
};
// Default mapping from DokuWiki's conf/acronyms.conf.
const DEFAULT_ACRONYMS: Record<string, string> = {
  ACL: "Access Control List",
  AFAICS: "As far as I can see",
  AFAIK: "As far as I know",
  AFAIR: "As far as I remember",
  API: "Application Programming Interface",
  ASAP: "As soon as possible",
  ASCII: "American Standard Code for Information Interchange",
  BTW: "By the way",
  CMS: "Content Management System",
  CSS: "Cascading Style Sheets",
  DNS: "Domain Name System",
  EOF: "End of file",
  EOL: "End of line",
  EOM: "End of message",
  EOT: "End of text",
  FAQ: "Frequently Asked Questions",
  FTP: "File Transfer Protocol",
  FOSS: "Free & Open-Source Software",
  FLOSS: "Free/Libre and Open Source Software",
  FUD: "Fear, Uncertainty, and Doubt",
  FYI: "For your information",
  GB: "Gigabyte",
  GHz: "Gigahertz",
  GPL: "GNU General Public License",
  GUI: "Graphical User Interface",
  HTML: "HyperText Markup Language",
  IANAL: "I am not a lawyer (but)",
  IE: "Internet Explorer",
  IIRC: "If I remember correctly",
  IMHO: "In my humble opinion",
  IMO: "In my opinion",
  IOW: "In other words",
  IRC: "Internet Relay Chat",
  IRL: "In real life",
  KISS: "Keep it simple stupid",
  LAN: "Local Area Network",
  LGPL: "GNU Lesser General Public License",
  LOL: "Laughing out loud",
  MathML: "Mathematical Markup Language",
  MB: "Megabyte",
  MHz: "Megahertz",
  MSIE: "Microsoft Internet Explorer",
  OMG: "Oh my God",
  OS: "Operating System",
  OSS: "Open Source Software",
  OTOH: "On the other hand",
  PITA: "Pain in the Ass",
  RFC: "Request for Comments",
  ROTFL: "Rolling on the floor laughing",
  RTFM: "Read The Fine Manual",
  spec: "specification",
  TIA: "Thanks in advance",
  "TL;DR": "Too long; didn't read",
  TOC: "Table of Contents",
  URI: "Uniform Resource Identifier",
  URL: "Uniform Resource Locator",
  W3C: "World Wide Web Consortium",
  "WTF?": "What the f***",
  WYSIWYG: "What You See Is What You Get",
  YMMV: "Your mileage may vary"
};
const ACRONYM_BOUNDARY = "[\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7f]";
const DEFAULT_LINK_SCHEMES = new Set([
  "http",
  "https",
  "telnet",
  "gopher",
  "wais",
  "ftp",
  "ed2k",
  "irc",
  "ldap"
]);
const IMAGE_MEDIA_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png", "svg", "webp", "avif"]);
type ListType = "ul" | "ol";

export function renderWikiText(
  source: string,
  options: RenderWikiTextOptions = {}
): RenderedWikiText {
  const directives = options.directives ?? getWikiRenderDirectives(source);
  const blocks: string[] = [];
  const toc: TocItem[] = [];
  const context: RenderContext = {
    footnotes: [],
    dependencies: new Map(),
    pageId: options.pageId ? cleanPageId(options.pageId, options.pageIdCleanOptions) : undefined,
    existingPageIds: options.existingPageIds,
    entityReplacements: options.entityReplacements ?? DEFAULT_ENTITY_REPLACEMENTS,
    smileys: options.smileys ?? DEFAULT_SMILEYS,
    acronyms: options.acronyms ?? DEFAULT_ACRONYMS,
    interwikiTemplates: options.interwikiTemplates,
    linkSchemes: normalizeLinkSchemes(options.linkSchemes),
    relNofollow: options.relNofollow ?? true,
    linkTargets: normalizeLinkTargets(options.linkTargets),
    autoPluralLinks: options.autoPluralLinks ?? false,
    sectionEdit: options.sectionEdit ?? true,
    topTocLevel: clampHeadingLevel(options.topTocLevel, 1),
    maxTocLevel: clampHeadingLevel(options.maxTocLevel, 5),
    maxSectionEditLevel: clampHeadingLevel(options.maxSectionEditLevel, 5, 0),
    camelCaseLinks: options.camelCaseLinks ?? false,
    typographyMode: clampTypographyMode(options.typographyMode),
    pageIdCleanOptions: options.pageIdCleanOptions,
    sectionIndex: 0,
    anchorIds: new Set()
  };
  const title: { value: string | null } = { value: null };
  const state: ParserState = {
    paragraph: [],
    list: [],
    code: [],
    table: [],
    quote: [],
    specialBlock: null,
    codeBlockIndex: 0
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (isRenderDirectiveLine(line)) {
      continue;
    }

    if (state.specialBlock) {
      if (line.trim().toLowerCase() === `</${state.specialBlock.type}>`) {
        flushSpecialBlock(blocks, state, context);
      } else {
        state.specialBlock.lines.push(line);
      }
      continue;
    }

    const specialBlockStart = line.match(/^<(code|file)(?:\s+([^>]+))?>\s*$/i);
    if (specialBlockStart) {
      flushAll(blocks, state, context);
      const type = specialBlockStart[1].toLowerCase() as "code" | "file";
      const metadata = parseSpecialBlockMetadata(type, specialBlockStart[2]?.trim() || "");
      state.specialBlock = {
        type,
        index: state.codeBlockIndex,
        language: metadata.language,
        filename: metadata.filename,
        lines: []
      };
      state.codeBlockIndex += 1;
      continue;
    }

    const heading = parseHeading(line);

    if (heading) {
      flushAll(blocks, state, context);
      const id = uniqueAnchor(slugify(heading.title), context.anchorIds);
      if (heading.level >= context.topTocLevel && heading.level <= context.maxTocLevel) {
        toc.push({ id, level: heading.level, title: heading.title });
      }
      title.value ??= heading.title;
      context.sectionIndex += 1;
      blocks.push(
        `<h${heading.level} id="${id}">${renderInline(heading.title, context)}${renderSectionEditLink(
          heading.title,
          heading.level,
          context
        )}</h${heading.level}>`
      );
      continue;
    }

    if (/^-{4,}\s*$/.test(line)) {
      flushAll(blocks, state, context);
      blocks.push("<hr>");
      continue;
    }

    const listItem = line.match(/^(\s{2,})([*-])\s+(.*)$/);
    if (listItem) {
      flushParagraph(blocks, state, context);
      flushCode(blocks, state);
      flushTable(blocks, state, context);
      flushQuote(blocks, state, context);
      state.list.push({
        level: Math.max(1, Math.floor(listItem[1].length / 2)),
        type: listItem[2] === "-" ? "ol" : "ul",
        content: listItem[3]
      });
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

    const quote = line.match(/^(>+)\s?(.*)$/);
    if (quote) {
      flushParagraph(blocks, state, context);
      flushList(blocks, state, context);
      flushCode(blocks, state);
      flushTable(blocks, state, context);
      state.quote.push({ level: quote[1].length, content: quote[2] });
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
  flushSpecialBlock(blocks, state, context);
  flushFootnotes(blocks, context);

  return {
    html: blocks.join("\n"),
    title: title.value,
    toc: directives.noToc ? [] : toc,
    dependencies: sortedDependencies(context.dependencies),
    noCache: directives.noCache,
    noToc: directives.noToc
  };
}

export function extractCodeBlock(source: string, index: number): ExtractedCodeBlock | null {
  const wantedIndex = Number.isInteger(index) && index >= 0 ? index : -1;
  let current: SpecialBlock | null = null;
  let codeBlockIndex = 0;

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (current) {
      if (line.trim().toLowerCase() === `</${current.type}>`) {
        if (current.index === wantedIndex) {
          return specialBlockToExtracted(current);
        }
        current = null;
      } else {
        current.lines.push(line);
      }
      continue;
    }

    const specialBlockStart = line.match(/^<(code|file)(?:\s+([^>]+))?>\s*$/i);
    if (!specialBlockStart) continue;

    const type = specialBlockStart[1].toLowerCase() as "code" | "file";
    const metadata = parseSpecialBlockMetadata(type, specialBlockStart[2]?.trim() || "");
    current = {
      type,
      index: codeBlockIndex,
      language: metadata.language,
      filename: metadata.filename,
      lines: []
    };
    codeBlockIndex += 1;
  }

  return current?.index === wantedIndex ? specialBlockToExtracted(current) : null;
}

export function getWikiRenderDirectives(source: string): { noCache: boolean; noToc: boolean } {
  const directives = { noCache: false, noToc: false };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim().toUpperCase();
    directives.noCache ||= trimmed === "~~NOCACHE~~";
    directives.noToc ||= trimmed === "~~NOTOC~~";
  }

  return directives;
}

function isRenderDirectiveLine(line: string): boolean {
  const trimmed = line.trim().toUpperCase();
  return trimmed === "~~NOCACHE~~" || trimmed === "~~NOTOC~~";
}

interface ParserState {
  paragraph: string[];
  list: ListItem[];
  code: string[];
  table: string[];
  quote: QuoteItem[];
  specialBlock: SpecialBlock | null;
  codeBlockIndex: number;
}

interface ListItem {
  level: number;
  type: ListType;
  content: string;
}

interface QuoteItem {
  level: number;
  content: string;
}

interface SpecialBlock {
  type: "code" | "file";
  index: number;
  language: string | null;
  filename: string | null;
  lines: string[];
}

interface RenderContext {
  footnotes: string[];
  dependencies: Map<string, CacheDependency>;
  pageId?: string;
  existingPageIds?: ReadonlySet<string>;
  entityReplacements: ReadonlyArray<readonly [string, string]>;
  smileys: Readonly<Record<string, string>>;
  acronyms: Readonly<Record<string, string>>;
  interwikiTemplates?: InterwikiTemplates;
  linkSchemes: ReadonlySet<string>;
  relNofollow: boolean;
  linkTargets: Required<Record<LinkTargetKind, string | null>>;
  autoPluralLinks: boolean;
  sectionEdit: boolean;
  topTocLevel: number;
  maxTocLevel: number;
  maxSectionEditLevel: number;
  camelCaseLinks: boolean;
  typographyMode: number;
  pageIdCleanOptions?: PageIdCleanOptions;
  sectionIndex: number;
  anchorIds: Set<string>;
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
  if (!match) return null;

  return {
    level: 7 - match[1].length,
    title: match[2].trim()
  };
}

function renderSectionEditLink(title: string, level: number, context: RenderContext): string {
  if (!context.pageId || !context.sectionEdit || level > context.maxSectionEditLevel) return "";

  const href = `${pageIdToRoutePath(context.pageId, context.pageIdCleanOptions)}?do=edit&section=${context.sectionIndex}`;

  return `<a class="secedit" href="${escapeAttribute(href)}" aria-label="Edit section ${escapeAttribute(title)}">Edit</a>`;
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

  blocks.push(renderList(state.list, context));
  state.list = [];
}

function renderList(items: ListItem[], context: RenderContext): string {
  const stack: ListType[] = [];
  let html = "";

  for (const item of items) {
    while (stack.length > item.level) {
      const type = stack.pop()!;
      html += `</li></${type}>`;
    }

    if (stack.length === item.level) {
      const currentType = stack.at(-1);
      if (currentType === item.type) {
        html += "</li>";
      } else {
        const type = stack.pop()!;
        html += `</li></${type}>`;
      }
    }

    while (stack.length < item.level) {
      html += `<${item.type}>`;
      stack.push(item.type);
    }

    html += `<li>${renderInline(item.content, context)}`;
  }

  while (stack.length > 0) {
    const type = stack.pop()!;
    html += `</li></${type}>`;
  }

  return html;
}

function flushCode(blocks: string[], state: ParserState): void {
  if (state.code.length === 0) return;

  blocks.push(`<pre><code>${escapeHtml(state.code.join("\n"))}</code></pre>`);
  state.code = [];
}

function flushTable(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.table.length === 0) return;

  const rows = applyTableRowspans(state.table.map(parseTableRow)).map((row) => {
    return `<tr>${row.map((cell) => renderTableCell(cell, context)).join("")}</tr>`;
  });

  blocks.push(`<table>${rows.join("")}</table>`);
  state.table = [];
}

interface TableCell {
  header: boolean;
  raw: string;
  content: string;
  colspan: number;
  rowspan: number;
  align: "left" | "center" | "right" | null;
}

function parseTableRow(row: string): TableCell[] {
  const cells: TableCell[] = [];
  let separator = row[0];
  let raw = "";
  let protectedEnd: string | null = null;

  for (let index = 1; index < row.length; index += 1) {
    const char = row[index];
    const pair = row.slice(index, index + 2);

    if (protectedEnd) {
      if (pair === protectedEnd) {
        raw += pair;
        index += 1;
        protectedEnd = null;
      } else {
        raw += char;
      }
      continue;
    }

    if (pair === "[[" || pair === "{{" || pair === "%%") {
      protectedEnd = pair === "[[" ? "]]" : pair === "{{" ? "}}" : "%%";
      raw += pair;
      index += 1;
      continue;
    }

    if (char === "|" || char === "^") {
      const content = raw.trim();

      if (content === "" && cells.length > 0) {
        cells[cells.length - 1].colspan += 1;
      } else {
        cells.push({
          header: separator === "^",
          raw,
          content,
          colspan: 1,
          rowspan: 1,
          align: tableCellAlign(raw)
        });
      }

      separator = char;
      raw = "";
    } else {
      raw += char;
    }
  }

  return cells;
}

function applyTableRowspans(rows: TableCell[][]): TableCell[][] {
  const spanningCells = new Map<number, TableCell>();

  return rows.map((row) => {
    const renderedRow: TableCell[] = [];
    let column = 0;

    for (const cell of row) {
      if (cell.content === ":::") {
        const spanningCell = spanningCells.get(column);
        if (spanningCell) {
          spanningCell.rowspan += 1;
        }
        column += cell.colspan;
        continue;
      }

      renderedRow.push(cell);
      for (let offset = 0; offset < cell.colspan; offset += 1) {
        spanningCells.set(column + offset, cell);
      }
      column += cell.colspan;
    }

    return renderedRow;
  });
}

function tableCellAlign(raw: string): TableCell["align"] {
  const leading = raw.match(/^\s*/)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/)?.[0].length ?? 0;

  if (leading >= 2 && trailing >= 2) return "center";
  if (leading >= 2) return "right";
  if (trailing >= 2) return "left";
  return null;
}

function renderTableCell(cell: TableCell, context: RenderContext): string {
  const tag = cell.header ? "th" : "td";
  const attributes = [
    cell.align ? `class="${cell.align}align"` : "",
    cell.colspan > 1 ? `colspan="${cell.colspan}"` : "",
    cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : ""
  ].filter(Boolean);
  const attributeText = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  return `<${tag}${attributeText}>${renderInline(cell.content, context)}</${tag}>`;
}

function flushQuote(blocks: string[], state: ParserState, context: RenderContext): void {
  if (state.quote.length === 0) return;

  blocks.push(renderQuotes(state.quote, context));
  state.quote = [];
}

function renderQuotes(items: QuoteItem[], context: RenderContext): string {
  let depth = 0;
  let paragraphOpen = false;
  let html = "";

  for (const item of items) {
    if (paragraphOpen) {
      html += "</p>";
      paragraphOpen = false;
    }

    while (depth > item.level) {
      html += "</blockquote>";
      depth -= 1;
    }

    while (depth < item.level) {
      html += "<blockquote>";
      depth += 1;
    }

    html += `<p>${renderInline(item.content, context)}`;
    paragraphOpen = true;
  }

  if (paragraphOpen) {
    html += "</p>";
  }

  while (depth > 0) {
    html += "</blockquote>";
    depth -= 1;
  }

  return html;
}

function flushSpecialBlock(blocks: string[], state: ParserState, context: RenderContext): void {
  if (!state.specialBlock) return;

  const block = state.specialBlock;
  const code = `<pre><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;

  if (block.filename) {
    const href = context.pageId
      ? `${pageIdToRoutePath(context.pageId, context.pageIdCleanOptions)}?do=export_code&codeblock=${block.index}`
      : null;
    const title = escapeHtml(block.filename);
    const label = href
      ? `<a href="${escapeAttribute(href)}" title="Download" class="${fileDownloadClass(block.filename)}">${title}</a>`
      : title;

    blocks.push(`<dl class="${block.type}"><dt>${label}</dt><dd>${code}</dd></dl>`);
  } else {
    blocks.push(
      `<pre class="${block.type}"><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`
    );
  }

  state.specialBlock = null;
}

function parseSpecialBlockMetadata(
  type: "code" | "file",
  meta: string
): { language: string | null; filename: string | null } {
  const cleaned = meta.replace(/\[.*\]/, "").trim();
  if (!cleaned) return { language: null, filename: null };

  const [rawLanguage = "", rawFilename = ""] = cleaned.split(/\s+(.+)/, 2);
  const language = normalizeSpecialBlockLanguage(rawLanguage);
  const filename = rawFilename.trim() || null;

  return {
    language,
    filename: type === "file" || type === "code" ? filename : null
  };
}

function normalizeSpecialBlockLanguage(value: string): string | null {
  if (!value || value === "-") return null;
  const language = value === "html" ? "html4strict" : value;
  const normalized = language.replace(/[^A-Za-z0-9_-]+/g, "");
  return normalized || null;
}

function specialBlockToExtracted(block: SpecialBlock): ExtractedCodeBlock {
  return {
    type: block.type,
    index: block.index,
    text: block.lines.join("\n").replace(/^\n/, "").replace(/\n$/, ""),
    language: block.language,
    filename: block.filename
  };
}

function fileDownloadClass(filename: string): string {
  const extension =
    filename
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^A-Za-z0-9_-]+/g, "_") || "txt";
  return `mediafile mf_${extension}`;
}

function flushFootnotes(blocks: string[], context: RenderContext): void {
  if (context.footnotes.length === 0) return;

  const notes = context.footnotes
    .map(
      (note, index) =>
        `<div class="fn" id="fn__${index + 1}"><sup><a href="#fnt__${index + 1}">${index + 1})</a></sup> ${renderInline(
          note,
          {
            footnotes: [],
            dependencies: context.dependencies,
            pageId: context.pageId,
            entityReplacements: context.entityReplacements,
            smileys: context.smileys,
            acronyms: context.acronyms,
            interwikiTemplates: context.interwikiTemplates,
            linkSchemes: context.linkSchemes,
            relNofollow: context.relNofollow,
            linkTargets: context.linkTargets,
            autoPluralLinks: context.autoPluralLinks,
            sectionEdit: context.sectionEdit,
            topTocLevel: context.topTocLevel,
            maxTocLevel: context.maxTocLevel,
            maxSectionEditLevel: context.maxSectionEditLevel,
            camelCaseLinks: context.camelCaseLinks,
            typographyMode: context.typographyMode,
            pageIdCleanOptions: context.pageIdCleanOptions,
            sectionIndex: context.sectionIndex,
            anchorIds: context.anchorIds
          }
        )}</div>`
    )
    .join("");

  blocks.push(`<div class="footnotes">${notes}</div>`);
}

function renderInline(source: string, context: RenderContext): string {
  const nowiki: string[] = [];
  const footnotes: string[] = [];
  const protectedHtml: ProtectedHtml[] = [];
  const protectHtml = (html: string, options: { linkLabelHtml?: string } = {}): string => {
    const token = `\uE004${protectedHtml.length}\uE005`;
    protectedHtml.push({ html, linkLabelHtml: options.linkLabelHtml });
    return token;
  };
  const renderLinkLabel = (label: string): string =>
    escapeHtml(label).replace(/\uE004(\d+)\uE005/g, (_match, index: string) => {
      const entry = protectedHtml[Number(index)];
      return entry?.linkLabelHtml ?? entry?.html ?? "";
    });
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
  rendered = renderMedia(rendered, context, protectHtml);
  rendered = renderLinks(rendered, context, protectHtml, renderLinkLabel);
  rendered = renderExternalAutolinks(
    rendered,
    context.linkSchemes,
    context.relNofollow,
    context.linkTargets,
    protectHtml
  );
  rendered = renderEmailAutolinks(rendered, protectHtml);
  rendered = renderTypography(rendered, context.entityReplacements, context.typographyMode);
  rendered = renderCamelCaseLinks(rendered, context, protectHtml);
  rendered = renderSmileys(rendered, context.smileys, protectHtml);
  rendered = renderAcronyms(rendered, context.acronyms, protectHtml);
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

  for (let index = protectedHtml.length - 1; index >= 0; index -= 1) {
    rendered = rendered.replaceAll(`\uE004${index}\uE005`, protectedHtml[index].html);
  }

  for (const [index, literal] of nowiki.entries()) {
    rendered = rendered.replace(`\uE000${index}\uE001`, literal);
  }

  return rendered;
}

function renderTypography(
  source: string,
  entityReplacements: ReadonlyArray<readonly [string, string]>,
  typographyMode: number
): string {
  let rendered = source;

  for (const [token, replacement] of entityReplacements) {
    rendered = rendered.replaceAll(escapeHtml(token), replacement);
  }

  if (typographyMode > 0) {
    rendered = rendered
      .replace(/\b([1-9]|\d{2,})[xX](\d+)\b/g, "$1&times;$2")
      .replace(/(^|[\s/#~:+=&%@\-()[\]{}><"'])&quot;(?=[^\s/#~:+=&%@\-()[\]{}><"';,.?!])/g, "$1“")
      .replace(/&quot;/g, "”");
  }

  if (typographyMode === 2) {
    rendered = rendered
      .replace(/(^|[\s/#~:+=&%@\-()[\]{}><"'])&#39;(?=[^\s/#~:+=&%@\-()[\]{}><"';,.?!])/g, "$1‘")
      .replace(/&#39;(?=$|[\s/#~:+=&%@\-()[\]{}><"';,.?!])/g, "’")
      .replace(/&#39;/g, "’");
  }

  return rendered;
}

function renderSmileys(
  source: string,
  smileys: Readonly<Record<string, string>>,
  protectHtml: (html: string) => string
): string {
  const pattern = smileyPattern(smileys);
  if (!pattern) return source;

  return source.replace(pattern, (_match, prefix: string, smiley: string) => {
    const filename = smileys[smiley];

    return `${prefix}${protectHtml(
      `<img src="${SMILEY_IMAGE_BASE}/${filename}" class="icon smiley" alt="${escapeAttribute(smiley)}">`
    )}`;
  });
}

function smileyPattern(smileys: Readonly<Record<string, string>>): RegExp | null {
  const tokens = Object.keys(smileys);
  if (tokens.length === 0) return null;

  return new RegExp(
    `(^|[^A-Za-z0-9_])(${tokens
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|")})(?=$|[^A-Za-z0-9_])`,
    "g"
  );
}

function renderAcronyms(
  source: string,
  acronyms: Readonly<Record<string, string>>,
  protectHtml: (html: string) => string
): string {
  const pattern = acronymPattern(acronyms);
  if (!pattern) return source;

  return source.replace(pattern, (_match, prefix: string, acronym: string) => {
    const title = acronyms[acronym];

    return `${prefix}${protectHtml(
      `<abbr title="${escapeAttribute(title)}">${escapeHtml(acronym)}</abbr>`
    )}`;
  });
}

function acronymPattern(acronyms: Readonly<Record<string, string>>): RegExp | null {
  const tokens = Object.keys(acronyms);
  if (tokens.length === 0) return null;

  return new RegExp(
    `(^|${ACRONYM_BOUNDARY})(${tokens
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|")})(?=$|${ACRONYM_BOUNDARY})`,
    "g"
  );
}

function renderMedia(
  source: string,
  context: RenderContext,
  protectHtml: (html: string, options?: { linkLabelHtml?: string }) => string
): string {
  return source.replace(/\{\{([^}]+)\}\}/g, (_match, rawMedia: string) => {
    const parsed = parseMedia(rawMedia);
    const title = parsed.title?.trim() || null;
    const linkTitle = escapeAttribute(parsed.id);
    addCacheDependency(context, "media", parsed.id);

    if (parsed.linking === "linkonly" || !isImageMedia(parsed.id)) {
      const label = title || mediaName(parsed.id);
      const target = targetAttribute(context.linkTargets.media);
      const rel = context.linkTargets.media ? ' rel="noopener"' : "";
      return protectHtml(
        `<a href="${mediaPath(parsed.id)}" class="media" title="${linkTitle}"${target}${rel}>${escapeHtml(label)}</a>`,
        { linkLabelHtml: escapeHtml(label) }
      );
    }

    const attributes = [
      `src="${mediaPath(parsed.id)}"`,
      `class="media${parsed.align ?? ""}"`,
      'loading="lazy"',
      title ? `title="${escapeAttribute(title)}"` : "",
      `alt="${title ? escapeAttribute(title) : ""}"`,
      parsed.width ? `width="${escapeAttribute(parsed.width)}"` : "",
      parsed.height ? `height="${escapeAttribute(parsed.height)}"` : ""
    ].filter(Boolean);
    const image = `<img ${attributes.join(" ")}>`;

    if (parsed.linking === "nolink") {
      return protectHtml(image, { linkLabelHtml: image });
    }

    const href = parsed.linking === "direct" ? mediaPath(parsed.id) : mediaDetailPath(parsed.id);
    const target = targetAttribute(context.linkTargets.media);
    const rel = context.linkTargets.media ? ' rel="noopener"' : "";
    return protectHtml(
      `<a href="${href}" class="media" title="${linkTitle}"${target}${rel}>${image}</a>`,
      {
        linkLabelHtml: image
      }
    );
  });
}

interface ProtectedHtml {
  html: string;
  linkLabelHtml?: string;
}

interface ParsedMedia {
  id: string;
  title: string | null;
  align: "left" | "right" | "center" | null;
  width: string | null;
  height: string | null;
  linking: "details" | "direct" | "linkonly" | "nolink";
}

function parseMedia(rawMedia: string): ParsedMedia {
  const [rawTarget, rawTitle] = rawMedia.split("|", 2);
  const leadingSpace = rawTarget.startsWith(" ");
  const trailingSpace = rawTarget.endsWith(" ");
  const align =
    leadingSpace && trailingSpace
      ? "center"
      : leadingSpace
        ? "right"
        : trailingSpace
          ? "left"
          : null;
  const trimmedTarget = rawTarget.trim();
  const queryIndex = trimmedTarget.lastIndexOf("?");
  const rawId = queryIndex === -1 ? trimmedTarget : trimmedTarget.slice(0, queryIndex);
  const params = queryIndex === -1 ? "" : trimmedTarget.slice(queryIndex + 1);
  const size = params.match(/(\d+)(?:x(\d+))?/i);

  return {
    id: cleanMediaId(rawId),
    title: rawTitle ?? null,
    align,
    width: size?.[1] ?? null,
    height: size?.[2] ?? null,
    linking: mediaLinkingMode(params)
  };
}

function mediaLinkingMode(params: string): ParsedMedia["linking"] {
  if (/nolink/i.test(params)) return "nolink";
  if (/direct/i.test(params)) return "direct";
  if (/linkonly/i.test(params)) return "linkonly";
  return "details";
}

function isImageMedia(id: string): boolean {
  const extension = mediaName(id).split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MEDIA_EXTENSIONS.has(extension);
}

function renderLinks(
  source: string,
  context: RenderContext,
  protectHtml: (html: string) => string,
  renderLinkLabel: (label: string) => string
): string {
  return source.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = decodeHtmlEntities(rawTarget.trim());
    const explicitLabel = rawLabel?.trim();
    const label = decodeHtmlEntities(explicitLabel || target);

    if (isEmailAddress(target)) {
      return protectHtml(renderEmailLink(target, explicitLabel ? label : undefined));
    }

    const external = isExternalLinkTarget(target, context.linkSchemes);
    const interwiki = external ? null : resolveInterwikiLink(target, context.interwikiTemplates);
    const windowsShare = external || interwiki ? null : windowsSharePath(target);
    const internal = !external && !interwiki && !windowsShare;
    const internalLink = internal
      ? resolveAutoPluralInternalLink(resolveInternalLink(target, context), context)
      : null;

    if (internalLink?.pageId) {
      addCacheDependency(context, "page", internalLink.pageId);
    }

    const internalMissing = Boolean(
      internal && internalLink?.pageId && isMissingInternalPage(context, internalLink.pageId)
    );
    const href = external
      ? target
      : interwiki
        ? interwiki.href
        : windowsShare
          ? windowsShare
          : (internalLink?.href ?? "#");
    const classNames = linkClassNames({
      external,
      interwikiShortcut: interwiki ? interwikiShortcut(target) : null,
      internal,
      internalMissing,
      windowsShare: Boolean(windowsShare)
    });
    const targetKind = linkTargetKind(
      external,
      interwiki?.external ?? null,
      internal,
      Boolean(windowsShare)
    );
    const targetName = targetKind ? context.linkTargets[targetKind] : null;
    const rel = linkRelAttribute(targetKind, targetName, context.relNofollow);
    const classAttribute = classNames.length > 0 ? ` class="${classNames.join(" ")}"` : "";
    const titleAttribute = internalMissing ? ' title="This topic does not exist yet"' : "";
    const targetAttributeText = targetAttribute(targetName);

    return protectHtml(
      `<a href="${escapeAttribute(href)}"${classAttribute}${titleAttribute}${targetAttributeText}${rel}>${renderLinkLabel(label)}</a>`
    );
  });
}

function linkTargetKind(
  external: boolean,
  interwikiExternal: boolean | null,
  internal: boolean,
  windowsShare: boolean
): LinkTargetKind | null {
  if (external) return "extern";
  if (windowsShare) return "windows";
  if (interwikiExternal !== null) return interwikiExternal ? "interwiki" : "wiki";
  if (internal) return "wiki";
  return null;
}

function linkClassNames(options: {
  external: boolean;
  interwikiShortcut: string | null;
  internal: boolean;
  internalMissing: boolean;
  windowsShare: boolean;
}): string[] {
  if (options.windowsShare) return ["windows"];
  if (options.external) return ["urlextern"];
  if (options.interwikiShortcut) return ["interwiki", `iw_${options.interwikiShortcut}`];
  if (options.internal) return [options.internalMissing ? "wikilink2" : "wikilink1"];
  return [];
}

function isMissingInternalPage(context: RenderContext, pageId: string): boolean {
  return Boolean(context.existingPageIds && !context.existingPageIds.has(pageId));
}

function resolveAutoPluralInternalLink(
  link: { href: string; pageId: string | null; fragment: string },
  context: RenderContext
): { href: string; pageId: string | null; fragment: string } {
  if (
    !context.autoPluralLinks ||
    !link.pageId ||
    !context.existingPageIds ||
    context.existingPageIds.has(link.pageId)
  ) {
    return link;
  }

  const alternatePageId = autoPluralPageId(link.pageId);
  if (!context.existingPageIds.has(alternatePageId)) return link;

  return {
    href: `${pageIdToRoutePath(alternatePageId, context.pageIdCleanOptions)}${link.fragment}`,
    pageId: alternatePageId,
    fragment: link.fragment
  };
}

function autoPluralPageId(pageId: string): string {
  return pageId.endsWith("s") ? pageId.slice(0, -1) : `${pageId}s`;
}

function interwikiShortcut(target: string): string | null {
  const separator = target.indexOf(">");
  if (separator <= 0) return null;

  return target
    .slice(0, separator)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");
}

function isExternalLinkTarget(target: string, linkSchemes: ReadonlySet<string>): boolean {
  const match = target.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return Boolean(match && linkSchemes.has(match[1].toLowerCase()));
}

function linkRelAttribute(
  targetKind: LinkTargetKind | null,
  targetName: string | null,
  relNofollow: boolean
): string {
  const rels: string[] = [];
  if (targetKind === "extern" && relNofollow) rels.push("ugc", "nofollow");
  if (
    (targetKind === "extern" || targetKind === "interwiki" || targetKind === "media") &&
    targetName
  ) {
    rels.push("noopener");
  }
  return rels.length > 0 ? ` rel="${rels.join(" ")}"` : "";
}

function targetAttribute(targetName: string | null): string {
  return targetName ? ` target="${escapeAttribute(targetName)}"` : "";
}

function renderEmailAutolinks(source: string, protectHtml: (html: string) => string): string {
  return source.replace(
    /&lt;([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})&gt;/gi,
    (_match, email: string) => protectHtml(renderEmailLink(email))
  );
}

function renderCamelCaseLinks(
  source: string,
  context: RenderContext,
  protectHtml: (html: string) => string
): string {
  if (!context.camelCaseLinks) return source;

  return source.replace(/\b[A-Z]+[a-z]+[A-Z][A-Za-z]*\b/g, (linkText: string) => {
    const internalLink = resolveAutoPluralInternalLink(
      resolveInternalLink(linkText, context),
      context
    );

    if (!internalLink.pageId) {
      return linkText;
    }

    addCacheDependency(context, "page", internalLink.pageId);
    const internalMissing = isMissingInternalPage(context, internalLink.pageId);
    const className = internalMissing ? "wikilink2" : "wikilink1";
    const titleAttribute = internalMissing ? ' title="This topic does not exist yet"' : "";

    return protectHtml(
      `<a href="${escapeAttribute(internalLink.href)}" class="${className}"${titleAttribute}>${escapeHtml(linkText)}</a>`
    );
  });
}

function renderExternalAutolinks(
  source: string,
  linkSchemes: ReadonlySet<string>,
  relNofollow: boolean,
  linkTargets: Required<Record<LinkTargetKind, string | null>>,
  protectHtml: (html: string) => string
): string {
  const pattern = externalAutolinkPattern(linkSchemes);

  return source.replace(pattern, (match) => {
    const { linkText, suffix } = splitTrailingLinkPunctuation(match);
    const decoded = decodeHtmlEntities(linkText);
    const href = decoded.startsWith("www.")
      ? `http://${decoded}`
      : decoded.startsWith("ftp.")
        ? `ftp://${decoded}`
        : decoded;

    return `${protectHtml(
      `<a href="${escapeAttribute(href)}" class="urlextern"${targetAttribute(linkTargets.extern)}${linkRelAttribute("extern", linkTargets.extern, relNofollow)}>${escapeHtml(decoded)}</a>`
    )}${suffix}`;
  });
}

function externalAutolinkPattern(linkSchemes: ReadonlySet<string>): RegExp {
  const any = "[A-Z0-9/#~:.?+=&%@!_()[\\],;-]";
  const host = "[A-Z0-9.?\\-;,#~=+&%@!_()[\\]/]";
  const patterns = [`(?:www|ftp)\\.${host}+`];
  const schemes = [...linkSchemes].filter(isSafeUrlScheme);

  if (schemes.length > 0) {
    patterns.unshift(
      `(?:${schemes
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join("|")}):\\/\\/${any}+`
    );
  }

  return new RegExp(`\\b(${patterns.join("|")})(?=\\s|$|[<])`, "gi");
}

function normalizeLinkSchemes(
  linkSchemes: ReadonlyArray<string> | ReadonlySet<string> | undefined
): ReadonlySet<string> {
  if (!linkSchemes) return DEFAULT_LINK_SCHEMES;

  const values = Array.isArray(linkSchemes) ? linkSchemes : [...linkSchemes];
  return new Set(values.map((scheme) => scheme.toLowerCase()).filter(isSafeUrlScheme));
}

function isSafeUrlScheme(scheme: string): boolean {
  return /^[a-z][a-z0-9+.-]*$/.test(scheme);
}

function normalizeLinkTargets(
  linkTargets: LinkTargets | undefined
): Required<Record<LinkTargetKind, string | null>> {
  return {
    wiki: normalizeLinkTarget(linkTargets?.wiki),
    interwiki: normalizeLinkTarget(linkTargets?.interwiki),
    extern: normalizeLinkTarget(linkTargets?.extern),
    media: normalizeLinkTarget(linkTargets?.media),
    windows: normalizeLinkTarget(linkTargets?.windows)
  };
}

function normalizeLinkTarget(value: string | null | undefined): string | null {
  const target = value?.trim();
  return target || null;
}

function splitTrailingLinkPunctuation(value: string): { linkText: string; suffix: string } {
  const match = value.match(/^(.*?)([.,;:!?)]*)$/);
  return {
    linkText: match?.[1] || value,
    suffix: match?.[2] || ""
  };
}

function renderEmailLink(email: string, label?: string): string {
  const obfuscated = obfuscateEmail(email);
  const name = label ? escapeHtml(label) : obfuscated;

  return `<a href="mailto:${obfuscated}" class="mail" title="${obfuscated}">${name}</a>`;
}

function obfuscateEmail(email: string): string {
  return Array.from(email)
    .map((char) => `&#${char.codePointAt(0) ?? 0};`)
    .join("");
}

function isEmailAddress(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
}

function windowsSharePath(target: string): string | null {
  return target.startsWith("\\\\") ? `file:///${target.replaceAll("\\", "/")}` : null;
}

function resolveInternalLink(
  target: string,
  context: RenderContext
): { href: string; pageId: string | null; fragment: string } {
  const [rawPageId = "", rawFragment] = target.split("#", 2);
  const fragment = rawFragment ? `#${slugify(rawFragment)}` : "";

  if (!rawPageId) {
    return {
      href: fragment || "#",
      pageId: context.pageId ? cleanPageId(context.pageId, context.pageIdCleanOptions) : null,
      fragment
    };
  }

  const pageId = resolvePageLinkId(rawPageId, context.pageId, context.pageIdCleanOptions);

  return {
    href: `${pageIdToRoutePath(pageId, context.pageIdCleanOptions)}${fragment}`,
    pageId,
    fragment
  };
}

function addCacheDependency(
  context: RenderContext,
  subjectType: CacheDependency["subjectType"],
  subjectId: string
): void {
  if (!subjectId) return;

  const key = `${subjectType}:${subjectId}`;
  context.dependencies.set(key, { subjectType, subjectId });
}

function sortedDependencies(dependencies: Map<string, CacheDependency>): CacheDependency[] {
  return [...dependencies.values()].sort(
    (a, b) => a.subjectType.localeCompare(b.subjectType) || a.subjectId.localeCompare(b.subjectId)
  );
}

function uniqueAnchor(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  const id = `${base}-${index}`;
  existing.add(id);
  return id;
}

function slugify(value: string): string {
  const slug = cleanPageId(value).replaceAll(":", "-").replaceAll("_", "-");
  return slug || "section";
}

function clampHeadingLevel(value: number | undefined, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(5, parsed));
}

function clampTypographyMode(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 1;
  return Math.max(0, Math.min(2, parsed));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
