export type MailguardMode = "visible" | "hex" | "none";

export function normalizeMailguardMode(value: string | null | undefined): MailguardMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "visible" || normalized === "none" ? normalized : "hex";
}

export function obfuscateEmail(email: string, mode: MailguardMode = "hex"): string {
  if (mode === "visible") {
    return email.replaceAll("@", " [at] ").replaceAll(".", " [dot] ").replaceAll("-", " [dash] ");
  }

  if (mode === "none") return email;

  return Array.from(email)
    .map((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 0x100 ? `&#${codePoint};` : `&#x${codePoint.toString(16)};`;
    })
    .join("");
}

export function mailtoHrefAddress(email: string, mode: MailguardMode = "hex"): string {
  const obfuscated = obfuscateEmail(email, mode);
  return mode === "visible" ? encodeURIComponent(obfuscated) : obfuscated;
}
