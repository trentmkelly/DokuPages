/* global FormData, performance, Request */

import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
const TEST_CSRF_TOKEN = "test-csrf-token";
let db;

describe("route performance guardrails", () => {
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("keeps warm page renders fast with bounded D1 and KV operations", async () => {
    const env = createEnv();
    await seedPage(env.DB);

    await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
    env.DB.resetCounts();
    env.RENDER_CACHE.resetCounts();

    const measured = await measure(() =>
      handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env)
    );

    expect(measured.response.status).toBe(200);
    expect(measured.durationMs).toBeLessThan(1000);
    expect(measured.cpuMs).toBeLessThan(500);
    expect(Math.abs(measured.heapDeltaBytes)).toBeLessThan(16 * 1024 * 1024);
    expect(env.DB.totalReads()).toBeLessThanOrEqual(6);
    expect(env.DB.counts.batch).toBe(0);
    expect(env.RENDER_CACHE.counts.get).toBeLessThanOrEqual(2);
    expect(env.RENDER_CACHE.counts.put).toBe(0);
  });

  it("keeps concurrent page read load within local route limits", async () => {
    const env = createEnv();
    await seedPage(env.DB);
    await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
    env.DB.resetCounts();
    env.RENDER_CACHE.resetCounts();

    const startedAt = performance.now();
    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env)
      )
    );
    const durationMs = performance.now() - startedAt;

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(durationMs).toBeLessThan(3000);
    expect(env.DB.totalReads()).toBeLessThanOrEqual(25 * 6);
    expect(env.RENDER_CACHE.counts.put).toBe(0);
  });

  it("keeps edit saves fast with bounded storage operations", async () => {
    const env = createEnv();
    await seedPage(env.DB);
    await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
    env.DB.resetCounts();
    env.RENDER_CACHE.resetCounts();

    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", `${pageContent()}\n\nSaved from route performance test.`);
    form.set("summary", "Route performance save");

    const measured = await measure(() =>
      handleRequest(
        new Request("https://example.com/api/pages", {
          method: "POST",
          body: form,
          headers: csrfHeaders()
        }),
        env
      )
    );

    expect(measured.response.status).toBe(303);
    expect(measured.response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(measured.durationMs).toBeLessThan(1000);
    expect(measured.cpuMs).toBeLessThan(500);
    expect(Math.abs(measured.heapDeltaBytes)).toBeLessThan(16 * 1024 * 1024);
    expect(env.DB.counts.batch).toBeLessThanOrEqual(4);
    expect(env.DB.totalReads()).toBeLessThanOrEqual(12);
    expect(env.RENDER_CACHE.counts.get).toBeLessThanOrEqual(4);
    expect(env.RENDER_CACHE.counts.put).toBeLessThanOrEqual(1);
    expect(env.RENDER_CACHE.counts.delete).toBeGreaterThanOrEqual(1);
  });
});

function createEnv() {
  db = new DatabaseSync(":memory:");
  db.exec(migrationSql);

  return {
    DB: new CountingSqliteD1(db),
    RENDER_CACHE: new CountingMemoryKv(),
    SITE_NAME: "Test Wiki"
  };
}

async function seedPage(d1) {
  const id = "wiki:welcome";
  const revisionId = "wiki:welcome@2026-05-07T00:00:00.000Z";
  const now = "2026-05-07T00:00:00.000Z";
  const content = pageContent();

  await d1
    .prepare(
      `insert into pages (
         id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, "wiki", "Welcome", revisionId, 0, now, now)
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
      "hash:welcome",
      null,
      null,
      "Seed page",
      "create",
      content.length,
      now
    )
    .run();
}

function pageContent() {
  return [
    "====== Welcome ======",
    "",
    "Imported page with representative syntax.",
    "",
    "===== Links =====",
    "",
    "[[wiki:syntax|Syntax page]] and https://www.dokuwiki.org/",
    "",
    "===== Table =====",
    "",
    "^ Header ^ Value ^",
    "| Alpha | Beta |",
    "| Gamma | Delta |",
    "",
    "===== List =====",
    "",
    "  * One",
    "  * Two",
    "  * Three"
  ].join("\n");
}

function csrfHeaders(headers = {}) {
  return {
    ...headers,
    cookie: headers.cookie
      ? `${headers.cookie}; DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`
      : `DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`,
    "x-csrf-token": TEST_CSRF_TOKEN
  };
}

async function measure(callback) {
  const startedAt = performance.now();
  const cpuStartedAt = process.cpuUsage();
  const heapStartedAt = process.memoryUsage().heapUsed;
  const response = await callback();
  const cpu = process.cpuUsage(cpuStartedAt);
  return {
    response,
    durationMs: performance.now() - startedAt,
    cpuMs: (cpu.user + cpu.system) / 1000,
    heapDeltaBytes: process.memoryUsage().heapUsed - heapStartedAt
  };
}

class CountingSqliteD1 {
  constructor(database) {
    this.database = database;
    this.resetCounts();
  }

  resetCounts() {
    this.counts = {
      first: 0,
      all: 0,
      run: 0,
      batch: 0
    };
  }

  totalReads() {
    return this.counts.first + this.counts.all;
  }

  prepare(sql) {
    return new CountingSqliteD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.counts.batch += 1;
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

class CountingSqliteD1PreparedStatement {
  constructor(d1, sql) {
    this.d1 = d1;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    this.d1.counts.first += 1;
    return this.d1.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    this.d1.counts.all += 1;
    return {
      results: this.d1.database.prepare(this.sql).all(...this.values)
    };
  }

  async run() {
    this.d1.counts.run += 1;
    this.d1.database.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}

class CountingMemoryKv {
  constructor() {
    this.values = new Map();
    this.resetCounts();
  }

  resetCounts() {
    this.counts = {
      get: 0,
      put: 0,
      delete: 0
    };
  }

  async get(key, type) {
    this.counts.get += 1;
    const value = this.values.get(key) ?? null;
    if (value && type === "json") return JSON.parse(value);
    return value;
  }

  async put(key, value) {
    this.counts.put += 1;
    this.values.set(key, value);
  }

  async delete(key) {
    this.counts.delete += 1;
    this.values.delete(key);
  }
}
