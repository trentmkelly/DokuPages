/* global FormData, Request, TextEncoder */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.ts";
import { hashPassword } from "../src/auth/password.ts";
import { anonymousPrincipal, principalFromUser } from "../src/auth/principal.ts";
import { validateMediaUpload, UPLOAD_XSS_MESSAGE } from "../src/wiki/media-validation.ts";
import { ACL_NONE, ACL_UPLOAD, resolveAclPermission } from "../src/wiki/acl.ts";
import {
  findWordblockMatch,
  UPLOAD_SPAM_MESSAGE,
  WORD_BLOCK_MESSAGE
} from "../src/wiki/wordblock.ts";
import { discoverAclRules } from "../scripts/import-dokuwiki.mjs";
import { readMigrationSql } from "./support/migrations.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const upstreamRoot = path.resolve(repoRoot, "../dokuwiki");
const migrationSql = readMigrationSql();
const SECURITY_TOKEN_ERROR = "Security Token did not match. Possible CSRF attack.";

describe("upstream DokuWiki security fixture parity", () => {
  let database;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("anchors XSS upload blocking to upstream media.php and language fixtures", async () => {
    const mediaSource = await upstreamFile("inc/media.php");
    const languageSource = await upstreamFile("inc/lang/en/lang.php");
    const mime = parseMimeConf(await upstreamFile("conf/mime.conf"));
    const svgPolicy = mime.active.get("svg");

    expect(svgPolicy).toMatchObject({ mimeType: "image/svg+xml", forceDownload: false });
    expect(mediaSource).toContain("fread($fh, 256)");
    expect(mediaSource).toContain("preg_match('/<(script|a|img|html|body|iframe)[\\s>]/i'");
    expect(extractDokuWikiLang(languageSource, "uploadxss")).toBe(UPLOAD_XSS_MESSAGE);
    expect(
      validateMediaUpload({
        id: "wiki:bad.svg",
        body: bytes("<svg><script>alert(1)</script></svg>"),
        mimeType: svgPolicy.mimeType,
        mimePolicy: svgPolicy
      })
    ).toEqual({
      ok: false,
      error: UPLOAD_XSS_MESSAGE
    });
    expect(
      validateMediaUpload({
        id: "wiki:late.svg",
        body: bytes(`${" ".repeat(256)}<script>alert(1)</script>`),
        mimeType: svgPolicy.mimeType,
        mimePolicy: svgPolicy
      })
    ).toEqual({ ok: true });
  });

  it("keeps unsafe media types disabled when upstream mime.conf only comments them", async () => {
    const mime = parseMimeConf(await upstreamFile("conf/mime.conf"));
    const languageSource = await upstreamFile("inc/lang/en/lang.php");

    expect(mime.commented.get("html")).toMatchObject({
      mimeType: "text/html",
      forceDownload: false
    });
    expect(mime.active.has("html")).toBe(false);
    expect(extractDokuWikiLang(languageSource, "uploadwrong")).toBe(
      "Upload denied. This file extension is forbidden!"
    );
    expect(
      validateMediaUpload({
        id: "wiki:payload.html",
        body: bytes("<script>alert(1)</script>"),
        mimeType: "text/html"
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("not allowed")
    });
  });

  it("matches upstream wordblock fixture patterns and messages", async () => {
    const wordblocks = parseWordblockConf(await upstreamFile("conf/wordblock.conf"));
    const languageSource = await upstreamFile("inc/lang/en/lang.php");

    expect(extractDokuWikiLang(languageSource, "uploadspam")).toBe(UPLOAD_SPAM_MESSAGE);
    expect(extractDokuWikiLang(languageSource, "wordblock")).toBe(WORD_BLOCK_MESSAGE);
    expect(wordblocks).toContain("zoosex");
    expect(findWordblockMatch("Plain text with zoosex in it.", wordblocks)).toMatchObject({
      pattern: "zoosex",
      match: "zoosex"
    });
    expect(
      findWordblockMatch("Visit www.cheap-discount-viagra.example now.", wordblocks)
    ).toMatchObject({
      pattern: wordblocks[0],
      match: expect.stringContaining("cheap-discount-viagra")
    });
  });

  it("prevents ACL bypasses when a narrower deny rule overrides the upstream root grant", async () => {
    const createdAt = "2026-05-07T00:00:00.000Z";
    const upstreamRules = await discoverAclRules(path.join(upstreamRoot, "conf/acl.auth.php.dist"));
    const rules = [
      ...upstreamRules,
      {
        id: "acl:private:*:@ALL",
        scope: "private:*",
        principalType: "all",
        principal: "@ALL",
        permission: ACL_NONE,
        createdAt
      }
    ];

    expect(upstreamRules).toEqual([
      expect.objectContaining({
        scope: "*",
        principalType: "all",
        principal: "@ALL",
        permission: ACL_UPLOAD
      })
    ]);
    expect(resolveAclPermission(upstreamRules, "wiki:start", anonymousPrincipal())).toBe(
      ACL_UPLOAD
    );
    expect(resolveAclPermission(rules, "private:secret", anonymousPrincipal())).toBe(ACL_NONE);
    expect(
      resolveAclPermission(rules, "private:secret", userPrincipal("alice", ["user"], createdAt))
    ).toBe(ACL_NONE);
  });

  it("matches upstream anonymous CSRF bypass and logged-in sectok rejection", async () => {
    const commonSource = await upstreamFile("inc/common.php");
    const env = createEnv();
    await seedUser(env.DB);

    expect(commonSource).toContain("if (!$INPUT->server->str('REMOTE_USER')) return true");
    expect(commonSource).toContain(`msg('${SECURITY_TOKEN_ERROR}', -1)`);

    const login = new FormData();
    login.set("username", "alice");
    login.set("password", "correct horse battery staple");

    const anonymousLogin = await handleRequest(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        body: login,
        headers: { accept: "application/json" }
      }),
      env
    );

    expect(anonymousLogin.status).toBe(303);
    expect(anonymousLogin.headers.get("set-cookie") ?? "").toContain("DW_PAGES_SESSION=");

    const edit = new FormData();
    edit.set("id", "wiki:welcome");
    edit.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    edit.set("content", "Changed.");

    const loggedInEdit = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: edit,
        headers: {
          accept: "application/json",
          "cf-access-authenticated-user-email": "alice@example.test"
        }
      }),
      env
    );

    expect(loggedInEdit.status).toBe(403);
    await expect(loggedInEdit.json()).resolves.toEqual({ error: SECURITY_TOKEN_ERROR });
  });

  function createEnv(overrides = {}) {
    database = new DatabaseSync(":memory:");
    database.exec(migrationSql);

    return {
      DB: new SqliteD1(database),
      RENDER_CACHE: new MemoryKv(),
      SITE_NAME: "Security Fixture Wiki",
      EXTERNAL_AUTH_MODE: "cloudflare_access",
      ...overrides
    };
  }
});

async function upstreamFile(relativePath) {
  return readFile(path.join(upstreamRoot, relativePath), "utf8");
}

function bytes(value) {
  return new TextEncoder().encode(value).buffer;
}

function parseMimeConf(source) {
  const active = new Map();
  const commented = new Map();

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const isCommented = trimmed.startsWith("#");
    const body = isCommented ? trimmed.slice(1).trim() : trimmed;
    const match = body.match(/^([A-Za-z0-9]+)\s+(!?\S+)/);

    if (!match) continue;

    const [, extension, rawMimeType] = match;
    const entry = {
      mimeType: rawMimeType.replace(/^!/, ""),
      forceDownload: rawMimeType.startsWith("!")
    };
    (isCommented ? commented : active).set(extension, entry);
  }

  return { active, commented };
}

function parseWordblockConf(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function extractDokuWikiLang(source, key) {
  const expression = new RegExp(
    String.raw`\$lang\['${escapeRegExp(key)}'\]\s*=\s*'((?:\\'|[^'])*)';`
  );
  const match = source.match(expression);
  if (!match) throw new Error(`DokuWiki language key '${key}' was not found.`);

  return match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userPrincipal(username, groups, createdAt) {
  return principalFromUser(
    {
      id: `user:${username}`,
      username,
      displayName: username,
      email: `${username}@example.test`,
      passwordHash: "hash",
      isDisabled: false,
      createdAt,
      updatedAt: createdAt
    },
    groups
  );
}

async function seedUser(
  d1,
  {
    userId = "user-1",
    username = "alice",
    password = "correct horse battery staple",
    displayName = "Alice Example",
    email = "alice@example.test",
    groups = ["user"]
  } = {}
) {
  const now = "2026-05-07T00:00:00.000Z";
  const passwordHash = await hashPassword(password, {
    iterations: 1_000,
    salt: new Uint8Array(16).fill(9)
  });

  await d1
    .prepare(
      `insert into users (
         id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, username, displayName, email, passwordHash, 0, now, now)
    .run();

  for (const group of groups) {
    const groupId = `group:${group}`;
    await d1
      .prepare("insert or ignore into groups (id, name, created_at) values (?, ?, ?)")
      .bind(groupId, group, now)
      .run();
    await d1
      .prepare("insert or ignore into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
      .bind(userId, groupId, now)
      .run();
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

  async get(key) {
    const entry = this.values.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }

    return entry.value;
  }

  async put(key, value, options = {}) {
    this.values.set(key, {
      value,
      expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null
    });
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list({ prefix = "", cursor } = {}) {
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(cursor ? Number(cursor) : 0)
      .map((name) => ({ name }));

    return {
      keys,
      list_complete: true
    };
  }
}
