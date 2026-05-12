/* global Request */

import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
let db;

const UPSTREAM_TEMPLATE_FILES = [
  "../dokuwiki/lib/tpl/dokuwiki/main.php",
  "../dokuwiki/lib/tpl/dokuwiki/tpl_header.php",
  "../dokuwiki/lib/tpl/dokuwiki/tpl_footer.php"
];

const UPSTREAM_SHELL_MARKERS = [
  "dokuwiki__site",
  "dokuwiki__top",
  "dokuwiki__header",
  "a11y skip",
  "dokuwiki__usertools",
  "dokuwiki__sitetools",
  "breadcrumbs",
  "wrapper group",
  "dokuwiki__content",
  "page group",
  "dokuwiki__pagetools",
  "dokuwiki__footer",
  "buttons"
];

const PAGE_MODE_CASES = [
  ["show", "/wiki/wiki/welcome"],
  ["edit", "/wiki/wiki/welcome?do=edit"],
  ["revisions", "/wiki/wiki/welcome?do=revisions"],
  ["diff", "/wiki/wiki/welcome?do=diff"],
  ["recent", "/recent"],
  ["search", "/search?q=welcome"],
  ["index", "/index?ns=wiki"],
  ["backlink", "/wiki/wiki/welcome?do=backlink"],
  ["login", "/login"],
  ["register", "/register"],
  ["media", "/media-manager?ns=wiki"]
];

describe("DokuWiki template shell parity", () => {
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("keeps the Pages shell landmarks aligned with upstream main.php", async () => {
    const upstream = await readUpstreamTemplateSource();

    for (const marker of UPSTREAM_SHELL_MARKERS) {
      expect(upstream, marker).toContain(marker);
    }
  });

  it.each(PAGE_MODE_CASES)(
    "renders upstream-style shell structure for mode_%s",
    async (mode, path) => {
      const env = createEnv();
      await seedTemplateShellData(env.DB);

      const response = await handleRequest(new Request(`https://example.com${path}`), env);

      expect(response.status, path).toBe(200);
      const html = await response.text();
      expect(html).toContain(`class="site dokuwiki mode_${mode} tpl_dokuwiki`);
      assertInOrder(html, [
        'id="dokuwiki__site"',
        'id="dokuwiki__top"',
        'id="dokuwiki__header"',
        'class="a11y skip"',
        'id="dokuwiki__usertools"',
        'id="dokuwiki__sitetools"',
        'class="breadcrumbs"',
        'class="wrapper group"',
        'id="dokuwiki__content"',
        'class="page group"',
        'id="dokuwiki__footer"',
        'class="buttons"'
      ]);
    }
  );
});

async function readUpstreamTemplateSource() {
  const files = await Promise.all(UPSTREAM_TEMPLATE_FILES.map((file) => readFile(file, "utf8")));
  return files.join("\n");
}

function createEnv() {
  db = new DatabaseSync(":memory:");
  db.exec(migrationSql);

  return {
    DB: new SqliteD1(db),
    RENDER_CACHE: new MemoryKv(),
    SITE_NAME: "Test Wiki",
    DOKUWIKI_COOKIE_SALT: "template-shell-test-salt"
  };
}

async function seedTemplateShellData(d1) {
  const id = "wiki:welcome";
  const currentRevisionId = "wiki:welcome@2026-05-07T00:00:00.000Z";
  const oldRevisionId = "wiki:welcome@2026-05-06T00:00:00.000Z";
  const now = "2026-05-07T00:00:00.000Z";
  const old = "2026-05-06T00:00:00.000Z";

  await d1
    .prepare(
      `insert into pages (
         id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, "wiki", "Welcome", currentRevisionId, 0, old, now)
    .run();
  await d1
    .prepare(
      `insert into page_revisions (
         id, page_id, content, content_hash, author_id, author_name, summary,
         change_type, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      oldRevisionId,
      id,
      "====== Welcome ======\n\nOlder page.",
      "hash:old",
      null,
      null,
      "Older page",
      "edit",
      32,
      old
    )
    .run();
  await d1
    .prepare(
      `insert into page_revisions (
         id, page_id, content, content_hash, author_id, author_name, summary,
         change_type, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      currentRevisionId,
      id,
      "====== Welcome ======\n\nImported page.",
      "hash:welcome",
      null,
      null,
      "Seed page",
      "create",
      38,
      now
    )
    .run();
  await d1
    .prepare(
      `insert into changelog (
         id, subject_type, subject_id, revision_id, user_id, user_name, ip,
         change_type, summary, size_change, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      `page:${currentRevisionId}`,
      "page",
      id,
      currentRevisionId,
      null,
      "Seeder",
      "127.0.0.1",
      "create",
      "Seed page",
      38,
      now
    )
    .run();
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
      "media-hash",
      "media-rev-current",
      0,
      now,
      now
    )
    .run();
}

function assertInOrder(value, markers) {
  let lastIndex = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    expect(index, marker).toBeGreaterThan(lastIndex);
    lastIndex = index;
  }
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

  async get(key, type) {
    const value = this.values.get(key) ?? null;
    if (value && type === "json") return JSON.parse(value);
    return value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list() {
    return { keys: [], list_complete: true, cursor: undefined };
  }
}
