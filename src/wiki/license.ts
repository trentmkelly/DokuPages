export interface LicenseConfig {
  id: string;
  name: string;
  urlTemplate: string;
}

export interface ResolvedLicense {
  id: string;
  name: string;
  url: string;
}

// Default mapping from DokuWiki's conf/license.php.
const DEFAULT_LICENSES: LicenseConfig[] = [
  {
    id: "cc-zero",
    name: "CC0 1.0 Universal",
    urlTemplate: "https://creativecommons.org/publicdomain/zero/1.0/deed.{lang}"
  },
  {
    id: "publicdomain",
    name: "Public Domain",
    urlTemplate: "https://creativecommons.org/licenses/publicdomain/deed.{lang}"
  },
  {
    id: "cc-by",
    name: "CC Attribution 4.0 International",
    urlTemplate: "https://creativecommons.org/licenses/by/4.0/deed.{lang}"
  },
  {
    id: "cc-by-sa",
    name: "CC Attribution-Share Alike 4.0 International",
    urlTemplate: "https://creativecommons.org/licenses/by-sa/4.0/deed.{lang}"
  },
  {
    id: "gnufdl",
    name: "GNU Free Documentation License 1.3",
    urlTemplate: "https://www.gnu.org/licenses/fdl-1.3.html"
  },
  {
    id: "cc-by-nc",
    name: "CC Attribution-Noncommercial 4.0 International",
    urlTemplate: "https://creativecommons.org/licenses/by-nc/4.0/deed.{lang}"
  },
  {
    id: "cc-by-nc-sa",
    name: "CC Attribution-Noncommercial-Share Alike 4.0 International",
    urlTemplate: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.{lang}"
  }
];

const DEFAULT_LICENSE_MAP = new Map(DEFAULT_LICENSES.map((license) => [license.id, license]));

export function listDefaultLicenses(): LicenseConfig[] {
  return DEFAULT_LICENSES.map((license) => ({ ...license }));
}

export function resolveDefaultLicense(id: string, lang = "en"): ResolvedLicense | null {
  const license = DEFAULT_LICENSE_MAP.get(id);
  if (!license) return null;

  return {
    id: license.id,
    name: license.name,
    url: license.urlTemplate.replaceAll("{lang}", normalizeLang(lang))
  };
}

function normalizeLang(lang: string): string {
  const normalized = lang
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return normalized || "en";
}
