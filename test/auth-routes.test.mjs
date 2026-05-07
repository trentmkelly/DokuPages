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
    await expect(response.text()).resolves.toContain('id="dw__login"');
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
        body: login
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
        headers: { cookie }
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

  it("rejects invalid logins without setting a session cookie", async () => {
    env = createEnv();
    await seedUser(env.DB);
    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "wrong");

    const response = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login
      }),
      env
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.text()).resolves.toContain("Invalid username or password.");
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
