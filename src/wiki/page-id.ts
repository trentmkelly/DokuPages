const COLON_RUN = /:{2,}/g;
const PAGE_ID_SPECIALS = /[^\p{Letter}\p{Number}:._-]+/gu;
const ASCII_FILENAME = /^[a-zA-Z0-9/_\-.%]+$/;
const SAFE_FN_PLAIN = "-./[_0123456789abcdefghijklmnopqrstuvwxyz";
const SAFE_FN_PRE_INDICATOR = "%";
const SAFE_FN_POST_INDICATOR = "]";

export type DokuWikiFnEncode = "url" | "safe" | "utf-8";

export interface PageIdCleanOptions {
  ascii?: boolean;
  deaccent?: boolean | 0 | 1 | 2;
  fnencode?: DokuWikiFnEncode;
  sepchar?: string;
  useslash?: boolean;
}

const DEFAULT_PAGE_ID_OPTIONS: Required<PageIdCleanOptions> = {
  ascii: false,
  deaccent: 1,
  fnencode: "url" satisfies DokuWikiFnEncode,
  sepchar: "_",
  useslash: false
};

const LOWER_ACCENT_REPLACEMENTS = new Map<string, string>([
  ["á", "a"],
  ["à", "a"],
  ["ă", "a"],
  ["â", "a"],
  ["å", "a"],
  ["ä", "ae"],
  ["ã", "a"],
  ["ą", "a"],
  ["ā", "a"],
  ["æ", "ae"],
  ["ḃ", "b"],
  ["ć", "c"],
  ["ĉ", "c"],
  ["č", "c"],
  ["ċ", "c"],
  ["ç", "c"],
  ["ď", "d"],
  ["ḋ", "d"],
  ["đ", "d"],
  ["ð", "dh"],
  ["é", "e"],
  ["è", "e"],
  ["ĕ", "e"],
  ["ê", "e"],
  ["ě", "e"],
  ["ë", "e"],
  ["ė", "e"],
  ["ę", "e"],
  ["ē", "e"],
  ["ḟ", "f"],
  ["ƒ", "f"],
  ["ğ", "g"],
  ["ĝ", "g"],
  ["ġ", "g"],
  ["ģ", "g"],
  ["ĥ", "h"],
  ["ħ", "h"],
  ["í", "i"],
  ["ì", "i"],
  ["î", "i"],
  ["ï", "i"],
  ["ĩ", "i"],
  ["į", "i"],
  ["ī", "i"],
  ["ı", "i"],
  ["ĵ", "j"],
  ["ķ", "k"],
  ["ĺ", "l"],
  ["ľ", "l"],
  ["ļ", "l"],
  ["ł", "l"],
  ["ṁ", "m"],
  ["ń", "n"],
  ["ň", "n"],
  ["ñ", "n"],
  ["ņ", "n"],
  ["ó", "o"],
  ["ò", "o"],
  ["ô", "o"],
  ["ö", "oe"],
  ["ő", "o"],
  ["õ", "o"],
  ["ø", "o"],
  ["ō", "o"],
  ["ơ", "o"],
  ["ṗ", "p"],
  ["ŕ", "r"],
  ["ř", "r"],
  ["ŗ", "r"],
  ["ś", "s"],
  ["ŝ", "s"],
  ["š", "s"],
  ["ṡ", "s"],
  ["ş", "s"],
  ["ș", "s"],
  ["ß", "ss"],
  ["ť", "t"],
  ["ṫ", "t"],
  ["ţ", "t"],
  ["ț", "t"],
  ["ŧ", "t"],
  ["ú", "u"],
  ["ù", "u"],
  ["ŭ", "u"],
  ["û", "u"],
  ["ů", "u"],
  ["ü", "ue"],
  ["ű", "u"],
  ["ũ", "u"],
  ["ų", "u"],
  ["ū", "u"],
  ["ư", "u"],
  ["ẃ", "w"],
  ["ẁ", "w"],
  ["ŵ", "w"],
  ["ẅ", "w"],
  ["ý", "y"],
  ["ỳ", "y"],
  ["ŷ", "y"],
  ["ÿ", "y"],
  ["ź", "z"],
  ["ž", "z"],
  ["ż", "z"],
  ["þ", "th"],
  ["µ", "u"]
]);

const ROMANIZATION_REPLACEMENTS = new Map<string, string>([
  ["å", "a"],
  ["ä", "a"],
  ["ö", "o"],
  ["а", "a"],
  ["б", "b"],
  ["в", "v"],
  ["г", "g"],
  ["д", "d"],
  ["е", "e"],
  ["ё", "jo"],
  ["ж", "zh"],
  ["з", "z"],
  ["и", "i"],
  ["й", "j"],
  ["к", "k"],
  ["л", "l"],
  ["м", "m"],
  ["н", "n"],
  ["о", "o"],
  ["п", "p"],
  ["р", "r"],
  ["с", "s"],
  ["т", "t"],
  ["у", "u"],
  ["ф", "f"],
  ["х", "x"],
  ["ц", "c"],
  ["ч", "ch"],
  ["ш", "sh"],
  ["щ", "sch"],
  ["ъ", ""],
  ["ы", "y"],
  ["ь", ""],
  ["э", "e"],
  ["ю", "ju"],
  ["я", "ja"],
  ["α", "a"],
  ["ά", "a"],
  ["β", "b"],
  ["γ", "g"],
  ["δ", "d"],
  ["ε", "e"],
  ["έ", "e"],
  ["ζ", "z"],
  ["η", "i"],
  ["ή", "i"],
  ["θ", "th"],
  ["ι", "i"],
  ["ί", "i"],
  ["κ", "k"],
  ["λ", "l"],
  ["μ", "m"],
  ["ν", "n"],
  ["ξ", "x"],
  ["ο", "o"],
  ["ό", "o"],
  ["π", "p"],
  ["ρ", "r"],
  ["ς", "s"],
  ["σ", "s"],
  ["τ", "t"],
  ["υ", "y"],
  ["ύ", "y"],
  ["φ", "f"],
  ["χ", "ch"],
  ["ψ", "ps"],
  ["ω", "o"],
  ["ώ", "o"]
]);

export function cleanPageId(rawId: string, options: PageIdCleanOptions = {}): string {
  const normalized = normalizePageIdOptions(options);
  const shouldRomanize = normalized.ascii || normalized.deaccent === 2;
  const shouldDeaccent = normalized.ascii || normalized.deaccent !== 0;
  let id = String(rawId).trim().toLowerCase();

  id = id.replace(/[;/]/g, (separator) =>
    separator === ";" || normalized.useslash ? ":" : normalized.sepchar
  );

  if (shouldRomanize) {
    id = romanize(id);
  }

  if (shouldDeaccent) {
    id = deaccentLowercase(id);
  }

  id = id.replace(PAGE_ID_SPECIALS, normalized.sepchar);

  if (normalized.ascii) {
    id = stripNonAscii(id);
  }

  id = id
    .replace(separatorRunPattern(normalized.sepchar), normalized.sepchar)
    .replace(COLON_RUN, ":")
    .replace(/^[:._-]+|[:._-]+$/g, "")
    .replace(/:[:._-]+/g, ":")
    .replace(/[:._-]+:/g, ":");

  return id;
}

export function cleanRoutePageId(rawPath: string, options: PageIdCleanOptions = {}): string {
  const decoded = decodeDokuWikiFileName(rawPath, options.fnencode);
  return cleanPageId(decoded.replace(/\/+/g, ":"), { ...options, useslash: true });
}

export function pageIdToPath(id: string, options: PageIdCleanOptions = {}): string {
  const clean = cleanPageId(id, options);
  return clean ? `${encodeDokuWikiFileName(clean.replaceAll(":", "/"), options.fnencode)}.txt` : "";
}

export function pageIdToRoutePath(id: string, options: PageIdCleanOptions = {}): string {
  return `/wiki/${cleanPageId(id, options)
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function resolvePageLinkId(
  target: string,
  currentPageId?: string,
  options: PageIdCleanOptions = {}
): string {
  const trimmed = target.trim();

  if (trimmed.startsWith(":")) {
    return cleanPageId(trimmed.slice(1), options);
  }

  const currentNamespace = currentPageId ? pageNamespace(cleanPageId(currentPageId, options)) : "";

  if (!currentNamespace) {
    return cleanPageId(trimmed, options);
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

    return cleanPageId([...segments, relative].filter(Boolean).join(":"), options);
  }

  if (!trimmed.includes(":")) {
    return cleanPageId(`${currentNamespace}:${trimmed}`, options);
  }

  return cleanPageId(trimmed, options);
}

export function encodeDokuWikiFileName(
  filename: string,
  fnencode: DokuWikiFnEncode = DEFAULT_PAGE_ID_OPTIONS.fnencode
): string {
  if (fnencode === "utf-8" || ASCII_FILENAME.test(filename)) return filename;
  if (fnencode === "safe") return encodeSafeFileName(filename);

  return encodeURIComponent(filename).replace(/%2F/gi, "/");
}

export function decodeDokuWikiFileName(
  filename: string,
  fnencode: DokuWikiFnEncode = DEFAULT_PAGE_ID_OPTIONS.fnencode
): string {
  if (fnencode === "utf-8") return filename;
  if (fnencode === "safe") return decodeSafeFileName(filename);

  return safeDecodeUrlFileName(filename);
}

function pageNamespace(pageId: string): string {
  return pageId.includes(":") ? pageId.slice(0, pageId.lastIndexOf(":")) : "";
}

function normalizePageIdOptions(options: PageIdCleanOptions): Required<PageIdCleanOptions> {
  return {
    ascii: options.ascii ?? DEFAULT_PAGE_ID_OPTIONS.ascii,
    deaccent: normalizeDeaccent(options.deaccent),
    fnencode: normalizeFnEncode(options.fnencode),
    sepchar: normalizeSepchar(options.sepchar),
    useslash: options.useslash ?? DEFAULT_PAGE_ID_OPTIONS.useslash
  };
}

function normalizeDeaccent(value: PageIdCleanOptions["deaccent"]): 0 | 1 | 2 {
  if (value === 2) return 2;
  if (value === 0 || value === false) return 0;
  return 1;
}

function normalizeFnEncode(value: DokuWikiFnEncode | undefined): DokuWikiFnEncode {
  return value === "safe" || value === "utf-8" ? value : "url";
}

function normalizeSepchar(value: string | undefined): string {
  return value && /^[A-Za-z0-9_.-]$/.test(value) ? value : DEFAULT_PAGE_ID_OPTIONS.sepchar;
}

function separatorRunPattern(sepchar: string): RegExp {
  return new RegExp(`${escapeRegExp(sepchar)}+`, "g");
}

function deaccentLowercase(value: string): string {
  return Array.from(value, (char) => LOWER_ACCENT_REPLACEMENTS.get(char) ?? char).join("");
}

function romanize(value: string): string {
  return Array.from(value, (char) => ROMANIZATION_REPLACEMENTS.get(char) ?? char).join("");
}

function stripNonAscii(value: string): string {
  return Array.from(value)
    .filter((char) => (char.codePointAt(0) ?? 0) < 128)
    .join("");
}

function encodeSafeFileName(filename: string): string {
  let safe = "";
  let converted = false;

  for (const char of filename) {
    const codepoint = char.codePointAt(0) ?? 0;
    if (codepoint < 127 && (SAFE_FN_PLAIN.includes(char) || char === SAFE_FN_POST_INDICATOR)) {
      if (converted) {
        safe += SAFE_FN_POST_INDICATOR;
        converted = false;
      }
      safe += char;
      continue;
    }

    if (char === SAFE_FN_PRE_INDICATOR) {
      safe += SAFE_FN_PRE_INDICATOR;
      converted = true;
      continue;
    }

    safe += `${SAFE_FN_PRE_INDICATOR}${(codepoint - 32).toString(36)}`;
    converted = true;
  }

  if (converted) safe += SAFE_FN_POST_INDICATOR;
  return safe;
}

function decodeSafeFileName(filename: string): string {
  const safe = filename.toLowerCase();
  let decoded = "";
  let converted = false;

  for (let index = 0; index < safe.length; ) {
    const char = safe[index];

    if (char === SAFE_FN_PRE_INDICATOR) {
      let end = index + 1;
      while (
        end < safe.length &&
        safe[end] !== SAFE_FN_PRE_INDICATOR &&
        safe[end] !== SAFE_FN_POST_INDICATOR
      ) {
        end += 1;
      }

      if (end === index + 1) {
        decoded += SAFE_FN_PRE_INDICATOR;
      } else {
        const codepoint = 32 + Number.parseInt(safe.slice(index + 1, end), 36);
        decoded += String.fromCodePoint(codepoint);
      }
      converted = true;
      index = end;
      continue;
    }

    if (converted && char === SAFE_FN_POST_INDICATOR) {
      converted = false;
      index += 1;
      continue;
    }

    decoded += char;
    converted = false;
    index += 1;
  }

  return decoded;
}

function safeDecodeUrlFileName(filename: string): string {
  try {
    return decodeURIComponent(filename.replace(/\+/g, "%20"));
  } catch {
    return filename;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
