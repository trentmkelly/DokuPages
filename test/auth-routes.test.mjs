/* global FormData, Request, Response */

import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/app.ts";
import { hashPassword } from "../src/auth/password.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
const TEST_CSRF_TOKEN = "test-csrf-token";

describe("auth routes", () => {
  let db;
  let env;

  afterEach(() => {
    db?.close();
    db = undefined;
    env = undefined;
    vi.unstubAllGlobals();
  });

  it("renders the login form", async () => {
    env = createEnv();

    const response = await handleRequest(new Request("https://example.com/login"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").toContain("DW_CSRF_TOKEN=");
    const html = await response.text();
    expect(html).toContain('id="dw__login"');
    expect(html).toContain('name="sectok"');
  });

  it("renders, deduplicates, and clears stacked DokuWiki flash messages", async () => {
    env = createEnv();

    const response = await handleRequest(
      new Request("https://example.com/login", {
        headers: {
          cookie: flashCookie([
            { type: "error", text: "Repeated message" },
            { type: "error", text: "Repeated message" },
            { type: "notify", text: "Review your email." }
          ])
        }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").toContain("DW_FLASH_MESSAGES=;");
    const html = await response.text();
    expect(html).toContain('<div class="error">Repeated message</div>');
    expect(html).toContain('<div class="notify">Review your email.</div>');
    expect(html.match(/Repeated message/g)).toHaveLength(1);
  });

  it("renders DokuWiki-style page action login links with CSRF", async () => {
    env = createEnv();

    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=login"),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").toContain("DW_CSRF_TOKEN=");
    const html = await response.text();
    expect(html).toContain('id="dw__login"');
    expect(html).toContain('name="returnTo" value="/wiki/wiki/welcome"');
    expect(html).toMatch(/name="sectok" value="[^"]+"/);
  });

  it("creates, rotates, and accepts DokuWiki-compatible authentication tokens", async () => {
    env = createEnv({
      DOKUWIKI_COOKIE_SALT: "test-dokuwiki-cookie-salt",
      API_BEARER_TOKEN: "deployment-api-token"
    });
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nBody."
    });
    const cookie = await loginAsAlice(env);
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_770_000_000_000);

    try {
      const profile = await handleRequest(
        new Request("https://example.com/profile", {
          headers: { cookie }
        }),
        env
      );
      const profileHtml = await profile.text();
      const token = extractProfileToken(profileHtml);

      expect(profile.status).toBe(200);
      expect(profileHtml).toContain('id="dw__profiletoken"');
      expect(token).toContain(".");

      const session = await handleRequest(
        new Request("https://example.com/api/auth/session", {
          headers: { authorization: `Bearer ${token}` }
        }),
        env
      );
      await expect(session.json()).resolves.toMatchObject({
        principal: {
          type: "user",
          username: "alice",
          displayName: "Alice Example"
        }
      });

      const apiRead = await handleRequest(
        new Request("https://example.com/api/v1/users/me", {
          headers: { "x-dokuwiki-token": token }
        }),
        env
      );
      await expect(apiRead.json()).resolves.toMatchObject({
        ok: true,
        principal: { username: "alice" }
      });

      const apiWrite = await handleRequest(
        new Request("https://example.com/api/v1/pages", {
          method: "POST",
          body: JSON.stringify({
            id: "wiki:welcome",
            content: "====== Welcome ======\n\nToken edit.",
            baseRevisionId: "wiki:welcome@2026-05-07T00:00:00.000Z"
          }),
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
          }
        }),
        env
      );
      expect(apiWrite.status).toBe(200);

      clock.mockReturnValue(1_770_000_001_000);
      const rotated = await handleRequest(
        new Request("https://example.com/profile?do=authtoken", {
          method: "POST",
          headers: csrfHeaders({ cookie })
        }),
        env
      );

      expect(rotated.status).toBe(303);
      expect(rotated.headers.get("location")).toBe("/profile");
      const flashSetCookie = rotated.headers.get("set-cookie") ?? "";
      expect(flashSetCookie).toContain("DW_FLASH_MESSAGES=");

      const updatedProfile = await handleRequest(
        new Request("https://example.com/profile", {
          headers: { cookie: cookieHeader(cookie, flashSetCookie) }
        }),
        env
      );
      const updatedProfileHtml = await updatedProfile.text();
      expect(updatedProfile.headers.get("set-cookie") ?? "").toContain("DW_FLASH_MESSAGES=;");
      expect(updatedProfileHtml).toContain(
        '<div class="success">Authentication token regenerated.</div>'
      );
      const newToken = extractProfileToken(updatedProfileHtml);
      expect(newToken).not.toBe(token);

      const oldTokenSession = await handleRequest(
        new Request("https://example.com/api/auth/session", {
          headers: { authorization: `Bearer ${token}` }
        }),
        env
      );
      await expect(oldTokenSession.json()).resolves.toMatchObject({
        principal: { type: "anonymous", isAuthenticated: false }
      });

      const newTokenSession = await handleRequest(
        new Request("https://example.com/api/auth/session", {
          headers: { authorization: `Bearer ${newToken}` }
        }),
        env
      );
      await expect(newTokenSession.json()).resolves.toMatchObject({
        principal: { type: "user", username: "alice" }
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("renders registration and password reset forms", async () => {
    env = createEnv();

    const register = await handleRequest(new Request("https://example.com/register"), env);
    const pageRegister = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=register"),
      env
    );
    const reset = await handleRequest(new Request("https://example.com/resendpwd"), env);
    const resetAlias = await handleRequest(new Request("https://example.com/password-reset"), env);
    const legacyRegister = await handleRequest(
      new Request("https://example.com/doku.php?do=register"),
      env
    );
    const legacyReset = await handleRequest(
      new Request("https://example.com/doku.php?do=resendpwd"),
      env
    );

    expect(register.status).toBe(200);
    expect(register.headers.get("set-cookie") ?? "").toContain("DW_CSRF_TOKEN=");
    await expect(register.text()).resolves.toContain('id="dw__register"');
    expect(pageRegister.status).toBe(200);
    await expect(pageRegister.text()).resolves.toContain('id="dw__register"');
    expect(reset.status).toBe(200);
    await expect(reset.text()).resolves.toContain('id="dw__resendpwd"');
    expect(resetAlias.status).toBe(200);
    await expect(resetAlias.text()).resolves.toContain('id="dw__resendpwd"');
    expect(legacyRegister.status).toBe(301);
    expect(legacyRegister.headers.get("location")).toBe("/register");
    expect(legacyReset.status).toBe(301);
    expect(legacyReset.headers.get("location")).toBe("/resendpwd");
  });

  it("renders upstream auth language text for configured locales", async () => {
    env = createEnv({ WIKI_LANG: "de" });

    const login = await handleRequest(new Request("https://example.com/login"), env);
    const register = await handleRequest(new Request("https://example.com/register"), env);
    const resend = await handleRequest(new Request("https://example.com/resendpwd"), env);
    const reset = await handleRequest(
      new Request("https://example.com/password-reset?token=reset-token"),
      env
    );
    const denied = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=denied"),
      env
    );
    const locked = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=locked"),
      env
    );

    await expect(login.text()).resolves.toContain('<h1 id="anmelden">Anmelden</h1>');
    await expect(register.text()).resolves.toContain(
      '<h1 id="als-neuer-benutzer-registrieren">Als neuer Benutzer registrieren</h1>'
    );
    await expect(resend.text()).resolves.toContain(
      '<h1 id="neues-passwort-anfordern">Neues Passwort anfordern</h1>'
    );
    await expect(reset.text()).resolves.toContain("Bitte geben Sie ein neues Passwort");
    await expect(denied.text()).resolves.toContain(
      '<h1 id="zugang-verweigert">Zugang verweigert</h1>'
    );
    await expect(locked.text()).resolves.toContain('<h1 id="seite-gesperrt">Seite gesperrt</h1>');
  });

  it("gates login and registration with Turnstile when configured", async () => {
    env = createEnv({
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"
    });
    await seedUser(env.DB);
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true, "error-codes": [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const loginPage = await handleRequest(new Request("https://example.com/login"), env);
    const loginHtml = await loginPage.text();

    expect(loginHtml).toContain('class="auth-form"');
    expect(loginHtml).toContain('class="cf-turnstile"');
    expect(loginHtml).toContain("https://challenges.cloudflare.com/turnstile/v0/api.js");
    expect(loginPage.headers.get("content-security-policy")).toContain(
      "https://challenges.cloudflare.com"
    );

    const missingLoginToken = new FormData();
    missingLoginToken.set("username", "alice");
    missingLoginToken.set("password", "correct horse battery staple");

    const rejectedLogin = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: missingLoginToken,
        headers: csrfHeaders()
      }),
      env
    );

    expect(rejectedLogin.status).toBe(400);
    await expect(rejectedLogin.text()).resolves.toContain("Human verification failed");
    expect(fetchMock).not.toHaveBeenCalled();

    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");
    login.set("cf-turnstile-response", "XXXX.DUMMY.TOKEN.XXXX");

    const acceptedLogin = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login,
        headers: csrfHeaders()
      }),
      env
    );

    expect(acceptedLogin.status).toBe(303);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const register = new FormData();
    register.set("username", "turnstileuser");
    register.set("displayName", "Turnstile User");
    register.set("email", "turnstile@example.test");
    register.set("password", "new correct battery staple");
    register.set("passwordConfirm", "new correct battery staple");
    register.set("cf-turnstile-response", "XXXX.DUMMY.TOKEN.XXXX");

    const acceptedRegister = await handleRequest(
      new Request("https://example.com/api/auth/register", {
        method: "POST",
        body: register,
        headers: csrfHeaders()
      }),
      env
    );

    expect(acceptedRegister.status).toBe(303);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("registers native users and sends registration notifications when configured", async () => {
    env = createEnv({
      EMAIL_FROM: "Wiki <wiki@example.test>",
      EMAIL_REGISTRATION_NOTIFY: "admin@example.test",
      RESEND_API_KEY: "resend-token"
    });
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "email_registration" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("username", "newuser");
    form.set("displayName", "New User");
    form.set("email", "newuser@example.test");
    form.set("password", "new correct battery staple");
    form.set("passwordConfirm", "new correct battery staple");

    const response = await handleRequest(
      new Request("https://example.com/api/auth/register", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie") ?? "").toContain("DW_PAGES_SESSION=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const emailRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(emailRequest).toMatchObject({
      from: "Wiki <wiki@example.test>",
      to: ["admin@example.test"],
      subject: "Test Wiki: new user registration"
    });
    expect(emailRequest.html).toContain("newuser@example.test");
    await expect(
      env.DB.prepare("select username, display_name, email from users where username = ?")
        .bind("newuser")
        .first()
    ).resolves.toMatchObject({
      username: "newuser",
      display_name: "New User",
      email: "newuser@example.test"
    });
    await expect(
      env.DB.prepare("select status, provider_message_id from email_deliveries").bind().all()
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({ status: "sent", provider_message_id: "email_registration" })
      ]
    });
  });

  it("supports DokuWiki autopasswd registration with generated password email", async () => {
    env = createEnv({
      AUTOPASSWD: "1",
      EMAIL_FROM: "Wiki <wiki@example.test>",
      EMAIL_PROVIDER_ENDPOINT: "https://email.example.test/emails",
      RESEND_API_KEY: "resend-token"
    });
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "email_password" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const registerPage = await handleRequest(new Request("https://example.com/register"), env);
    const registerHtml = await registerPage.text();
    expect(registerHtml).toContain("if you are not asked to enter a password here");
    expect(registerHtml).not.toContain('id="register__pass"');

    const form = new FormData();
    form.set("username", "autouser");
    form.set("displayName", "Auto User");
    form.set("email", "autouser@example.test");

    const response = await handleRequest(
      new Request("https://example.com/api/auth/register", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    const flashSetCookie = response.headers.get("set-cookie") ?? "";
    expect(flashSetCookie).toContain("DW_FLASH_MESSAGES=");
    expect(flashSetCookie).not.toContain("DW_PAGES_SESSION=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const emailRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(emailRequest).toMatchObject({
      from: "Wiki <wiki@example.test>",
      to: ["autouser@example.test"],
      subject: "Your DokuWiki password"
    });
    expect(emailRequest.text).toContain("Login    : autouser");
    const generatedPassword = emailRequest.text.match(/Password : (\S+)/)?.[1];
    expect(generatedPassword).toMatch(
      /^[bcdfghjklmnprstvwz][aeiou][bcdfghjklmnprstvwzaeiou]{7}[!$%&?+*~#_:.;,-][1-9][0-9]$/
    );

    const loginPage = await handleRequest(
      new Request("https://example.com/login", {
        headers: { cookie: cookieHeader(flashSetCookie) }
      }),
      env
    );
    const loginHtml = await loginPage.text();
    expect(loginPage.headers.get("set-cookie") ?? "").toContain("DW_FLASH_MESSAGES=;");
    expect(loginHtml).toContain(
      '<div class="success">The user has been created and the password was sent by email.</div>'
    );

    const login = await postLogin(env, "autouser", generatedPassword);
    expect(login.status).toBe(303);
    await expect(
      env.DB.prepare("select kind, recipient, status, provider_message_id from email_deliveries")
        .bind()
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          kind: "generated_password",
          recipient: "autouser@example.test",
          status: "sent",
          provider_message_id: "email_password"
        }
      ]
    });
  });

  it("sends password reset emails and accepts valid reset tokens", async () => {
    env = createEnv({
      EMAIL_FROM: "Wiki <wiki@example.test>",
      RESEND_API_KEY: "resend-token"
    });
    await seedUser(env.DB);
    let resetToken = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const emailRequest = JSON.parse(String(init.body));
        const resetUrl = emailRequest.text.match(
          /https:\/\/example\.com\/password-reset\?token=\S+/
        )?.[0];
        resetToken = new URL(resetUrl).searchParams.get("token");
        return new Response(JSON.stringify({ id: "email_reset" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      })
    );
    const requestForm = new FormData();
    requestForm.set("identifier", "alice");

    const requested = await handleRequest(
      new Request("https://example.com/api/auth/password-reset/request", {
        method: "POST",
        body: requestForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(requested.status).toBe(200);
    await expect(requested.text()).resolves.toContain(
      "A confirmation link has been sent by email."
    );
    expect(resetToken).toBeTruthy();
    await expect(
      env.DB.prepare("select status, provider_message_id from email_deliveries").bind().all()
    ).resolves.toMatchObject({
      results: [expect.objectContaining({ status: "sent", provider_message_id: "email_reset" })]
    });

    const confirmForm = new FormData();
    confirmForm.set("token", resetToken);
    confirmForm.set("password", "new correct battery staple");
    confirmForm.set("passwordConfirm", "new correct battery staple");
    const confirmed = await handleRequest(
      new Request("https://example.com/api/auth/password-reset/confirm", {
        method: "POST",
        body: confirmForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(confirmed.status).toBe(200);
    await expect(confirmed.text()).resolves.toContain("Your new password has been sent by email.");
    const oldLogin = await postLogin(env, "alice", "correct horse battery staple");
    const newLogin = await postLogin(env, "alice", "new correct battery staple");
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(303);
  });

  it("allows subscriptions and sends immediate page change notifications", async () => {
    env = createEnv({
      EMAIL_FROM: "Wiki <wiki@example.test>",
      RESEND_API_KEY: "resend-token"
    });
    await seedUser(env.DB);
    await seedAuthUser(env.DB, {
      userId: "user-2",
      username: "bob",
      password: "bob password",
      displayName: "Bob Example",
      email: "bob@example.test",
      groups: ["user"]
    });
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nInitial."
    });
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "email_page_change" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const aliceCookie = await loginAsAlice(env);
    const subscription = new FormData();
    subscription.set("subjectType", "page");
    subscription.set("subjectId", "wiki:welcome");
    subscription.set("digestInterval", "immediate");
    subscription.set("returnTo", "/wiki/wiki/welcome?do=subscribe");

    const subscribed = await handleRequest(
      new Request("https://example.com/api/subscriptions", {
        method: "POST",
        body: subscription,
        headers: csrfHeaders({ cookie: aliceCookie })
      }),
      env
    );

    expect(subscribed.status).toBe(303);
    expect(subscribed.headers.get("location")).toBe("/wiki/wiki/welcome?do=subscribe");

    const bobCookie = await loginAs(env, "bob", "bob password");
    const edit = new FormData();
    edit.set("id", "wiki:welcome");
    edit.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    edit.set("content", "====== Welcome ======\n\nChanged.");
    edit.set("summary", "Updated page");
    const saved = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: edit,
        headers: csrfHeaders({ cookie: bobCookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const emailRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(emailRequest).toMatchObject({
      to: ["alice@example.test"],
      subject: "Test Wiki: wiki:welcome changed"
    });
    expect(emailRequest.text).toContain("Summary: Updated page");
    await expect(
      env.DB.prepare("select subject_id, change_type, summary from email_notification_events")
        .bind()
        .all()
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          subject_id: "wiki:welcome",
          change_type: "edit",
          summary: "Updated page"
        })
      ]
    });
    await expect(
      env.DB.prepare("select subscription_id, event_id from email_digest_deliveries").bind().all()
    ).resolves.toMatchObject({ results: [expect.objectContaining({})] });

    subscription.set("subscriptionAction", "unsubscribe");
    const unsubscribed = await handleRequest(
      new Request("https://example.com/api/subscriptions", {
        method: "POST",
        body: subscription,
        headers: csrfHeaders({ cookie: aliceCookie })
      }),
      env
    );

    expect(unsubscribed.status).toBe(303);
    await expect(
      env.DB.prepare("select id from subscriptions where user_id = ?").bind("user-1").all()
    ).resolves.toEqual({ results: [] });
    await expect(
      env.DB.prepare("select subscription_id from email_digest_deliveries").bind().all()
    ).resolves.toEqual({ results: [] });
  });

  it("sends scheduled digest emails for deferred subscription events", async () => {
    env = createEnv({
      EMAIL_FROM: "Wiki <wiki@example.test>",
      RESEND_API_KEY: "resend-token",
      EMAIL_TASK_TOKEN: "task-token"
    });
    await seedUser(env.DB);
    await seedAuthUser(env.DB, {
      userId: "user-2",
      username: "bob",
      password: "bob password",
      displayName: "Bob Example",
      email: "bob@example.test",
      groups: ["user"]
    });
    await seedAuthUser(env.DB, {
      userId: "user-3",
      username: "cara",
      password: "cara password",
      displayName: "Cara Example",
      email: "cara@example.test",
      groups: ["user"]
    });
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nInitial."
    });
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "email_digest" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const aliceCookie = await loginAsAlice(env);
    const subscription = new FormData();
    subscription.set("subjectType", "namespace");
    subscription.set("subjectId", "wiki");
    subscription.set("digestInterval", "daily");
    subscription.set("returnTo", "/wiki/wiki/welcome?do=subscribe");
    await handleRequest(
      new Request("https://example.com/api/subscriptions", {
        method: "POST",
        body: subscription,
        headers: csrfHeaders({ cookie: aliceCookie })
      }),
      env
    );
    const caraCookie = await loginAs(env, "cara", "cara password");
    const weeklySubscription = new FormData();
    weeklySubscription.set("subjectType", "namespace");
    weeklySubscription.set("subjectId", "wiki");
    weeklySubscription.set("digestInterval", "weekly");
    weeklySubscription.set("returnTo", "/wiki/wiki/welcome?do=subscribe");
    await handleRequest(
      new Request("https://example.com/api/subscriptions", {
        method: "POST",
        body: weeklySubscription,
        headers: csrfHeaders({ cookie: caraCookie })
      }),
      env
    );

    const bobCookie = await loginAs(env, "bob", "bob password");
    const edit = new FormData();
    edit.set("id", "wiki:welcome");
    edit.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    edit.set("content", "====== Welcome ======\n\nDigest change.");
    edit.set("summary", "Digest update");
    await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: edit,
        headers: csrfHeaders({ cookie: bobCookie })
      }),
      env
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const digest = await handleRequest(
      new Request("https://example.com/api/tasks/email-digests", {
        method: "POST",
        headers: { authorization: "Bearer task-token" }
      }),
      env
    );

    expect(digest.status).toBe(200);
    await expect(digest.json()).resolves.toMatchObject({
      ok: true,
      interval: "daily",
      subscriptionsChecked: 1,
      digestsSent: 1,
      eventsDelivered: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const emailRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(emailRequest).toMatchObject({
      to: ["alice@example.test"],
      subject: "Test Wiki: page change digest"
    });
    expect(emailRequest.text).toContain("wiki:welcome");

    const secondDigest = await handleRequest(
      new Request("https://example.com/api/tasks/email-digests", {
        method: "POST",
        headers: { authorization: "Bearer task-token" }
      }),
      env
    );
    await expect(secondDigest.json()).resolves.toMatchObject({
      digestsSent: 0,
      eventsDelivered: 0
    });

    const weeklyDigest = await handleRequest(
      new Request("https://example.com/api/tasks/email-digests?interval=weekly", {
        method: "POST",
        headers: { authorization: "Bearer task-token" }
      }),
      env
    );
    await expect(weeklyDigest.json()).resolves.toMatchObject({
      ok: true,
      interval: "weekly",
      subscriptionsChecked: 1,
      digestsSent: 1,
      eventsDelivered: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const weeklyEmailRequest = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(weeklyEmailRequest).toMatchObject({
      to: ["cara@example.test"],
      subject: "Test Wiki: page change digest"
    });
  });

  it("allows authenticated users to update their profile and password", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);

    const anonymous = await handleRequest(new Request("https://example.com/profile"), env);
    const legacy = await handleRequest(new Request("https://example.com/doku.php?do=profile"), env);
    const profile = await handleRequest(
      new Request("https://example.com/profile", {
        headers: { cookie }
      }),
      env
    );

    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toBe("/login?returnTo=%2Fprofile");
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("/profile");
    expect(profile.status).toBe(200);
    const html = await profile.text();
    expect(html).toContain('id="dw__profile"');
    expect(html).toContain('name="oldpass"');
    expect(html).toContain('id="dw__profiledelete"');
    expect(html).toContain("Alice Example");
    expect(html).toContain('id="dokuwiki__usertools"');
    expect(html).toContain(
      '<li class="action profile"><a href="/profile" rel="nofollow">Update Profile</a></li>'
    );
    expect(html).toContain(
      '<li class="action logout"><a href="/logout" rel="nofollow">Log Out</a></li>'
    );
    expect(html).not.toContain('<a href="/login" rel="nofollow">Log In</a>');

    const invalid = new FormData();
    invalid.set("displayName", "Alice Updated");
    invalid.set("email", "alice.updated@example.test");
    invalid.set("currentPassword", "wrong password");
    invalid.set("newPassword", "new correct battery staple");
    invalid.set("newPasswordConfirm", "new correct battery staple");

    const rejected = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: invalid,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(rejected.status).toBe(400);
    await expect(rejected.text()).resolves.toContain("Sorry, the password was wrong");

    const form = new FormData();
    form.set("displayName", "Alice Updated");
    form.set("email", "alice.updated@example.test");
    form.set("currentPassword", "correct horse battery staple");
    form.set("newPassword", "new correct battery staple");
    form.set("newPasswordConfirm", "new correct battery staple");

    const saved = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/profile");
    const profileFlashSetCookie = saved.headers.get("set-cookie") ?? "";
    expect(profileFlashSetCookie).toContain("DW_FLASH_MESSAGES=");
    await expect(
      env.DB.prepare(
        `select display_name, email
         from users
         where id = ?`
      )
        .bind("user-1")
        .first()
    ).resolves.toMatchObject({
      display_name: "Alice Updated",
      email: "alice.updated@example.test"
    });
    const profileAfterSave = await handleRequest(
      new Request("https://example.com/profile", {
        headers: { cookie: cookieHeader(cookie, profileFlashSetCookie) }
      }),
      env
    );
    await expect(profileAfterSave.text()).resolves.toContain(
      '<div class="success">User profile successfully updated.</div>'
    );

    const oldLogin = await postLogin(env, "alice", "correct horse battery staple");
    expect(oldLogin.status).toBe(401);
    const newLogin = await postLogin(env, "alice", "new correct battery staple");
    expect(newLogin.status).toBe(303);

    const updatedSession = await handleRequest(
      new Request("https://example.com/api/auth/session", {
        headers: { cookie }
      }),
      env
    );
    await expect(updatedSession.json()).resolves.toMatchObject({
      principal: {
        username: "alice",
        displayName: "Alice Updated"
      }
    });
  });

  it("matches DokuWiki profileconfirm for profile updates", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);

    const withoutPassword = new FormData();
    withoutPassword.set("fullname", "Alice Renamed");
    withoutPassword.set("email", "alice@example.test");

    const rejected = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: withoutPassword,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(rejected.status).toBe(400);
    await expect(rejected.text()).resolves.toContain("Sorry, the password was wrong");

    withoutPassword.set("oldpass", "correct horse battery staple");
    const saved = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: withoutPassword,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    await expect(
      env.DB.prepare("select display_name from users where id = ?").bind("user-1").first()
    ).resolves.toMatchObject({ display_name: "Alice Renamed" });

    const noChange = new FormData();
    noChange.set("fullname", "Alice Renamed");
    noChange.set("email", "alice@example.test");
    noChange.set("oldpass", "correct horse battery staple");
    const noChangeResponse = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: noChange,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(noChangeResponse.status).toBe(400);
    await expect(noChangeResponse.text()).resolves.toContain("No changes, nothing to do.");

    db.close();
    env = createEnv({ PROFILECONFIRM: "0" });
    await seedUser(env.DB);
    const relaxedCookie = await loginAsAlice(env);
    const relaxedForm = new FormData();
    relaxedForm.set("fullname", "Alice Without Confirm");
    relaxedForm.set("email", "alice@example.test");

    const relaxed = await handleRequest(
      new Request("https://example.com/api/auth/profile", {
        method: "POST",
        body: relaxedForm,
        headers: csrfHeaders({ cookie: relaxedCookie })
      }),
      env
    );

    expect(relaxed.status).toBe(303);
    await expect(
      env.DB.prepare("select display_name from users where id = ?").bind("user-1").first()
    ).resolves.toMatchObject({ display_name: "Alice Without Confirm" });
  });

  it("deletes authenticated profiles through the DokuWiki confirmation flow", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);
    await seedProfileDeleteDependents(env.DB);

    const missingConfirm = new FormData();
    missingConfirm.set("delete", "1");
    missingConfirm.set("oldpass", "correct horse battery staple");
    const missingConfirmResponse = await handleRequest(
      new Request("https://example.com/api/auth/profile/delete", {
        method: "POST",
        body: missingConfirm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(missingConfirmResponse.status).toBe(400);
    await expect(missingConfirmResponse.text()).resolves.toContain(
      "Confirmation check box not ticked"
    );

    const wrongPassword = new FormData();
    wrongPassword.set("delete", "1");
    wrongPassword.set("confirm_delete", "1");
    wrongPassword.set("oldpass", "wrong password");
    const wrongPasswordResponse = await handleRequest(
      new Request("https://example.com/api/auth/profile/delete", {
        method: "POST",
        body: wrongPassword,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(wrongPasswordResponse.status).toBe(400);
    await expect(wrongPasswordResponse.text()).resolves.toContain("Sorry, the password was wrong");

    const form = new FormData();
    form.set("delete", "1");
    form.set("confirm_delete", "1");
    form.set("oldpass", "correct horse battery staple");

    const deleted = await handleRequest(
      new Request("https://example.com/doku.php?do=profile_delete&id=wiki:welcome", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    await expect(deleted.text()).resolves.toContain(
      '<div class="success">Your user account has been deleted from this wiki</div>'
    );

    for (const table of [
      "users",
      "sessions",
      "user_groups",
      "subscriptions",
      "password_reset_tokens",
      "drafts"
    ]) {
      await expect(
        env.DB.prepare(
          `select count(*) as count from ${table} where ${profileDeleteUserWhere(table)}`
        )
          .bind("user-1")
          .first()
      ).resolves.toMatchObject({ count: 0 });
    }

    await expect(
      env.DB.prepare("select count(*) as count from email_digest_deliveries").first()
    ).resolves.toMatchObject({ count: 0 });
  });

  it("logs in native users, resolves the session principal, and logs out", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");
    login.set("returnTo", "/wiki/wiki/welcome");

    try {
      const loginResponse = await handleRequest(
        new Request("https://example.com/api/auth/login", {
          method: "POST",
          body: login,
          headers: csrfHeaders()
        }),
        env
      );
      const cookie = loginResponse.headers.get("set-cookie") ?? "";

      expect(loginResponse.status).toBe(303);
      expect(loginResponse.headers.get("location")).toBe("/wiki/wiki/welcome");
      expect(cookie).toContain("DW_PAGES_SESSION=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");

      const sessionResponse = await handleRequest(
        new Request("https://example.com/api/auth/session", {
          headers: { cookie }
        }),
        env
      );

      await expect(sessionResponse.json()).resolves.toMatchObject({
        principal: {
          type: "user",
          isAuthenticated: true,
          username: "alice",
          displayName: "Alice Example",
          groups: ["admin", "user"],
          aclSubjects: ["@ALL", "@admin", "@user", "alice"]
        }
      });

      const logout = new FormData();
      logout.set("returnTo", "/wiki/wiki/welcome");
      const logoutResponse = await handleRequest(
        new Request("https://example.com/api/auth/logout", {
          method: "POST",
          body: logout,
          headers: csrfHeaders({ cookie })
        }),
        env
      );

      expect(logoutResponse.status).toBe(303);
      expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");

      const anonymousResponse = await handleRequest(
        new Request("https://example.com/api/auth/session", {
          headers: { cookie }
        }),
        env
      );

      await expect(anonymousResponse.json()).resolves.toMatchObject({
        principal: {
          type: "anonymous",
          isAuthenticated: false
        }
      });
      expect(log.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
        expect.objectContaining({
          event: "auth_event",
          authEvent: "login_success",
          userId: "user-1",
          username: "alice"
        }),
        expect.objectContaining({
          event: "auth_event",
          authEvent: "logout",
          userId: "user-1",
          username: "alice"
        })
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("resolves synced external users from Cloudflare Access headers", async () => {
    env = createEnv({
      EXTERNAL_AUTH_MODE: "cloudflare_access",
      EXTERNAL_AUTH_EMAIL_HEADER: "CF-Access-Authenticated-User-Email"
    });
    await seedUser(env.DB, {
      userId: "user-kiwi",
      username: "kiwi",
      password: "unused native password",
      displayName: "Kiwi Example",
      email: "kiwi@example.test",
      groups: ["user", "ldap"]
    });

    const response = await handleRequest(
      new Request("https://example.com/api/auth/session", {
        headers: {
          "CF-Access-Authenticated-User-Email": "kiwi@example.test"
        }
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      principal: {
        type: "user",
        isAuthenticated: true,
        username: "kiwi",
        displayName: "Kiwi Example",
        groups: ["ldap", "user"],
        aclSubjects: ["@ALL", "@ldap", "@user", "kiwi"]
      }
    });
  });

  it("renders page editor identity with DokuWiki showuseras modes", async () => {
    env = createEnv({ SHOWUSERAS: "username_link" });
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nBody.",
      authorId: "user-1",
      authorName: "Alice Example"
    });
    await seedChangelog(env.DB, {
      id: "page:wiki:welcome@2026-05-07T00:00:00.000Z",
      subjectId: "wiki:welcome",
      revisionId: "wiki:welcome@2026-05-07T00:00:00.000Z",
      userId: "user-1",
      userName: "Alice Example"
    });

    const page = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
    const pageHtml = await page.text();

    expect(pageHtml).toContain(
      'Last modified: <time datetime="2026-05-07T00:00:00.000Z">2026-05-07T00:00:00.000Z</time> by <bdi><a href="/wiki/user/alice" class="interwiki iw_user">Alice Example</a></bdi>'
    );

    const revisions = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=revisions"),
      env
    );
    await expect(revisions.text()).resolves.toContain(
      '<span class="user"><bdi><a href="/wiki/user/alice" class="interwiki iw_user">Alice Example</a></bdi></span>'
    );

    const recent = await handleRequest(new Request("https://example.com/recent"), env);
    await expect(recent.text()).resolves.toContain(
      '<span class="user"><bdi><a href="/wiki/user/alice" class="interwiki iw_user">Alice Example</a></bdi></span>'
    );

    env = createEnv({ SHOWUSERAS: "email_link" });
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nBody.",
      authorId: "user-1",
      authorName: "Alice Example"
    });

    const emailPage = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome"),
      env
    );
    const emailHtml = await emailPage.text();

    expect(emailHtml).toContain(
      '<a href="mailto:&#x61;&#x6c;&#x69;&#x63;&#x65;&#x40;&#x65;&#x78;&#x61;&#x6d;&#x70;&#x6c;&#x65;&#x2e;&#x74;&#x65;&#x73;&#x74;" class="mail"'
    );
  });

  it("keeps the native session ttl when upstream remember-me fields are submitted", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");
    login.set("r", "1");
    login.set("remember", "1");
    login.set("rememberme", "1");

    const response = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login,
        headers: csrfHeaders()
      }),
      env
    );
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(cookie).toContain("DW_PAGES_SESSION=");
    expect(cookie).toContain("Max-Age=86400");
    expect(cookie).not.toContain("Max-Age=31536000");
    expect(cookie).not.toContain("correct horse battery staple");
  });

  it("revalidates session user state on every request instead of caching until auth_security_timeout", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);
    const now = "2026-05-07T00:01:00.000Z";
    await env.DB.batch([
      env.DB.prepare("delete from user_groups where user_id = ? and group_id = ?").bind(
        "user-1",
        "group:admin"
      ),
      env.DB.prepare("insert into groups (id, name, created_at) values (?, ?, ?)").bind(
        "group:editor",
        "editor",
        now
      ),
      env.DB.prepare(
        "insert into user_groups (user_id, group_id, created_at) values (?, ?, ?)"
      ).bind("user-1", "group:editor", now)
    ]);

    const response = await handleRequest(
      new Request("https://example.com/api/auth/session", {
        headers: { cookie }
      }),
      env
    );

    await expect(response.json()).resolves.toMatchObject({
      principal: {
        type: "user",
        username: "alice",
        groups: ["editor", "user"],
        aclSubjects: ["@ALL", "@editor", "@user", "alice"]
      }
    });
  });

  it("logs in imported DokuWiki authplain hashes and rehashes them natively", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await env.DB.prepare("update users set password_hash = ? where username = ?")
      .bind("$1$salt1234$U4DE1tCkda9p2NZpiBnLR0", "alice")
      .run();

    const loginResponse = await postLogin(env, "alice", "legacy password");
    const row = await env.DB.prepare("select password_hash from users where username = ?")
      .bind("alice")
      .first();

    expect(loginResponse.status).toBe(303);
    expect(row.password_hash).toMatch(/^pbkdf2-sha256\$100000\$/);
  });

  it("allows admin users to manage ACL rules", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nBody."
    });
    await seedPage(env.DB, {
      id: "docs:guide:start",
      title: "Guide Start",
      content: "====== Guide Start ======\n\nBody."
    });
    const cookie = await loginAsAlice(env);

    const denied = await handleRequest(new Request("https://example.com/admin/acl"), env);
    const legacy = await handleRequest(
      new Request("https://example.com/doku.php?do=admin&page=acl"),
      env
    );
    const page = await handleRequest(
      new Request("https://example.com/admin/acl", {
        headers: { cookie }
      }),
      env
    );

    expect(denied.status).toBe(403);
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("/admin/acl");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Access Control List Management");
    expect(html).toContain('id="acl_manager"');
    expect(html).toContain('id="acl__tree"');
    expect(html).toContain('id="acl__detail"');
    expect(html).toContain('id="acl__namespace_input"');
    expect(html).toContain("Browse namespace");
    expect(html).toContain('name="acl_t"');
    expect(html).toContain("/admin/acl?ns=wiki");
    expect(html).toContain("/admin/acl?id=wiki%3Awelcome");
    expect(html).toContain("/admin/acl?ns=docs");
    expect(html).toContain("/admin/acl?id=docs%3Aguide%3Astart");
    expect(html).toContain("Current ACL Rules");

    const rebuild = await handleRequest(
      new Request("https://example.com/api/admin/search/rebuild", {
        method: "POST",
        body: new FormData(),
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(rebuild.status).toBe(303);
    expect(rebuild.headers.get("location")).toBe("/admin?searchRebuild=ok");

    const form = new FormData();
    form.set("scope", "private:*");
    form.set("principalType", "group");
    form.set("principal", "admin");
    form.set("permission", "16");

    const saved = await handleRequest(
      new Request("https://example.com/api/admin/acl", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/admin/acl");
    await expect(env.DB.prepare("select * from acl_rules").bind().all()).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          scope: "private:*",
          principal_type: "group",
          principal: "@admin",
          permission: 16
        })
      ]
    });

    const rules = await env.DB.prepare("select id from acl_rules").bind().all();
    const remove = new FormData();
    remove.set("id", rules.results[0].id);

    const deleted = await handleRequest(
      new Request("https://example.com/api/admin/acl/delete", {
        method: "POST",
        body: remove,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(deleted.status).toBe(303);
    await expect(env.DB.prepare("select * from acl_rules").bind().all()).resolves.toEqual({
      results: []
    });

    const namespaceRule = new FormData();
    namespaceRule.set("scope", "private:*");
    namespaceRule.set("principalType", "group");
    namespaceRule.set("principal", "admin");
    namespaceRule.set("permission", "16");
    await handleRequest(
      new Request("https://example.com/api/admin/acl", {
        method: "POST",
        body: namespaceRule,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    const pageRule = new FormData();
    pageRule.set("scope", "docs:guide:start");
    pageRule.set("principalType", "user");
    pageRule.set("principal", "alice");
    pageRule.set("permission", "2");
    await handleRequest(
      new Request("https://example.com/api/admin/acl", {
        method: "POST",
        body: pageRule,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    const currentRulesPage = await handleRequest(
      new Request("https://example.com/admin/acl?ns=docs", {
        headers: { cookie }
      }),
      env
    );
    const currentRulesHtml = await currentRulesPage.text();
    const currentRules = await env.DB.prepare("select id, scope from acl_rules order by scope")
      .bind()
      .all();
    const docsRule = currentRules.results.find((rule) => rule.scope === "docs:guide:start");
    const privateRule = currentRules.results.find((rule) => rule.scope === "private:*");

    expect(docsRule).toBeTruthy();
    expect(privateRule).toBeTruthy();
    expect(currentRulesPage.status).toBe(200);
    expect(currentRulesHtml).toContain('action="/api/admin/acl/bulk"');
    expect(currentRulesHtml).toContain('id="acl__namespace_input"');
    expect(currentRulesHtml).toContain('value="docs"');
    expect(currentRulesHtml).toContain(`name="permission:${docsRule.id}"`);
    expect(currentRulesHtml).toContain(`name="permission:${privateRule.id}"`);

    const bulkUpdate = new FormData();
    bulkUpdate.set("run", "update");
    bulkUpdate.append("rule", privateRule.id);
    bulkUpdate.append("rule", docsRule.id);
    bulkUpdate.set(`permission:${privateRule.id}`, "1");
    bulkUpdate.set(`permission:${docsRule.id}`, "16");

    const bulkUpdated = await handleRequest(
      new Request("https://example.com/api/admin/acl/bulk", {
        method: "POST",
        body: bulkUpdate,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(bulkUpdated.status).toBe(303);
    expect(bulkUpdated.headers.get("location")).toBe("/admin/acl?bulkUpdated=2");
    await expect(
      env.DB.prepare("select scope, permission from acl_rules order by scope").bind().all()
    ).resolves.toEqual({
      results: [
        { scope: "docs:guide:start", permission: 2 },
        { scope: "private:*", permission: 1 }
      ]
    });

    const bulkDelete = new FormData();
    bulkDelete.set("run", "delete");
    bulkDelete.append("delete", privateRule.id);
    bulkDelete.append("delete", docsRule.id);

    const bulkDeleted = await handleRequest(
      new Request("https://example.com/api/admin/acl/bulk", {
        method: "POST",
        body: bulkDelete,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(bulkDeleted.status).toBe(303);
    expect(bulkDeleted.headers.get("location")).toBe("/admin/acl?bulkDeleted=2");
    await expect(env.DB.prepare("select * from acl_rules").bind().all()).resolves.toEqual({
      results: []
    });
    await expect(
      env.DB.prepare(
        "select action, target_type, target_id, details_json from audit_log order by action"
      )
        .bind()
        .all()
    ).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          action: "acl_rule_delete",
          target_type: "acl_rule"
        }),
        expect.objectContaining({
          action: "acl_rule_upsert",
          target_type: "acl_rule",
          target_id: expect.stringContaining("private")
        }),
        expect.objectContaining({
          action: "acl_rules_bulk_delete",
          target_type: "acl_rule"
        }),
        expect.objectContaining({
          action: "acl_rules_bulk_update",
          target_type: "acl_rule"
        }),
        expect.objectContaining({
          action: "search_index_rebuild",
          target_type: "search_index"
        })
      ])
    });

    const auditPage = await handleRequest(
      new Request("https://example.com/admin/audit", {
        headers: { cookie }
      }),
      env
    );

    expect(auditPage.status).toBe(200);
    const auditHtml = await auditPage.text();
    expect(auditHtml).toContain("Audit log");
    expect(auditHtml).toContain("DokuWiki's bundled logviewer reads PHP log files");
    expect(auditHtml).toContain("Cloudflare Logs");
    expect(auditHtml).toContain("acl_rule_upsert");
    expect(auditHtml).toContain("search_index_rebuild");
  });

  it("normalizes ACL admin values and clamps page permissions", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);

    const pageForm = new FormData();
    pageForm.set("scope", "Wiki:Locked");
    pageForm.set("principalType", "user");
    pageForm.set("principal", "@Alice Example");
    pageForm.set("permission", "16");

    const pageSaved = await handleRequest(
      new Request("https://example.com/api/admin/acl", {
        method: "POST",
        body: pageForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(pageSaved.status).toBe(303);
    await expect(
      env.DB.prepare("select scope, principal_type, principal, permission from acl_rules").all()
    ).resolves.toMatchObject({
      results: [
        {
          scope: "wiki:locked",
          principal_type: "user",
          principal: "alice_example",
          permission: 2
        }
      ]
    });

    const placeholderForm = new FormData();
    placeholderForm.set("scope", "teams:%GROUP%:*");
    placeholderForm.set("principalType", "group");
    placeholderForm.set("principal", "%GROUP%");
    placeholderForm.set("permission", "8");

    const placeholderSaved = await handleRequest(
      new Request("https://example.com/api/admin/acl", {
        method: "POST",
        body: placeholderForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(placeholderSaved.status).toBe(303);
    await expect(
      env.DB.prepare(
        "select scope, principal_type, principal, permission from acl_rules where scope = ?"
      )
        .bind("teams:%GROUP%:*")
        .first()
    ).resolves.toMatchObject({
      scope: "teams:%GROUP%:*",
      principal_type: "group",
      principal: "%GROUP%",
      permission: 8
    });
  });

  it("allows admin users to manage native users and groups", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await seedUser(env.DB, {
      userId: "user-bob",
      username: "bob",
      password: "bob password",
      displayName: "Bob Example",
      email: "bob@example.test",
      groups: ["user"]
    });
    await seedUser(env.DB, {
      userId: "user-charlie",
      username: "charlie",
      password: "charlie password",
      displayName: "Charlie Guest",
      email: "charlie@example.test",
      groups: ["guest"]
    });
    const cookie = await loginAsAlice(env);

    const anonymous = await handleRequest(new Request("https://example.com/admin/users"), env);
    const dashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie }
      }),
      env
    );
    const page = await handleRequest(
      new Request("https://example.com/admin/users", {
        headers: { cookie }
      }),
      env
    );

    expect(anonymous.status).toBe(403);
    await expect(dashboard.text()).resolves.toContain("User manager");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Bob Example");
    expect(html).toContain("bob@example.test");
    expect(html).toContain("Displaying users 1-3 of 3 found. 3 users total.");

    const filtered = await handleRequest(
      new Request("https://example.com/admin/users?userid=bob", {
        headers: { cookie }
      }),
      env
    );
    const filteredHtml = await filtered.text();
    expect(filteredHtml).toContain("Bob Example");
    expect(filteredHtml).not.toContain("Charlie Guest");
    expect(filteredHtml).toContain("Displaying users 1-1 of 1 found. 3 users total.");

    const groupFiltered = await handleRequest(
      new Request("https://example.com/admin/users?usergroups=guest", {
        headers: { cookie }
      }),
      env
    );
    const groupFilteredHtml = await groupFiltered.text();
    expect(groupFilteredHtml).toContain("Charlie Guest");
    expect(groupFilteredHtml).not.toContain("Bob Example");

    const invalidForm = new FormData();
    invalidForm.set("id", "user-bob");
    invalidForm.set("displayName", "Bobby User");
    invalidForm.set("email", "bad-address");
    invalidForm.set("groups", "user");

    const invalid = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        body: invalidForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(invalid.status).toBe(400);
    await expect(invalid.text()).resolves.toContain("Bad email address");

    const form = new FormData();
    form.set("id", "user-bob");
    form.set("displayName", "Bobby User");
    form.set("email", "");
    form.set("groups", "user, manager");
    form.set("isDisabled", "1");
    form.set("returnTo", "/admin/users?userid=bob");

    const saved = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/admin/users?userid=bob&saved=1");
    await expect(
      env.DB.prepare(
        `select username, display_name, email, is_disabled
         from users
         where id = ?`
      )
        .bind("user-bob")
        .first()
    ).resolves.toMatchObject({
      username: "bob",
      display_name: "Bobby User",
      email: null,
      is_disabled: 1
    });
    await expect(
      env.DB.prepare(
        `select g.name
         from user_groups ug
         join groups g on g.id = ug.group_id
         where ug.user_id = ?
         order by g.name asc`
      )
        .bind("user-bob")
        .all()
    ).resolves.toEqual({
      results: [{ name: "manager" }, { name: "user" }]
    });

    const bobLogin = await postLogin(env, "bob", "bob password");
    expect(bobLogin.status).toBe(401);
    expect(bobLogin.headers.get("set-cookie") ?? "").not.toContain("DW_PAGES_SESSION=");

    const selfDelete = new FormData();
    selfDelete.set("run", "delete");
    selfDelete.set("delete", "user-1");

    const rejectedDelete = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        body: selfDelete,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(rejectedDelete.status).toBe(400);
    await expect(rejectedDelete.text()).resolves.toContain("You can&#39;t delete yourself!");

    const deleteForm = new FormData();
    deleteForm.set("run", "delete");
    deleteForm.set("delete", "user-charlie");
    deleteForm.set("returnTo", "/admin/users?usergroups=guest");

    const deleted = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        body: deleteForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(deleted.status).toBe(303);
    expect(deleted.headers.get("location")).toBe("/admin/users?usergroups=guest&deleted=1");
    await expect(
      env.DB.prepare("select id from users where id = ?").bind("user-charlie").first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare("select action, target_type, target_id from audit_log where action = ?")
        .bind("user_update")
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          action: "user_update",
          target_type: "user",
          target_id: "user-bob"
        }
      ]
    });
    await expect(
      env.DB.prepare("select action, target_type, target_id from audit_log where action = ?")
        .bind("user_delete_bulk")
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          action: "user_delete_bulk",
          target_type: "user",
          target_id: null
        }
      ]
    });
  });

  it("allows manager users to view the admin dashboard but not ACL management", async () => {
    env = createEnv();
    await seedUser(env.DB, {
      userId: "user-2",
      username: "mona",
      password: "manager password",
      displayName: "Mona Manager",
      email: "mona@example.test",
      groups: ["manager", "user"]
    });
    const cookie = await loginAs(env, "mona", "manager password");

    const anonymous = await handleRequest(new Request("https://example.com/admin"), env);
    const legacy = await handleRequest(new Request("https://example.com/doku.php?do=admin"), env);
    const dashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie }
      }),
      env
    );
    const acl = await handleRequest(
      new Request("https://example.com/admin/acl", {
        headers: { cookie }
      }),
      env
    );
    const audit = await handleRequest(
      new Request("https://example.com/admin/audit", {
        headers: { cookie }
      }),
      env
    );
    const users = await handleRequest(
      new Request("https://example.com/admin/users", {
        headers: { cookie }
      }),
      env
    );
    const mediaCleanup = await handleRequest(
      new Request("https://example.com/admin/media-cleanup", {
        headers: { cookie }
      }),
      env
    );
    const revert = await handleRequest(
      new Request("https://example.com/admin/revert", {
        headers: { cookie }
      }),
      env
    );
    const config = await handleRequest(
      new Request("https://example.com/admin/config", {
        headers: { cookie }
      }),
      env
    );
    const configExport = await handleRequest(
      new Request("https://example.com/api/admin/config/export", {
        headers: { cookie }
      }),
      env
    );
    const cachePurgeForm = new FormData();
    const cachePurge = await handleRequest(
      new Request("https://example.com/api/admin/cache/purge", {
        method: "POST",
        body: cachePurgeForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );
    const mediaCleanupForm = new FormData();
    mediaCleanupForm.set("confirm", "delete");
    const mediaCleanupPost = await handleRequest(
      new Request("https://example.com/api/admin/media/cleanup", {
        method: "POST",
        body: mediaCleanupForm,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(anonymous.status).toBe(403);
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("/admin");
    expect(dashboard.status).toBe(200);
    await expect(dashboard.text()).resolves.toContain("Administration");
    expect(acl.status).toBe(403);
    expect(audit.status).toBe(403);
    expect(users.status).toBe(403);
    expect(mediaCleanup.status).toBe(403);
    expect(revert.status).toBe(200);
    await expect(revert.text()).resolves.toContain("Revert Manager");
    expect(config.status).toBe(403);
    expect(configExport.status).toBe(403);
    expect(cachePurge.status).toBe(403);
    expect(mediaCleanupPost.status).toBe(403);
  });

  it("honors configured DokuWiki superuser and manager member lists", async () => {
    env = createEnv({
      SUPERUSER: "root,@ops",
      MANAGER: "@staff,mona"
    });
    await seedUser(env.DB, {
      userId: "user-root",
      username: "root",
      password: "root password",
      displayName: "Root User",
      email: "root@example.test",
      groups: ["user"]
    });
    await seedUser(env.DB, {
      userId: "user-ops",
      username: "oliver",
      password: "ops password",
      displayName: "Oliver Ops",
      email: "oliver@example.test",
      groups: ["ops", "user"]
    });
    await seedUser(env.DB, {
      userId: "user-staff",
      username: "stella",
      password: "staff password",
      displayName: "Stella Staff",
      email: "stella@example.test",
      groups: ["staff", "user"]
    });
    await seedUser(env.DB, {
      userId: "user-mona",
      username: "mona",
      password: "mona password",
      displayName: "Mona Named",
      email: "mona@example.test",
      groups: ["user"]
    });
    await seedUser(env.DB, {
      userId: "user-legacy-manager",
      username: "mickey",
      password: "manager password",
      displayName: "Mickey Manager",
      email: "mickey@example.test",
      groups: ["manager", "user"]
    });

    const rootCookie = await loginAs(env, "root", "root password");
    const opsCookie = await loginAs(env, "oliver", "ops password");
    const staffCookie = await loginAs(env, "stella", "staff password");
    const monaCookie = await loginAs(env, "mona", "mona password");
    const legacyManagerCookie = await loginAs(env, "mickey", "manager password");

    const rootAcl = await handleRequest(
      new Request("https://example.com/admin/acl", {
        headers: { cookie: rootCookie }
      }),
      env
    );
    const opsAcl = await handleRequest(
      new Request("https://example.com/admin/acl", {
        headers: { cookie: opsCookie }
      }),
      env
    );
    const staffDashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie: staffCookie }
      }),
      env
    );
    const staffAcl = await handleRequest(
      new Request("https://example.com/admin/acl", {
        headers: { cookie: staffCookie }
      }),
      env
    );
    const monaDashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie: monaCookie }
      }),
      env
    );
    const legacyManagerDashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie: legacyManagerCookie }
      }),
      env
    );

    expect(rootAcl.status).toBe(200);
    expect(opsAcl.status).toBe(200);
    expect(staffDashboard.status).toBe(200);
    expect(staffAcl.status).toBe(403);
    expect(monaDashboard.status).toBe(200);
    expect(legacyManagerDashboard.status).toBe(403);
  });

  it("allows manager users to search and batch-revert spam pages", async () => {
    env = createEnv();
    await seedUser(env.DB, {
      userId: "user-2",
      username: "mona",
      password: "manager password",
      displayName: "Mona Manager",
      email: "mona@example.test",
      groups: ["manager", "user"]
    });
    await seedPageHistory(env.DB, {
      id: "wiki:spam",
      title: "Spam",
      revisions: [
        {
          id: "wiki:spam@2026-05-07T00:00:00.000Z",
          content: "Clean body",
          summary: "Clean revision",
          changeType: "create",
          createdAt: "2026-05-07T00:00:00.000Z"
        },
        {
          id: "wiki:spam@2026-05-07T01:00:00.000Z",
          content: "Buy http://spam.example now",
          summary: "Spam edit",
          changeType: "edit",
          createdAt: "2026-05-07T01:00:00.000Z"
        }
      ]
    });
    await seedPageHistory(env.DB, {
      id: "wiki:badonly",
      title: "Bad Only",
      revisions: [
        {
          id: "wiki:badonly@2026-05-07T01:05:00.000Z",
          content: "Only http://spam.example here",
          summary: "Spam create",
          changeType: "create",
          createdAt: "2026-05-07T01:05:00.000Z"
        }
      ]
    });
    await seedPageHistory(env.DB, {
      id: "wiki:clean",
      title: "Clean",
      revisions: [
        {
          id: "wiki:clean@2026-05-07T01:10:00.000Z",
          content: "Nothing suspicious",
          summary: "Clean create",
          changeType: "create",
          createdAt: "2026-05-07T01:10:00.000Z"
        }
      ]
    });
    const cookie = await loginAs(env, "mona", "manager password");

    const search = await handleRequest(
      new Request("https://example.com/admin/revert?filter=http://spam.example", {
        headers: { cookie }
      }),
      env
    );
    const searchHtml = await search.text();

    expect(search.status).toBe(200);
    expect(searchHtml).toContain("Search spammy pages");
    expect(searchHtml).toContain("Note: this search is case sensitive");
    expect(searchHtml).toContain("wiki:spam");
    expect(searchHtml).toContain("wiki:badonly");
    expect(searchHtml).not.toContain("wiki:clean");

    const form = new FormData();
    form.set("filter", "http://spam.example");
    form.append("revert", "wiki:spam");
    form.append("revert", "wiki:badonly");
    const reverted = await handleRequest(
      new Request("https://example.com/admin/revert", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );
    const revertedHtml = await reverted.text();

    expect(reverted.status).toBe(200);
    expect(revertedHtml).toContain("Reversion process started");
    expect(revertedHtml).toContain("wiki:spam reverted to revision 2026-05-07T00:00:00.000Z");
    expect(revertedHtml).toContain("wiki:badonly removed");
    expect(revertedHtml).toContain("Reversion process finished successfully.");

    await expect(currentPageRevision(env.DB, "wiki:spam")).resolves.toMatchObject({
      is_deleted: 0,
      content: "Clean body",
      summary: "old revision restored",
      change_type: "revert"
    });
    await expect(currentPageRevision(env.DB, "wiki:badonly")).resolves.toMatchObject({
      is_deleted: 1,
      content: "Only http://spam.example here",
      summary: "removed",
      change_type: "delete"
    });
    await expect(
      env.DB.prepare("select action, target_type from audit_log where action = ?")
        .bind("revert_manager_run")
        .all()
    ).resolves.toMatchObject({
      results: [{ action: "revert_manager_run", target_type: "page" }]
    });
  });

  it("writes DokuWiki-shaped page metadata for saved pages", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "wiki:welcome",
      title: "Welcome",
      content: "====== Welcome ======\n\nExisting page."
    });
    await seedPage(env.DB, {
      id: "wiki:meta",
      title: "Old Metadata",
      content: "====== Old Metadata ======\n\nOld content.",
      revisionId: "wiki:meta@2026-05-07T00:00:00.000Z",
      createdAt: "2026-05-07T00:00:00.000Z"
    });
    await seedMediaObjectReferences(env.DB);
    const cookie = await loginAsAlice(env);
    const form = new FormData();
    form.set("id", "wiki:meta");
    form.set("baseRevisionId", "wiki:meta@2026-05-07T00:00:00.000Z");
    form.set(
      "content",
      [
        "====== Metadata Page ======",
        "",
        "Intro paragraph with [[wiki:welcome|Welcome]] and [[wiki:missing|Missing]].",
        "",
        "{{wiki:logo.svg|Logo}}"
      ].join("\n")
    );
    form.set("summary", "Create metadata page");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );
    const metadata = await pageMetadata(env.DB, "wiki:meta");
    const targetMetadata = await pageMetadata(env.DB, "wiki:welcome");

    expect(response.status).toBe(303);
    expect(metadata.relation).toMatchObject({
      references: {
        "wiki:missing": false,
        "wiki:welcome": true
      },
      media: {
        "wiki:logo.svg": true
      },
      firstimage: "wiki:logo.svg"
    });
    expect(metadata.description).toMatchObject({
      abstract: expect.stringContaining("Metadata Page"),
      tableofcontents: [{ hid: "metadata-page", title: "Metadata Page", type: "ul", level: 1 }]
    });
    expect(metadata.date).toMatchObject({
      created: expect.any(Number),
      modified: expect.any(Number)
    });
    expect(metadata.contributor).toMatchObject({
      "user-1": "Alice Example"
    });
    expect(metadata.dokuwiki).toMatchObject({
      current: {
        title: "Metadata Page",
        relation: {
          references: {
            "wiki:welcome": true,
            "wiki:missing": false
          }
        }
      },
      persistent: {
        contributor: {
          "user-1": "Alice Example"
        }
      }
    });
    expect(targetMetadata.backlinks).toEqual(["wiki:meta"]);
  });

  it("uses relation metadata for backlink, wanted, and orphan reports", async () => {
    env = createEnv();
    await seedPage(env.DB, {
      id: "wiki:target",
      title: "Target",
      content: "====== Target ======\n\nNo source body points here."
    });
    await seedPage(env.DB, {
      id: "wiki:source",
      title: "Source",
      content: "====== Source ======\n\nThe metadata row, not this body, defines links."
    });
    await seedPage(env.DB, {
      id: "wiki:orphan",
      title: "Orphan",
      content: "====== Orphan ======\n\nNo incoming relation metadata."
    });
    await insertPageMetadata(env.DB, "wiki:source", "relation", {
      references: {
        "wiki:target": true,
        "wiki:wanted": false
      },
      media: {},
      firstimage: ""
    });
    await insertPageMetadata(env.DB, "wiki:target", "backlinks", ["wiki:source"]);
    await insertPageMetadata(env.DB, "wiki:target", "relation", {
      references: {},
      media: {},
      firstimage: ""
    });
    await insertPageMetadata(env.DB, "wiki:orphan", "relation", {
      references: {},
      media: {},
      firstimage: ""
    });

    const backlinks = await handleRequest(
      new Request("https://example.com/wiki/wiki/target?do=backlink"),
      env
    );
    const wanted = await handleRequest(new Request("https://example.com/wanted"), env);
    const orphans = await handleRequest(new Request("https://example.com/orphans"), env);

    const backlinksHtml = await backlinks.text();
    const wantedHtml = await wanted.text();
    const orphansHtml = await orphans.text();

    expect(backlinks.status).toBe(200);
    expect(backlinksHtml).toContain("Backlinks for wiki:target");
    expect(backlinksHtml).toContain("/wiki/wiki/source");
    expect(wanted.status).toBe(200);
    expect(wantedHtml).toContain("wiki:wanted");
    expect(wantedHtml).toContain("/wiki/wiki/source");
    expect(orphans.status).toBe(200);
    expect(orphansHtml).toContain("/wiki/wiki/orphan");
    expect(orphansHtml).not.toContain("/wiki/wiki/target");
  });

  it("matches DokuWiki recent-change grouping, filters, and hidden-page pagination", async () => {
    env = createEnv({ HIDE_PAGES: "hidden" });
    for (const id of [
      "wiki:visible",
      "wiki:second",
      "wiki:hidden",
      "wiki:minor",
      "other:visible"
    ]) {
      await seedPage(env.DB, {
        id,
        title: id,
        content: `====== ${id} ======\n\nRecent fixture.`
      });
    }
    await insertPageChangelog(env.DB, {
      id: "wiki:visible",
      changeType: "edit",
      summary: "Latest visible edit",
      createdAt: "2026-05-08T12:00:00.000Z"
    });
    await insertPageChangelog(env.DB, {
      id: "wiki:hidden",
      changeType: "edit",
      summary: "Hidden edit",
      createdAt: "2026-05-08T11:00:00.000Z"
    });
    await insertPageChangelog(env.DB, {
      id: "wiki:second",
      changeType: "edit",
      summary: "Second visible edit",
      createdAt: "2026-05-08T10:00:00.000Z"
    });
    await insertPageChangelog(env.DB, {
      id: "wiki:minor",
      changeType: "minor",
      summary: "Minor edit",
      createdAt: "2026-05-08T09:00:00.000Z"
    });
    await insertPageChangelog(env.DB, {
      id: "other:visible",
      changeType: "edit",
      summary: "Other namespace edit",
      createdAt: "2026-05-08T08:00:00.000Z"
    });
    await insertPageChangelog(env.DB, {
      id: "wiki:visible",
      changeType: "create",
      summary: "Older duplicate visible edit",
      createdAt: "2026-05-07T12:00:00.000Z"
    });

    const firstPage = await handleRequest(
      new Request("https://example.com/recent?ns=wiki&limit=1"),
      env
    );
    const firstHtml = await firstPage.text();
    const secondPage = await handleRequest(
      new Request("https://example.com/recent?ns=wiki&limit=1&first%5B1%5D=1"),
      env
    );
    const secondHtml = await secondPage.text();
    const noMinor = await handleRequest(
      new Request("https://example.com/recent?ns=wiki&show_minor=0"),
      env
    );
    const noMinorHtml = await noMinor.text();

    expect(firstPage.status).toBe(200);
    expect(firstHtml).toContain("Latest visible edit");
    expect(firstHtml).toContain('name="first[1]"');
    expect(firstHtml).not.toContain("Hidden edit");
    expect(firstHtml).not.toContain("Older duplicate visible edit");
    expect(firstHtml).not.toContain("Other namespace edit");
    expect(secondPage.status).toBe(200);
    expect(secondHtml).toContain("Second visible edit");
    expect(secondHtml).not.toContain("Hidden edit");
    expect(noMinor.status).toBe(200);
    expect(noMinorHtml).not.toContain("/wiki/wiki/minor");
  });

  it("allows admin users to purge global render and discovery caches", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await env.RENDER_CACHE.put("page:wiki:welcome", "rendered page");
    await env.RENDER_CACHE.put("page:wiki:welcome:rev-1", "rendered revision");
    await env.RENDER_CACHE.put("discovery:sitemap:https://example.com", "sitemap");
    await env.RENDER_CACHE.put("auth:login:203.0.113.10:alice", "4");
    const cookie = await loginAsAlice(env);

    const missingCsrf = await handleRequest(
      new Request("https://example.com/api/admin/cache/purge", {
        method: "POST"
      }),
      env
    );
    const dashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie }
      }),
      env
    );
    const form = new FormData();
    const purged = await handleRequest(
      new Request("https://example.com/api/admin/cache/purge", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(missingCsrf.status).toBe(403);
    await expect(dashboard.text()).resolves.toContain("Purge render cache");
    expect(purged.status).toBe(303);
    expect(purged.headers.get("location")).toBe("/admin");
    await expect(env.RENDER_CACHE.get("page:wiki:welcome")).resolves.toBeNull();
    await expect(env.RENDER_CACHE.get("page:wiki:welcome:rev-1")).resolves.toBeNull();
    await expect(env.RENDER_CACHE.get("discovery:sitemap:https://example.com")).resolves.toBeNull();
    await expect(env.RENDER_CACHE.get("auth:login:203.0.113.10:alice")).resolves.toBe("4");
    await expect(
      env.DB.prepare("select action, target_type, target_id from audit_log where action = ?")
        .bind("cache_purge")
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          action: "cache_purge",
          target_type: "cache",
          target_id: "global"
        }
      ]
    });
  });

  it("allows admin users to clean up unreferenced media objects", async () => {
    env = createEnv();
    env.MEDIA_BUCKET = createMediaCleanupR2Stub([
      ["media/current/wiki/logo.svg", "<svg>current</svg>"],
      ["media/revisions/wiki/logo.svg/20260506000000", "<svg>old</svg>"],
      ["media/current/wiki/orphan.svg", "<svg>orphan</svg>"],
      ["backups/2026-05-07/export.sql", "backup"]
    ]);
    await seedUser(env.DB);
    await seedMediaObjectReferences(env.DB);
    const cookie = await loginAsAlice(env);

    const dashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie }
      }),
      env
    );
    const scan = await handleRequest(
      new Request("https://example.com/admin/media-cleanup?scan=1", {
        headers: { cookie }
      }),
      env
    );
    const missingCsrf = await handleRequest(
      new Request("https://example.com/api/admin/media/cleanup", {
        method: "POST"
      }),
      env
    );
    const unconfirmed = await handleRequest(
      new Request("https://example.com/api/admin/media/cleanup", {
        method: "POST",
        body: new FormData(),
        headers: csrfHeaders({ cookie, accept: "application/json" })
      }),
      env
    );
    const cleanupForm = new FormData();
    cleanupForm.set("confirm", "delete");
    const cleanup = await handleRequest(
      new Request("https://example.com/api/admin/media/cleanup", {
        method: "POST",
        body: cleanupForm,
        headers: csrfHeaders({ cookie, accept: "application/json" })
      }),
      env
    );
    const rescan = await handleRequest(
      new Request("https://example.com/admin/media-cleanup?scan=1", {
        headers: { cookie }
      }),
      env
    );

    expect(dashboard.status).toBe(200);
    await expect(dashboard.text()).resolves.toContain("Media cleanup");
    expect(scan.status).toBe(200);
    const scanHtml = await scan.text();
    expect(scanHtml).toContain("Unreferenced R2 media objects: 1");
    expect(scanHtml).toContain("media/current/wiki/orphan.svg");
    expect(scanHtml).not.toContain("backups/2026-05-07/export.sql");
    expect(missingCsrf.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: "Media cleanup requires delete confirmation."
    });
    expect(cleanup.status).toBe(200);
    await expect(cleanup.json()).resolves.toMatchObject({
      ok: true,
      scannedObjectCount: 3,
      referencedObjectCount: 2,
      unreferencedObjectCount: 1,
      deletedObjectCount: 1
    });
    await expect(env.MEDIA_BUCKET.head("media/current/wiki/orphan.svg")).resolves.toBeNull();
    await expect(env.MEDIA_BUCKET.head("media/current/wiki/logo.svg")).resolves.not.toBeNull();
    await expect(env.MEDIA_BUCKET.head("backups/2026-05-07/export.sql")).resolves.not.toBeNull();
    await expect(
      env.DB.prepare("select action, target_type from audit_log where action = ?")
        .bind("media_cleanup")
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          action: "media_cleanup",
          target_type: "media"
        }
      ]
    });
    await expect(rescan.text()).resolves.toContain("No unreferenced media objects were found.");
  });

  it("allows admin users to inspect and export redacted runtime configuration", async () => {
    env = createEnv();
    env.API_BEARER_TOKEN = "super-secret-token";
    env.API_CORS_ORIGINS = "https://client.example";
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);

    const anonymous = await handleRequest(new Request("https://example.com/admin/config"), env);
    const dashboard = await handleRequest(
      new Request("https://example.com/admin", {
        headers: { cookie }
      }),
      env
    );
    const page = await handleRequest(
      new Request("https://example.com/admin/config", {
        headers: { cookie }
      }),
      env
    );
    const exported = await handleRequest(
      new Request("https://example.com/api/admin/config/export", {
        headers: { cookie }
      }),
      env
    );

    expect(anonymous.status).toBe(403);
    await expect(dashboard.text()).resolves.toContain("Configuration manager");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Configuration manager");
    expect(html).toContain("Runtime configuration is read-only inside Pages Functions.");
    expect(html).toContain("permanent Pages runtime difference");
    expect(html).toContain("Upstream metadata");
    expect(html).toContain("<code>title</code>");
    expect(html).toContain("lib/plugins/config/settings/config.metadata.php");
    expect(html).toContain("API_BEARER_TOKEN");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("super-secret-token");
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("dokuwiki-pages-config-");
    const backupText = await exported.text();
    expect(backupText).toContain("API_CORS_ORIGINS");
    expect(backupText).toContain("[redacted]");
    expect(backupText).not.toContain("super-secret-token");
  });

  it("maps bundled plugin admin pages to native replacements or explicit removal", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await seedPluginEnablement(env.DB, {
      plugin: "acl",
      enabled: true,
      source: "plugins.required.php",
      layer: "required",
      locked: true
    });
    await seedPluginEnablement(env.DB, {
      plugin: "popularity",
      enabled: false,
      source: "plugins.local.php",
      layer: "local",
      locked: false
    });
    const cookie = await loginAsAlice(env);
    const replacements = [
      ["acl", "/admin/acl", "Access Control List Management"],
      ["config", "/admin/config", "Configuration manager"],
      ["info", "/diagnostics", "Diagnostics"],
      ["logviewer", "/admin/audit", "Cloudflare Logs"],
      ["revert", "/admin/revert", "Revert Manager"],
      ["styling", "/admin/styling", "Template Style Settings"],
      ["usermanager", "/admin/users", "User manager"]
    ];

    for (const [plugin, location, pageText] of replacements) {
      const legacy = await handleRequest(
        new Request(`https://example.com/doku.php?do=admin&page=${plugin}`),
        env
      );
      const native = await handleRequest(
        new Request(`https://example.com${location}`, {
          headers: { cookie }
        }),
        env
      );

      expect(legacy.status, plugin).toBe(301);
      expect(legacy.headers.get("location"), plugin).toBe(location);
      expect(native.status, plugin).toBe(200);
      await expect(native.text(), plugin).resolves.toContain(pageText);
    }

    const extensionAnonymous = await handleRequest(
      new Request("https://example.com/admin/extension"),
      env
    );
    const extensionPage = await handleRequest(
      new Request("https://example.com/admin/extension", {
        headers: { cookie }
      }),
      env
    );
    expect(extensionAnonymous.status).toBe(403);
    expect(extensionPage.status).toBe(501);
    const extensionHtml = await extensionPage.text();
    expect(extensionHtml).toContain("Extension Manager");
    expect(extensionHtml).toContain("Installed Plugins");
    expect(extensionHtml).toContain("Search and Install");
    expect(extensionHtml).toContain("Imported plugin enablement");
    expect(extensionHtml).toContain("<code>acl</code>");
    expect(extensionHtml).toContain("plugins.required.php");
    expect(extensionHtml).toContain("required");
    expect(extensionHtml).toContain(
      "Runtime plugin and template installation is not available in this Pages port."
    );

    const diagnostics = await handleRequest(
      new Request("https://example.com/api/diagnostics"),
      env
    );
    await expect(diagnostics.json()).resolves.toMatchObject({
      plugins: {
        sourceFiles: ["conf/plugins.php", "conf/plugins.local.php", "conf/plugins.required.php"],
        summary: {
          total: 2,
          enabled: 1,
          disabled: 1,
          locked: 1
        },
        plugins: expect.arrayContaining([
          expect.objectContaining({
            plugin: "acl",
            enabled: true,
            source: "plugins.required.php",
            layer: "required",
            locked: true
          }),
          expect.objectContaining({
            plugin: "popularity",
            enabled: false,
            source: "plugins.local.php",
            layer: "local",
            locked: false
          })
        ])
      }
    });
    const diagnosticsHtml = await handleRequest(
      new Request("https://example.com/diagnostics"),
      env
    );
    const diagnosticsBody = await diagnosticsHtml.text();
    expect(diagnosticsBody).toContain("<h2>Plugin enablement</h2>");
    expect(diagnosticsBody).toContain("plugins.local.php");

    for (const plugin of ["extension", "popularity", "safefnrecode"]) {
      const removed = await handleRequest(
        new Request(`https://example.com/doku.php?do=admin&page=${plugin}`),
        env
      );
      const html = await removed.text();

      expect(removed.status, plugin).toBe(501);
      expect(removed.headers.get("content-type"), plugin).toBe("text/html; charset=utf-8");
      expect(html, plugin).toContain("is not available in this Pages port");
      if (plugin === "popularity") {
        expect(html).toContain("does not collect, autosubmit, or phone home usage statistics");
        expect(html).toContain("update.dokuwiki.org");
      }
      if (plugin === "safefnrecode") {
        expect(html).toContain("npm run safefn:recode");
      }
    }
  });

  it("allows admin users to edit deployment-safe template style variables", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);

    const anonymous = await handleRequest(new Request("https://example.com/admin/styling"), env);
    const page = await handleRequest(
      new Request("https://example.com/admin/styling", {
        headers: { cookie }
      }),
      env
    );
    const initialCss = await handleRequest(new Request("https://example.com/theme.css"), env);

    expect(anonymous.status).toBe(403);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Template Style Settings");
    expect(html).toContain("Main text color");
    expect(html).toContain("/theme.css");
    await expect(initialCss.text()).resolves.toContain("no Pages theme overrides");

    const form = new FormData();
    form.set("run", "save");
    form.set("__text__", "#112233");
    form.set("__background__", "#fefefe");

    const saved = await handleRequest(
      new Request("https://example.com/api/admin/styling", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/admin/styling?saved=1");
    const row = await env.DB.prepare(
      "select value_json from plugin_settings where plugin = 'styling' and key = 'theme_variables'"
    )
      .bind()
      .first();
    expect(JSON.parse(row.value_json).variables).toMatchObject({
      __text__: "#112233",
      __background__: "#fefefe"
    });

    const css = await handleRequest(new Request("https://example.com/theme.css"), env);
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    await expect(css.text()).resolves.toContain("--dw-text: #112233;");

    const revert = new FormData();
    revert.set("run", "revert");
    const reverted = await handleRequest(
      new Request("https://example.com/api/admin/styling", {
        method: "POST",
        body: revert,
        headers: csrfHeaders({ cookie })
      }),
      env
    );
    expect(reverted.status).toBe(303);
    expect(reverted.headers.get("location")).toBe("/admin/styling?reverted=1");
    const revertedCss = await handleRequest(new Request("https://example.com/theme.css"), env);
    await expect(revertedCss.text()).resolves.toContain("no Pages theme overrides");
  });

  it("bypasses shared rendered cache for pages not readable by anonymous users", async () => {
    env = createEnv();
    await seedUser(env.DB);
    await seedPage(env.DB, {
      id: "private:start",
      title: "Private",
      content: "====== Private ======\n\nSecret body."
    });
    await seedAclRule(env.DB, {
      scope: "*",
      principalType: "all",
      principal: "@ALL",
      permission: 0
    });
    await seedAclRule(env.DB, {
      scope: "private:*",
      principalType: "group",
      principal: "user",
      permission: 1
    });
    await env.RENDER_CACHE.put(
      "page:private:start",
      JSON.stringify({
        rendererVersion: 17,
        revisionId: "private:start@2026-05-07T00:00:00.000Z",
        title: "Cached Private",
        html: "<p>Cached private body.</p>",
        toc: []
      })
    );
    const cookie = await loginAsAlice(env);

    const anonymous = await handleRequest(
      new Request("https://example.com/wiki/private/start"),
      env
    );
    const response = await handleRequest(
      new Request("https://example.com/wiki/private/start", {
        headers: { cookie }
      }),
      env
    );

    expect(anonymous.status).toBe(403);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Secret body.");
    expect(html).not.toContain("Cached private body.");
  });

  it("rejects invalid logins without setting a session cookie", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "wrong");

    try {
      const response = await handleRequest(
        new Request("https://example.com/api/auth/login", {
          method: "POST",
          body: login,
          headers: csrfHeaders()
        }),
        env
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie") ?? "").not.toContain("DW_PAGES_SESSION=");
      await expect(response.text()).resolves.toContain("Sorry, username or password was wrong.");
      expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
        event: "auth_event",
        authEvent: "login_failure",
        username: "alice"
      });
    } finally {
      log.mockRestore();
    }
  });

  it("rate limits repeated invalid login attempts", async () => {
    env = createEnv();
    await seedUser(env.DB);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await postLogin(env, "alice", "wrong", {
        "cf-connecting-ip": "203.0.113.55"
      });
      expect(response.status).toBe(401);
    }

    const limited = await postLogin(env, "alice", "wrong", {
      "cf-connecting-ip": "203.0.113.55"
    });

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    await expect(limited.text()).resolves.toContain("Too many failed login attempts.");
  });

  it("rejects disabled users during login and session resolution", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const cookie = await loginAsAlice(env);
    await env.DB.prepare("update users set is_disabled = 1 where username = ?").bind("alice").run();

    const sessionResponse = await handleRequest(
      new Request("https://example.com/api/auth/session", {
        headers: { cookie }
      }),
      env
    );

    await expect(sessionResponse.json()).resolves.toMatchObject({
      principal: {
        type: "anonymous",
        isAuthenticated: false
      }
    });

    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");

    const loginResponse = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login,
        headers: csrfHeaders()
      }),
      env
    );

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.headers.get("set-cookie") ?? "").not.toContain("DW_PAGES_SESSION=");
  });

  it("rejects login posts without CSRF tokens", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");

    const response = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login,
        headers: { accept: "application/json" }
      }),
      env
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid CSRF token." });
  });

  function createEnv(overrides = {}) {
    db = new DatabaseSync(":memory:");
    db.exec(migrationSql);

    return {
      DB: new SqliteD1(db),
      RENDER_CACHE: new MemoryKv(),
      SITE_NAME: "Test Wiki",
      ...overrides
    };
  }
});

function csrfHeaders(headers = {}) {
  return {
    ...headers,
    cookie: headers.cookie
      ? `${headers.cookie}; DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`
      : `DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`,
    "x-csrf-token": TEST_CSRF_TOKEN
  };
}

function cookieHeader(...setCookies) {
  return setCookies
    .filter(Boolean)
    .map((setCookie) => String(setCookie).split(";")[0])
    .join("; ");
}

function flashCookie(messages) {
  return `DW_FLASH_MESSAGES=${Buffer.from(JSON.stringify(messages), "utf8").toString("base64url")}`;
}

function extractProfileToken(html) {
  const match = html.match(/<code[^>]*>([^<]+)<\/code>/);
  if (!match) throw new Error("Profile token was not rendered.");
  return match[1];
}

async function seedUser(d1, options) {
  return seedAuthUser(d1, options);
}

async function seedPage(
  d1,
  {
    id,
    title,
    content,
    revisionId = `${id}@2026-05-07T00:00:00.000Z`,
    createdAt = "2026-05-07T00:00:00.000Z",
    authorId = null,
    authorName = null
  }
) {
  const namespace = id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
  await d1
    .prepare(
      `insert into pages (
         id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, namespace, title, revisionId, 0, createdAt, createdAt)
    .run();
  await d1
    .prepare(
      `insert into page_revisions (
         id, page_id, content, content_hash, author_id, author_name, summary,
         change_type, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      revisionId,
      id,
      content,
      `hash:${id}`,
      authorId,
      authorName,
      "Seed page",
      "create",
      content.length,
      createdAt
    )
    .run();
}

async function seedPageHistory(d1, { id, title, revisions }) {
  const namespace = id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
  const current = revisions.at(-1);
  if (!current) throw new Error("seedPageHistory requires at least one revision");

  await d1
    .prepare(
      `insert into pages (
         id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, namespace, title, current.id, 0, revisions[0].createdAt, current.createdAt)
    .run();

  let previousLength = 0;
  for (const revision of revisions) {
    await d1
      .prepare(
        `insert into page_revisions (
           id, page_id, content, content_hash, author_id, author_name, summary,
           change_type, size_change, created_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        revision.id,
        id,
        revision.content,
        `hash:${revision.id}`,
        null,
        "Seeder",
        revision.summary,
        revision.changeType,
        revision.content.length - previousLength,
        revision.createdAt
      )
      .run();

    await d1
      .prepare(
        `insert into changelog (
           id, subject_type, subject_id, revision_id, user_id, user_name, ip,
           change_type, summary, size_change, created_at
         ) values (?, 'page', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `page:${revision.id}`,
        id,
        revision.id,
        null,
        "Seeder",
        "127.0.0.1",
        revision.changeType,
        revision.summary,
        revision.content.length - previousLength,
        revision.createdAt
      )
      .run();

    previousLength = revision.content.length;
  }
}

async function seedChangelog(
  d1,
  {
    id,
    subjectType = "page",
    subjectId,
    revisionId,
    userId = null,
    userName = null,
    ip = "127.0.0.1",
    changeType = "edit",
    summary = "Seed page",
    sizeChange = 24,
    createdAt = "2026-05-07T00:00:00.000Z"
  }
) {
  await d1
    .prepare(
      `insert into changelog (
         id, subject_type, subject_id, revision_id, user_id, user_name, ip,
         change_type, summary, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      subjectType,
      subjectId,
      revisionId,
      userId,
      userName,
      ip,
      changeType,
      summary,
      sizeChange,
      createdAt
    )
    .run();
}

async function seedPluginEnablement(
  d1,
  { plugin, enabled, source, layer, locked, updatedAt = "2026-05-07T00:00:00.000Z" }
) {
  await d1
    .prepare(
      `insert into plugin_settings (plugin, key, value_json, updated_at)
       values (?, 'enabled', ?, ?)
       on conflict(plugin, key) do update set
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .bind(plugin, JSON.stringify({ plugin, enabled, source, layer, locked }), updatedAt)
    .run();
}

async function currentPageRevision(d1, id) {
  return d1
    .prepare(
      `select p.is_deleted, r.content, r.summary, r.change_type
       from pages p
       join page_revisions r on r.id = p.current_revision_id
       where p.id = ?`
    )
    .bind(id)
    .first();
}

async function pageMetadata(d1, id) {
  const rows = await d1
    .prepare(
      `select key, value_json
       from metadata
       where subject_type = 'page'
         and subject_id = ?`
    )
    .bind(id)
    .all();

  return Object.fromEntries(rows.results.map((row) => [row.key, JSON.parse(row.value_json)]));
}

async function insertPageMetadata(d1, id, key, value) {
  await d1
    .prepare(
      `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
       values ('page', ?, ?, ?, ?)`
    )
    .bind(id, key, JSON.stringify(value), "2026-05-07T00:00:00.000Z")
    .run();
}

async function insertPageChangelog(d1, { id, changeType, summary, createdAt, sizeChange = 12 }) {
  await d1
    .prepare(
      `insert into changelog (
         id, subject_type, subject_id, revision_id, user_id, user_name, ip,
         change_type, summary, size_change, created_at
       ) values (?, 'page', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      `page:${id}@${createdAt}:${changeType}`,
      id,
      `${id}@${createdAt}`,
      null,
      "Seeder",
      "127.0.0.1",
      changeType,
      summary,
      sizeChange,
      createdAt
    )
    .run();
}

async function seedMediaObjectReferences(d1) {
  const now = "2026-05-07T00:00:00.000Z";

  await d1
    .prepare(
      `insert into media (
         id, namespace, object_key, mime_type, byte_length, content_hash,
         current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      "wiki:logo.svg",
      "wiki",
      "media/current/wiki/logo.svg",
      "image/svg+xml",
      18,
      "hash:current-logo",
      "media-rev-current",
      0,
      now,
      now
    )
    .run();

  await d1
    .prepare(
      `insert into media_revisions (
         id, media_id, object_key, mime_type, byte_length, content_hash,
         author_id, summary, change_type, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      "media-rev-current",
      "wiki:logo.svg",
      "media/revisions/wiki/logo.svg/20260506000000",
      "image/svg+xml",
      14,
      "hash:old-logo",
      null,
      "Seed media revision",
      "create",
      now
    )
    .run();
}

async function seedAclRule(
  d1,
  { id, scope, principalType, principal, permission, createdAt = "2026-05-07T00:00:00.000Z" }
) {
  const ruleId = id ?? `acl:${scope}:${principalType}:${principal}`;
  await d1
    .prepare(
      `insert into acl_rules (
         id, scope, principal_type, principal, permission, created_at
       ) values (?, ?, ?, ?, ?, ?)`
    )
    .bind(ruleId, scope, principalType, principal, permission, createdAt)
    .run();
}

async function seedAuthUser(
  d1,
  {
    userId = "user-1",
    username = "alice",
    password = "correct horse battery staple",
    displayName = "Alice Example",
    email = "alice@example.test",
    groups = ["user", "admin"]
  } = {}
) {
  const now = "2026-05-07T00:00:00.000Z";
  const passwordHash = await hashPassword(password, {
    iterations: 1_000,
    salt: new Uint8Array(16).fill(9)
  });

  await d1
    .prepare(
      `insert into users (
         id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, username, displayName, email, passwordHash, 0, now, now)
    .run();

  for (const group of groups) {
    const groupId = `group:${group}`;
    await d1
      .prepare("insert or ignore into groups (id, name, created_at) values (?, ?, ?)")
      .bind(groupId, group, now)
      .run();
    await d1
      .prepare("insert or ignore into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
      .bind(userId, groupId, now)
      .run();
  }
}

async function seedProfileDeleteDependents(d1) {
  const now = "2026-05-07T00:00:00.000Z";
  await d1
    .prepare(
      `insert into drafts (id, page_id, user_id, content, base_revision_id, updated_at)
       values (?, ?, ?, ?, ?, ?)`
    )
    .bind("draft:wiki:start:user-1", "wiki:start", "user-1", "draft text", null, now)
    .run();
  await d1
    .prepare(
      `insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       values (?, ?, ?, ?, ?)`
    )
    .bind("reset-1", "user-1", "token-hash-1", "2026-05-08T00:00:00.000Z", now)
    .run();
  await d1
    .prepare(
      `insert into subscriptions (id, subject_type, subject_id, user_id, digest_interval, created_at)
       values (?, ?, ?, ?, ?, ?)`
    )
    .bind("sub-1", "page", "wiki:start", "user-1", "daily", now)
    .run();
  await d1
    .prepare(
      `insert into email_notification_events (
         id, subject_type, subject_id, revision_id, change_type, summary, actor_id, actor_name, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind("event-1", "page", "wiki:start", "rev-1", "edit", "summary", "user-1", "Alice", now)
    .run();
  await d1
    .prepare(
      `insert into email_digest_deliveries (subscription_id, event_id, delivered_at)
       values (?, ?, ?)`
    )
    .bind("sub-1", "event-1", now)
    .run();
}

function profileDeleteUserWhere(table) {
  return table === "users" ? "id = ?" : "user_id = ?";
}

async function loginAsAlice(env) {
  return loginAs(env, "alice", "correct horse battery staple");
}

async function loginAs(env, username, password) {
  const response = await postLogin(env, username, password);
  return response.headers.get("set-cookie") ?? "";
}

async function postLogin(env, username, password, headers = {}) {
  const login = new FormData();
  login.set("username", username);
  login.set("password", password);

  return handleRequest(
    new Request("https://example.com/api/auth/login", {
      method: "POST",
      body: login,
      headers: csrfHeaders(headers)
    }),
    env
  );
}

function createMediaCleanupR2Stub(entries) {
  const objects = new Map(entries);

  return {
    head: async (key) => (objects.has(key) ? {} : null),
    list: async ({ prefix = "", cursor } = {}) => {
      const start = cursor ? Number(cursor) : 0;
      const matching = [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right));

      return {
        objects: matching.slice(start).map(([key, value]) => ({
          key,
          size: String(value).length
        })),
        truncated: false,
        cursor: undefined
      };
    },
    delete: async (key) => {
      objects.delete(key);
    }
  };
}

class SqliteD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("begin");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.database.exec("commit");
      return results;
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
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

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return {
      results: this.database.prepare(this.sql).all(...this.values)
    };
  }

  async run() {
    this.database.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    const entry = this.values.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }

    return entry.value;
  }

  async put(key, value, options = {}) {
    this.values.set(key, {
      value,
      expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null
    });
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list({ prefix = "", cursor } = {}) {
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(cursor ? Number(cursor) : 0)
      .map((name) => ({ name }));

    return {
      keys,
      list_complete: true
    };
  }
}
