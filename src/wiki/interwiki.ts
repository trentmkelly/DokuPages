import { pageIdToRoutePath } from "./page-id";

interface InterwikiLink {
  href: string;
  external: boolean;
}

export type InterwikiTemplates = Readonly<Record<string, string>>;

const INTERWIKI_TEMPLATES = new Map<string, string>([
  ["wp", "https://en.wikipedia.org/wiki/{NAME}"],
  ["wpfr", "https://fr.wikipedia.org/wiki/{NAME}"],
  ["wpde", "https://de.wikipedia.org/wiki/{NAME}"],
  ["wpes", "https://es.wikipedia.org/wiki/{NAME}"],
  ["wppl", "https://pl.wikipedia.org/wiki/{NAME}"],
  ["wpjp", "https://ja.wikipedia.org/wiki/{NAME}"],
  ["wpru", "https://ru.wikipedia.org/wiki/{NAME}"],
  ["wpmeta", "https://meta.wikipedia.org/wiki/{NAME}"],
  ["doku", "https://www.dokuwiki.org/"],
  ["rfc", "https://tools.ietf.org/html/rfc"],
  ["man", "http://man.cx/"],
  ["amazon", "https://www.amazon.com/dp/{URL}?tag=splitbrain-20"],
  ["amazon.de", "https://www.amazon.de/dp/{URL}?tag=splitbrain-21"],
  ["amazon.uk", "https://www.amazon.co.uk/dp/{URL}"],
  ["paypal", "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business="],
  ["phpfn", "https://secure.php.net/{NAME}"],
  ["skype", "skype:{NAME}"],
  ["google", "https://www.google.com/search?q="],
  ["google.de", "https://www.google.de/search?q="],
  ["go", "https://www.google.com/search?q={URL}&btnI=lucky"],
  ["user", ":user:{NAME}"],
  ["callto", "callto://{NAME}"],
  ["tel", "tel:{NAME}"]
]);

export function resolveInterwikiLink(
  target: string,
  templates?: InterwikiTemplates
): InterwikiLink | null {
  const separator = target.indexOf(">");
  if (separator <= 0) return null;

  const shortcut = target.slice(0, separator).toLowerCase();
  const name = target.slice(separator + 1);

  if (shortcut === "this") {
    return {
      href: `/${name.replace(/^\/+/, "")}`,
      external: false
    };
  }

  const template = templates?.[shortcut] ?? INTERWIKI_TEMPLATES.get(shortcut);
  if (!template) return null;

  if (template.startsWith(":")) {
    return {
      href: pageIdToRoutePath(applyTemplate(template.slice(1), name)),
      external: false
    };
  }

  const href = templateHasPlaceholder(template)
    ? applyTemplate(template, name)
    : `${template}${encodeInterwikiUrlPart(name)}`;

  return {
    href,
    external: isExternalHref(href)
  };
}

function applyTemplate(template: string, name: string): string {
  const parsed = parseUrlParts(name);

  return template
    .replaceAll("{URL}", encodeURIComponent(name))
    .replaceAll("{NAME}", encodeInterwikiName(name))
    .replaceAll("{SCHEME}", parsed?.protocol.replace(/:$/, "") ?? "")
    .replaceAll("{HOST}", parsed?.hostname ?? "")
    .replaceAll("{PORT}", parsed?.port ?? "")
    .replaceAll("{PATH}", parsed?.pathname ?? "")
    .replaceAll("{QUERY}", parsed?.search.replace(/^\?/, "") ?? "");
}

function templateHasPlaceholder(template: string): boolean {
  return /\{(?:URL|NAME|SCHEME|HOST|PORT|PATH|QUERY)\}/.test(template);
}

function encodeInterwikiName(name: string): string {
  return encodeURI(name.replace(/\s+/g, "_"));
}

function encodeInterwikiUrlPart(name: string): string {
  return encodeURIComponent(name).replaceAll("%3A", ":").replaceAll("%23", "#");
}

function parseUrlParts(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isExternalHref(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
}
