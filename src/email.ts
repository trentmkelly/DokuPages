import type { Env } from "./env";

const DEFAULT_RESEND_ENDPOINT = "https://api.resend.com/emails";
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type EmailKind =
  | "registration_notification"
  | "generated_password"
  | "password_reset"
  | "page_change"
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
}

export interface RegistrationNotificationTemplateInput {
  siteName: string;
  baseUrl: string;
  username: string;
  displayName: string;
  email: string | null;
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
  const from = nonEmpty(env.EMAIL_FROM) ?? null;

  return {
    enabled: provider === "resend" && Boolean(token && from),
    provider: "resend",
    endpoint: nonEmpty(env.EMAIL_PROVIDER_ENDPOINT) ?? DEFAULT_RESEND_ENDPOINT,
    token,
    from,
    replyTo: nonEmpty(env.EMAIL_REPLY_TO) ?? null,
    returnPath: nonEmpty(env.EMAIL_RETURN_PATH) ?? null,
    baseUrl: nonEmpty(env.EMAIL_BASE_URL) ?? null,
    registrationNotify: emailList(env.EMAIL_REGISTRATION_NOTIFY)
  };
}

export async function sendWikiEmail(
  env: Env,
  email: WikiEmail,
  fetcher: typeof fetch = fetch
): Promise<EmailSendResult> {
  const config = emailConfig(env);

  if (!config.enabled || !config.token || !config.from) {
    const result: EmailSendResult = {
      ok: false,
      status: "skipped",
      provider: config.provider,
      providerMessageId: null,
      error: "Outbound email is not configured."
    };
    await recordEmailDelivery(env.DB, email, result);
    return result;
  }

  const body = {
    from: config.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...(config.returnPath ? { headers: { "Return-Path": config.returnPath } } : {})
  };

  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        ...(email.idempotencyKey ? { "idempotency-key": email.idempotencyKey } : {})
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
      await recordEmailDelivery(env.DB, email, result);
      logEmailDelivery(email, result);
      return result;
    }

    const result: EmailSendResult = {
      ok: true,
      status: "sent",
      provider: config.provider,
      providerMessageId,
      error: null
    };
    await recordEmailDelivery(env.DB, email, result);
    logEmailDelivery(email, result);
    return result;
  } catch (error) {
    const result: EmailSendResult = {
      ok: false,
      status: "failed",
      provider: config.provider,
      providerMessageId: null,
      error: error instanceof Error ? error.message : String(error)
    };
    await recordEmailDelivery(env.DB, email, result);
    logEmailDelivery(email, result);
    return result;
  }
}

export function registrationNotificationEmail(
  input: RegistrationNotificationTemplateInput
): Omit<WikiEmail, "kind" | "to"> {
  const title = `${input.siteName}: new user registration`;
  const rows: Array<[string, string]> = [
    ["Username", input.username],
    ["Display name", input.displayName],
    ["Email", input.email ?? "not provided"]
  ];

  return {
    subject: title,
    text: [
      `A new user registered on ${input.siteName}.`,
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      `Site: ${input.baseUrl}`
    ].join("\n"),
    html: `${paragraph(`A new user registered on ${input.siteName}.`)}
${definitionList(rows)}
${paragraph(link(input.baseUrl, input.baseUrl))}`
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
    `Password : ${input.password}`
  ].join("\n");

  return {
    subject: "Your DokuWiki password",
    text,
    html: `${paragraph(`Hi ${escapeHtml(input.displayName)}!`)}
${paragraph(`Here is your userdata for ${escapeHtml(input.siteName)} at ${link(input.baseUrl, input.baseUrl)}`)}
${definitionList([
  ["Login", input.username],
  ["Password", input.password]
])}`
  };
}

export function passwordResetEmail(
  input: PasswordResetTemplateInput
): Omit<WikiEmail, "kind" | "to"> {
  return {
    subject: `${input.siteName}: password reset`,
    text: [
      `Hello ${input.displayName},`,
      "",
      `Use this link to reset your ${input.siteName} password:`,
      input.resetUrl,
      "",
      "If you did not request this email, you can ignore it."
    ].join("\n"),
    html: `${paragraph(`Hello ${input.displayName},`)}
${paragraph(`Use this link to reset your ${input.siteName} password:`)}
${paragraph(link(input.resetUrl, "Reset password"))}
${paragraph("If you did not request this email, you can ignore it.")}`
  };
}

export function pageChangeEmail(input: PageChangeTemplateInput): Omit<WikiEmail, "kind" | "to"> {
  const actor = input.actorName || "Anonymous";
  const summary = input.summary || "(no edit summary)";

  return {
    subject: `${input.siteName}: ${input.pageId} changed`,
    text: [
      `${input.pageId} was updated on ${input.siteName}.`,
      "",
      `Change: ${input.changeType}`,
      `Editor: ${actor}`,
      `Summary: ${summary}`,
      `Page: ${input.pageUrl}`
    ].join("\n"),
    html: `${paragraph(`${code(input.pageId)} was updated on ${escapeHtml(input.siteName)}.`)}
${definitionList([
  ["Change", input.changeType],
  ["Editor", actor],
  ["Summary", summary]
])}
${paragraph(link(input.pageUrl, "View page"))}`
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
    subject: `${input.siteName}: page change digest`,
    text: [
      `Hello ${input.displayName},`,
      "",
      `Recent page changes on ${input.siteName}:`,
      "",
      ...lines,
      "",
      `Site: ${input.baseUrl}`
    ].join("\n"),
    html: `${paragraph(`Hello ${input.displayName},`)}
${paragraph(`Recent page changes on ${input.siteName}:`)}
<ul>${items}</ul>
${paragraph(link(input.baseUrl, input.baseUrl))}`
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

function logEmailDelivery(email: WikiEmail, result: EmailSendResult): void {
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
