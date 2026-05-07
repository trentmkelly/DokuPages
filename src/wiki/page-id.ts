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

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("");
}
