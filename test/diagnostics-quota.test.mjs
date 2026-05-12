import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { collectDiagnostics } from "../src/http/diagnostics.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
let db;

describe("Cloudflare quota diagnostics", () => {
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("reports unconfigured quota budgets without making diagnostics unhealthy", async () => {
    const env = createEnv();
    seedQuotaData(db);

    const diagnostics = await collectDiagnostics(env);

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.quotas).toMatchObject({
      d1Logical: {
        ok: true,
        status: "unconfigured",
        thresholdBytes: null,
        usageBytes: expect.any(Number)
      },
      r2Referenced: {
        ok: true,
        status: "unconfigured",
        usageBytes: 96
      },
      renderedCache: {
        ok: true,
        status: "unconfigured",
        usageBytes: 18
      }
    });
  });

  it("warns when configured Cloudflare storage budgets are exceeded", async () => {
    const env = createEnv({
      QUOTA_D1_LOGICAL_WARN_BYTES: "1",
      QUOTA_R2_REFERENCED_WARN_BYTES: "50",
      QUOTA_RENDER_CACHE_WARN_BYTES: "10"
    });
    seedQuotaData(db);

    const diagnostics = await collectDiagnostics(env);

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.quotas).toMatchObject({
      d1Logical: {
        ok: false,
        status: "warning",
        thresholdBytes: 1,
        details: expect.objectContaining({
          pageCount: 1,
          pageRevisionCount: 1,
          metadataCount: 1,
          searchPostingCount: 1
        })
      },
      r2Referenced: {
        ok: false,
        status: "warning",
        usageBytes: 96,
        thresholdBytes: 50,
        details: { objectCount: 1 }
      },
      renderedCache: {
        ok: false,
        status: "warning",
        usageBytes: 18,
        thresholdBytes: 10,
        details: { entryCount: 1 }
      }
    });
  });
});

function createEnv(overrides = {}) {
  db = new DatabaseSync(":memory:");
  db.exec(migrationSql);

  return {
    DB: new SqliteD1(db),
    RENDER_CACHE: {
      get: async () => null
    },
    MEDIA_BUCKET: {
      head: async () => null
    },
    PAGE_LOCKS: {},
    ...overrides
  };
}

function seedQuotaData(database) {
  database
    .prepare(
      `insert into pages (
         id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "wiki:start",
      "wiki",
      "Start",
      "wiki:start@2026-05-12T00:00:00.000Z",
      0,
      "2026-05-12T00:00:00.000Z",
      "2026-05-12T00:00:00.000Z"
    );
  database
    .prepare(
      `insert into page_revisions (
         id, page_id, content, content_hash, author_id, author_name, summary,
         change_type, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "wiki:start@2026-05-12T00:00:00.000Z",
      "wiki:start",
      "====== Start ======\nBody",
      "hash",
      null,
      null,
      "create",
      "create",
      22,
      "2026-05-12T00:00:00.000Z"
    );
  database
    .prepare(
      `insert into metadata (
         subject_type, subject_id, key, value_json, updated_at
       ) values (?, ?, ?, ?, ?)`
    )
    .run("page", "wiki:start", "description", '{"title":"Start"}', "2026-05-12T00:00:00.000Z");
  database
    .prepare(
      `insert into rendered_cache (
         cache_key, subject_type, subject_id, revision_id, content_hash,
         rendered_html, created_at, expires_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "page:wiki:start",
      "page",
      "wiki:start",
      "wiki:start@2026-05-12T00:00:00.000Z",
      "hash",
      "<h1>Start</h1>Body",
      "2026-05-12T00:00:00.000Z",
      null
    );
  database
    .prepare(
      `insert into media (
         id, namespace, object_key, mime_type, byte_length, content_hash,
         current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "wiki:logo.svg",
      "wiki",
      "media/current/wiki/logo.svg",
      "image/svg+xml",
      96,
      "media-hash",
      "media-rev-1",
      0,
      "2026-05-12T00:00:00.000Z",
      "2026-05-12T00:00:00.000Z"
    );
  database
    .prepare(
      `insert into media_revisions (
         id, media_id, object_key, mime_type, byte_length, content_hash,
         author_id, summary, change_type, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "media-rev-1",
      "wiki:logo.svg",
      "media/current/wiki/logo.svg",
      "image/svg+xml",
      96,
      "media-hash",
      null,
      "upload",
      "create",
      "2026-05-12T00:00:00.000Z"
    );
  database.prepare("insert into search_terms (term, document_count) values (?, ?)").run("start", 1);
  database
    .prepare(
      "insert into search_postings (term, page_id, frequency, updated_at) values (?, ?, ?, ?)"
    )
    .run("start", "wiki:start", 1, "2026-05-12T00:00:00.000Z");
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
