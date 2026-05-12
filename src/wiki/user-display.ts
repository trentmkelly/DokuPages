import type { RuntimeConfig } from "../config";
import { resolveInterwikiLink } from "./interwiki";
import { mailtoHrefAddress, obfuscateEmail, type MailguardMode } from "./mailguard";

export interface UserDisplaySource {
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  fallbackName?: string | null;
  knownUser?: boolean;
}

export function renderUserDisplay(
  source: UserDisplaySource,
  showUserAs: RuntimeConfig["showUserAs"],
  mailguard: MailguardMode = "hex"
): string {
  const username = displayUsername(source);
  const displayName = source.displayName?.trim() || username;
  const email = source.email?.trim() || null;

  if (showUserAs === "username") {
    return escapeHtml(displayName);
  }

  if (showUserAs === "username_link") {
    if (source.knownUser && source.username) {
      const interwiki = resolveInterwikiLink(`user>${source.username}`);
      if (interwiki) {
        return `<a href="${escapeAttribute(interwiki.href)}" class="interwiki iw_user">${escapeHtml(displayName)}</a>`;
      }
    }
    return escapeHtml(displayName);
  }

  if (showUserAs === "email") {
    return email ? obfuscateEmail(email, mailguard) : escapeHtml(username);
  }

  if (showUserAs === "email_link") {
    return email ? renderEmailLink(email, mailguard) : escapeHtml(username);
  }

  return escapeHtml(username);
}

export function formatUserDisplayText(
  source: UserDisplaySource,
  showUserAs: RuntimeConfig["showUserAs"]
): string {
  const username = displayUsername(source);
  if (showUserAs === "username" || showUserAs === "username_link") {
    return source.displayName?.trim() || username;
  }
  if (showUserAs === "email" || showUserAs === "email_link") {
    return source.email?.trim() || username;
  }
  return username;
}

function displayUsername(source: UserDisplaySource): string {
  return (
    source.username?.trim() || source.fallbackName?.trim() || source.userId?.trim() || "Anonymous"
  );
}

function renderEmailLink(email: string, mailguard: MailguardMode): string {
  const obfuscated = obfuscateEmail(email, mailguard);
  const hrefAddress = mailtoHrefAddress(email, mailguard);
  return `<a href="mailto:${hrefAddress}" class="mail" title="${obfuscated}">${obfuscated}</a>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
