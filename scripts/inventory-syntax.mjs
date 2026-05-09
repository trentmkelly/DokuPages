#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const FEATURE_DEFINITIONS = [
  {
    id: "headings",
    label: "Headings",
    status: "supported",
    pattern: /^={2,6}\s*(.*?)\s*={2,6}\s*$/gm
  },
  {
    id: "bold",
    label: "Bold",
    status: "supported",
    pattern: /\*\*[^*\n]+?\*\*/g
  },
  {
    id: "italic",
    label: "Italic",
    status: "supported",
    pattern: /(^|[^:])\/\/[^/\n]+?\/\//gm
  },
  {
    id: "underline",
    label: "Underline",
    status: "supported",
    pattern: /__[^_\n]+?__/g
  },
  {
    id: "monospace",
    label: "Monospace",
    status: "supported",
    pattern: /''[^'\n]+?''/g
  },
  {
    id: "subscript",
    label: "Subscript",
    status: "supported",
    pattern: /<sub>[\s\S]*?<\/sub>|,,[^,\n]+,,/gi
  },
  {
    id: "superscript",
    label: "Superscript",
    status: "supported",
    pattern: /<sup>[\s\S]*?<\/sup>/gi
  },
  {
    id: "deleted_text",
    label: "Deleted text",
    status: "supported",
    pattern: /<del>[\s\S]*?<\/del>/gi
  },
  {
    id: "forced_linebreaks",
    label: "Forced line breaks",
    status: "supported",
    pattern: /\\\\(?:\s|$)/gm
  },
  {
    id: "internal_links",
    label: "Internal links",
    status: "supported",
    pattern: /\[\[(?![a-z][a-z0-9+.-]*:\/\/)(?!\\\\)(?![a-z0-9_-]+>)[^[\]]+?\]\]/gi
  },
  {
    id: "external_link_syntax",
    label: "Explicit external links",
    status: "supported",
    pattern: /\[\[[a-z][a-z0-9+.-]*:\/\/[^[\]]+?\]\]/gi
  },
  {
    id: "external_autolinks",
    label: "Automatic external links",
    status: "supported",
    pattern:
      /\b((?:https?|ftp):\/\/[A-Z0-9/#~:.?+=&%@!_()[\],;-]+|(?:www|ftp)\.[A-Z0-9.?\-;,#~=+&%@!_()[\]/]+)/gi
  },
  {
    id: "interwiki_links",
    label: "Interwiki links",
    status: "supported",
    pattern: /\[\[[a-z0-9_-]+>[^|\]]+(?:\|[^\]]*)?\]\]/gi
  },
  {
    id: "windows_share_links",
    label: "Windows share links",
    status: "supported",
    pattern: /\[\[\\\\[^|\]]+(?:\|[^\]]*)?\]\]/g
  },
  {
    id: "email_links",
    label: "Email links",
    status: "supported",
    pattern: /<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>/gi
  },
  {
    id: "media_embeds",
    label: "Media embeds",
    status: "supported",
    pattern: /{{(?!rss>)[^{}]+}}/gi
  },
  {
    id: "media_links",
    label: "Media used as link labels",
    status: "supported",
    pattern: /\[\[[^\]]+\|{{[^{}]+}}\]\]/g
  },
  {
    id: "media_resize",
    label: "Media resizing",
    status: "supported",
    pattern: /{{[^{}]+\?\d+(?:x\d+)?[^{}]*}}/g
  },
  {
    id: "media_linkonly",
    label: "Media link-only option",
    status: "supported",
    pattern: /{{[^{}]+\?[^{}|]*\blinkonly\b[^{}]*}}/gi
  },
  {
    id: "media_alignment_or_title",
    label: "Media alignment or title",
    status: "supported",
    pattern: /{{\s+[^{}]+}}|{{[^{}]+\s+}}|{{[^{}]+\|[^{}]+}}/g
  },
  {
    id: "rss_feed_aggregation",
    label: "RSS feed aggregation syntax",
    status: "supported",
    pattern: /{{rss>[^{}]+}}/gi,
    note: "Renderer fetches and caches remote feeds with DokuWiki-style aggregation parameters."
  },
  {
    id: "unordered_lists",
    label: "Unordered lists",
    status: "supported",
    pattern: /^\s{2,}\*\s+/gm
  },
  {
    id: "ordered_lists",
    label: "Ordered lists",
    status: "supported",
    pattern: /^\s{2,}-\s+/gm
  },
  {
    id: "tables",
    label: "Tables",
    status: "supported",
    pattern: /^[|^].*[|^]\s*$/gm
  },
  {
    id: "quotes",
    label: "Quote blocks",
    status: "supported",
    pattern: /^>+\s?/gm
  },
  {
    id: "footnotes",
    label: "Footnotes",
    status: "supported",
    pattern: /\(\([\s\S]+?\)\)/g
  },
  {
    id: "horizontal_rules",
    label: "Horizontal rules",
    status: "supported",
    pattern: /^-{4,}\s*$/gm
  },
  {
    id: "code_blocks",
    label: "Code blocks",
    status: "supported",
    pattern: /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    scope: "raw"
  },
  {
    id: "file_blocks",
    label: "File blocks",
    status: "supported",
    pattern: /<file\b[^>]*>[\s\S]*?<\/file>/gi,
    scope: "raw"
  },
  {
    id: "indented_code_blocks",
    label: "Indented code blocks",
    status: "supported",
    pattern: /^(?: {2}[^\n]*(?:\n|$))+/gm,
    scope: "raw"
  },
  {
    id: "syntax_highlighted_blocks",
    label: "Code/file language metadata",
    status: "partial",
    pattern: /<(?:code|file)\s+(?!-)([a-z0-9_+-]+)(?:\s+[^>]*)?>/gi,
    scope: "raw",
    note: "Renderer preserves code/file content but does not run GeSHi highlighting."
  },
  {
    id: "downloadable_file_blocks",
    label: "Downloadable file block metadata",
    status: "partial",
    pattern: /<file\s+(?:-|[a-z0-9_+-]+)\s+[^>]+>/gi,
    scope: "raw",
    note: "Renderer displays file labels but does not provide generated downloads."
  },
  {
    id: "nowiki",
    label: "No-formatting spans and blocks",
    status: "supported",
    pattern: /<nowiki\b[^>]*>[\s\S]*?<\/nowiki>|%%[\s\S]*?%%/gi,
    scope: "raw"
  },
  {
    id: "smileys",
    label: "Smileys",
    status: "supported",
    pattern:
      /(^|[^A-Za-z0-9_])(8-\)|8-O|8-o|:-\(|:-\)|=\)|:-\/|:-\\|:-\?|:-D|:-P|:-O|:-X|:-\||;-\)|\^_\^|m\(|:\?:|:!:|LOL|FIXME|DELETEME)(?=$|[^A-Za-z0-9_])/g
  },
  {
    id: "typography",
    label: "Typography replacements",
    status: "supported",
    pattern: /->|<-|<->|=>|<=|<=>|>>|<<|---|--|\b\d+x\d+\b|\(c\)|\(tm\)|\(r\)|\.\.\./gi
  },
  {
    id: "acronyms",
    label: "Acronym replacement",
    status: "supported",
    pattern: /\b(?:ACL|API|CSS|FAQ|GPL|HTML|IRC|PHP|RSS|URL|XML)\b/g
  },
  {
    id: "control_macros",
    label: "Control macros",
    status: "supported",
    pattern: /~~(?:NOTOC|NOCACHE)~~/gi
  },
  {
    id: "syntax_plugin_macros",
    label: "Syntax plugin macros",
    status: "supported",
    pattern: /~~[A-Z]+:[^~]+~~/g,
    note: "Current content uses the bundled INFO syntax plugin macro, which has a native replacement."
  }
];

export function inventorySyntax(sourceDir) {
  const resolvedSource = resolve(sourceDir);
  const pages = listPageFiles(resolvedSource);
  const features = FEATURE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    status: definition.status,
    note: definition.note ?? "",
    occurrences: 0,
    pages: []
  }));
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  let lineCount = 0;

  for (const page of pages) {
    const source = readFileSync(page.path, "utf8");
    const analysisSource = stripNonRenderingExamples(source);
    const pageLines = source === "" ? 0 : source.split(/\r\n?|\n/).length;
    lineCount += pageLines;
    page.lines = pageLines;

    for (const definition of FEATURE_DEFINITIONS) {
      const text = definition.scope === "raw" ? source : analysisSource;
      const count = countMatches(text, definition.pattern);
      if (count === 0) continue;

      const feature = featureById.get(definition.id);
      feature.occurrences += count;
      feature.pages.push(page.id);
    }
  }

  return {
    sourceDir: resolvedSource,
    pageCount: pages.length,
    lineCount,
    pages,
    features: features.filter((feature) => feature.occurrences > 0)
  };
}

export function renderSyntaxInventoryMarkdown(inventory) {
  const pageRows = inventory.pages
    .map(
      (page) =>
        `| \`${escapeMarkdown(page.id)}\` | \`${escapeMarkdown(page.relativePath)}\` | ${page.lines} |`
    )
    .join("\n");
  const featureRows = inventory.features
    .map((feature) => {
      const pages = feature.pages.map((page) => `\`${escapeMarkdown(page)}\``).join(", ");
      const note = feature.note ? escapeMarkdown(feature.note) : "";
      return `| ${escapeMarkdown(feature.label)} | ${feature.status} | ${feature.occurrences} | ${pages} | ${note} |`;
    })
    .join("\n");
  const unsupported = inventory.features.filter((feature) => feature.status !== "supported");
  const unsupportedRows = unsupported
    .map(
      (feature) =>
        `- ${feature.status}: ${feature.label} (${feature.occurrences} occurrence${feature.occurrences === 1 ? "" : "s"})${feature.note ? ` - ${feature.note}` : ""}`
    )
    .join("\n");

  return `# DokuWiki Syntax Inventory

Source: \`${escapeMarkdown(relative(process.cwd(), inventory.sourceDir) || ".")}\`

Scanned ${inventory.pageCount} page files and ${inventory.lineCount} source lines.

## Pages

| Page ID | Source path | Lines |
| --- | --- | ---: |
${pageRows}

## Detected Syntax Features

| Feature | Renderer status | Occurrences | Pages | Notes |
| --- | --- | ---: | --- | --- |
${featureRows}

## Follow-Up Notes

${unsupportedRows || "- No unsupported or partially supported syntax features were detected."}

The current source is mostly DokuWiki's bundled starter content. The
\`wiki:syntax\` page intentionally exercises broad syntax coverage, so this
inventory should be rerun after importing production content.
`;
}

function listPageFiles(sourceDir) {
  const files = [];
  collectPageFiles(sourceDir, sourceDir, files);
  return files.sort((left, right) => left.id.localeCompare(right.id));
}

function collectPageFiles(root, dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPageFiles(root, path, files);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;

    const relativePath = relative(root, path);
    files.push({
      id: relativePathToPageId(relativePath),
      path,
      relativePath,
      lines: 0
    });
  }
}

function relativePathToPageId(path) {
  return path
    .replace(/\.txt$/i, "")
    .split(sep)
    .filter(Boolean)
    .join(":");
}

function stripNonRenderingExamples(source) {
  return source
    .replace(/^<code\b[^\n>]*>\s*\n[\s\S]*?\n<\/code>\s*$/gim, "\n")
    .replace(/^<file\b[^\n>]*>\s*\n[\s\S]*?\n<\/file>\s*$/gim, "\n")
    .replace(/^<nowiki\b[^\n>]*>\s*\n[\s\S]*?\n<\/nowiki>\s*$/gim, "\n")
    .replace(/<nowiki\b[^>\n]*>[^\n]*?<\/nowiki>/gi, " ")
    .replace(/%%[^\n]*?%%/g, " ")
    .split(/\r\n?|\n/)
    .filter((line) => !(line.startsWith("  ") && !/^\s{2,}[*-]\s+/.test(line)))
    .join("\n");
}

function countMatches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function parseArgs(argv) {
  const args = {
    source: "../dokuwiki/data/pages",
    output: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = argv[++index];
    } else if (arg === "--output") {
      args.output = argv[++index];
    }
  }

  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = inventorySyntax(args.source);
  const markdown = renderSyntaxInventoryMarkdown(inventory);

  if (args.output) {
    writeFileSync(args.output, markdown);
  } else {
    process.stdout.write(markdown);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
