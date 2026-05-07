import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { D1SearchStore } from "../src/storage/d1.ts";
import { searchPages } from "../src/wiki/page-service.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();

describe("search performance guardrails", () => {
  let db;
  let d1;

  afterEach(() => {
    db?.close();
    db = undefined;
    d1 = undefined;
  });

  it("uses indexed plans and one D1 read for page search", async () => {
    ({ db, d1 } = createSearchDatabase());

    const results = await searchPages(d1, "alpha beta", "wiki", 5000);

    expect(results).toHaveLength(50);
    expect(d1.counts).toMatchObject({ first: 0, all: 1, run: 0, batch: 0 });
    expect(d1.lastAll?.values).toHaveLength(4);

    const plan = explainCapturedAllQuery(db, d1);
    expect(plan).toContain("idx_pages_namespace_deleted_id");
    expect(plan).toContain("sqlite_autoindex_page_revisions_1");
    expect(plan).toContain("sqlite_autoindex_search_postings_1");
    expect(plan).not.toContain("SCAN search_postings");
    expect(plan).not.toContain("SCAN pages");
  });

  it("keeps all-namespace page search on deleted-page and posting indexes", async () => {
    ({ db, d1 } = createSearchDatabase());

    const results = await searchPages(d1, "alpha beta", "", 50);

    expect(results).toHaveLength(50);
    expect(d1.counts).toMatchObject({ first: 0, all: 1, run: 0, batch: 0 });

    const plan = explainCapturedAllQuery(db, d1);
    expect(plan).toContain("idx_pages_deleted_id");
    expect(plan).toContain("sqlite_autoindex_page_revisions_1");
    expect(plan).toContain("sqlite_autoindex_search_postings_1");
    expect(plan).not.toContain("SCAN search_postings");
    expect(plan).not.toContain("SCAN pages");
  });

  it("bounds raw posting search terms and result size", async () => {
    ({ db, d1 } = createSearchDatabase());

    const hits = await new D1SearchStore(d1).search(["alpha", "alpha", "beta", "", "   "], 5000);

    expect(hits).toHaveLength(100);
    expect(d1.counts).toMatchObject({ first: 0, all: 1, run: 0, batch: 0 });
    expect(d1.lastAll?.values).toEqual(["alpha", "beta", 100]);

    const plan = explainCapturedAllQuery(db, d1);
    expect(plan).toContain("sqlite_autoindex_search_postings_1");
    expect(plan).not.toContain("SCAN search_postings");
  });
});

function createSearchDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(migrationSql);
  seedSearchCorpus(database);
  return { db: database, d1: new CapturingSqliteD1(database) };
}

function seedSearchCorpus(db) {
  const insertPage = db.prepare(
    `insert into pages (
       id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
     ) values (?, ?, ?, ?, 0, ?, ?)`
  );
  const insertRevision = db.prepare(
    `insert into page_revisions (
       id, page_id, content, content_hash, author_id, author_name, summary,
       change_type, size_change, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPosting = db.prepare(
    "insert into search_postings (term, page_id, frequency, updated_at) values (?, ?, ?, ?)"
  );

  db.prepare("insert into search_terms (term, document_count) values (?, ?)").run("alpha", 650);
  db.prepare("insert into search_terms (term, document_count) values (?, ?)").run("beta", 650);

  for (let index = 0; index < 650; index += 1) {
    const namespace = index < 550 ? "wiki" : "private";
    const pageId = `${namespace}:page_${index.toString().padStart(3, "0")}`;
    const revisionId = `${pageId}@current`;
    const createdAt = timestamp(index);

    insertPage.run(pageId, namespace, `Page ${index}`, revisionId, createdAt, createdAt);
    insertRevision.run(
      revisionId,
      pageId,
      `alpha beta page ${index}`,
      `hash-${index}`,
      null,
      null,
      "current",
      "create",
      20,
      createdAt
    );
    insertPosting.run("alpha", pageId, 1000 - index, createdAt);
    insertPosting.run("beta", pageId, 1, createdAt);
  }
}

function explainCapturedAllQuery(db, d1) {
  const captured = d1.lastAll;
  expect(captured).toBeTruthy();

  return db
    .prepare(`explain query plan ${captured.sql}`)
    .all(...captured.values)
    .map((row) => row.detail)
    .join("\n");
}

function timestamp(index) {
  return new Date(Date.UTC(2026, 4, 7, 0, index, 0)).toISOString();
}

class CapturingSqliteD1 {
  constructor(database) {
    this.database = database;
    this.resetCounts();
  }

  resetCounts() {
    this.counts = {
      prepare: 0,
      first: 0,
      all: 0,
      run: 0,
      batch: 0
    };
    this.lastAll = null;
  }

  prepare(sql) {
    this.counts.prepare += 1;
    return new CapturingSqliteD1PreparedStatement(this, sql);
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

class CapturingSqliteD1PreparedStatement {
  constructor(d1, sql) {
    this.d1 = d1;
    this.database = d1.database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    this.d1.counts.first += 1;
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    this.d1.counts.all += 1;
    this.d1.lastAll = {
      sql: this.sql,
      values: this.values
    };
    return {
      results: this.database.prepare(this.sql).all(...this.values)
    };
  }

  async run() {
    this.d1.counts.run += 1;
    this.database.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}
