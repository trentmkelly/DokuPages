const DISALLOWED = /[^a-z0-9:._-]+/g;
const COLON_RUN = /:{2,}/g;

export function cleanPageId(rawId: string): string {
  return stripControlChars(rawId)
    .replace(/\//g, ":")
    .trim()
    .toLowerCase()
    .replace(DISALLOWED, "_")
    .replace(COLON_RUN, ":")
    .replace(/^:+|:+$/g, "");
}

export function pageIdToPath(id: string): string {
  const clean = cleanPageId(id);
  return clean ? `${clean.replaceAll(":", "/")}.txt` : "";
}

export function pageIdToRoutePath(id: string): string {
  return `/wiki/${cleanPageId(id)
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function resolvePageLinkId(target: string, currentPageId?: string): string {
  const trimmed = target.trim();

  if (trimmed.startsWith(":")) {
    return cleanPageId(trimmed.slice(1));
  }

  const currentNamespace = currentPageId ? pageNamespace(cleanPageId(currentPageId)) : "";

  if (!currentNamespace) {
    return cleanPageId(trimmed);
  }

  if (trimmed.startsWith("..:") || trimmed.startsWith(".:")) {
    const segments = currentNamespace.split(":").filter(Boolean);
    let relative = trimmed;

    while (relative.startsWith("..:")) {
      segments.pop();
      relative = relative.slice(3);
    }

    if (relative.startsWith(".:")) {
      relative = relative.slice(2);
    }

    return cleanPageId([...segments, relative].filter(Boolean).join(":"));
  }

  if (!trimmed.includes(":")) {
    return cleanPageId(`${currentNamespace}:${trimmed}`);
  }

  return cleanPageId(trimmed);
}

function pageNamespace(pageId: string): string {
  return pageId.includes(":") ? pageId.slice(0, pageId.lastIndexOf(":")) : "";
}

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("");
}
