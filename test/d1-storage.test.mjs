import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  D1AclStore,
  D1AuditLogStore,
  D1ChangelogStore,
  D1DraftStore,
  D1MediaStore,
  D1MetadataStore,
  D1PageStore,
  D1RenderedCacheStore,
  D1SearchStore,
  D1UserStore
} from "../src/storage/d1.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();

describe("D1 storage adapters", () => {
  let db;
  let d1;

  afterEach(() => {
    db?.close();
    db = undefined;
    d1 = undefined;
  });

  it("stores page records and revisions", async () => {
    d1 = createD1();
    const pages = new D1PageStore(d1);

    await pages.savePageRevision({
      id: "wiki:start@2026-05-07T00:00:00.000Z",
      pageId: "wiki:start",
      content: "====== Start ======",
      contentHash: "hash",
      authorId: "user-1",
      authorName: "Alice",
      summary: "create",
      changeType: "create",
      sizeChange: 17,
      createdAt: "2026-05-07T00:00:00.000Z"
    });

    await expect(pages.getPage("wiki:start")).resolves.toMatchObject({
      id: "wiki:start",
      namespace: "wiki",
      currentRevisionId: "wiki:start@2026-05-07T00:00:00.000Z",
      isDeleted: false
    });
    await expect(
      pages.getPageRevision("wiki:start@2026-05-07T00:00:00.000Z")
    ).resolves.toMatchObject({
      pageId: "wiki:start",
      contentHash: "hash",
      authorName: "Alice"
    });
    await expect(pages.listPageRevisions("wiki:start", 10)).resolves.toHaveLength(1);
  });

  it("stores media metadata and reads media revisions", async () => {
    d1 = createD1();
    const media = new D1MediaStore(d1);

    await media.saveMedia(
      {
        id: "wiki:logo.svg",
        namespace: "wiki",
        objectKey: "media/wiki/logo.svg",
        mimeType: "image/svg+xml",
        byteLength: 120,
        contentHash: "media-hash",
        currentRevisionId: "media-rev-1",
        isDeleted: false,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z"
      },
      new ArrayBuffer(0)
    );
    await d1
      .prepare(
        `insert into media_revisions (
           id, media_id, object_key, mime_type, byte_length, content_hash,
           author_id, summary, change_type, created_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "media-rev-1",
        "wiki:logo.svg",
        "media/wiki/logo.svg",
        "image/svg+xml",
        120,
        "media-hash",
        "user-1",
        "upload",
        "create",
        "2026-05-07T00:00:00.000Z"
      )
      .run();

    await expect(media.getMedia("wiki:logo.svg")).resolves.toMatchObject({
      id: "wiki:logo.svg",
      objectKey: "media/wiki/logo.svg",
      isDeleted: false
    });
    await expect(media.getMediaRevision("media-rev-1")).resolves.toMatchObject({
      mediaId: "wiki:logo.svg",
      authorId: "user-1"
    });
    await expect(media.listMediaRevisions("wiki:logo.svg", 10)).resolves.toHaveLength(1);
  });

  it("stores metadata, ACLs, users, drafts, changelog rows, and rendered cache rows", async () => {
    d1 = createD1();
    const metadata = new D1MetadataStore(d1);
    const acl = new D1AclStore(d1);
    const audit = new D1AuditLogStore(d1);
    const users = new D1UserStore(d1);
    const drafts = new D1DraftStore(d1);
    const changelog = new D1ChangelogStore(d1);
    const rendered = new D1RenderedCacheStore(d1);

    await metadata.putMetadata({
      subjectType: "page",
      subjectId: "wiki:start",
      key: "title",
      value: { title: "Start" },
      updatedAt: "2026-05-07T00:00:00.000Z"
    });
    await acl.putRule({
      id: "acl-1",
      scope: "wiki:*",
      principalType: "group",
      principal: "user",
      permission: 8,
      createdAt: "2026-05-07T00:00:00.000Z"
    });
    await users.putUser({
      id: "user-1",
      username: "alice",
      displayName: "Alice Example",
      email: "alice@example.test",
      passwordHash: "hash",
      isDisabled: false,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z"
    });
    await drafts.putDraft({
      id: "draft:wiki:start:anonymous",
      pageId: "wiki:start",
      userId: null,
      content: "draft",
      baseRevisionId: null,
      updatedAt: "2026-05-07T00:00:00.000Z"
    });
    await changelog.appendChange({
      id: "change-1",
      subjectType: "page",
      subjectId: "wiki:start",
      revisionId: "rev-1",
      userId: "user-1",
      userName: "Alice",
      ip: "203.0.113.10",
      changeType: "create",
      summary: "created",
      sizeChange: 5,
      createdAt: "2026-05-07T00:00:00.000Z"
    });
    await audit.appendEntry({
      id: "audit-1",
      actorId: "user-1",
      action: "acl_rule_upsert",
      targetType: "acl_rule",
      targetId: "acl-1",
      details: { scope: "wiki:*", permission: 8 },
      createdAt: "2026-05-07T00:00:00.000Z"
    });
    await rendered.putRendered({
      cacheKey: "page:wiki:start",
      subjectType: "page",
      subjectId: "wiki:start",
      revisionId: "rev-1",
      contentHash: "hash",
      renderedHtml: "<h1>Start</h1>",
      createdAt: "2026-05-07T00:00:00.000Z",
      expiresAt: null
    });

    await expect(metadata.getMetadata("page", "wiki:start")).resolves.toEqual([
      expect.objectContaining({ key: "title", value: { title: "Start" } })
    ]);
    await expect(acl.listRules("wiki:*")).resolves.toEqual([
      expect.objectContaining({ principalType: "group", principal: "user", permission: 8 })
    ]);
    await expect(acl.listAllRules()).resolves.toEqual([
      expect.objectContaining({ scope: "wiki:*", principalType: "group", principal: "user" })
    ]);
    await acl.deleteMatchingRules("wiki:*", "group", "user");
    await expect(acl.listAllRules()).resolves.toEqual([]);
    await acl.putRule({
      id: "acl-2",
      scope: "*",
      principalType: "all",
      principal: "@ALL",
      permission: 1,
      createdAt: "2026-05-07T00:00:00.000Z"
    });
    await acl.deleteRule("acl-2");
    await expect(acl.listAllRules()).resolves.toEqual([]);
    await expect(users.getUserByUsername("alice")).resolves.toMatchObject({
      id: "user-1",
      isDisabled: false
    });
    await expect(drafts.getDraft("draft:wiki:start:anonymous")).resolves.toMatchObject({
      content: "draft"
    });
    await expect(changelog.listChanges("page", "wiki:start", 10)).resolves.toEqual([
      expect.objectContaining({ userName: "Alice", ip: "203.0.113.10" })
    ]);
    await expect(audit.listEntries(10)).resolves.toEqual([
      expect.objectContaining({
        actorId: "user-1",
        action: "acl_rule_upsert",
        targetId: "acl-1",
        details: { scope: "wiki:*", permission: 8 }
      })
    ]);
    await expect(rendered.getRendered("page:wiki:start")).resolves.toMatchObject({
      renderedHtml: "<h1>Start</h1>"
    });

    await drafts.deleteDraft("draft:wiki:start:anonymous");
    await expect(drafts.getDraft("draft:wiki:start:anonymous")).resolves.toBeNull();
    await rendered.purgeSubject("page", "wiki:start");
    await expect(rendered.getRendered("page:wiki:start")).resolves.toBeNull();
  });

  it("indexes, searches, and deletes D1 search postings", async () => {
    d1 = createD1();
    const pages = new D1PageStore(d1);
    const search = new D1SearchStore(d1);

    await pages.savePageRevision({
      id: "wiki:start@2026-05-07T00:00:00.000Z",
      pageId: "wiki:start",
      content: "Start",
      contentHash: "hash",
      authorId: null,
      authorName: null,
      summary: "",
      changeType: "create",
      sizeChange: 5,
      createdAt: "2026-05-07T00:00:00.000Z"
    });

    await search.indexPage(
      "wiki:start",
      new Map([
        ["start", 4],
        ["wiki", 2]
      ]),
      "2026-05-07T00:00:00.000Z"
    );

    await expect(search.search(["wiki", "missing"], 10)).resolves.toEqual([
      { pageId: "wiki:start", frequency: 2, updatedAt: "2026-05-07T00:00:00.000Z" }
    ]);
    await expect(search.search([""], 10)).resolves.toEqual([]);
    expect(
      await d1
        .prepare("select document_count from search_terms where term = ?")
        .bind("start")
        .first()
    ).toMatchObject({ document_count: 1 });

    await search.deletePage("wiki:start");

    await expect(search.search(["start"], 10)).resolves.toEqual([]);
    await expect(
      d1.prepare("select document_count from search_terms where term = ?").bind("start").first()
    ).resolves.toBeNull();
  });

  function createD1() {
    db = new DatabaseSync(":memory:");
    db.exec(migrationSql);
    return new SqliteD1(db);
  }
});

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
