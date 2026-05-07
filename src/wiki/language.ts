export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = [
  "af",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "ca",
  "ca-valencia",
  "ckb",
  "cs",
  "cy",
  "da",
  "de",
  "de-informal",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "hu-formal",
  "hy",
  "ia",
  "id",
  "id-ni",
  "is",
  "it",
  "ja",
  "ka",
  "kk",
  "km",
  "ko",
  "ku",
  "la",
  "lb",
  "lt",
  "lv",
  "mg",
  "mk",
  "mr",
  "ms",
  "nan",
  "ne",
  "nl",
  "no",
  "oc",
  "pl",
  "pt",
  "pt-br",
  "ro",
  "ru",
  "si",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "ta",
  "th",
  "tr",
  "uk",
  "uz",
  "vi",
  "zh",
  "zh-tw"
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);

export function resolveLanguage(rawLanguage: string | undefined): SupportedLanguage {
  const normalized = normalizeLanguage(rawLanguage ?? DEFAULT_LANGUAGE);

  if (isSupportedLanguage(normalized)) {
    return normalized;
  }

  const baseLanguage = normalized.split("-")[0] ?? DEFAULT_LANGUAGE;

  return isSupportedLanguage(baseLanguage) ? baseLanguage : DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return SUPPORTED_LANGUAGE_SET.has(language);
}

export function normalizeLanguage(language: string): string {
  return language
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
