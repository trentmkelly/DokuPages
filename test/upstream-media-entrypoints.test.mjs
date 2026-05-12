/* global fetch, Request, Response, setTimeout */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { readMigrationSql } from "./support/migrations.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const upstreamRoot = resolve(repoRoot, "../dokuwiki");
const upstreamInit = resolve(upstreamRoot, "inc/init.php");
const phpAvailable = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;
const upstreamAvailable = phpAvailable && existsSync(upstreamInit);
const migrationSql = readMigrationSql();
const mediaFixtures = [
  {
    id: "wiki:dokuwiki.svg",
    namespace: "wiki",
    mimeType: "image/svg+xml",
    path: resolve(upstreamRoot, "data/media/wiki/dokuwiki.svg")
  },
  {
    id: "wiki:dokuwiki-128.png",
    namespace: "wiki",
    mimeType: "image/png",
    path: resolve(upstreamRoot, "data/media/wiki/dokuwiki-128.png")
  }
];

describe("upstream media entrypoint parity", () => {
  let upstreamServer;

  beforeAll(async () => {
    if (!upstreamAvailable) return;
    upstreamServer = await startUpstreamServer();
  });

  afterAll(() => {
    upstreamServer?.stop();
  });

  it.skipIf(!upstreamAvailable)(
    "matches upstream fetch.php delivery for current media",
    async () => {
      const env = createEnv();
      const upstream = await fetch(
        `${upstreamServer.url}/lib/exe/fetch.php?media=wiki:dokuwiki.svg`
      );
      const native = await handleRequest(
        new Request("https://example.com/media/wiki/dokuwiki.svg"),
        env
      );

      expect(native.status).toBe(upstream.status);
      expect(native.headers.get("content-type")).toBe(upstream.headers.get("content-type"));
      expect(contentDispositionSignature(native.headers)).toEqual(
        contentDispositionSignature(upstream.headers)
      );
      expect(cacheSignature(native.headers)).toEqual(cacheSignature(upstream.headers));
      expect(Buffer.from(await native.arrayBuffer())).toEqual(
        Buffer.from(await upstream.arrayBuffer())
      );
    }
  );

  it.skipIf(!upstreamAvailable)("matches upstream detail.php detail-page structure", async () => {
    const env = createEnv();
    const upstream = await fetch(
      `${upstreamServer.url}/lib/exe/detail.php?media=wiki:dokuwiki.svg&id=wiki:syntax`
    );
    const native = await handleRequest(
      new Request("https://example.com/media-detail/wiki/dokuwiki.svg"),
      env
    );

    expect(native.status).toBe(upstream.status);
    expect(detailSignature(await native.text())).toEqual(detailSignature(await upstream.text()));
  });

  it.skipIf(!upstreamAvailable)("matches upstream mediamanager.php browser structure", async () => {
    const env = createEnv();
    const upstream = await fetch(`${upstreamServer.url}/lib/exe/mediamanager.php?ns=wiki`);
    const native = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki"),
      env
    );

    expect(native.status).toBe(upstream.status);
    expect(mediaManagerSignature(await native.text())).toEqual(
      mediaManagerSignature(await upstream.text())
    );
  });
});

function createEnv() {
  const database = new DatabaseSync(":memory:");
  database.exec(migrationSql);
  const db = new SqliteD1(database);
  seedAcl(db);
  seedPage(db);
  seedMedia(db);

  return {
    DB: db,
    MEDIA_BUCKET: new MemoryR2(mediaFixtures),
    RENDER_CACHE: new MemoryKv(),
    SITE_NAME: "DokuWiki",
    DOKUWIKI_COOKIE_SALT: "test-dokuwiki-cookie-salt"
  };
}

function seedAcl(db) {
  db.prepare(
    `insert into acl_rules (id, scope, principal_type, principal, permission, created_at)
     values (?, ?, ?, ?, ?, ?)`
  )
    .bind("acl:*:@ALL", "*", "all", "@ALL", 16, "2026-05-07T00:00:00.000Z")
    .run();
}

function seedPage(db) {
  db.prepare(
    `insert into pages (id, namespace, title, current_revision_id, is_deleted, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      "wiki:syntax",
      "wiki",
      "Syntax",
      "wiki:syntax@2026-05-07T00:00:00.000Z",
      0,
      "2026-05-07T00:00:00.000Z",
      "2026-05-07T00:00:00.000Z"
    )
    .run();
  db.prepare(
    `insert into page_revisions (
       id, page_id, content, content_hash, author_id, author_name, summary,
       change_type, size_change, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      "wiki:syntax@2026-05-07T00:00:00.000Z",
      "wiki:syntax",
      "====== Syntax ======\n\n{{wiki:dokuwiki.svg}}",
      "hash:wiki:syntax",
      null,
      null,
      "Seed page",
      "create",
      39,
      "2026-05-07T00:00:00.000Z"
    )
    .run();
  db.prepare(
    `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
     values (?, ?, ?, ?, ?)`
  )
    .bind(
      "page",
      "wiki:syntax",
      "relation",
      JSON.stringify({ media: { "wiki:dokuwiki.svg": true } }),
      "2026-05-07T00:00:00.000Z"
    )
    .run();
}

function seedMedia(db) {
  for (const fixture of mediaFixtures) {
    const bytes = readFileSync(fixture.path);
    const stat = statSync(fixture.path);
    const timestamp = stat.mtime.toISOString();
    const revisionId = `${fixture.id}@${Math.floor(stat.mtimeMs / 1000)}`;
    const objectKey = `media/current/${fixture.id.replaceAll(":", "/")}`;

    db.prepare(
      `insert into media (
         id, namespace, object_key, mime_type, byte_length, content_hash,
         current_revision_id, is_deleted, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        fixture.id,
        fixture.namespace,
        objectKey,
        fixture.mimeType,
        bytes.byteLength,
        createHash("md5").update(bytes).digest("hex"),
        revisionId,
        0,
        timestamp,
        timestamp
      )
      .run();

    db.prepare(
      `insert into media_revisions (
         id, media_id, object_key, mime_type, byte_length, content_hash,
         author_id, summary, change_type, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        revisionId,
        fixture.id,
        objectKey,
        fixture.mimeType,
        bytes.byteLength,
        createHash("md5").update(bytes).digest("hex"),
        null,
        "Seed media",
        "create",
        timestamp
      )
      .run();
  }
}

async function startUpstreamServer() {
  const port = await getAvailablePort();
  const stderr = [];
  const child = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", upstreamRoot], {
    cwd: upstreamRoot,
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const url = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Upstream PHP server exited early:\n${stderr.join("")}`);
    }

    try {
      const response = await fetch(`${url}/lib/exe/fetch.php?media=wiki:dokuwiki.svg`, {
        method: "HEAD"
      });
      if (response.ok) {
        return {
          url,
          stop: () => child.kill()
        };
      }
    } catch {
      // Retry until PHP's built-in server starts accepting connections.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  child.kill();
  throw new Error(`Timed out starting upstream PHP server:\n${stderr.join("")}`);
}

function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a local port"));
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function contentDispositionSignature(headers) {
  const value = headers.get("content-disposition") ?? "";
  return {
    disposition: value.split(";", 1)[0],
    filename: value.match(/filename="?([^";]+)"?/)?.[1] ?? ""
  };
}

function cacheSignature(headers) {
  const cache = headers.get("cache-control") ?? "";
  return {
    public: cache.includes("public"),
    proxyRevalidate: cache.includes("proxy-revalidate"),
    noTransform: cache.includes("no-transform"),
    maxAge: cache.match(/max-age=(\d+)/)?.[1] ?? ""
  };
}

function detailSignature(html) {
  const links = mediaLinks(html);
  return {
    root: hasId(html, "dokuwiki__detail"),
    preview: hasClass(html, "img_detail"),
    mediaId: html.includes("wiki:dokuwiki.svg"),
    originalLink: links.includes("/media/wiki/dokuwiki.svg")
  };
}

function mediaManagerSignature(html) {
  return {
    root: hasId(html, "media__manager"),
    aside: hasId(html, "mediamgr__aside"),
    content: hasId(html, "mediamgr__content"),
    tree: hasId(html, "media__tree"),
    files: hasId(html, "media__content"),
    uploadForm: hasId(html, "dw__upload"),
    uploadFile: hasId(html, "upload__file"),
    uploadName: hasId(html, "upload__name"),
    searchForm: hasId(html, "dw__mediasearch"),
    mediaIds: [...new Set(html.match(/wiki:dokuwiki(?:-128)?\.(?:svg|png)/g) ?? [])].sort()
  };
}

function mediaLinks(html) {
  return [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => normalizeMediaUrl(match[1]))
    .filter((href) => href.includes("dokuwiki"));
}

function normalizeMediaUrl(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/^\/lib\/exe\/fetch\.php\?[^"]*media=([^"&]+).*$/g, (_match, media) => {
      return `/media/${decodeURIComponent(media).replaceAll(":", "/")}`;
    })
    .replace(/^\/lib\/exe\/detail\.php\?[^"]*media=([^"&]+).*$/g, (_match, media) => {
      return `/media-detail/${decodeURIComponent(media).replaceAll(":", "/")}`;
    });
}

function hasId(html, id) {
  return new RegExp(`id="${id}"`).test(html);
}

function hasClass(html, className) {
  return new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`).test(html);
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

class MemoryR2 {
  constructor(fixtures) {
    this.objects = new Map(
      fixtures.map((fixture) => [
        `media/current/${fixture.id.replaceAll(":", "/")}`,
        readFileSync(fixture.path)
      ])
    );
  }

  async head(key) {
    return this.objects.has(key) ? {} : null;
  }

  async get(key) {
    const value = this.objects.get(key);
    if (!value) return null;

    return {
      body: new Response(value).body
    };
  }
}

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined
    };
  }
}
