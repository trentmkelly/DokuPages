/* global FormData, Request */

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

  it("returns explicit not-supported responses for deferred account flows", async () => {
    env = createEnv();
    const browserUrls = [
      "https://example.com/register",
      "https://example.com/resendpwd",
      "https://example.com/password-reset",
      "https://example.com/doku.php?do=register",
      "https://example.com/doku.php?do=resendpwd",
      "https://example.com/wiki/wiki/welcome?do=register"
    ];
    const apiUrls = [
      "https://example.com/api/auth/register",
      "https://example.com/api/auth/password-reset"
    ];

    for (const url of browserUrls) {
      const response = await handleRequest(new Request(url), env);
      expect(response.status, url).toBe(501);
      expect(response.headers.get("content-type"), url).toContain("text/html");
      await expect(response.text(), url).resolves.toContain("not supported");
    }

    for (const url of apiUrls) {
      const response = await handleRequest(new Request(url), env);
      expect(response.status, url).toBe(501);
      expect(response.headers.get("content-type"), url).toContain("application/json");
      await expect(response.json(), url).resolves.toMatchObject({
        status: "not_supported"
      });
    }
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
    expect(html).toContain("Alice Example");
    expect(html).toContain('id="dokuwiki__usertools"');
    expect(html).toContain('<a href="/profile" rel="nofollow">Update Profile</a>');
    expect(html).toContain('<a href="/logout" rel="nofollow">Logout</a>');
    expect(html).not.toContain('<a href="/login" rel="nofollow">Login</a>');

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
    await expect(rejected.text()).resolves.toContain("Current password is incorrect.");

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
    expect(saved.headers.get("location")).toBe("/profile?updated=1");
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

  it("allows admin users to manage ACL rules", async () => {
    env = createEnv();
    await seedUser(env.DB);
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
    await expect(page.text()).resolves.toContain("Access control list manager");

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
    expect(auditHtml).toContain("acl_rule_upsert");
    expect(auditHtml).toContain("search_index_rebuild");
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

    const form = new FormData();
    form.set("id", "user-bob");
    form.set("displayName", "Bobby User");
    form.set("email", "");
    form.set("groups", "user, manager");
    form.set("isDisabled", "1");

    const saved = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ cookie })
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/admin/users");
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

    expect(anonymous.status).toBe(403);
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("/admin");
    expect(dashboard.status).toBe(200);
    await expect(dashboard.text()).resolves.toContain("Administration");
    expect(acl.status).toBe(403);
    expect(audit.status).toBe(403);
    expect(users.status).toBe(403);
    expect(config.status).toBe(403);
    expect(configExport.status).toBe(403);
    expect(cachePurge.status).toBe(403);
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
    const cookie = await loginAsAlice(env);
    const replacements = [
      ["acl", "/admin/acl", "Access control list manager"],
      ["config", "/admin/config", "Configuration manager"],
      ["info", "/diagnostics", "Diagnostics"],
      ["logviewer", "/admin/audit", "Audit log"],
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

    for (const plugin of ["extension", "popularity", "safefnrecode", "styling"]) {
      const removed = await handleRequest(
        new Request(`https://example.com/doku.php?do=admin&page=${plugin}`),
        env
      );

      expect(removed.status, plugin).toBe(501);
      await expect(removed.json(), plugin).resolves.toMatchObject({
        status: "not_available"
      });
    }
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
        rendererVersion: 16,
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
      await expect(response.text()).resolves.toContain("Invalid username or password.");
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

  function createEnv() {
    db = new DatabaseSync(":memory:");
    db.exec(migrationSql);

    return {
      DB: new SqliteD1(db),
      RENDER_CACHE: new MemoryKv(),
      SITE_NAME: "Test Wiki"
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
    createdAt = "2026-05-07T00:00:00.000Z"
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
      null,
      null,
      "Seed page",
      "create",
      content.length,
      createdAt
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
