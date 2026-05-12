import { DEFAULT_LANGUAGE, normalizeLanguage } from "./language";

type TemplateLanguageKey = "home";

const TEMPLATE_LANGUAGE_PACKS: Record<string, Partial<Record<TemplateLanguageKey, string>>> = {
  cs: { home: "Domů" },
  de: { home: "Startseite" },
  "de-informal": { home: "Startseite" },
  en: { home: "Home" },
  es: { home: "Inicio" },
  fr: { home: "Accueil" },
  hu: { home: "Kezdőlap" },
  it: { home: "Home" },
  pl: { home: "Główna" },
  pt: { home: "Página Inicial" },
  "pt-br": { home: "Início" },
  ru: { home: "Домой" },
  sk: { home: "Domov" },
  uk: { home: "Головна" },
  vi: { home: "Trang chủ" },
  zh: { home: "主页" }
};

export function templateLang(language: string, key: TemplateLanguageKey): string {
  for (const candidate of languageCandidates(language)) {
    const value = TEMPLATE_LANGUAGE_PACKS[candidate]?.[key];
    if (typeof value === "string") return value;
  }

  return TEMPLATE_LANGUAGE_PACKS[DEFAULT_LANGUAGE]?.[key] ?? "";
}

function languageCandidates(language: string): string[] {
  const normalized = normalizeLanguage(language || DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const base = normalized.split("-")[0] || DEFAULT_LANGUAGE;
  return [...new Set([normalized, base, DEFAULT_LANGUAGE])];
}
