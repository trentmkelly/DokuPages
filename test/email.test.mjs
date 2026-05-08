/* global Headers, Response */

import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  digestEmail,
  emailConfig,
  generatedPasswordEmail,
  pageChangeEmail,
  passwordResetEmail,
  registrationNotificationEmail,
  sendWikiEmail
} from "../src/email";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
let db;

describe("email adapter", () => {
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("keeps outbound mail disabled until provider secrets and sender are configured", async () => {
    const env = createEnv();

    expect(emailConfig(env)).toMatchObject({
      enabled: false,
      provider: "resend",
      registrationNotify: []
    });

    const result = await sendWikiEmail(env, sampleEmail(), async () => {
      throw new Error("fetch should not run");
    });

    expect(result).toMatchObject({
      ok: false,
      status: "skipped",
      error: "Outbound email is not configured."
    });
    expect(deliveries()).toEqual([
      expect.objectContaining({
        kind: "password_reset",
        recipient: "alice@example.test",
        status: "skipped",
        provider: "resend",
        error_message: "Outbound email is not configured."
      })
    ]);
  });

  it("sends through the Resend HTTP API and records delivery metadata", async () => {
    const env = createEnv({
      EMAIL_FROM: "Wiki <wiki@example.test>",
      EMAIL_REPLY_TO: "support@example.test",
      EMAIL_RETURN_PATH: "bounces@example.test",
      EMAIL_PROVIDER_ENDPOINT: "https://email.example.test/emails",
      RESEND_API_KEY: "resend-token"
    });
    let requestUrl = "";
    let requestInit;

    const result = await sendWikiEmail(env, sampleEmail(), async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    expect(result).toMatchObject({
      ok: true,
      status: "sent",
      providerMessageId: "email_123"
    });
    expect(requestUrl).toBe("https://email.example.test/emails");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer resend-token");
    expect(new Headers(requestInit?.headers).get("idempotency-key")).toBe("reset:user-1");
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      from: "Wiki <wiki@example.test>",
      to: ["alice@example.test"],
      subject: "Reset password",
      reply_to: "support@example.test",
      headers: { "Return-Path": "bounces@example.test" }
    });
    expect(deliveries()).toEqual([
      expect.objectContaining({
        status: "sent",
        provider_message_id: "email_123",
        error_message: null
      })
    ]);
  });

  it("records provider failures without throwing", async () => {
    const env = createEnv({
      EMAIL_FROM: "wiki@example.test",
      RESEND_API_KEY: "resend-token"
    });

    const result = await sendWikiEmail(env, sampleEmail(), async () => {
      return new Response(JSON.stringify({ message: "domain is not verified" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "HTTP 422: domain is not verified"
    });
    expect(deliveries()).toEqual([
      expect.objectContaining({
        status: "failed",
        error_message: "HTTP 422: domain is not verified"
      })
    ]);
  });
});

describe("email templates", () => {
  it("renders registration notification content without trusting user input", () => {
    const message = registrationNotificationEmail({
      siteName: "Test Wiki",
      baseUrl: "https://wiki.example.test",
      username: "alice<script>",
      displayName: "Alice <Admin>",
      email: "alice@example.test"
    });

    expect(message.subject).toBe("Test Wiki: new user registration");
    expect(message.text).toContain("Username: alice<script>");
    expect(message.html).toContain("alice&lt;script&gt;");
    expect(message.html).toContain("Alice &lt;Admin&gt;");
    expect(message.html).not.toContain("Alice <Admin>");
  });

  it("renders password reset, page change, and digest messages", () => {
    const reset = passwordResetEmail({
      siteName: "Test Wiki",
      resetUrl: "https://wiki.example.test/password-reset?token=abc",
      displayName: "Alice"
    });
    const change = pageChangeEmail({
      siteName: "Test Wiki",
      pageId: "wiki:start",
      pageUrl: "https://wiki.example.test/wiki/wiki/start",
      actorName: null,
      changeType: "edit",
      summary: ""
    });
    const digest = digestEmail({
      siteName: "Test Wiki",
      baseUrl: "https://wiki.example.test",
      displayName: "Alice",
      events: [
        {
          pageId: "wiki:start",
          pageUrl: "https://wiki.example.test/wiki/wiki/start",
          actorName: "Bob",
          changeType: "edit",
          summary: "updated",
          createdAt: "2026-05-08T00:00:00.000Z"
        }
      ]
    });

    expect(reset.subject).toBe("Test Wiki: password reset");
    expect(reset.text).toContain("reset your Test Wiki password");
    expect(reset.html).toContain("Reset password");
    expect(change.subject).toBe("Test Wiki: wiki:start changed");
    expect(change.text).toContain("Editor: Anonymous");
    expect(change.html).toContain("<code>wiki:start</code>");
    expect(digest.subject).toBe("Test Wiki: page change digest");
    expect(digest.text).toContain("- wiki:start (edit) by Bob");
    expect(digest.html).toContain("updated");
  });

  it("renders DokuWiki generated password emails", () => {
    const message = generatedPasswordEmail({
      siteName: "Test Wiki",
      baseUrl: "https://wiki.example.test",
      username: "alice<script>",
      displayName: "Alice <Admin>",
      password: "cefsezdug:42"
    });

    expect(message.subject).toBe("Your DokuWiki password");
    expect(message.text).toContain("Login    : alice<script>");
    expect(message.text).toContain("Password : cefsezdug:42");
    expect(message.html).toContain("Alice &lt;Admin&gt;");
    expect(message.html).toContain("cefsezdug:42");
    expect(message.html).not.toContain("alice<script>");
  });
});

function createEnv(overrides = {}) {
  db = new DatabaseSync(":memory:");
  db.exec(migrationSql);

  return {
    DB: new SqliteD1(db),
    RENDER_CACHE: {},
    ...overrides
  };
}

function sampleEmail() {
  return {
    kind: "password_reset",
    to: ["alice@example.test"],
    subject: "Reset password",
    text: "Reset password",
    html: "<p>Reset password</p>",
    idempotencyKey: "reset:user-1"
  };
}

function deliveries() {
  return (
    db
      ?.prepare(
        `select kind, recipient, subject, status, provider, provider_message_id, error_message
         from email_deliveries
         order by created_at asc`
      )
      .all() ?? []
  );
}

class SqliteD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.database, sql);
  }
}

class SqliteD1PreparedStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    this.database.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}
