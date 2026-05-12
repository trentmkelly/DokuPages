import type { Env } from "./env";
import { getRuntimeConfig, isDokuWikiLogFacilityEnabled } from "./config";

const DEFAULT_RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_SITE_NAME = "DokuWiki";
const DEFAULT_HTML_MAIL = true;
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type EmailKind =
  | "registration_notification"
  | "generated_password"
  | "password_reset"
  | "page_change"
  | "media_change"
  | "digest";

export interface WikiEmail {
  kind: EmailKind;
  to: string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  provider: string;
  providerMessageId: string | null;
  error: string | null;
}

export interface EmailConfig {
  enabled: boolean;
  provider: "resend";
  endpoint: string;
  token: string | null;
  from: string | null;
  replyTo: string | null;
  returnPath: string | null;
  baseUrl: string | null;
  registrationNotify: string[];
  notify: string[];
  mailPrefix: string | null;
  htmlMail: boolean;
  siteName: string;
}

export interface RegistrationNotificationTemplateInput {
  siteName: string;
  baseUrl: string;
  username: string;
  displayName: string;
  email: string | null;
  date?: string;
  browser?: string;
  ipAddress?: string;
  hostname?: string;
}

export interface GeneratedPasswordTemplateInput {
  siteName: string;
  baseUrl: string;
  username: string;
  displayName: string;
  password: string;
}

export interface PasswordResetTemplateInput {
  siteName: string;
  resetUrl: string;
  displayName: string;
}

export interface PageChangeTemplateInput {
  siteName: string;
  pageId: string;
  pageUrl: string;
  actorName: string | null;
  changeType: string;
  summary: string;
  date?: string;
  browser?: string;
  ipAddress?: string;
  hostname?: string;
  oldRevision?: string;
  newRevision?: string;
}

export interface MediaChangeTemplateInput {
  siteName: string;
  mediaId: string;
  mediaUrl: string;
  actorName: string | null;
  changeType: string;
  summary: string;
  mimeType: string;
  byteLength: number;
  date?: string;
  browser?: string;
  ipAddress?: string;
  hostname?: string;
}

export interface DigestTemplateInput {
  siteName: string;
  baseUrl: string;
  displayName: string;
  events: Array<{
    pageId: string;
    pageUrl: string;
    actorName: string | null;
    changeType: string;
    summary: string;
    createdAt: string;
  }>;
}

export function emailConfig(env: Env): EmailConfig {
  const provider = (nonEmpty(env.EMAIL_PROVIDER) ?? "resend").toLowerCase();
  const token = nonEmpty(env.RESEND_API_KEY) ?? nonEmpty(env.EMAIL_API_TOKEN) ?? null;
  const from = normalizedMailAddress(nonEmpty(env.EMAIL_FROM) ?? nonEmpty(env.MAILFROM), env);
  const returnPath = normalizedMailAddress(
    nonEmpty(env.EMAIL_RETURN_PATH) ?? nonEmpty(env.MAILRETURNPATH),
    env
  );
  const siteName = nonEmpty(env.TITLE) ?? nonEmpty(env.SITE_NAME) ?? DEFAULT_SITE_NAME;

  return {
    enabled: provider === "resend" && Boolean(token && from),
    provider: "resend",
    endpoint: nonEmpty(env.EMAIL_PROVIDER_ENDPOINT) ?? DEFAULT_RESEND_ENDPOINT,
    token,
    from,
    replyTo: nonEmpty(env.EMAIL_REPLY_TO) ?? null,
    returnPath,
    baseUrl:
      nonEmpty(env.EMAIL_BASE_URL) ?? nonEmpty(env.BASE_URL) ?? nonEmpty(env.CF_PAGES_URL) ?? null,
    registrationNotify: emailList(nonEmpty(env.EMAIL_REGISTRATION_NOTIFY) ?? env.REGISTERNOTIFY),
    notify: emailList(nonEmpty(env.EMAIL_NOTIFY) ?? env.NOTIFY),
    mailPrefix: nonEmpty(env.MAILPREFIX) ?? null,
    htmlMail: booleanConfig(env.HTMLMAIL, DEFAULT_HTML_MAIL),
    siteName
  };
}

export async function sendWikiEmail(
  env: Env,
  email: WikiEmail,
  fetcher: typeof fetch = fetch
): Promise<EmailSendResult> {
  const config = emailConfig(env);
  const preparedEmail = {
    ...email,
    subject: subjectWithDokuWikiPrefix(email.subject, config)
  };

  if (!config.enabled || !config.token || !config.from) {
    const result: EmailSendResult = {
      ok: false,
      status: "skipped",
      provider: config.provider,
      providerMessageId: null,
      error: "Outbound email is not configured."
    };
    await recordEmailDelivery(env.DB, preparedEmail, result);
    return result;
  }

  const body = {
    from: config.from,
    to: preparedEmail.to,
    subject: preparedEmail.subject,
    text: preparedEmail.text,
    ...(config.htmlMail ? { html: preparedEmail.html } : {}),
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...(config.returnPath ? { headers: { "Return-Path": config.returnPath } } : {})
  };

  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        ...(preparedEmail.idempotencyKey ? { "idempotency-key": preparedEmail.idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });

    const payload = await readJsonPayload(response);
    const providerMessageId = stringOrNull(payload?.id);

    if (!response.ok) {
      const result: EmailSendResult = {
        ok: false,
        status: "failed",
        provider: config.provider,
        providerMessageId,
        error: providerErrorMessage(response.status, payload)
      };
      await recordEmailDelivery(env.DB, preparedEmail, result);
      logEmailDelivery(env, preparedEmail, result);
      return result;
    }

    const result: EmailSendResult = {
      ok: true,
      status: "sent",
      provider: config.provider,
      providerMessageId,
      error: null
    };
    await recordEmailDelivery(env.DB, preparedEmail, result);
    logEmailDelivery(env, preparedEmail, result);
    return result;
  } catch (error) {
    const result: EmailSendResult = {
      ok: false,
      status: "failed",
      provider: config.provider,
      providerMessageId: null,
      error: error instanceof Error ? error.message : String(error)
    };
    await recordEmailDelivery(env.DB, preparedEmail, result);
    logEmailDelivery(env, preparedEmail, result);
    return result;
  }
}

export function registrationNotificationEmail(
  input: RegistrationNotificationTemplateInput
): Omit<WikiEmail, "kind" | "to"> {
  const title = `new user: ${input.username}`;
  const rows: Array<[string, string]> = [
    ["Username", input.username],
    ["Display name", input.displayName],
    ["Email", input.email ?? "not provided"],
    ["Date", input.date ?? ""],
    ["Browser", input.browser ?? ""],
    ["IP-Address", input.ipAddress ?? ""],
    ["Hostname", input.hostname ?? ""]
  ];

  return {
    subject: title,
    text: [
      "A new user has registered. Here are the details:",
      "",
      `User name   : ${input.username}`,
      `Full name   : ${input.displayName}`,
      `E-mail      : ${input.email ?? ""}`,
      "",
      `Date        : ${input.date ?? ""}`,
      `Browser     : ${input.browser ?? ""}`,
      `IP-Address  : ${input.ipAddress ?? ""}`,
      `Hostname    : ${input.hostname ?? ""}`,
      upstreamSignature(input.baseUrl)
    ].join("\n"),
    html: `${paragraph(`A new user registered on ${escapeHtml(input.siteName)}.`)}
${definitionList(rows)}
${paragraph(link(input.baseUrl, input.baseUrl))}
${htmlSignature(input.baseUrl)}`
  };
}

export function generatedPasswordEmail(
  input: GeneratedPasswordTemplateInput
): Omit<WikiEmail, "kind" | "to"> {
  const text = [
    `Hi ${input.displayName}!`,
    "",
    `Here is your userdata for ${input.siteName} at ${input.baseUrl}`,
    "",
    `Login    : ${input.username}`,
    `Password : ${input.password}`,
    upstreamSignature(input.baseUrl)
  ].join("\n");

  return {
    subject: "Your DokuWiki password",
    text,
    html: `${paragraph(`Hi ${escapeHtml(input.displayName)}!`)}
${paragraph(`Here is your userdata for ${escapeHtml(input.siteName)} at ${link(input.baseUrl, input.baseUrl)}`)}
${definitionList([
  ["Login", input.username],
  ["Password", input.password]
])}
${htmlSignature(input.baseUrl)}`
  };
}

export function passwordResetEmail(
  input: PasswordResetTemplateInput
): Omit<WikiEmail, "kind" | "to"> {
  const baseUrl = siteUrlFromUrl(input.resetUrl);
  return {
    subject: "Your DokuWiki password",
    text: [
      `Hi ${input.displayName}!`,
      "",
      `Someone requested a new password for your ${input.siteName} login at ${baseUrl}`,
      "",
      "If you did not request a new password then just ignore this email.",
      "",
      "To confirm that the request was really sent by you please use the following link.",
      "",
      input.resetUrl,
      upstreamSignature(baseUrl)
    ].join("\n"),
    html: `${paragraph(`Hi ${escapeHtml(input.displayName)}!`)}
${paragraph(
  `Someone requested a new password for your ${escapeHtml(input.siteName)} login at ${link(
    baseUrl,
    baseUrl
  )}.`
)}
${paragraph("If you did not request a new password then just ignore this email.")}
${paragraph("To confirm that the request was really sent by you please use the following link.")}
${paragraph(link(input.resetUrl, "Reset password"))}
${htmlSignature(baseUrl)}`
  };
}

export function pageChangeEmail(input: PageChangeTemplateInput): Omit<WikiEmail, "kind" | "to"> {
  const actor = input.actorName || "Anonymous";
  const summary = input.summary || "(no edit summary)";
  const subject = `${input.changeType === "create" ? "page added:" : "page changed:"} ${input.pageId}`;

  return {
    subject,
    text: [
      "A page in your DokuWiki was added or changed. Here are the details:",
      "",
      `Browser             : ${input.browser ?? ""}`,
      `IP Address          : ${input.ipAddress ?? ""}`,
      `Hostname            : ${input.hostname ?? ""}`,
      `Old Revision        : ${input.oldRevision ?? ""}`,
      `New Revision        : ${input.newRevision ?? ""}`,
      `Date of New Revision: ${input.date ?? ""}`,
      `Edit Summary        : ${summary}`,
      `User                : ${actor}`,
      "",
      input.pageUrl,
      upstreamSignature(siteUrlFromUrl(input.pageUrl))
    ].join("\n"),
    html: `${paragraph(`${code(input.pageId)} was updated on ${escapeHtml(input.siteName)}.`)}
${definitionList([
  ["Change", input.changeType],
  ["Editor", actor],
  ["Summary", summary],
  ["Date", input.date ?? ""]
])}
${paragraph(link(input.pageUrl, "View page"))}
${htmlSignature(siteUrlFromUrl(input.pageUrl))}`
  };
}

export function mediaChangeEmail(input: MediaChangeTemplateInput): Omit<WikiEmail, "kind" | "to"> {
  const actor = input.actorName || "Anonymous";
  const summary = input.summary || "(no upload summary)";

  return {
    subject: `file uploaded: ${input.mediaId}`,
    text: [
      "A file was uploaded to your DokuWiki. Here are the details:",
      "",
      `File        : ${input.mediaId}`,
      `Old revision: ${input.changeType === "create" ? "" : "yes"}`,
      `Date        : ${input.date ?? ""}`,
      `Browser     : ${input.browser ?? ""}`,
      `IP-Address  : ${input.ipAddress ?? ""}`,
      `Hostname    : ${input.hostname ?? ""}`,
      `Size        : ${input.byteLength}`,
      `MIME Type   : ${input.mimeType}`,
      `User        : ${actor}`,
      `Summary     : ${summary}`,
      "",
      input.mediaUrl,
      upstreamSignature(siteUrlFromUrl(input.mediaUrl))
    ].join("\n"),
    html: `${paragraph(`${code(input.mediaId)} was uploaded to ${escapeHtml(input.siteName)}.`)}
${definitionList([
  ["Change", input.changeType],
  ["User", actor],
  ["Summary", summary],
  ["Size", String(input.byteLength)],
  ["MIME Type", input.mimeType],
  ["Date", input.date ?? ""]
])}
${paragraph(link(input.mediaUrl, "View media"))}
${htmlSignature(siteUrlFromUrl(input.mediaUrl))}`
  };
}

export function digestEmail(input: DigestTemplateInput): Omit<WikiEmail, "kind" | "to"> {
  const lines = input.events.map(
    (event) =>
      `- ${event.pageId} (${event.changeType}) by ${event.actorName || "Anonymous"}: ${event.pageUrl}`
  );
  const items = input.events
    .map(
      (event) =>
        `<li>${link(event.pageUrl, event.pageId)} ${escapeHtml(event.changeType)} by ${escapeHtml(
          event.actorName || "Anonymous"
        )}<br><span>${escapeHtml(event.summary || "(no edit summary)")}</span></li>`
    )
    .join("");

  return {
    subject: "page change digest",
    text: [
      `Hello ${input.displayName},`,
      "",
      `Recent page changes on ${input.siteName}:`,
      "",
      ...lines,
      "",
      `Site: ${input.baseUrl}`,
      upstreamSignature(input.baseUrl)
    ].join("\n"),
    html: `${paragraph(`Hello ${escapeHtml(input.displayName)},`)}
${paragraph(`Recent page changes on ${escapeHtml(input.siteName)}:`)}
<ul>${items}</ul>
${paragraph(link(input.baseUrl, input.baseUrl))}
${htmlSignature(input.baseUrl)}`
  };
}

async function recordEmailDelivery(
  db: D1Database,
  email: WikiEmail,
  result: EmailSendResult,
  now = new Date()
): Promise<void> {
  const timestamp = now.toISOString();
  await db
    .prepare(
      `insert into email_deliveries (
         id, kind, recipient, subject, status, provider, provider_message_id,
         error_message, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      email.kind,
      email.to.join(", "),
      email.subject,
      result.status,
      result.provider,
      result.providerMessageId,
      result.error,
      timestamp,
      timestamp
    )
    .run();
}

function logEmailDelivery(env: Env, email: WikiEmail, result: EmailSendResult): void {
  const facility = result.ok ? "debug" : "error";
  if (!isDokuWikiLogFacilityEnabled(getRuntimeConfig(env), facility)) return;

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "error",
      event: "email_delivery",
      kind: email.kind,
      status: result.status,
      provider: result.provider,
      recipientCount: email.to.length,
      providerMessageId: result.providerMessageId,
      error: result.error
    })
  );
}

async function readJsonPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function providerErrorMessage(status: number, payload: Record<string, unknown> | null): string {
  const message = stringOrNull(payload?.message) ?? stringOrNull(payload?.error);
  return message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
}

function subjectWithDokuWikiPrefix(subject: string, config: EmailConfig): string {
  const prefixValue = config.mailPrefix ?? defaultSubjectPrefix(config.siteName);
  const prefix = `[${prefixValue}]`;
  return subject.startsWith(prefix) ? subject : `${prefix} ${subject}`;
}

function defaultSubjectPrefix(siteName: string): string {
  return siteName.length < 20 ? siteName : `${siteName.slice(0, 20)}...`;
}

function normalizedMailAddress(value: string | undefined, env: Env): string | null {
  if (!value) return null;

  const host = mailHost(env);
  const siteName = nonEmpty(env.TITLE) ?? nonEmpty(env.SITE_NAME) ?? DEFAULT_SITE_NAME;
  return value
    .replaceAll("@MAIL@", `noreply@${host}`)
    .replaceAll("@USER@", "noreply")
    .replaceAll("@NAME@", siteName);
}

function mailHost(env: Env): string {
  const rawUrl =
    nonEmpty(env.EMAIL_BASE_URL) ?? nonEmpty(env.BASE_URL) ?? nonEmpty(env.CF_PAGES_URL);
  if (!rawUrl) return "example.com";

  try {
    return new URL(rawUrl).hostname || "example.com";
  } catch {
    return "example.com";
  }
}

function booleanConfig(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function emailList(value: string | undefined): string[] {
  const raw = nonEmpty(value);
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => EMAIL_ADDRESS.test(extractEmailAddress(entry)));
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^<>]+)>/);
  return (match?.[1] ?? value).trim();
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? "");
  return text || null;
}

function paragraph(value: string): string {
  return `<p>${value}</p>`;
}

function upstreamSignature(baseUrl: string): string {
  return `\n-- \nThis mail was generated by DokuWiki at\n${baseUrl}`;
}

function htmlSignature(baseUrl: string): string {
  return `<br><hr><small>This mail was generated by DokuWiki at<br>${link(baseUrl, baseUrl)}</small>`;
}

function siteUrlFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function definitionList(rows: Array<[string, string]>): string {
  return `<dl>${rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl>`;
}

function link(href: string, label: string): string {
  return `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
}

function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
