import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/app";
import type { Env } from "../src/env";
import { PageLockObject } from "../src/storage/page-lock-object";
import { WORD_BLOCK_MESSAGE } from "../src/wiki/wordblock";

interface D1StubState {
  row: Record<string, unknown> | null;
  revisions: Record<string, unknown>[];
  changelog: Record<string, unknown>[];
  searchPostings: Record<string, unknown>[];
  media: Record<string, unknown>[];
  mediaRevisions: Record<string, unknown>[];
  metadata: Record<string, unknown>[];
  cacheDependencies: Record<string, unknown>[];
  drafts: Record<string, unknown>[];
  aclRules: Record<string, unknown>[];
  deleted: boolean;
  batches: unknown[][];
}

const state: D1StubState = {
  row: currentPageRow(),
  revisions: seedRevisions(),
  changelog: seedChangelog(),
  searchPostings: seedSearchPostings(),
  media: seedMedia(),
  mediaRevisions: seedMediaRevisions(),
  metadata: [],
  cacheDependencies: [],
  drafts: [],
  aclRules: seedAclRules(),
  deleted: false,
  batches: []
};

const purgedKeys: string[] = [];
const cachePuts: string[] = [];
const renderCache = new Map<string, string>();
const pageLocks = createPageLockNamespaceStub();
const TEST_CSRF_TOKEN = "test-csrf-token";

const env: Env = {
  DB: createD1Stub(state),
  MEDIA_BUCKET: createR2Stub(),
  RENDER_CACHE: {
    get: async (key: string, type?: string) => {
      const value = renderCache.get(key);
      if (!value) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => {
      cachePuts.push(key);
      renderCache.set(key, value);
    },
    delete: async (key: string) => {
      purgedKeys.push(key);
      renderCache.delete(key);
    }
  } as unknown as KVNamespace,
  PAGE_LOCKS: pageLocks.namespace,
  SITE_NAME: "Test Wiki",
  API_BEARER_TOKEN: "test-token",
  API_CORS_ORIGINS: "https://client.example",
  MAINTENANCE_MODE: undefined
};

describe("handleRequest", () => {
  beforeEach(() => {
    state.row = currentPageRow();
    state.revisions = seedRevisions();
    state.changelog = seedChangelog();
    state.searchPostings = seedSearchPostings();
    state.media = seedMedia();
    state.mediaRevisions = seedMediaRevisions();
    state.metadata = [];
    state.cacheDependencies = [];
    state.drafts = [];
    state.aclRules = seedAclRules();
    state.deleted = false;
    state.batches = [];
    purgedKeys.length = 0;
    cachePuts.length = 0;
    renderCache.clear();
    pageLocks.reset();
    env.API_BEARER_TOKEN = "test-token";
    env.API_CORS_ORIGINS = "https://client.example";
    env.MAINTENANCE_MODE = undefined;
  });

  it("returns health information for the API health route", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      version: "0.1.0",
      bindings: {
        d1: true,
        r2: true,
        kv: true,
        durableObjects: true
      },
      storage: {
        d1: { status: "ok" },
        kv: { status: "ok" },
        r2: { status: "ok" },
        durableObjects: { status: "ok" }
      },
      config: {
        ok: true,
        issueCount: 0
      }
    });
  });

  it("returns native diagnostics as JSON and HTML", async () => {
    const json = await handleRequest(new Request("https://example.com/api/diagnostics"), env);
    const html = await handleRequest(new Request("https://example.com/diagnostics"), env);

    expect(json.status).toBe(200);
    await expect(json.json()).resolves.toMatchObject({
      service: "dokuwiki-pages-dev-port",
      version: "0.1.0",
      site: {
        siteName: "Test Wiki"
      },
      storage: {
        d1: { status: "ok" },
        kv: { status: "ok" },
        r2: { status: "ok" }
      },
      migration: {
        latestSchemaVersion: 1
      },
      config: {
        ok: true
      }
    });
    expect(html.status).toBe(200);
    const diagnosticsHtml = await html.text();
    expect(diagnosticsHtml).toContain("<h2>Configuration</h2>");
    expect(diagnosticsHtml).toContain("<h2>Migration status</h2>");
  });

  it("resolves requests as anonymous until session auth is implemented", async () => {
    const response = await handleRequest(new Request("https://example.com/api/auth/session"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      principal: {
        type: "anonymous",
        isAuthenticated: false,
        username: null,
        displayName: "Anonymous",
        groups: [],
        aclSubjects: ["@ALL"]
      }
    });
  });

  it("handles wiki routes through the Pages Function router", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    const html = await response.text();
    expect(html).toContain('<nav aria-label="Breadcrumb">');
    expect(html).toContain('<a href="/index?ns=wiki">wiki</a> / <span>welcome</span>');
    expect(html).toContain('<link rel="canonical" href="/wiki/wiki/welcome">');
    expect(html).toContain('<link rel="stylesheet" href="/dokuwiki.css?v=0.1.0">');
    expect(html).toContain('<script src="/dokuwiki.js?v=0.1.0" defer></script>');
    expect(html).toContain('id="dokuwiki__usertools"');
    expect(html).toContain("User tools");
    expect(html).toContain('id="mobile__tools"');
    expect(html).toContain(
      '<li class="action login"><a href="/wiki/wiki/welcome?do=login" rel="nofollow">Log In</a></li>'
    );
    expect(html).toContain(
      '<li class="action register"><a href="/wiki/wiki/welcome?do=register" rel="nofollow">Register</a></li>'
    );
    expect(html).toContain('<option value="/wiki/wiki/welcome?do=login">Log In</option>');
    expect(html).toContain('<option value="/wiki/wiki/welcome?do=register">Register</option>');
    expect(html).toContain(
      '<h1 id="welcome">Welcome<a class="secedit" href="/wiki/wiki/welcome?do=edit&amp;section=1" aria-label="Edit section Welcome">Edit</a></h1>'
    );
    expect(cachePuts).toContain("page:wiki:welcome");
  });

  it("marks missing internal page links with DokuWiki red-link styling", async () => {
    state.row = {
      ...currentPageRow(),
      content:
        "====== Welcome ======\n\nExisting [[wiki:guide|Guide]] and missing [[missing:page|Missing]]."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<a href="/wiki/wiki/guide" class="wikilink1">Guide</a>');
    expect(html).toContain(
      '<a href="/wiki/missing/page" class="wikilink2" title="This topic does not exist yet">Missing</a>'
    );
  });

  it("fingerprints static assets with the Pages commit when available", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), {
      ...env,
      CF_PAGES_COMMIT_SHA: "abcdef1234567890abcdef1234567890abcdef12"
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<link rel="stylesheet" href="/dokuwiki.css?v=0.1.0-abcdef123456">');
    expect(html).toContain('<script src="/dokuwiki.js?v=0.1.0-abcdef123456" defer></script>');
  });

  it("redirects non-canonical wiki paths to normalized page routes", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=edit"),
      env
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
  });

  it("redirects the site root to the configured start page", async () => {
    const response = await handleRequest(new Request("https://example.com/"), env);
    const staticIndex = await handleRequest(new Request("https://example.com/index.html"), env);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(staticIndex.status).toBe(301);
    expect(staticIndex.headers.get("location")).toBe("/wiki/wiki/welcome");
  });

  it("redirects legacy DokuWiki query URLs to canonical page routes", async () => {
    const page = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome"),
      env
    );
    const edit = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=edit"),
      env
    );
    const diff = await handleRequest(
      new Request(
        "https://example.com/doku.php?id=Wiki:Welcome&do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );
    const start = await handleRequest(new Request("https://example.com/wiki/"), env);

    expect(page.status).toBe(301);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(edit.status).toBe(301);
    expect(edit.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
    expect(diff.status).toBe(301);
    expect(diff.headers.get("location")).toBe(
      "/wiki/wiki/welcome?do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
    );
    expect(start.status).toBe(301);
    expect(start.headers.get("location")).toBe("/wiki/wiki/welcome");
  });

  it("redirects legacy DokuWiki export URL aliases to page routes", async () => {
    const raw = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=export_raw"),
      env
    );
    const htmlAlias = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=export_htmlbody"),
      env
    );

    expect(raw.status).toBe(301);
    expect(raw.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_raw");
    expect(htmlAlias.status).toBe(301);
    expect(htmlAlias.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_xhtmlbody");
  });

  it("serves DokuWiki-compatible AJAX search and index endpoints", async () => {
    const quick = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=qsearch&q=welcome"),
      env
    );
    const suggestions = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=suggestions&q=welcome"),
      env
    );
    const linkwiz = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=linkwiz&q=welcome"),
      env
    );
    const index = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=index&idx=wiki"),
      env
    );
    const unknown = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=missing"),
      env
    );

    expect(quick.status).toBe(200);
    await expect(quick.text()).resolves.toContain("Quick hits");
    expect(suggestions.headers.get("content-type")).toBe("application/x-suggestions+json");
    await expect(suggestions.json()).resolves.toEqual(["welcome", ["welcome"], [], []]);
    await expect(linkwiz.text()).resolves.toContain('class="wikilink1"');
    await expect(index.text()).resolves.toContain('<ul class="idx">');
    expect(unknown.status).toBe(400);
  });

  it("returns explicit not-implemented responses for legacy remote API entrypoints", async () => {
    const xmlrpc = await handleRequest(new Request("https://example.com/lib/exe/xmlrpc.php"), env);
    const jsonrpc = await handleRequest(
      new Request("https://example.com/lib/exe/jsonrpc.php"),
      env
    );
    const openapi = await handleRequest(
      new Request("https://example.com/lib/exe/openapi.php"),
      env
    );

    expect(xmlrpc.status).toBe(501);
    expect(jsonrpc.status).toBe(501);
    expect(openapi.status).toBe(501);
    await expect(jsonrpc.json()).resolves.toMatchObject({
      status: "not_implemented"
    });
  });

  it("handles unsupported legacy executable endpoints explicitly", async () => {
    const index = await handleRequest(new Request("https://example.com/index.php"), env);
    const install = await handleRequest(new Request("https://example.com/install.php"), env);
    const css = await handleRequest(new Request("https://example.com/lib/exe/css.php?t=1"), env);
    const js = await handleRequest(new Request("https://example.com/lib/exe/js.php?t=1"), env);
    const jquery = await handleRequest(new Request("https://example.com/lib/exe/jquery.php"), env);
    const indexer = await handleRequest(
      new Request("https://example.com/lib/exe/indexer.php"),
      env
    );
    const taskrunner = await handleRequest(
      new Request("https://example.com/lib/exe/taskrunner.php"),
      env
    );

    expect(index.status).toBe(301);
    expect(index.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(css.status).toBe(301);
    expect(css.headers.get("location")).toBe("/dokuwiki.css?v=0.1.0");
    expect(js.status).toBe(301);
    expect(js.headers.get("location")).toBe("/dokuwiki.js?v=0.1.0");
    expect(jquery.status).toBe(301);
    expect(jquery.headers.get("location")).toBe("/dokuwiki.js?v=0.1.0");
    expect(install.status).toBe(410);
    await expect(install.json()).resolves.toMatchObject({ status: "not_available" });
    expect(indexer.status).toBe(501);
    await expect(indexer.json()).resolves.toMatchObject({ status: "not_available" });
    expect(taskrunner.status).toBe(204);
    expect(taskrunner.headers.get("cache-control")).toBe("no-store");
  });

  it("serves authenticated native API read methods with configured CORS", async () => {
    const headers = {
      authorization: "Bearer test-token",
      origin: "https://client.example"
    };
    const index = await handleRequest(new Request("https://example.com/api/v1", { headers }), env);
    const page = await handleRequest(
      new Request("https://example.com/api/v1/pages?id=wiki:welcome", { headers }),
      env
    );
    const pageRevisions = await handleRequest(
      new Request("https://example.com/api/v1/pages/revisions?id=wiki:welcome", { headers }),
      env
    );
    const revision = await handleRequest(
      new Request("https://example.com/api/v1/revisions?id=wiki:welcome@2026-05-06T00:00:00.000Z", {
        headers
      }),
      env
    );
    const media = await handleRequest(
      new Request("https://example.com/api/v1/media?id=wiki:logo.svg", { headers }),
      env
    );
    const mediaRevisions = await handleRequest(
      new Request("https://example.com/api/v1/media/revisions?id=wiki:logo.svg", { headers }),
      env
    );
    const search = await handleRequest(
      new Request("https://example.com/api/v1/search?q=welcome", { headers }),
      env
    );
    const user = await handleRequest(
      new Request("https://example.com/api/v1/users/me", { headers }),
      env
    );

    expect(index.status).toBe(200);
    expect(index.headers.get("access-control-allow-origin")).toBe("https://client.example");
    await expect(page.json()).resolves.toMatchObject({
      ok: true,
      page: {
        id: "wiki:welcome",
        revisionId: "wiki:welcome@2026-05-07T00:00:00.000Z",
        url: "/wiki/wiki/welcome"
      }
    });
    await expect(pageRevisions.json()).resolves.toMatchObject({
      ok: true,
      revisions: [expect.objectContaining({ pageId: "wiki:welcome" })]
    });
    await expect(revision.json()).resolves.toMatchObject({
      ok: true,
      revision: {
        id: "wiki:welcome@2026-05-06T00:00:00.000Z",
        content: "====== Welcome ======\n\nOlder page."
      }
    });
    await expect(media.json()).resolves.toMatchObject({
      ok: true,
      media: {
        id: "wiki:logo.svg",
        url: "/media/wiki/logo.svg",
        detailUrl: "/media-detail/wiki/logo.svg"
      }
    });
    await expect(mediaRevisions.json()).resolves.toMatchObject({
      ok: true,
      revisions: [expect.objectContaining({ mediaId: "wiki:logo.svg" })]
    });
    await expect(search.json()).resolves.toMatchObject({
      ok: true,
      results: [expect.objectContaining({ id: "wiki:welcome" })]
    });
    await expect(user.json()).resolves.toMatchObject({
      ok: true,
      principal: {
        isAuthenticated: true,
        username: "api-token"
      }
    });
  });

  it("supports native API page and media writes through bearer auth", async () => {
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };

    const page = await handleRequest(
      new Request("https://example.com/api/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "wiki:welcome",
          content: "====== Welcome ======\n\nUpdated through API.",
          summary: "API edit",
          baseRevisionId: "wiki:welcome@2026-05-07T00:00:00.000Z"
        })
      }),
      env
    );
    const mediaDelete = await handleRequest(
      new Request("https://example.com/api/v1/media?id=wiki:logo.svg", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ summary: "API delete" })
      }),
      env
    );

    expect(page.status).toBe(200);
    await expect(page.json()).resolves.toMatchObject({
      ok: true,
      changeType: "edit",
      page: {
        id: "wiki:welcome",
        content: "====== Welcome ======\n\nUpdated through API."
      }
    });
    expect(purgedKeys).toContain("page:wiki:welcome");
    expect(mediaDelete.status).toBe(200);
    await expect(mediaDelete.json()).resolves.toMatchObject({
      ok: true,
      id: "wiki:logo.svg",
      revision: {
        mediaId: "wiki:logo.svg",
        changeType: "delete"
      }
    });
  });

  it("rejects unauthenticated native API writes and unapproved CORS origins", async () => {
    const anonymousWrite = await handleRequest(
      new Request("https://example.com/api/v1/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "wiki:welcome", content: "Blocked", summary: "Blocked" })
      }),
      env
    );
    const invalidBearer = await handleRequest(
      new Request("https://example.com/api/v1/pages?id=wiki:welcome", {
        headers: { authorization: "Bearer wrong" }
      }),
      env
    );
    const blockedPreflight = await handleRequest(
      new Request("https://example.com/api/v1/pages", {
        method: "OPTIONS",
        headers: {
          origin: "https://blocked.example",
          "access-control-request-method": "GET"
        }
      }),
      env
    );

    expect(anonymousWrite.status).toBe(401);
    expect(anonymousWrite.headers.get("www-authenticate")).toBe(
      'Bearer realm="DokuWiki Pages API"'
    );
    expect(invalidBearer.status).toBe(401);
    expect(blockedPreflight.status).toBe(403);
    expect(state.row?.content).toBe("====== Welcome ======\n\nImported page.");
  });

  it("fetches media, renders media detail, and redirects legacy media URLs", async () => {
    const fetch = await handleRequest(new Request("https://example.com/media/wiki/logo.svg"), env);
    const head = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", { method: "HEAD" }),
      env
    );
    const download = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?download=1"),
      env
    );
    const resized = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?w=80"),
      env
    );
    const revision = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?rev=media-rev-1"),
      env
    );
    const detail = await handleRequest(
      new Request("https://example.com/media-detail/wiki/logo.svg"),
      env
    );
    const manager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki"),
      env
    );
    const legacyFetch = await handleRequest(
      new Request("https://example.com/lib/exe/fetch.php?media=wiki:logo.svg&dl=1"),
      env
    );
    const legacyDetail = await handleRequest(
      new Request("https://example.com/lib/exe/detail.php?id=wiki:logo.svg"),
      env
    );

    expect(fetch.status).toBe(200);
    expect(fetch.headers.get("content-type")).toBe("image/svg+xml");
    expect(fetch.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(fetch.headers.get("x-dokuwiki-thumbnail-policy")).toBe("original");
    expect(resized.headers.get("x-dokuwiki-resize-policy")).toBe("browser-constrained-original");
    await expect(fetch.text()).resolves.toBe("<svg>current</svg>");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("18");
    await expect(head.text()).resolves.toBe("");
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="logo.svg"');
    expect(revision.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    await expect(revision.text()).resolves.toBe("<svg>old</svg>");
    await expect(detail.text()).resolves.toContain("Media detail");
    const managerHtml = await manager.text();
    expect(managerHtml).toContain('id="media__manager"');
    expect(managerHtml).toContain('id="mediamgr__aside"');
    expect(managerHtml).toContain("Media Files");
    expect(managerHtml).toContain("logo.svg");
    expect(managerHtml).toContain('class="idx media__manager media-grid"');
    const pagedManager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&limit=1"),
      env
    );
    const pagedManagerHtml = await pagedManager.text();
    expect(pagedManagerHtml).toContain("limit=1");
    expect(pagedManagerHtml).toContain("offset=1");
    const searchManager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&q=svg"),
      env
    );
    const emptySearchManager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&q=missing"),
      env
    );
    expect(await searchManager.text()).toContain("logo.svg");
    expect(await emptySearchManager.text()).toContain("No media found.");
    expect(legacyFetch.status).toBe(301);
    expect(legacyFetch.headers.get("location")).toBe("/media/wiki/logo.svg?download=1");
    expect(legacyDetail.status).toBe(301);
    expect(legacyDetail.headers.get("location")).toBe("/media-detail/wiki/logo.svg");
  });

  it("answers conditional media fetches without R2 body reads", async () => {
    const r2Operations = { head: 0, get: 0, put: 0, delete: 0 };
    env.MEDIA_BUCKET = createR2Stub(r2Operations);

    const etag = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", {
        headers: { "if-none-match": '"current-media-hash"' }
      }),
      env
    );
    const modifiedSince = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", {
        headers: { "if-modified-since": "Thu, 07 May 2026 00:00:00 GMT" }
      }),
      env
    );

    expect(etag.status).toBe(304);
    expect(etag.headers.get("etag")).toBe('"current-media-hash"');
    expect(etag.headers.get("content-length")).toBe(null);
    expect(modifiedSince.status).toBe(304);
    expect(r2Operations.get).toBe(0);
    expect(r2Operations.head).toBe(0);
  });

  it("uploads media to R2 and records D1 media revision metadata", async () => {
    const form = new FormData();
    form.set("ns", "wiki");
    form.set("summary", "Upload logo");
    form.set("file", new File(["uploaded media"], "upload.txt", { type: "text/plain" }));

    const response = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ "cf-connecting-ip": "203.0.113.20" })
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/media-detail/wiki/upload.txt");
    expect(state.media[0]).toMatchObject({
      id: "wiki:upload.txt",
      namespace: "wiki",
      mime_type: "text/plain",
      byte_length: 14,
      is_deleted: 0
    });
    expect(state.mediaRevisions[0]).toMatchObject({
      media_id: "wiki:upload.txt",
      mime_type: "text/plain",
      byte_length: 14,
      summary: "Upload logo",
      change_type: "create"
    });
    expect(state.changelog[0]).toMatchObject({
      subject_type: "media",
      subject_id: "wiki:upload.txt",
      ip: "203.0.113.20",
      change_type: "create"
    });
    expect(state.metadata).toContainEqual(
      expect.objectContaining({
        subject_type: "media",
        subject_id: "wiki:upload.txt",
        key: "contentHash"
      })
    );

    const fetch = await handleRequest(
      new Request("https://example.com/media/wiki/upload.txt"),
      env
    );
    expect(fetch.status).toBe(200);
    await expect(fetch.text()).resolves.toBe("uploaded media");
  });

  it("rejects media uploads that would overwrite existing media unless requested", async () => {
    const form = new FormData();
    form.set("ns", "wiki");
    form.set("file", new File(["replacement"], "logo.svg", { type: "image/svg+xml" }));

    const conflict = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: "Media 'wiki:logo.svg' already exists."
    });

    form.set("overwrite", "1");
    const overwrite = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(overwrite.status).toBe(303);
    expect(state.media[0]).toMatchObject({
      id: "wiki:logo.svg",
      byte_length: 11
    });
    expect(state.mediaRevisions[0]).toMatchObject({
      media_id: "wiki:logo.svg",
      change_type: "edit"
    });
  });

  it("rejects unsafe media uploads before writing R2 objects", async () => {
    const form = new FormData();
    form.set("ns", "wiki");
    form.set("file", new File(["<?php"], "shell.php", { type: "application/x-httpd-php" }));

    const response = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("not allowed")
    });
    expect(state.media).toHaveLength(1);
    expect(state.mediaRevisions).toHaveLength(1);
  });

  it("rate limits repeated media upload attempts before writing R2 objects", async () => {
    async function upload(name: string): Promise<Response> {
      const form = new FormData();
      form.set("ns", "wiki");
      form.set("file", new File(["uploaded media"], name, { type: "text/plain" }));

      return handleRequest(
        new Request("https://example.com/api/media/upload", {
          method: "POST",
          body: form,
          headers: csrfHeaders({
            accept: "application/json",
            "cf-connecting-ip": "203.0.113.60"
          })
        }),
        env
      );
    }

    for (let index = 0; index < 20; index += 1) {
      const response = await upload(`upload-${index}.txt`);
      expect(response.status).toBe(200);
    }

    const limited = await upload("upload-limited.txt");

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    await expect(limited.json()).resolves.toMatchObject({
      error: "Too many media upload attempts. Try again later."
    });
    expect(state.media.some((media) => media.id === "wiki:upload-limited.txt")).toBe(false);
  });

  it("deletes current media while preserving immutable media revisions", async () => {
    renderCache.set("page:wiki:welcome", "cached page");
    state.cacheDependencies = [
      {
        cache_key: "page:wiki:welcome",
        dependency_type: "media",
        dependency_id: "wiki:logo.svg"
      }
    ];
    const form = new FormData();
    form.set("id", "wiki:logo.svg");
    form.set("summary", "Remove logo");

    const response = await handleRequest(
      new Request("https://example.com/api/media/delete", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ "cf-connecting-ip": "203.0.113.30" })
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/media-manager?ns=wiki");
    expect(state.media[0]).toMatchObject({
      id: "wiki:logo.svg",
      is_deleted: 1
    });
    expect(state.mediaRevisions[0]).toMatchObject({
      media_id: "wiki:logo.svg",
      object_key: "media/current/wiki/logo.svg",
      change_type: "delete",
      summary: "Remove logo"
    });
    expect(state.changelog[0]).toMatchObject({
      subject_type: "media",
      subject_id: "wiki:logo.svg",
      ip: "203.0.113.30",
      change_type: "delete",
      size_change: -18
    });
    expect(state.metadata).toContainEqual(
      expect.objectContaining({
        subject_type: "media",
        subject_id: "wiki:logo.svg",
        key: "deleted",
        value_json: "true"
      })
    );

    const current = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg"),
      env
    );
    const oldRevision = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?rev=media-rev-1"),
      env
    );

    expect(current.status).toBe(404);
    expect(oldRevision.status).toBe(200);
    await expect(oldRevision.text()).resolves.toBe("<svg>old</svg>");
    expect(purgedKeys).toContain("page:wiki:welcome");
    expect(state.cacheDependencies).toEqual([]);
  });

  it("prevents media upload and delete ACL bypasses", async () => {
    state.aclRules = [aclRule("*", "all", "@ALL", 1)];

    const fetch = await handleRequest(new Request("https://example.com/media/wiki/logo.svg"), env);

    const deleteForm = new FormData();
    deleteForm.set("id", "wiki:logo.svg");
    const deniedDelete = await handleRequest(
      new Request("https://example.com/api/media/delete", {
        method: "POST",
        body: deleteForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    const uploadForm = new FormData();
    uploadForm.set("ns", "wiki");
    uploadForm.set("file", new File(["upload"], "upload.txt", { type: "text/plain" }));
    const deniedUpload = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: uploadForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(fetch.status).toBe(200);
    expect(deniedDelete.status).toBe(403);
    await expect(deniedDelete.json()).resolves.toMatchObject({
      error: "Permission denied for 'wiki:logo.svg'.",
      requiredPermission: 16
    });
    expect(deniedUpload.status).toBe(403);
    await expect(deniedUpload.json()).resolves.toMatchObject({
      error: "Permission denied for 'wiki:upload.txt'.",
      requiredPermission: 8
    });
    expect(state.media).toHaveLength(1);
    expect(state.mediaRevisions).toHaveLength(1);
    expect(state.media.some((media) => media.id === "wiki:upload.txt")).toBe(false);
  });

  it("reverts current media to an immutable media revision", async () => {
    const form = new FormData();
    form.set("id", "wiki:logo.svg");
    form.set("revisionId", "media-rev-1");
    form.set("summary", "Restore old logo");

    const response = await handleRequest(
      new Request("https://example.com/api/media/revert", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ "cf-connecting-ip": "203.0.113.40" })
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/media-detail/wiki/logo.svg");
    expect(state.media[0]).toMatchObject({
      id: "wiki:logo.svg",
      object_key: "media/revisions/wiki/logo.svg/20260506000000",
      byte_length: 14,
      content_hash: "old-media-hash",
      is_deleted: 0
    });
    expect(state.mediaRevisions[0]).toMatchObject({
      media_id: "wiki:logo.svg",
      object_key: "media/revisions/wiki/logo.svg/20260506000000",
      change_type: "revert",
      summary: "Restore old logo"
    });
    expect(state.changelog[0]).toMatchObject({
      subject_type: "media",
      subject_id: "wiki:logo.svg",
      ip: "203.0.113.40",
      change_type: "revert",
      size_change: -4
    });

    const current = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg"),
      env
    );

    expect(current.status).toBe(200);
    await expect(current.text()).resolves.toBe("<svg>old</svg>");
  });

  it("uses matching rendered page cache entries", async () => {
    renderCache.set(
      "page:wiki:welcome",
      JSON.stringify({
        rendererVersion: 18,
        revisionId: "wiki:welcome@2026-05-07T00:00:00.000Z",
        title: "Cached Welcome",
        html: "<p>Cached body.</p>",
        toc: []
      })
    );

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<nav aria-label="Breadcrumb">');
    expect(html).toContain("Cached body.");
    expect(html).not.toContain("Imported page.");
    expect(cachePuts).toHaveLength(0);
  });

  it("uses revision-specific rendered cache entries as the instruction cache equivalent", async () => {
    renderCache.set(
      "page:wiki:welcome:wiki:welcome@2026-05-06T00:00:00.000Z",
      JSON.stringify({
        rendererVersion: 18,
        revisionId: "wiki:welcome@2026-05-06T00:00:00.000Z",
        title: "Cached Older Welcome",
        html: "<p>Cached older body.</p>",
        toc: []
      })
    );

    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<p><strong>Old revision:</strong> 2026-05-06T00:00:00.000Z</p>");
    expect(html).toContain("Cached older body.");
    expect(html).not.toContain("Older page.");
    expect(cachePuts).toHaveLength(0);
  });

  it("refreshes rendered page cache entries from older renderer versions", async () => {
    renderCache.set(
      "page:wiki:welcome",
      JSON.stringify({
        revisionId: "wiki:welcome@2026-05-07T00:00:00.000Z",
        title: "Stale",
        html: "<p>Stale body.</p>",
        toc: []
      })
    );

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Imported page.");
    expect(cachePuts).toContain("page:wiki:welcome");
  });

  it("stores rendered page cache dependencies for invalidation", async () => {
    state.row = {
      ...currentPageRow(),
      content: "====== Welcome ======\n\n[[wiki:syntax|Syntax]] {{wiki:logo.svg|Logo}}"
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const cached = JSON.parse(renderCache.get("page:wiki:welcome") ?? "{}");
    expect(cached.dependencies).toEqual([
      { subjectType: "media", subjectId: "wiki:logo.svg" },
      { subjectType: "page", subjectId: "wiki:syntax" }
    ]);
    expect(state.cacheDependencies).toEqual([
      {
        cache_key: "page:wiki:welcome",
        dependency_type: "media",
        dependency_id: "wiki:logo.svg"
      },
      {
        cache_key: "page:wiki:welcome",
        dependency_type: "page",
        dependency_id: "wiki:syntax"
      }
    ]);
  });

  it("emits cache, search, and media metric events", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
      await handleRequest(new Request("https://example.com/search?q=welcome"), env);
      await handleRequest(new Request("https://example.com/media/wiki/logo.svg"), env);

      const events = log.mock.calls.map((call) => JSON.parse(String(call[0])));
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: "cache_metric",
            cache: "rendered_page",
            action: "miss",
            cacheKey: "page:wiki:welcome"
          }),
          expect.objectContaining({
            event: "cache_metric",
            cache: "rendered_page",
            action: "write",
            cacheKey: "page:wiki:welcome"
          }),
          expect.objectContaining({
            event: "search_metric",
            surface: "search_page",
            queryLength: 7,
            resultCount: 1
          }),
          expect.objectContaining({
            event: "media_metric",
            operation: "fetch",
            namespace: "wiki",
            mimeType: "image/svg+xml",
            byteLength: 18,
            delivery: "body",
            r2Operations: 1
          })
        ])
      );
    } finally {
      log.mockRestore();
    }
  });

  it("renders table of contents for multi-heading pages", async () => {
    state.row = {
      ...currentPageRow(),
      content: "====== Welcome ======\n\n===== Details =====\n\nMore text."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="dw__toc"');
    expect(html).toContain('<a href="#details">Details</a>');
  });

  it("honors page render control macros", async () => {
    state.row = {
      ...currentPageRow(),
      content: "~~NOTOC~~\n~~NOCACHE~~\n====== Welcome ======\n\n===== Details =====\n\nMore text."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain('id="dw__toc"');
    expect(html).not.toContain("~~NOTOC~~");
    expect(html).not.toContain("~~NOCACHE~~");
    expect(cachePuts).toHaveLength(0);
  });

  it("returns 404 when a wiki page does not exist", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/missing/page"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain("This topic does not exist yet.");
    expect(html).toContain(
      '<a class="wikilink2" href="/wiki/missing/page?do=edit" title="This topic does not exist yet">Create this page</a>'
    );
    expect(html).toContain('<link rel="canonical" href="/wiki/missing/page">');
  });

  it("renders an edit form for existing pages", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(response.status).toBe(200);
    const lockCookie = response.headers.get("set-cookie") ?? "";
    expect(lockCookie).toContain("DW_LOCK_");
    expect(lockCookie).toContain("HttpOnly");
    expect(lockCookie).toContain("SameSite=Lax");
    expect(lockCookie).toContain("Secure");
    const html = await response.text();
    expect(html).toContain('name="baseRevisionId" value="wiki:welcome@2026-05-07T00:00:00.000Z"');
    expect(html).toContain('name="sectok" value="');
    expect(html).toContain('name="lockToken" value="');
    expect(html).toContain('id="dw__editform"');
    expect(html).toContain('id="tool__bar"');
    expect(html).toContain('id="edbtn__preview"');
    expect(html).toContain('data-draft-url="/api/pages/draft"');
    expect(html).toContain('data-lock-url="/api/pages/lock"');
    expect(html).toContain('name="minor" type="checkbox"');
  });

  it("prevents page read ACL bypasses before rendering or caching content", async () => {
    state.aclRules = [aclRule("*", "all", "@ALL", 16), aclRule("wiki:welcome", "all", "@ALL", 0)];

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("Permission denied");
    expect(cachePuts).toHaveLength(0);
  });

  it("prevents page edit ACL bypasses before locking or saving", async () => {
    state.aclRules = [aclRule("*", "all", "@ALL", 1)];

    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Denied ======");

    const save = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(edit.status).toBe(403);
    expect(save.status).toBe(403);
    await expect(save.json()).resolves.toMatchObject({
      error: "Permission denied for 'wiki:welcome'.",
      requiredPermission: 2
    });
    expect(state.batches).toHaveLength(0);
  });

  it("blocks concurrent page edits until the current edit lock is released", async () => {
    const first = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );
    const locked = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(first.status).toBe(200);
    expect(locked.status).toBe(423);
    await expect(locked.text()).resolves.toContain("Page locked");

    const html = await first.text();
    const token = html.match(/name="lockToken" value="([^"]+)"/)?.[1] ?? "";
    const release = new FormData();
    release.set("id", "wiki:welcome");
    release.set("lockToken", token);

    const released = await handleRequest(
      new Request("https://example.com/api/pages/lock/release", {
        method: "POST",
        body: release,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );
    const reopened = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(released.status).toBe(200);
    expect(reopened.status).toBe(200);
  });

  it("prefills missing page edits from namespace page templates", async () => {
    state.row = {
      id: "wiki:_template",
      namespace: "wiki",
      title: "_template",
      revision_id: "wiki:_template@2026-05-07T00:00:00.000Z",
      content: "====== @!PAGE!@ ======\n\nCreate @ID@ in @NS@.",
      updated_at: "2026-05-07T00:00:00.000Z"
    };

    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/new_page?do=edit"),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="baseRevisionId" value=""');
    expect(html).toContain("====== New Page ======");
    expect(html).toContain("Create wiki:new_page in wiki.");
  });

  it("returns source text for existing pages", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=source"),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("Imported page.");
  });

  it("exports pages as raw text and rendered HTML modes", async () => {
    const raw = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_raw"),
      env
    );
    const xhtmlBody = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_xhtmlbody"),
      env
    );
    const xhtml = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?do=export_xhtml&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(raw.headers.get("content-disposition")).toBe("attachment; filename=welcome.txt");
    expect(raw.headers.get("x-robots-tag")).toBe("noindex");
    await expect(raw.text()).resolves.toContain("Imported page.");

    expect(xhtmlBody.status).toBe(200);
    expect(xhtmlBody.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(xhtmlBody.text()).resolves.toContain("<p>Imported page.</p>");

    expect(xhtml.status).toBe(200);
    const html = await xhtml.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<div class="dokuwiki export">');
    expect(html).toContain("<p>Older page.</p>");
  });

  it("renders page revision history", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=revisions"),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Revisions for wiki:welcome");
    expect(html).toContain('class="changes"');
    expect(html).toContain('class="diff_link"');
    expect(html).toContain("Initial import");
    expect(html).toContain("wiki%3Awelcome%402026-05-07T00%3A00%3A00.000Z");

    const paged = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=revisions&limit=1&offset=1"),
      env
    );
    const pagedHtml = await paged.text();
    expect(paged.status).toBe(200);
    expect(pagedHtml).toContain("Older import");
    expect(pagedHtml).not.toContain("Initial import");
    expect(pagedHtml).toContain("limit=1");
    expect(pagedHtml).toContain("offset=0");
  });

  it("renders an old page revision", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Old revision:");
    expect(html).toContain("Older page.");
  });

  it("renders a page diff against the current revision", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Diff for wiki:welcome");
    expect(html).toContain('class="diff diff_sidebyside"');
    expect(html).toContain('class="diff-deletedline"');
    expect(html).toContain('class="diff-addedline"');
    expect(html).toContain("<del>Older page.</del>");
    expect(html).toContain("<ins>Imported page.</ins>");
  });

  it("renders a revert form for an old page revision", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?do=revert&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Revert wiki:welcome");
    expect(html).toContain('name="revisionId" value="wiki:welcome@2026-05-06T00:00:00.000Z"');
    expect(html).toContain('name="baseRevisionId" value="wiki:welcome@2026-05-07T00:00:00.000Z"');
  });

  it("reverts a page through the save pipeline", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("revisionId", "wiki:welcome@2026-05-06T00:00:00.000Z");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("summary", "Restore older page");

    const response = await handleRequest(
      new Request("https://example.com/api/pages/revert", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.row?.content).toContain("Older page.");
    expect(state.revisions[0]).toMatchObject({
      page_id: "wiki:welcome",
      content: "====== Welcome ======\n\nOlder page.",
      change_type: "revert",
      summary: "Restore older page"
    });
    expect(purgedKeys).toContain("page:wiki:welcome");
  });

  it("renders recent page changes", async () => {
    const response = await handleRequest(new Request("https://example.com/recent"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Recent changes");
    expect(html).toContain("Initial import");
    expect(html).toContain("/wiki/wiki/welcome");

    const paged = await handleRequest(new Request("https://example.com/recent?limit=1"), env);
    const pagedHtml = await paged.text();
    expect(paged.status).toBe(200);
    expect(pagedHtml).toContain("limit=1");
    expect(pagedHtml).toContain("offset=1");
  });

  it("renders search results from the page index", async () => {
    const response = await handleRequest(new Request("https://example.com/search?q=welcome"), env);
    const scoped = await handleRequest(
      new Request("https://example.com/search?q=welcome&ns=playground"),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Search");
    expect(html).toContain("/wiki/wiki/welcome");
    expect(html).toContain("Imported page.");
    expect(scoped.status).toBe(200);
    const scopedHtml = await scoped.text();
    expect(scopedHtml).toContain("Search scope: playground");
    expect(scopedHtml).toContain("No matching pages found.");
    expect(scopedHtml).not.toContain('<li>\n        <a href="/wiki/wiki/welcome"');
  });

  it("handles DokuWiki-style page search actions", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=search&q=welcome"),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("/wiki/wiki/welcome");
  });

  it("renders namespace indexes", async () => {
    const response = await handleRequest(new Request("https://example.com/index?ns=wiki"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Index of wiki");
    expect(html).toContain("/wiki/wiki/welcome");
    expect(html).toContain("/wiki/wiki/guide");

    const paged = await handleRequest(
      new Request("https://example.com/index?ns=wiki&limit=1"),
      env
    );
    const pagedHtml = await paged.text();
    expect(paged.status).toBe(200);
    expect(pagedHtml).toContain("limit=1");
    expect(pagedHtml).toContain("offset=1");
  });

  it("filters aggregate page outputs by ACL read access", async () => {
    state.aclRules = [aclRule("*", "all", "@ALL", 16), aclRule("wiki:welcome", "all", "@ALL", 0)];

    const search = await handleRequest(new Request("https://example.com/search?q=welcome"), env);
    const recent = await handleRequest(new Request("https://example.com/recent"), env);
    const index = await handleRequest(new Request("https://example.com/index?ns=wiki"), env);
    const sitemap = await handleRequest(new Request("https://example.com/sitemap.xml"), env);

    expect(await search.text()).toContain("No matching pages found.");
    expect(await recent.text()).not.toContain("Initial import");
    const indexHtml = await index.text();
    expect(indexHtml).not.toContain("<small>wiki:welcome");
    expect(indexHtml).toContain("/wiki/wiki/guide");
    expect(await sitemap.text()).not.toContain("https://example.com/wiki/wiki/welcome");
  });

  it("honors hidden page and sneaky index settings in aggregate views", async () => {
    const hiddenEnv = { ...env, HIDE_PAGES: "guide|missing" } satisfies Env;

    const hiddenIndex = await handleRequest(
      new Request("https://example.com/index?ns=wiki"),
      hiddenEnv
    );
    const hiddenWanted = await handleRequest(new Request("https://example.com/wanted"), hiddenEnv);

    expect(await hiddenIndex.text()).not.toContain("/wiki/wiki/guide");
    expect(await hiddenWanted.text()).not.toContain("missing:page");

    state.aclRules = [aclRule("*", "all", "@ALL", 16), aclRule("wiki:*", "all", "@ALL", 0)];
    const sneakyEnv = { ...env, SNEAKY_INDEX: "1" } satisfies Env;
    const sneakyIndex = await handleRequest(
      new Request("https://example.com/index?ns=wiki"),
      sneakyEnv
    );

    const sneakyHtml = await sneakyIndex.text();
    expect(sneakyHtml).toContain("No pages found in this namespace.");
    expect(sneakyHtml).not.toContain("<small>wiki:welcome");
    expect(sneakyHtml).not.toContain("<small>wiki:guide");
  });

  it("renders backlinks for a page", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=backlink"),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Backlinks for wiki:welcome");
    expect(html).toContain("/wiki/wiki/guide");
  });

  it("renders wanted and orphan page reports", async () => {
    const wanted = await handleRequest(new Request("https://example.com/wanted"), env);
    const orphans = await handleRequest(new Request("https://example.com/orphans"), env);

    expect(wanted.status).toBe(200);
    expect(orphans.status).toBe(200);
    await expect(wanted.text()).resolves.toContain("missing:page");
    await expect(orphans.text()).resolves.toContain("/wiki/wiki/guide");
  });

  it("renders sitemap, feeds, OpenSearch, manifest, and robots routes", async () => {
    const sitemap = await handleRequest(new Request("https://example.com/sitemap.xml"), env);
    const rss = await handleRequest(new Request("https://example.com/feed.php"), env);
    const atom = await handleRequest(new Request("https://example.com/atom.xml"), env);
    const opensearch = await handleRequest(
      new Request("https://example.com/lib/exe/opensearch.php"),
      env
    );
    const manifest = await handleRequest(
      new Request("https://example.com/lib/exe/manifest.php"),
      env
    );
    const robots = await handleRequest(new Request("https://example.com/robots.txt"), env);

    expect(sitemap.status).toBe(200);
    expect(rss.status).toBe(200);
    expect(atom.status).toBe(200);
    expect(opensearch.status).toBe(200);
    expect(manifest.status).toBe(200);
    expect(robots.status).toBe(200);
    await expect(sitemap.text()).resolves.toContain("https://example.com/wiki/wiki/welcome");
    await expect(rss.text()).resolves.toContain('<rss version="2.0">');
    await expect(atom.text()).resolves.toContain("http://www.w3.org/2005/Atom");
    await expect(opensearch.text()).resolves.toContain("OpenSearchDescription");
    await expect(manifest.json()).resolves.toMatchObject({ name: "Test Wiki" });
    await expect(robots.text()).resolves.toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("caches sitemap and feed documents in KV", async () => {
    const sitemap = await handleRequest(new Request("https://example.com/sitemap.xml"), env);
    const rss = await handleRequest(new Request("https://example.com/feed.php"), env);
    const atom = await handleRequest(new Request("https://example.com/atom.xml"), env);

    const sitemapText = await sitemap.text();
    const rssText = await rss.text();
    const atomText = await atom.text();

    expect(sitemap.headers.get("cache-control")).toBe("public, max-age=300");
    expect(rss.headers.get("cache-control")).toBe("public, max-age=300");
    expect(atom.headers.get("cache-control")).toBe("public, max-age=300");
    expect(cachePuts).toEqual(
      expect.arrayContaining([
        "discovery:sitemap:https://example.com",
        "discovery:rss:https://example.com",
        "discovery:atom:https://example.com"
      ])
    );

    state.row = null;
    state.changelog = [];

    await expect(
      handleRequest(new Request("https://example.com/sitemap.xml"), env).then((response) =>
        response.text()
      )
    ).resolves.toBe(sitemapText);
    await expect(
      handleRequest(new Request("https://example.com/feed.php"), env).then((response) =>
        response.text()
      )
    ).resolves.toBe(rssText);
    await expect(
      handleRequest(new Request("https://example.com/atom.xml"), env).then((response) =>
        response.text()
      )
    ).resolves.toBe(atomText);
  });

  it("previews submitted wiki text", async () => {
    const form = new FormData();
    form.set("id", "wiki:guide:start");
    form.set("content", "====== Preview ======\n\n**Text** [[child|Child]]");

    const response = await handleRequest(
      new Request("https://example.com/api/pages/preview", {
        method: "POST",
        body: form
      }),
      env
    );

    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview).toMatchObject({
      title: "Preview"
    });
    expect(preview).toMatchObject({
      html: expect.stringContaining(
        '<a href="/wiki/wiki/guide/child" class="wikilink2" title="This topic does not exist yet">Child</a>'
      )
    });
  });

  it("saves page edits with optimistic concurrency and redirects to the page", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Updated ======\n\nChanged.");
    form.set("summary", "Updated page");
    renderCache.set("discovery:sitemap:https://example.com", "stale sitemap");
    renderCache.set("discovery:rss:https://example.com", "stale rss");
    renderCache.set("discovery:atom:https://example.com", "stale atom");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ "cf-connecting-ip": "203.0.113.10" })
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.row?.title).toBe("Updated");
    expect(state.batches).toHaveLength(2);
    expect(
      state.batches[0].some((statement) =>
        String((statement as { sql?: unknown }).sql).includes("insert into pages")
      )
    ).toBe(true);
    expect(
      state.batches[1].every((statement) =>
        String((statement as { sql?: unknown }).sql).includes("delete from cache_dependencies")
      )
    ).toBe(true);
    expect(state.changelog[0]).toMatchObject({
      user_name: null,
      ip: "203.0.113.10"
    });
    expect(state.metadata).toContainEqual(
      expect.objectContaining({
        subject_type: "page",
        subject_id: "wiki:welcome",
        key: "outgoingLinks",
        value_json: "[]"
      })
    );
    expect(state.metadata).toContainEqual(
      expect.objectContaining({
        subject_type: "page",
        subject_id: "wiki:welcome",
        key: "contentHash"
      })
    );
    expect(purgedKeys).toContain("page:wiki:welcome");
    expect(purgedKeys).toContain("discovery:sitemap:https://example.com");
    expect(purgedKeys).toContain("discovery:rss:https://example.com");
    expect(purgedKeys).toContain("discovery:atom:https://example.com");
  });

  it("rate limits repeated page edit attempts before saving", async () => {
    async function save(id: string): Promise<Response> {
      const form = new FormData();
      form.set("id", id);
      form.set("content", `====== ${id} ======\n\nChanged.`);
      form.set("summary", "Rate limit check");

      return handleRequest(
        new Request("https://example.com/api/pages", {
          method: "POST",
          body: form,
          headers: csrfHeaders({ "cf-connecting-ip": "203.0.113.70" })
        }),
        env
      );
    }

    for (let index = 0; index < 30; index += 1) {
      const response = await save(`wiki:rate-${index}`);
      expect(response.status).toBe(303);
    }

    const limited = await save("wiki:rate-limited");

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    await expect(limited.text()).resolves.toContain(
      "Too many page edit attempts. Try again later."
    );
    expect(state.row?.id).not.toBe("wiki:rate-limited");
  });

  it("serves reads but blocks content writes in maintenance mode", async () => {
    env.MAINTENANCE_MODE = "1";

    const read = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);
    expect(read.status).toBe(200);
    state.batches = [];

    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "Changed.");
    const blocked = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );
    const editPage = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );
    const nativeWrite = await handleRequest(
      new Request("https://example.com/api/v1/pages", {
        method: "POST",
        headers: { accept: "application/json" },
        body: JSON.stringify({ id: "wiki:welcome", content: "Changed." })
      }),
      env
    );

    expect(blocked.status).toBe(503);
    expect(blocked.headers.get("retry-after")).toBe("300");
    await expect(blocked.json()).resolves.toMatchObject({
      error: "Wiki is in maintenance mode; content writes are temporarily disabled."
    });
    expect(editPage.status).toBe(503);
    expect(nativeWrite.status).toBe(503);
    expect(state.batches).toHaveLength(0);
  });

  it("rejects state-changing page and media posts without CSRF tokens", async () => {
    const pageForm = new FormData();
    pageForm.set("id", "wiki:welcome");
    pageForm.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    pageForm.set("content", "Changed.");

    const pageResponse = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: pageForm,
        headers: { accept: "application/json" }
      }),
      env
    );

    const mediaForm = new FormData();
    mediaForm.set("ns", "wiki");
    mediaForm.set("file", new File(["blocked"], "blocked.txt", { type: "text/plain" }));

    const mediaResponse = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: mediaForm,
        headers: { accept: "application/json" }
      }),
      env
    );

    expect(pageResponse.status).toBe(403);
    await expect(pageResponse.json()).resolves.toMatchObject({ error: "Invalid CSRF token." });
    expect(mediaResponse.status).toBe(403);
    await expect(mediaResponse.json()).resolves.toMatchObject({ error: "Invalid CSRF token." });
    expect(state.batches).toHaveLength(0);
    expect(state.media).toHaveLength(1);
  });

  it("blocks page edits that match the wordblock list", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Updated ======\n\nzoosex");
    form.set("summary", "Updated page");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: WORD_BLOCK_MESSAGE,
      blockedText: "zoosex"
    });
    expect(state.row?.content).toBe("====== Welcome ======\n\nImported page.");
    expect(state.batches).toHaveLength(0);
    expect(purgedKeys).toHaveLength(0);
  });

  it("purges rendered page cache through the page action", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=purge"),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(purgedKeys).toContain("page:wiki:welcome");
    expect(purgedKeys).toContain("page:wiki:welcome:wiki:welcome@2026-05-07T00:00:00.000Z");
  });

  it("records minor edits for existing pages", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Welcome ======\n\nSmall correction.");
    form.set("summary", "Small correction");
    form.set("minor", "1");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(state.revisions[0]).toMatchObject({
      page_id: "wiki:welcome",
      change_type: "minor",
      summary: "Small correction"
    });
  });

  it("saves, recovers, and deletes page drafts", async () => {
    const draft = new FormData();
    draft.set("id", "wiki:welcome");
    draft.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    draft.set("content", "====== Draft ======\n\nUnsaved text.");

    const saveDraft = await handleRequest(
      new Request("https://example.com/api/pages/draft", {
        method: "POST",
        body: draft,
        headers: csrfHeaders()
      }),
      env
    );

    expect(saveDraft.status).toBe(303);
    expect(saveDraft.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
    expect(state.drafts).toHaveLength(1);

    draft.set("content", "====== Draft ======\n\nAutosaved text.");
    const autosaveDraft = await handleRequest(
      new Request("https://example.com/api/pages/draft", {
        method: "POST",
        body: draft,
        headers: csrfHeaders({
          accept: "application/json",
          "x-requested-with": "XMLHttpRequest"
        })
      }),
      env
    );

    expect(autosaveDraft.status).toBe(200);
    await expect(autosaveDraft.json()).resolves.toMatchObject({ ok: true, id: "wiki:welcome" });

    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );
    const draftView = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=draft"),
      env
    );

    expect(edit.status).toBe(200);
    expect(draftView.status).toBe(200);
    await expect(edit.text()).resolves.toContain("Draft recovered:");
    await expect(draftView.text()).resolves.toContain("Autosaved text.");

    const deleteDraft = await handleRequest(
      new Request("https://example.com/api/pages/draft/delete", {
        method: "POST",
        body: draft,
        headers: csrfHeaders()
      }),
      env
    );

    expect(deleteDraft.status).toBe(303);
    expect(state.drafts).toHaveLength(0);
  });

  it("deletes page drafts after successful saves", async () => {
    state.drafts = [
      {
        id: "draft:wiki:welcome:anonymous",
        page_id: "wiki:welcome",
        content: "Draft text",
        base_revision_id: "wiki:welcome@2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-07T00:00:00.000Z"
      }
    ];
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Updated ======\n\nChanged.");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(state.drafts).toHaveLength(0);
  });

  it("returns conflicts when the base revision is stale", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "stale");
    form.set("content", "Changed.");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("Edit conflict");
    expect(state.batches).toHaveLength(0);
  });

  it("creates new pages and deletes pages through empty content", async () => {
    state.row = null;

    const create = new FormData();
    create.set("id", "wiki:new");
    create.set("content", "====== New ======\n\nCreated.");

    const createResponse = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: create,
        headers: csrfHeaders()
      }),
      env
    );

    expect(createResponse.status).toBe(303);
    const createdRow = state.row as unknown as Record<string, unknown>;
    expect(createdRow.id).toBe("wiki:new");
    expect(state.searchPostings).toContainEqual(
      expect.objectContaining({ page_id: "wiki:new", term: "created" })
    );

    const remove = new FormData();
    remove.set("id", "wiki:new");
    remove.set("baseRevisionId", String(createdRow.revision_id));
    remove.set("content", "");

    const deleteResponse = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: remove,
        headers: csrfHeaders()
      }),
      env
    );

    expect(deleteResponse.status).toBe(303);
    expect(state.deleted).toBe(true);
    expect(state.searchPostings.some((posting) => posting.page_id === "wiki:new")).toBe(false);
  });

  it("falls back to static assets for public asset routes", async () => {
    const response = await handleRequest(
      new Request("https://example.com/dokuwiki.css"),
      env,
      async () => new Response("static asset")
    );

    await expect(response.text()).resolves.toBe("static asset");
  });

  it("renders a DokuWiki-styled HTML 404 for unknown extensionless routes", async () => {
    let staticFallbackCalled = false;
    const response = await handleRequest(
      new Request("https://example.com/qwetrqrweqwe"),
      env,
      async () => {
        staticFallbackCalled = true;
        return new Response("stale static index");
      }
    );

    expect(staticFallbackCalled).toBe(false);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain('<link rel="stylesheet" href="/dokuwiki.css?v=0.1.0">');
    expect(html).toContain('<h1 id="not-found">Not found</h1>');
    expect(html).toContain("<code>/qwetrqrweqwe</code>");
    expect(html).toContain('href="/wiki/wiki/welcome"');
    expect(html).not.toContain("DokuWiki Pages.dev Port</h1>");
  });
});

function createPageLockNamespaceStub(): {
  namespace: DurableObjectNamespace;
  reset: () => void;
} {
  const states = new Map<string, DurableObjectState>();

  return {
    namespace: {
      idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
      get: (id: DurableObjectId) => {
        const name = (id as unknown as { name: string }).name;
        let state = states.get(name);

        if (!state) {
          state = createDurableObjectStateStub();
          states.set(name, state);
        }

        const object = new PageLockObject(state);
        return {
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            object.fetch(new Request(input, init))
        } as unknown as DurableObjectStub;
      }
    } as unknown as DurableObjectNamespace,
    reset: () => states.clear()
  };
}

function csrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    cookie: headers.cookie
      ? `${headers.cookie}; DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`
      : `DW_CSRF_TOKEN=${TEST_CSRF_TOKEN}`,
    "x-csrf-token": TEST_CSRF_TOKEN
  };
}

function createDurableObjectStateStub(): DurableObjectState {
  const values = new Map<string, unknown>();

  return {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, value);
      },
      delete: async (key: string) => values.delete(key)
    }
  } as unknown as DurableObjectState;
}

function createD1Stub(state: D1StubState): D1Database {
  return {
    prepare: (sql: string) => ({
      all: async () => {
        if (sql.includes("select distinct namespace") && sql.includes("from media")) {
          return {
            results: [
              ...new Set(
                state.media
                  .filter((media) => media.is_deleted === 0)
                  .map((media) => String(media.namespace ?? ""))
              )
            ].map((namespace) => ({ namespace }))
          };
        }

        return { results: [] };
      },
      bind: (...values: unknown[]) => ({
        sql,
        values,
        first: async () => {
          const [id] = values;
          if (sql.includes("select 1 as ok")) {
            return { ok: 1 };
          }

          if (sql.includes("from media_revisions")) {
            return state.mediaRevisions.find((revision) => revision.id === id) ?? null;
          }

          if (sql.includes("from media")) {
            return state.media.find((media) => media.id === id && media.is_deleted === 0) ?? null;
          }

          if (sql.includes("from page_revisions") && !sql.includes("join")) {
            return state.revisions.find((revision) => revision.id === id) ?? null;
          }

          if (sql.includes("from drafts")) {
            return state.drafts.find((draft) => draft.id === id) ?? null;
          }

          return !state.deleted && state.row?.id === id ? state.row : null;
        },
        all: async () => {
          const [idOrLimit, rawLimit] = values;
          const hasOffset = sql.includes("offset ?");
          const limit = Number(
            hasOffset ? values.at(-2) : typeof rawLimit === "number" ? rawLimit : idOrLimit
          );
          const offset = hasOffset ? Number(values.at(-1)) : 0;
          const applyPagination = <T>(rows: T[], fallbackLimit: number): T[] => {
            const safeLimit = Number.isFinite(limit) ? limit : fallbackLimit;
            const safeOffset = Number.isFinite(offset) ? offset : 0;
            return rows.slice(safeOffset, safeOffset + safeLimit);
          };

          if (sql.includes("from search_postings") && sql.includes("where page_id = ?")) {
            return {
              results: state.searchPostings
                .filter((posting) => posting.page_id === idOrLimit)
                .map((posting) => ({ term: posting.term }))
            };
          }

          if (sql.includes("from acl_rules")) {
            return {
              results: sql.includes("where scope = ?")
                ? state.aclRules.filter((rule) => rule.scope === idOrLimit)
                : [...state.aclRules]
            };
          }

          if (sql.includes("from schema_versions")) {
            return {
              results: [{ version: 1, applied_at: "2026-05-07T00:00:00.000Z" }]
            };
          }

          if (sql.includes("from import_jobs")) {
            return {
              results: [
                {
                  id: "fixture-import",
                  source_path: "../dokuwiki",
                  status: "finished",
                  counts_json: '{"pages":3}',
                  errors_json: "[]",
                  started_at: "2026-05-07T00:00:00.000Z",
                  finished_at: "2026-05-07T00:01:00.000Z"
                }
              ]
            };
          }

          if (sql.includes("from cache_dependencies")) {
            const [dependencyType, dependencyId] = values;
            return {
              results: state.cacheDependencies
                .filter(
                  (dependency) =>
                    dependency.dependency_type === dependencyType &&
                    dependency.dependency_id === dependencyId
                )
                .map((dependency) => ({ cache_key: dependency.cache_key }))
            };
          }

          if (sql.includes("from search_postings sp")) {
            const hasNamespaceFilter = sql.includes("p.namespace = ?");
            const terms = values.slice(0, hasNamespaceFilter ? -2 : -1);
            const namespace = hasNamespaceFilter ? values.at(-2) : null;
            const searchLimit = Number(values.at(-1));
            const scored = new Map<string, number>();

            for (const posting of state.searchPostings) {
              if (terms.includes(posting.term)) {
                const pageId = String(posting.page_id);
                scored.set(pageId, (scored.get(pageId) ?? 0) + Number(posting.frequency));
              }
            }

            return {
              results: [...scored.entries()]
                .filter(([pageId]) => {
                  if (state.deleted || state.row?.id !== pageId) return false;
                  return !namespace || state.row.namespace === namespace;
                })
                .sort((a, b) => b[1] - a[1])
                .slice(0, Number.isFinite(searchLimit) ? searchLimit : 25)
                .map(([, score]) => ({
                  id: state.row?.id,
                  title: state.row?.title,
                  content: state.row?.content,
                  updated_at: state.row?.updated_at,
                  score
                }))
            };
          }

          if (sql.includes("from media") && sql.includes("where namespace = ?")) {
            const query = sql.includes("like")
              ? String(values[1] ?? "")
                  .replaceAll("%", "")
                  .replaceAll("\\", "")
                  .toLowerCase()
              : "";
            return {
              results: applyPagination(
                state.media.filter(
                  (media) =>
                    media.namespace === idOrLimit &&
                    media.is_deleted === 0 &&
                    (!query ||
                      String(media.id).toLowerCase().includes(query) ||
                      String(media.mime_type).toLowerCase().includes(query))
                ),
                200
              )
            };
          }

          if (sql.includes("from media_revisions")) {
            return {
              results: applyPagination(
                state.mediaRevisions.filter((revision) => revision.media_id === idOrLimit),
                50
              )
            };
          }

          if (sql.includes("from pages") && sql.includes("where namespace = ?")) {
            return {
              results: applyPagination(
                currentPageSourceRows(state).filter((page) => page.namespace === idOrLimit),
                200
              )
            };
          }

          if (sql.includes("from pages") && sql.includes("id in")) {
            return {
              results: currentPageSourceRows(state)
                .filter((page) => values.includes(page.id))
                .map((page) => ({ id: page.id }))
            };
          }

          if (sql.includes("from pages") && sql.includes("where is_deleted = 0")) {
            return {
              results: currentPageSourceRows(state)
                .map((page) => ({
                  id: page.id,
                  title: page.title,
                  updated_at: page.updated_at
                }))
                .slice(0, Number.isFinite(limit) ? limit : 500)
            };
          }

          if (sql.includes("from pages p") && sql.includes("where p.is_deleted = 0")) {
            return {
              results: currentPageSourceRows(state).slice(0, Number.isFinite(limit) ? limit : 200)
            };
          }

          if (sql.includes("from page_revisions")) {
            return {
              results: applyPagination(
                state.revisions.filter((revision) => revision.page_id === idOrLimit),
                50
              )
            };
          }

          if (sql.includes("from changelog")) {
            return {
              results: applyPagination(state.changelog, 50)
            };
          }

          return { results: [] };
        },
        run: async () => {
          if (sql.includes("insert into drafts")) {
            const [id, pageId, userId, content, baseRevisionId, updatedAt] = values;
            const existing = state.drafts.find((draft) => draft.id === id);

            if (existing) {
              existing.user_id = userId;
              existing.content = content;
              existing.base_revision_id = baseRevisionId;
              existing.updated_at = updatedAt;
            } else {
              state.drafts.push({
                id,
                page_id: pageId,
                user_id: userId,
                content,
                base_revision_id: baseRevisionId,
                updated_at: updatedAt
              });
            }
          }

          if (sql.includes("delete from drafts")) {
            const [id] = values;
            state.drafts = state.drafts.filter((draft) => draft.id !== id);
          }

          if (sql.includes("delete from cache_dependencies")) {
            const [cacheKey] = values;
            state.cacheDependencies = cacheKey
              ? state.cacheDependencies.filter((dependency) => dependency.cache_key !== cacheKey)
              : [];
          }

          return { success: true };
        }
      })
    }),
    batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
      state.batches.push(statements);
      const pagesStatement = statements.find((statement) =>
        statement.sql.includes("insert into pages")
      );
      const revisionStatement = statements.find((statement) =>
        statement.sql.includes("insert into page_revisions")
      );
      const changelogStatement = statements.find((statement) =>
        statement.sql.includes("insert into changelog")
      );
      const mediaStatement = statements.find((statement) =>
        statement.sql.includes("insert into media (")
      );
      const mediaDeleteStatement = statements.find((statement) =>
        statement.sql.includes("update media")
      );
      const mediaRevisionStatement = statements.find((statement) =>
        statement.sql.includes("insert into media_revisions")
      );

      if (pagesStatement && revisionStatement) {
        const [id, namespace, title, revisionId, isDeleted, , updatedAt] = pagesStatement.values;
        const [, pageId, content, , , , summary, changeType, sizeChange, createdAt] =
          revisionStatement.values;

        state.deleted = isDeleted === 1;
        state.row = {
          id,
          namespace,
          title,
          revision_id: revisionId,
          content,
          updated_at: updatedAt
        };
        state.revisions.unshift({
          id: revisionId,
          page_id: pageId,
          content,
          summary,
          change_type: changeType,
          size_change: sizeChange,
          created_at: createdAt
        });
      }

      if (changelogStatement) {
        const [
          changelogId,
          subjectId,
          revisionId,
          ,
          userName,
          ip,
          changeType,
          summary,
          sizeChange,
          createdAt
        ] = changelogStatement.values;
        const subjectType = changelogStatement.sql.includes("'media'") ? "media" : "page";

        state.changelog.unshift({
          id: changelogId,
          subject_type: subjectType,
          subject_id: subjectId,
          revision_id: revisionId,
          user_name: userName,
          ip,
          change_type: changeType,
          summary,
          size_change: sizeChange,
          created_at: createdAt
        });
      }

      if (mediaStatement && mediaRevisionStatement) {
        const [
          id,
          namespace,
          objectKey,
          mimeType,
          byteLength,
          contentHash,
          currentRevisionId,
          createdAt,
          updatedAt
        ] = mediaStatement.values;
        const [
          revisionId,
          mediaId,
          revisionObjectKey,
          revisionMimeType,
          revisionByteLength,
          revisionContentHash,
          authorId,
          summary,
          changeType,
          revisionCreatedAt
        ] = mediaRevisionStatement.values;
        const existingMedia = state.media.find((media) => media.id === id);

        if (existingMedia) {
          existingMedia.namespace = namespace;
          existingMedia.object_key = objectKey;
          existingMedia.mime_type = mimeType;
          existingMedia.byte_length = byteLength;
          existingMedia.content_hash = contentHash;
          existingMedia.current_revision_id = currentRevisionId;
          existingMedia.is_deleted = 0;
          existingMedia.updated_at = updatedAt;
        } else {
          state.media.unshift({
            id,
            namespace,
            object_key: objectKey,
            mime_type: mimeType,
            byte_length: byteLength,
            content_hash: contentHash,
            current_revision_id: currentRevisionId,
            is_deleted: 0,
            created_at: createdAt,
            updated_at: updatedAt
          });
        }

        state.mediaRevisions.unshift({
          id: revisionId,
          media_id: mediaId,
          object_key: revisionObjectKey,
          mime_type: revisionMimeType,
          byte_length: revisionByteLength,
          content_hash: revisionContentHash,
          author_id: authorId,
          summary,
          change_type: changeType,
          created_at: revisionCreatedAt
        });
      }

      if (mediaDeleteStatement && mediaRevisionStatement) {
        const [currentRevisionId, updatedAt, id] = mediaDeleteStatement.values;
        const [
          revisionId,
          mediaId,
          revisionObjectKey,
          revisionMimeType,
          revisionByteLength,
          revisionContentHash,
          authorId,
          summary,
          changeType,
          revisionCreatedAt
        ] = mediaRevisionStatement.values;
        const existingMedia = state.media.find((media) => media.id === id);

        if (existingMedia) {
          existingMedia.current_revision_id = currentRevisionId;
          existingMedia.is_deleted = 1;
          existingMedia.updated_at = updatedAt;
        }

        state.mediaRevisions.unshift({
          id: revisionId,
          media_id: mediaId,
          object_key: revisionObjectKey,
          mime_type: revisionMimeType,
          byte_length: revisionByteLength,
          content_hash: revisionContentHash,
          author_id: authorId,
          summary,
          change_type: changeType,
          created_at: revisionCreatedAt
        });
      }

      for (const statement of statements) {
        if (statement.sql.includes("delete from search_postings where page_id = ?")) {
          const [pageId] = statement.values;
          state.searchPostings = state.searchPostings.filter(
            (posting) => posting.page_id !== pageId
          );
        }

        if (statement.sql.includes("insert into search_postings")) {
          const [term, pageId, frequency, updatedAt] = statement.values;
          const existing = state.searchPostings.find(
            (posting) => posting.term === term && posting.page_id === pageId
          );

          if (existing) {
            existing.frequency = frequency;
            existing.updated_at = updatedAt;
          } else {
            state.searchPostings.push({
              term,
              page_id: pageId,
              frequency,
              updated_at: updatedAt
            });
          }
        }

        if (statement.sql.includes("insert into metadata")) {
          const [subjectId, key, valueJson, updatedAt] = statement.values;
          const subjectType = statement.sql.includes("'media'") ? "media" : "page";
          const existing = state.metadata.find(
            (record) =>
              record.subject_type === subjectType &&
              record.subject_id === subjectId &&
              record.key === key
          );

          if (existing) {
            existing.value_json = valueJson;
            existing.updated_at = updatedAt;
          } else {
            state.metadata.push({
              subject_type: subjectType,
              subject_id: subjectId,
              key,
              value_json: valueJson,
              updated_at: updatedAt
            });
          }
        }

        if (statement.sql.includes("delete from cache_dependencies where cache_key = ?")) {
          const [cacheKey] = statement.values;
          state.cacheDependencies = state.cacheDependencies.filter(
            (dependency) => dependency.cache_key !== cacheKey
          );
        }

        if (statement.sql.includes("insert into cache_dependencies")) {
          const [cacheKey, dependencyType, dependencyId] = statement.values;
          const existing = state.cacheDependencies.find(
            (dependency) =>
              dependency.cache_key === cacheKey &&
              dependency.dependency_type === dependencyType &&
              dependency.dependency_id === dependencyId
          );

          if (!existing) {
            state.cacheDependencies.push({
              cache_key: cacheKey,
              dependency_type: dependencyType,
              dependency_id: dependencyId
            });
          }
        }
      }

      return [];
    }
  } as unknown as D1Database;
}

type R2OperationCounters = Record<"head" | "get" | "put" | "delete", number>;

function createR2Stub(counters?: R2OperationCounters): R2Bucket {
  const objects = new Map<string, BodyInit>([
    ["media/current/wiki/logo.svg", "<svg>current</svg>"],
    ["media/revisions/wiki/logo.svg/20260506000000", "<svg>old</svg>"]
  ]);

  return {
    head: async (key: string) => {
      if (counters) counters.head += 1;
      return objects.has(key) ? ({} as R2Object) : null;
    },
    get: async (key: string) => {
      if (counters) counters.get += 1;
      const value = objects.get(key);
      if (!value) return null;

      return {
        body: new Response(value).body
      };
    },
    put: async (key: string, value: BodyInit) => {
      if (counters) counters.put += 1;
      objects.set(key, value);
      return {} as R2Object;
    },
    delete: async (key: string) => {
      if (counters) counters.delete += 1;
      objects.delete(key);
    }
  } as unknown as R2Bucket;
}

function currentPageRow(): Record<string, unknown> {
  return {
    id: "wiki:welcome",
    namespace: "wiki",
    title: "Welcome",
    revision_id: "wiki:welcome@2026-05-07T00:00:00.000Z",
    content: "====== Welcome ======\n\nImported page.",
    updated_at: "2026-05-07T00:00:00.000Z"
  };
}

function currentPageSourceRows(state: D1StubState): Record<string, unknown>[] {
  const rows = [...seedPageSourceRows()];

  if (!state.deleted && state.row) {
    const id = String(state.row.id);
    rows.unshift({
      id,
      namespace: state.row.namespace ?? namespaceFromId(id),
      title: state.row.title,
      content: state.row.content,
      updated_at: state.row.updated_at
    });
  }

  return rows.filter(
    (row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index
  );
}

function seedPageSourceRows(): Record<string, unknown>[] {
  return [
    {
      id: "wiki:guide",
      namespace: "wiki",
      title: "Guide",
      content: "====== Guide ======\n\nSee [[wiki:welcome]] and [[missing:page]].",
      updated_at: "2026-05-06T00:00:00.000Z"
    },
    {
      id: "playground:playground",
      namespace: "playground",
      title: "Playground",
      content: "====== Playground ======\n\nScratch page.",
      updated_at: "2026-05-05T00:00:00.000Z"
    }
  ];
}

function namespaceFromId(id: string): string {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
}

function seedRevisions(): Record<string, unknown>[] {
  return [
    {
      id: "wiki:welcome@2026-05-07T00:00:00.000Z",
      page_id: "wiki:welcome",
      content: "====== Welcome ======\n\nImported page.",
      summary: "Initial import",
      change_type: "create",
      size_change: 38,
      created_at: "2026-05-07T00:00:00.000Z"
    },
    {
      id: "wiki:welcome@2026-05-06T00:00:00.000Z",
      page_id: "wiki:welcome",
      content: "====== Welcome ======\n\nOlder page.",
      summary: "Older import",
      change_type: "edit",
      size_change: 34,
      created_at: "2026-05-06T00:00:00.000Z"
    }
  ];
}

function seedChangelog(): Record<string, unknown>[] {
  return [
    {
      id: "page:wiki:welcome@2026-05-07T00:00:00.000Z",
      subject_type: "page",
      subject_id: "wiki:welcome",
      revision_id: "wiki:welcome@2026-05-07T00:00:00.000Z",
      user_name: null,
      change_type: "create",
      summary: "Initial import",
      size_change: 38,
      created_at: "2026-05-07T00:00:00.000Z"
    }
  ];
}

function seedSearchPostings(): Record<string, unknown>[] {
  return [
    {
      term: "welcome",
      page_id: "wiki:welcome",
      frequency: 5,
      updated_at: "2026-05-07T00:00:00.000Z"
    },
    {
      term: "imported",
      page_id: "wiki:welcome",
      frequency: 1,
      updated_at: "2026-05-07T00:00:00.000Z"
    }
  ];
}

function seedMedia(): Record<string, unknown>[] {
  return [
    {
      id: "wiki:logo.svg",
      namespace: "wiki",
      object_key: "media/current/wiki/logo.svg",
      mime_type: "image/svg+xml",
      byte_length: 18,
      content_hash: "current-media-hash",
      current_revision_id: "media-rev-current",
      is_deleted: 0,
      created_at: "2026-05-06T00:00:00.000Z",
      updated_at: "2026-05-07T00:00:00.000Z"
    }
  ];
}

function seedMediaRevisions(): Record<string, unknown>[] {
  return [
    {
      id: "media-rev-1",
      media_id: "wiki:logo.svg",
      object_key: "media/revisions/wiki/logo.svg/20260506000000",
      mime_type: "image/svg+xml",
      byte_length: 14,
      content_hash: "old-media-hash",
      change_type: "edit",
      summary: "Older media",
      created_at: "2026-05-06T00:00:00.000Z"
    }
  ];
}

function seedAclRules(): Record<string, unknown>[] {
  return [aclRule("*", "all", "@ALL", 16)];
}

function aclRule(
  scope: string,
  principalType: "all" | "group" | "user",
  principal: string,
  permission: number
): Record<string, unknown> {
  return {
    id: `acl:${scope}:${principal}`,
    scope,
    principal_type: principalType,
    principal,
    permission,
    created_at: "2026-05-07T00:00:00.000Z"
  };
}
