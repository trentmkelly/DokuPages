import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const REGISTERED_LANGUAGES = new Set<string>();

registerLanguage("bash", bash, ["sh", "shell"]);
registerLanguage("css", css);
registerLanguage("diff", diff);
registerLanguage("ini", ini, ["conf", "properties"]);
registerLanguage("java", java, ["java5"]);
registerLanguage("javascript", javascript, ["js", "ecmascript"]);
registerLanguage("json", json);
registerLanguage("markdown", markdown, ["md"]);
registerLanguage("php", php, ["php-brief"]);
registerLanguage("plaintext", plaintext, ["text", "txt"]);
registerLanguage("python", python, ["py"]);
registerLanguage("sql", sql, ["mysql", "postgresql", "plsql", "tsql"]);
registerLanguage("typescript", typescript, ["ts"]);
registerLanguage("xml", xml, ["html", "html4strict", "html5", "xhtml"]);
registerLanguage("yaml", yaml, ["yml"]);

export function highlightSyntax(code: string, language: string): string | null {
  const normalizedLanguage = normalizeHighlightLanguage(language);
  if (!normalizedLanguage || !REGISTERED_LANGUAGES.has(normalizedLanguage)) return null;

  try {
    const highlighted = hljs.highlight(code, {
      language: normalizedLanguage,
      ignoreIllegals: true
    }).value;
    return toGeshiClassNames(highlighted);
  } catch {
    return null;
  }
}

function registerLanguage(
  name: string,
  language: Parameters<typeof hljs.registerLanguage>[1],
  aliases: string[] = []
): void {
  hljs.registerLanguage(name, language);
  REGISTERED_LANGUAGES.add(name);
  for (const alias of aliases) {
    hljs.registerAliases(alias, { languageName: name });
    REGISTERED_LANGUAGES.add(alias);
  }
}

function normalizeHighlightLanguage(language: string): string | null {
  const normalized = language.toLowerCase().replace(/[^a-z0-9_+-]+/g, "");
  return normalized || null;
}

function toGeshiClassNames(html: string): string {
  return html.replace(/class="([^"]+)"/g, (_match, classes: string) => {
    const mapped = classes.split(/\s+/).map(geshiClassName).filter(Boolean);
    return mapped.length > 0 ? `class="${[...new Set(mapped)].join(" ")}"` : "";
  });
}

function geshiClassName(className: string): string {
  const normalized = className.replace(/^hljs-/, "").replace(/_$/, "");
  const classMap: Record<string, string> = {
    attr: "kw3",
    attribute: "kw3",
    built_in: "kw2",
    bullet: "sy0",
    comment: "co1",
    deletion: "co1",
    doctag: "kw2",
    emphasis: "st0",
    function: "me1",
    keyword: "kw1",
    literal: "kw2",
    meta: "co2",
    name: "kw2",
    number: "nu0",
    operator: "sy0",
    params: "re0",
    property: "kw3",
    punctuation: "sy0",
    regexp: "st0",
    section: "kw2",
    selector_attr: "kw3",
    selector_class: "re0",
    selector_id: "re0",
    selector_pseudo: "kw3",
    string: "st0",
    strong: "kw1",
    subst: "",
    symbol: "sy0",
    tag: "kw2",
    template_tag: "kw2",
    template_variable: "re0",
    title: "me1",
    type: "kw2",
    variable: "re0"
  };

  return classMap[normalized] ?? "";
}
