/* global Request */

import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
let db;

describe("accessibility surface", () => {
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("renders keyboard and screen-reader landmarks in the wiki shell", async () => {
    const env = createEnv();
    await seedPage(env.DB);

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<a href="#dokuwiki__content">skip to content</a>');
    expect(html).toContain('<main id="dokuwiki__content">');
    expect(html).toContain('<nav id="dokuwiki__usertools" aria-label="User Tools">');
    expect(html).toContain('<nav id="dokuwiki__sitetools" aria-label="Site Tools">');
    expect(html).toContain('<label class="a11y" for="qsearch__in">Search</label>');
    expect(html).toContain('<input id="qsearch__in" name="q" type="search"');
    expect(html).toContain(
      '<a href="/media-manager?ns=wiki" title="Media Manager" rel="nofollow">Media Manager</a>'
    );
    expect(html).toContain(
      '<a href="/index?ns=wiki" title="Sitemap [x]" rel="nofollow" accesskey="x">Sitemap</a>'
    );
    expect(html).toContain('<label class="a11y" for="mobile__tools">Tools</label>');
    expect(html).toContain('<option value="/media-manager?ns=wiki">Media Manager</option>');
    expect(html).toContain(
      '<nav id="dokuwiki__pagetools" aria-labelledby="dokuwiki__pagetools__heading">'
    );
    expect(html).toContain('id="dokuwiki__pagetools__heading">Page Tools</h3>');
    expect(html).toContain('aria-label="Edit this page"');
    expect(html).toContain('aria-label="Old revisions"');
    expect(html).toContain('aria-label="Backlinks"');
    expect(html).toContain('aria-label="Back to top"');
  });

  it("keeps the skip link available when it receives keyboard focus", async () => {
    const css = await readFile("public/dokuwiki.css", "utf8");

    expect(css).toContain(".a11y.skip:focus-within");
    expect(css).toContain(".a11y.skip a:focus");
  });
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

async function seedPage(d1) {
  const id = "wiki:welcome";
  const revisionId = "wiki:welcome@2026-05-07T00:00:00.000Z";
  const now = "2026-05-07T00:00:00.000Z";
  const content = "====== Welcome ======\n\nImported page.";

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
    .bind(revisionId, id, content, "hash:welcome", null, null, "Seed page", "create", 0, now)
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
}
