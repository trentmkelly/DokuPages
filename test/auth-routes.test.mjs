/* global FormData, Request */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { hashPassword } from "../src/auth/password.ts";

const migrationSql = readFileSync(
  fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url)),
  "utf8"
);
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

  it("logs in native users, resolves the session principal, and logs out", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");
    login.set("returnTo", "/wiki/wiki/welcome");

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

    expect(anonymous.status).toBe(403);
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("/admin");
    expect(dashboard.status).toBe(200);
    await expect(dashboard.text()).resolves.toContain("Administration");
    expect(acl.status).toBe(403);
  });

  it("rejects invalid logins without setting a session cookie", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "wrong");

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
}
