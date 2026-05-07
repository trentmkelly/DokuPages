import { resolveInterwikiLink } from "./interwiki";
import { cleanPageId, pageIdToRoutePath, resolvePageLinkId } from "./page-id";
import { cleanMediaId, mediaDetailPath, mediaName, mediaPath } from "./media-service";

export interface TocItem {
  id: string;
  level: number;
  title: string;
}

export interface RenderedWikiText {
  html: string;
  title: string | null;
  toc: TocItem[];
  noCache: boolean;
  noToc: boolean;
}

export interface RenderWikiTextOptions {
  pageId?: string;
}

const SMILEY_IMAGE_BASE = "/images/smileys";
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
const SMILEY_PATTERN = new RegExp(
  `(^|[^A-Za-z0-9_])(${Object.keys(DEFAULT_SMILEYS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?=$|[^A-Za-z0-9_])`,
  "g"
);
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
const ACRONYM_PATTERN = new RegExp(
  `(^|${ACRONYM_BOUNDARY})(${Object.keys(DEFAULT_ACRONYMS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?=$|${ACRONYM_BOUNDARY})`,
  "g"
);
const IMAGE_MEDIA_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png", "svg", "webp", "avif"]);

export function renderWikiText(
  source: string,
  options: RenderWikiTextOptions = {}
): RenderedWikiText {
  const directives = getWikiRenderDirectives(source);
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
    if (isRenderDirectiveLine(line)) {
      continue;
    }

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
    toc: directives.noToc ? [] : toc,
    noCache: directives.noCache,
    noToc: directives.noToc
  };
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
  rendered = renderTypography(rendered);
  rendered = renderMedia(rendered, protectHtml);
  rendered = renderLinks(rendered, context, protectHtml, renderLinkLabel);
  rendered = renderExternalAutolinks(rendered, protectHtml);
  rendered = renderEmailAutolinks(rendered, protectHtml);
  rendered = renderSmileys(rendered, protectHtml);
  rendered = renderAcronyms(rendered, protectHtml);
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

function renderTypography(source: string): string {
  return source
    .replace(/&lt;-&gt;/g, "&harr;")
    .replace(/&lt;=&gt;/g, "&hArr;")
    .replace(/-&gt;/g, "&rarr;")
    .replace(/&lt;-/g, "&larr;")
    .replace(/=&gt;/g, "&rArr;")
    .replace(/&lt;=/g, "&lArr;")
    .replace(/&gt;&gt;/g, "&raquo;")
    .replace(/&lt;&lt;/g, "&laquo;")
    .replace(/\(c\)/gi, "&copy;")
    .replace(/\(r\)/gi, "&reg;")
    .replace(/\(tm\)/gi, "&trade;")
    .replace(/\.\.\./g, "&hellip;")
    .replace(/---/g, "&mdash;")
    .replace(/--/g, "&ndash;");
}

function renderSmileys(source: string, protectHtml: (html: string) => string): string {
  return source.replace(SMILEY_PATTERN, (_match, prefix: string, smiley: string) => {
    const filename = DEFAULT_SMILEYS[smiley];

    return `${prefix}${protectHtml(
      `<img src="${SMILEY_IMAGE_BASE}/${filename}" class="icon smiley" alt="${escapeAttribute(smiley)}">`
    )}`;
  });
}

function renderAcronyms(source: string, protectHtml: (html: string) => string): string {
  return source.replace(ACRONYM_PATTERN, (_match, prefix: string, acronym: string) => {
    const title = DEFAULT_ACRONYMS[acronym];

    return `${prefix}${protectHtml(
      `<abbr title="${escapeAttribute(title)}">${escapeHtml(acronym)}</abbr>`
    )}`;
  });
}

function renderMedia(
  source: string,
  protectHtml: (html: string, options?: { linkLabelHtml?: string }) => string
): string {
  return source.replace(/\{\{([^}]+)\}\}/g, (_match, rawMedia: string) => {
    const parsed = parseMedia(rawMedia);
    const title = parsed.title?.trim() || null;
    const linkTitle = escapeAttribute(parsed.id);

    if (parsed.linking === "linkonly" || !isImageMedia(parsed.id)) {
      const label = title || mediaName(parsed.id);
      return protectHtml(
        `<a href="${mediaPath(parsed.id)}" class="media" title="${linkTitle}">${escapeHtml(label)}</a>`,
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
    return protectHtml(`<a href="${href}" class="media" title="${linkTitle}">${image}</a>`, {
      linkLabelHtml: image
    });
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

    const external = /^https?:\/\//i.test(target);
    const interwiki = external ? null : resolveInterwikiLink(target);
    const windowsShare = external || interwiki ? null : windowsSharePath(target);
    const href = external
      ? target
      : interwiki
        ? interwiki.href
        : windowsShare
          ? windowsShare
          : internalLinkPath(target, context.pageId);
    const rel = external || interwiki?.external ? ' rel="nofollow noopener noreferrer"' : "";
    const linkClass = windowsShare ? ' class="windows"' : "";

    return protectHtml(
      `<a href="${escapeAttribute(href)}"${rel}${linkClass}>${renderLinkLabel(label)}</a>`
    );
  });
}

function renderEmailAutolinks(source: string, protectHtml: (html: string) => string): string {
  return source.replace(
    /&lt;([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})&gt;/gi,
    (_match, email: string) => protectHtml(renderEmailLink(email))
  );
}

function renderExternalAutolinks(source: string, protectHtml: (html: string) => string): string {
  return source.replace(
    /\b((?:https?|ftp):\/\/[A-Z0-9/#~:.?+=&%@!_()[\],;-]+|(?:www|ftp)\.[A-Z0-9.?\-;,#~=+&%@!_()[\]/]+)(?=\s|$|[<])/gi,
    (match) => {
      const { linkText, suffix } = splitTrailingLinkPunctuation(match);
      const decoded = decodeHtmlEntities(linkText);
      const href = decoded.startsWith("www.")
        ? `http://${decoded}`
        : decoded.startsWith("ftp.")
          ? `ftp://${decoded}`
          : decoded;

      return `${protectHtml(
        `<a href="${escapeAttribute(href)}" rel="nofollow noopener noreferrer">${escapeHtml(decoded)}</a>`
      )}${suffix}`;
    }
  );
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
