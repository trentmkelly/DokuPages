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
      RENDER_CACHE: {
        get: async () => null,
        put: async () => undefined,
        delete: async () => undefined
      },
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

async function seedUser(d1) {
  const now = "2026-05-07T00:00:00.000Z";
  const passwordHash = await hashPassword("correct horse battery staple", {
    iterations: 1_000,
    salt: new Uint8Array(16).fill(9)
  });

  await d1
    .prepare(
      `insert into users (
         id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind("user-1", "alice", "Alice Example", "alice@example.test", passwordHash, 0, now, now)
    .run();
  await d1
    .prepare("insert into groups (id, name, created_at) values (?, ?, ?)")
    .bind("g1", "user", now)
    .run();
  await d1
    .prepare("insert into groups (id, name, created_at) values (?, ?, ?)")
    .bind("g2", "admin", now)
    .run();
  await d1
    .prepare("insert into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
    .bind("user-1", "g1", now)
    .run();
  await d1
    .prepare("insert into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
    .bind("user-1", "g2", now)
    .run();
}

async function loginAsAlice(env) {
  const login = new FormData();
  login.set("username", "alice");
  login.set("password", "correct horse battery staple");

  const response = await handleRequest(
    new Request("https://example.com/api/auth/login", {
      method: "POST",
      body: login,
      headers: csrfHeaders()
    }),
    env
  );

  return response.headers.get("set-cookie") ?? "";
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
