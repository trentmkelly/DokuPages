import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  D1AuditLogStore,
  D1ChangelogStore,
  D1MediaStore,
  D1PageStore,
  D1RenderedCacheStore,
  D1SearchStore
} from "../src/storage/d1.ts";
import { listMediaRevisions, listNamespaceMedia, searchMedia } from "../src/wiki/media-service.ts";
import {
  listAllPages,
  listNamespacePages,
  listPageRevisions,
  listRecentChanges,
  searchPages
} from "../src/wiki/page-service.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();

describe("storage performance guardrails", () => {
  let db;
  let d1;

  afterEach(() => {
    db?.close();
    db = undefined;
    d1 = undefined;
  });

  it("uses indexes for high-cardinality storage filters and pagination", () => {
    ({ db } = createDatabase());

    expectPlanUsesIndex(
      db,
      "page revision pagination",
      `select id, page_id, content, summary, change_type, size_change, created_at
       from page_revisions
       where page_id = ?
       order by created_at desc
       limit ? offset ?`,
      ["wiki:bulk", 100, 0],
      "idx_page_revisions_page_created"
    );
    expectPlanUsesIndex(
      db,
      "media revision pagination",
      `select id, media_id, object_key, mime_type, byte_length, content_hash,
              change_type, summary, created_at
       from media_revisions
       where media_id = ?
       order by created_at desc
       limit ?`,
      ["wiki:bulk.png", 100],
      "idx_media_revisions_media_created"
    );
    expectPlanUsesIndex(
      db,
      "recent changes feed",
      `select id, subject_id, revision_id, user_name, change_type, summary, size_change, created_at
       from changelog
       where subject_type = 'page'
       order by created_at desc
       limit ? offset ?`,
      [100, 0],
      "idx_changelog_type_created"
    );
    expectPlanUsesIndex(
      db,
      "namespace page listing",
      `select id, namespace, title, updated_at
       from pages
       where namespace = ? and is_deleted = 0
       order by id
       limit ? offset ?`,
      ["wiki", 500, 0],
      "idx_pages_namespace_deleted_id"
    );
    expectPlanUsesIndex(
      db,
      "all page listing",
      `select id, title, updated_at
       from pages
       where is_deleted = 0
       order by id
       limit ?`,
      [1000],
      "idx_pages_deleted_id"
    );
    expectPlanUsesIndex(
      db,
      "namespace media listing",
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, created_at, updated_at
       from media
       where namespace = ? and is_deleted = 0
       order by id asc
       limit ? offset ?`,
      ["wiki", 500, 0],
      "idx_media_namespace_deleted_id"
    );
    expectPlanUsesIndex(
      db,
      "search reindex term lookup",
      `select term
       from search_postings
       where page_id = ?`,
      ["wiki:bulk"],
      "idx_search_postings_page"
    );
    expectPlanUsesIndex(
      db,
      "rendered cache subject purge",
      `select cache_key
       from rendered_cache
       where subject_type = ? and subject_id = ?`,
      ["page", "wiki:bulk"],
      "idx_rendered_cache_subject"
    );
    expectPlanUsesIndex(
      db,
      "rendered cache dependency purge",
      `select cache_key
       from cache_dependencies
       where dependency_type = ? and dependency_id = ?`,
      ["media", "wiki:bulk.png"],
      "idx_cache_dependencies_subject"
    );
    expectPlanUsesIndex(
      db,
      "audit log pagination",
      `select id, actor_id, action, target_type, target_id, details_json, created_at
       from audit_log
       order by created_at desc, id desc
       limit ? offset ?`,
      [200, 0],
      "idx_audit_log_created"
    );
    expectPlanUsesIndex(
      db,
      "delete other sessions for password change",
      `select id
       from sessions
       where user_id = ? and id <> ?`,
      ["user-1", "session-1"],
      "idx_sessions_user"
    );
  });

  it("keeps paginated D1 reads to one bounded storage query", async () => {
    ({ db, d1 } = createDatabase());
    seedStorageDataset(db);

    await expectSingleRead(
      d1,
      "page-service revisions",
      () => listPageRevisions(d1, "wiki:bulk", 1000, 25),
      100
    );
    await expectSingleRead(
      d1,
      "D1PageStore revisions",
      () => new D1PageStore(d1).listPageRevisions("wiki:bulk", 1000),
      100
    );
    await expectSingleRead(
      d1,
      "media-service revisions",
      () => listMediaRevisions(d1, "wiki:bulk.png", 1000),
      100
    );
    await expectSingleRead(
      d1,
      "D1MediaStore revisions",
      () => new D1MediaStore(d1).listMediaRevisions("wiki:bulk.png", 1000),
      100
    );
    await expectSingleRead(d1, "recent changes", () => listRecentChanges(d1, 1000, 20), 100);
    await expectSingleRead(
      d1,
      "subject changelog",
      () => new D1ChangelogStore(d1).listChanges("page", "wiki:bulk", 1000),
      100
    );
    await expectSingleRead(d1, "audit log", () => new D1AuditLogStore(d1).listEntries(1000), 200);
    await expectSingleRead(
      d1,
      "namespace pages",
      () => listNamespacePages(d1, "wiki", 5000, 0),
      500
    );
    await expectSingleRead(d1, "all pages", () => listAllPages(d1, 5000), 551);
    await expectSingleRead(
      d1,
      "namespace media",
      () => listNamespaceMedia(d1, "wiki", 5000, 0),
      500
    );
    await expectSingleRead(d1, "media search", () => searchMedia(d1, "wiki", "image", 5000), 500);
    await expectSingleRead(
      d1,
      "page search",
      () => searchPages(d1, "alpha alpha", "wiki", 5000),
      50
    );
    await expectSingleRead(
      d1,
      "D1SearchStore search",
      () => new D1SearchStore(d1).search(["alpha", "alpha", ""], 1000),
      100
    );

    d1.resetCounts();
    await expect(new D1RenderedCacheStore(d1).getRendered("page:wiki:bulk")).resolves.toMatchObject(
      {
        subjectId: "wiki:bulk"
      }
    );
    expect(d1.counts).toMatchObject({ first: 1, all: 0, run: 0, batch: 0 });
  });

  it("keeps search index writes in one bounded D1 batch", async () => {
    ({ db, d1 } = createDatabase());
    seedCurrentPage(db, "wiki:indexed", "wiki", 1, "alpha beta gamma");
    const search = new D1SearchStore(d1);

    d1.resetCounts();
    await search.indexPage(
      "wiki:indexed",
      new Map([
        ["alpha", 3],
        ["beta", 2],
        ["gamma", 1],
        ["delta", 1],
        ["epsilon", 1]
      ]),
      timestamp(1)
    );
    expect(d1.counts).toMatchObject({ all: 1, batch: 1 });
    expect(d1.counts.batchStatements).toEqual([17]);

    d1.resetCounts();
    await search.deletePage("wiki:indexed");
    expect(d1.counts).toMatchObject({ all: 1, batch: 1 });
    expect(d1.counts.batchStatements).toEqual([7]);
  });
});

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(migrationSql);
  return { db: database, d1: new CountingSqliteD1(database) };
}

function expectPlanUsesIndex(db, name, sql, params, indexName) {
  const plan = explainQueryPlan(db, sql, params);

  expect(plan, `${name} query plan:\n${plan}`).toContain(indexName);
}

function explainQueryPlan(db, sql, params) {
  return db
    .prepare(`explain query plan ${sql}`)
    .all(...params)
    .map((row) => row.detail)
    .join("\n");
}

async function expectSingleRead(d1, name, action, expectedLength) {
  d1.resetCounts();

  const rows = await action();

  expect(rows, name).toHaveLength(expectedLength);
  expect(d1.counts, name).toMatchObject({ first: 0, all: 1, run: 0, batch: 0 });
}

function seedStorageDataset(db) {
  seedPageRevisions(db, "wiki:bulk", 130);
  seedMediaRevisions(db, "wiki:bulk.png", 130);
  seedChangelog(db, 130);
  seedAuditLog(db, 250);
  seedRenderedCache(db);

  for (let index = 0; index < 550; index += 1) {
    seedCurrentPage(db, `wiki:page_${index.toString().padStart(3, "0")}`, "wiki", index, "alpha");
    seedCurrentMedia(db, `wiki:image_${index.toString().padStart(3, "0")}.png`, "wiki", index);
  }

  seedSearchPostings(db, 120);
}

function seedPageRevisions(db, pageId, revisionCount) {
  seedCurrentPage(db, pageId, namespaceForId(pageId), 0, "alpha");

  const insertRevision = db.prepare(
    `insert into page_revisions (
       id, page_id, content, content_hash, author_id, author_name, summary,
       change_type, size_change, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 1; index <= revisionCount; index += 1) {
    insertRevision.run(
      `${pageId}@${index}`,
      pageId,
      `revision ${index}`,
      `hash-${index}`,
      null,
      null,
      `revision ${index}`,
      index === 1 ? "create" : "edit",
      index,
      timestamp(index)
    );
  }

  db.prepare("update pages set current_revision_id = ?, updated_at = ? where id = ?").run(
    `${pageId}@${revisionCount}`,
    timestamp(revisionCount),
    pageId
  );
}

function seedCurrentPage(db, pageId, namespace, index, content = "alpha") {
  const revisionId = `${pageId}@current`;
  const createdAt = timestamp(index);

  db.prepare(
    `insert or ignore into pages (
       id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(pageId, namespace, pageId.split(":").at(-1), revisionId, 0, createdAt, createdAt);
  db.prepare(
    `insert or ignore into page_revisions (
       id, page_id, content, content_hash, author_id, author_name, summary,
       change_type, size_change, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    revisionId,
    pageId,
    content,
    `hash-${pageId}`,
    null,
    null,
    "current",
    "create",
    1,
    createdAt
  );
  db.prepare("update pages set current_revision_id = ?, updated_at = ? where id = ?").run(
    revisionId,
    createdAt,
    pageId
  );
}

function seedMediaRevisions(db, mediaId, revisionCount) {
  seedCurrentMedia(db, mediaId, namespaceForId(mediaId), 0);

  const insertRevision = db.prepare(
    `insert into media_revisions (
       id, media_id, object_key, mime_type, byte_length, content_hash,
       author_id, summary, change_type, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 1; index <= revisionCount; index += 1) {
    insertRevision.run(
      `${mediaId}@${index}`,
      mediaId,
      `media/${mediaId.replaceAll(":", "/")}.${index}`,
      "image/png",
      index,
      `media-hash-${index}`,
      null,
      `revision ${index}`,
      index === 1 ? "create" : "edit",
      timestamp(index)
    );
  }
}

function seedCurrentMedia(db, mediaId, namespace, index) {
  const revisionId = `${mediaId}@current`;
  const createdAt = timestamp(index);

  db.prepare(
    `insert or ignore into media (
       id, namespace, object_key, mime_type, byte_length, content_hash,
       current_revision_id, is_deleted, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    mediaId,
    namespace,
    `media/${mediaId.replaceAll(":", "/")}`,
    "image/png",
    1024 + index,
    `media-hash-${mediaId}`,
    revisionId,
    0,
    createdAt,
    createdAt
  );
}

function seedChangelog(db, count) {
  const insert = db.prepare(
    `insert into changelog (
       id, subject_type, subject_id, revision_id, user_id, user_name, ip,
       change_type, summary, size_change, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 0; index < count; index += 1) {
    insert.run(
      `change-${index}`,
      "page",
      "wiki:bulk",
      `wiki:bulk@${index + 1}`,
      null,
      null,
      "203.0.113.10",
      "edit",
      `change ${index}`,
      index,
      timestamp(index)
    );
  }
}

function seedAuditLog(db, count) {
  const insert = db.prepare(
    `insert into audit_log (
       id, actor_id, action, target_type, target_id, details_json, created_at
     ) values (?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 0; index < count; index += 1) {
    insert.run(
      `audit-${index.toString().padStart(3, "0")}`,
      null,
      "storage_perf",
      "page",
      "wiki:bulk",
      "{}",
      timestamp(index)
    );
  }
}

function seedRenderedCache(db) {
  db.prepare(
    `insert into rendered_cache (
       cache_key, subject_type, subject_id, revision_id, content_hash,
       rendered_html, created_at, expires_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "page:wiki:bulk",
    "page",
    "wiki:bulk",
    "wiki:bulk@130",
    "hash",
    "<h1>Bulk</h1>",
    timestamp(1),
    null
  );
}

function seedSearchPostings(db, count) {
  db.prepare("insert into search_terms (term, document_count) values (?, ?)").run("alpha", count);
  db.prepare("insert into search_terms (term, document_count) values (?, ?)").run("beta", count);

  const insert = db.prepare(
    "insert into search_postings (term, page_id, frequency, updated_at) values (?, ?, ?, ?)"
  );

  for (let index = 0; index < count; index += 1) {
    const pageId = `wiki:page_${index.toString().padStart(3, "0")}`;
    insert.run("alpha", pageId, count - index, timestamp(index));
    insert.run("beta", pageId, 1, timestamp(index));
  }
}

function namespaceForId(id) {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
}

function timestamp(index) {
  return new Date(Date.UTC(2026, 4, 7, 0, index, 0)).toISOString();
}

class CountingSqliteD1 {
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
      batch: 0,
      batchStatements: []
    };
  }

  prepare(sql) {
    this.counts.prepare += 1;
    return new CountingSqliteD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.counts.batch += 1;
    this.counts.batchStatements.push(statements.length);
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
