import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/app";
import type { Env } from "../src/env";
import { PageLockObject } from "../src/storage/page-lock-object";
import { UPLOAD_XSS_MESSAGE } from "../src/wiki/media-validation";
import { mediaToken, requestedMediaSize } from "../src/wiki/media-token";
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
const TEST_DOKUWIKI_COOKIE_SALT = "test-dokuwiki-cookie-salt";
const TEST_PIXEL_PNG = base64Bytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII="
);

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
    },
    list: async (options?: { prefix?: string }) => ({
      keys: [...renderCache.keys()]
        .filter((key) => !options?.prefix || key.startsWith(options.prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined
    })
  } as unknown as KVNamespace,
  PAGE_LOCKS: pageLocks.namespace,
  SITE_NAME: "Test Wiki",
  API_BEARER_TOKEN: "test-token",
  API_CORS_ORIGINS: "https://client.example",
  DOKUWIKI_COOKIE_SALT: TEST_DOKUWIKI_COOKIE_SALT,
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
    env.DOKUWIKI_COOKIE_SALT = TEST_DOKUWIKI_COOKIE_SALT;
    env.MAINTENANCE_MODE = undefined;
    env.CAMELCASE = undefined;
    env.TYPOGRAPHY = undefined;
    env.AUTOPLURAL = undefined;
    env.REL_NOFOLLOW = undefined;
    env.REFCHECK = undefined;
    env.MEDIAREVISIONS = undefined;
    env.IEXSSPROTECT = undefined;
    env.FETCHSIZE = undefined;
    env.BREADCRUMBS = undefined;
    env.YOUAREHERE = undefined;
    env.FULLPATH = undefined;
    env.DFORMAT = undefined;
    env.LOCKTIME = undefined;
    env.USEDRAFT = undefined;
    env.TARGET_WIKI = undefined;
    env.TARGET_INTERWIKI = undefined;
    env.TARGET_EXTERN = undefined;
    env.TARGET_MEDIA = undefined;
    env.TARGET_WINDOWS = undefined;
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
    expect(html).toContain(
      '<div class="docInfo"><bdi>wiki/welcome.txt</bdi> · Last modified: <time datetime="2026-05-07T00:00:00.000Z">2026-05-07T00:00:00.000Z</time></div>'
    );
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

  it("honors the FULLPATH setting for page info paths", async () => {
    env.FULLPATH = "1";

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      '<div class="docInfo"><bdi>data/pages/wiki/welcome.txt</bdi> · Last modified: <time datetime="2026-05-07T00:00:00.000Z">2026-05-07T00:00:00.000Z</time></div>'
    );
  });

  it("renders and updates DokuWiki-style recent page breadcrumbs", async () => {
    const priorTrail = encodeURIComponent(JSON.stringify([{ id: "wiki:syntax", name: "Syntax" }]));
    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome", {
        headers: {
          cookie: `DW_PAGES_BC=${priorTrail}`
        }
      }),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<div class="trace"><span class="bchead">Trace:</span>');
    expect(html).not.toContain('<div class="youarehere">');
    expect(html).toContain(
      '<a href="/wiki/wiki/syntax" class="breadcrumbs" title="wiki:syntax">Syntax</a>'
    );
    expect(html).toContain(
      '<span class="curid"><bdi><a href="/wiki/wiki/welcome" class="breadcrumbs" title="wiki:welcome">Welcome</a></bdi></span>'
    );
    expect(response.headers.get("set-cookie")).toContain("DW_PAGES_BC=");
  });

  it("honors the YOUAREHERE setting for hierarchical header breadcrumbs", async () => {
    env.YOUAREHERE = "1";

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      '<div class="youarehere"><span>You are here: </span><a href="/wiki/wiki">wiki</a> <span class="bcsep">&raquo;</span> <span>welcome</span></div>'
    );
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

  it("honors the CAMELCASE parser setting for page views", async () => {
    env.CAMELCASE = "1";
    state.row = {
      ...currentPageRow(),
      content: "====== Welcome ======\n\nCamelCase and ExistingPage."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      '<a href="/wiki/wiki/camelcase" class="wikilink2" title="This topic does not exist yet">CamelCase</a>'
    );
    expect(html).toContain(
      '<a href="/wiki/wiki/existingpage" class="wikilink2" title="This topic does not exist yet">ExistingPage</a>'
    );
    expect(cachePuts).not.toContain("page:wiki:welcome");
  });

  it("honors imported AUTOPLURAL behavior for missing page links", async () => {
    state.metadata.push({
      subject_type: "config",
      subject_id: "dokuwiki",
      key: "conf:autoplural",
      value_json: JSON.stringify({ key: "autoplural", value: 1 }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.row = {
      ...currentPageRow(),
      id: "wiki:cats",
      namespace: "wiki",
      title: "Cats",
      content: "====== Cats ======\n\n[[cat|Cat]] and [[guides|Guides]]."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/cats"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<a href="/wiki/wiki/cats" class="wikilink1">Cat</a>');
    expect(html).toContain('<a href="/wiki/wiki/guide" class="wikilink1">Guides</a>');
  });

  it("honors the TYPOGRAPHY parser setting for page views", async () => {
    env.TYPOGRAPHY = "2";
    state.metadata.push({
      subject_type: "config",
      subject_id: "entities",
      key: "??",
      value_json: JSON.stringify({ token: "??", replacement: "‽", order: 0 }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "smileys",
      key: ":-)",
      value_json: JSON.stringify({ token: ":-)", filename: "custom.svg" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "acronyms",
      key: "API",
      value_json: JSON.stringify({ acronym: "API", title: "Custom API" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "interwiki",
      key: "docs",
      value_json: JSON.stringify({ shortcut: "docs", template: "https://docs.example/{URL}" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "scheme",
      key: "foo",
      value_json: JSON.stringify({ protocol: "foo" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "dokuwiki",
      key: "conf:relnofollow",
      value_json: JSON.stringify({ key: "relnofollow", value: 0 }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "dokuwiki",
      key: "conf:target.extern",
      value_json: JSON.stringify({ key: "target.extern", value: "_blank" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "config",
      subject_id: "dokuwiki",
      key: "conf:target.interwiki",
      value_json: JSON.stringify({ key: "target.interwiki", value: "_blank" }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    state.row = {
      ...currentPageRow(),
      content:
        "====== Welcome ======\n\n'quoted' don't and 640x480?? :-) API [[docs>Guide|Docs]] [[foo://service/path|Foo]]"
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("‘quoted’ don’t and 640&times;480‽");
    expect(html).toContain('<img src="/images/smileys/custom.svg"');
    expect(html).toContain('<abbr title="Custom API">API</abbr>');
    expect(html).toContain(
      '<a href="https://docs.example/Guide" class="interwiki iw_docs" target="_blank" rel="noopener">Docs</a>'
    );
    expect(html).toContain(
      '<a href="foo://service/path" class="urlextern" target="_blank" rel="noopener">Foo</a>'
    );
    expect(cachePuts).not.toContain("page:wiki:welcome");
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

  it("applies BASE_DIR to generated URLs and routed requests", async () => {
    const configuredEnv = {
      ...env,
      BASE_DIR: "/docs"
    } satisfies Env;

    const response = await handleRequest(
      new Request("https://example.com/docs/wiki/wiki/welcome"),
      configuredEnv
    );
    const redirect = await handleRequest(new Request("https://example.com/docs/"), configuredEnv);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<link rel="canonical" href="/docs/wiki/wiki/welcome">');
    expect(html).toContain('<link rel="stylesheet" href="/docs/dokuwiki.css?v=0.1.0">');
    expect(html).toContain(
      '<li class="action login"><a href="/docs/wiki/wiki/welcome?do=login" rel="nofollow">Log In</a></li>'
    );
    expect(html).toContain('<form class="search" method="get" action="/docs/search">');
    expect(html).toContain('<option value="/docs/media-manager?ns=wiki">Media Manager</option>');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/docs/wiki/wiki/welcome");
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
    const code = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=export_code&codeblock=0"),
      env
    );
    const htmlAlias = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=export_htmlbody"),
      env
    );
    const metadataExport = await handleRequest(
      new Request("https://example.com/doku.php?id=Wiki:Welcome&do=export_metadata"),
      env
    );

    expect(raw.status).toBe(301);
    expect(raw.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_raw");
    expect(code.status).toBe(301);
    expect(code.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_code&codeblock=0");
    expect(htmlAlias.status).toBe(301);
    expect(htmlAlias.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_xhtmlbody");
    expect(metadataExport.status).toBe(301);
    expect(metadataExport.headers.get("location")).toBe("/wiki/wiki/welcome?do=export_metadata");
  });

  it("maps legacy DokuWiki page actions to native Pages behavior", async () => {
    const check = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=check"),
      env
    );
    const denied = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=denied"),
      env
    );
    const locked = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=locked"),
      env
    );
    const conflict = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=conflict"),
      env
    );
    const cancel = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=cancel"),
      env
    );
    const recover = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=recover"),
      env
    );
    const draftDelete = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=draftdel"),
      env
    );
    const authToken = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=authtoken"),
      env
    );
    const plugin = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=plugin"),
      env
    );
    const media = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=media"),
      env
    );
    const redirect = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=redirect&hid=welcome"),
      env
    );

    expect(check.status).toBe(200);
    await expect(check.text()).resolves.toContain("<h1>Diagnostics</h1>");
    expect(denied.status).toBe(403);
    await expect(denied.text()).resolves.toContain("<h1>Permission denied</h1>");
    expect(locked.status).toBe(200);
    await expect(locked.text()).resolves.toContain("does not currently have an active edit lock");
    expect(conflict.status).toBe(409);
    const conflictHtml = await conflict.text();
    expect(conflictHtml).toContain("<h1>A newer version exists</h1>");
    expect(conflictHtml).toContain('<form id="dw__editform" class="conflict"');
    expect(conflictHtml).toContain('name="do[save]"');
    expect(conflictHtml).toContain('name="do[cancel]"');
    expect(conflictHtml).toContain('class="diff diff_sidebyside"');
    expect(cancel.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(recover.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
    expect(draftDelete.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
    expect(authToken.status).toBe(501);
    await expect(authToken.text()).resolves.toContain("Authentication token");
    expect(plugin.status).toBe(501);
    await expect(plugin.text()).resolves.toContain("DokuWiki action plugin dispatch");
    expect(media.headers.get("location")).toBe("/media-manager?ns=wiki");
    expect(redirect.headers.get("location")).toBe("/wiki/wiki/welcome#welcome");
  });

  it("hides and rejects actions listed in DISABLE_ACTIONS", async () => {
    const disabledEnv = {
      ...env,
      DISABLE_ACTIONS: "edit,revisions,media,login,register"
    } satisfies Env;

    const view = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome"),
      disabledEnv
    );
    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      disabledEnv
    );

    const saveForm = new FormData();
    saveForm.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    saveForm.set("content", "====== Disabled edit ======");

    const save = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=save", {
        method: "POST",
        body: saveForm,
        headers: csrfHeaders()
      }),
      disabledEnv
    );

    expect(view.status).toBe(200);
    const html = await view.text();
    expect(html).not.toContain("/wiki/wiki/welcome?do=edit");
    expect(html).not.toContain("/wiki/wiki/welcome?do=revisions");
    expect(html).not.toContain("Media Manager");
    expect(html).not.toContain("Log In");
    expect(html).not.toContain("Register");
    expect(edit.status).toBe(403);
    await expect(edit.text()).resolves.toContain("<h1>Action disabled</h1>");
    expect(save.status).toBe(403);
    expect(state.row?.content).not.toContain("Disabled edit");
  });

  it("accepts legacy POST action routing for save, preview, draft, and cancel", async () => {
    const saveForm = new FormData();
    saveForm.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    saveForm.set("content", "====== Saved through do=save ======\n\nUpdated.");
    saveForm.set("summary", "Legacy save");

    const saved = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=save", {
        method: "POST",
        body: saveForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.row?.content).toContain("Saved through do=save");

    const previewForm = new FormData();
    previewForm.set("content", "====== Previewed ======\n\nText.");

    const preview = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=preview", {
        method: "POST",
        body: previewForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(preview.status).toBe(200);
    await expect(preview.text()).resolves.toContain("<h1>Preview</h1>");

    const draftForm = new FormData();
    draftForm.set("baseRevisionId", String(state.row?.revision_id));
    draftForm.set("content", "====== Draft through doku.php ======");

    const draft = await handleRequest(
      new Request("https://example.com/doku.php?id=wiki:welcome&do=draft", {
        method: "POST",
        body: draftForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(draft.status).toBe(303);
    expect(draft.headers.get("location")).toBe("/wiki/wiki/welcome?do=edit");
    expect(state.drafts).toHaveLength(1);

    const cancel = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=cancel", {
        method: "POST",
        body: new FormData(),
        headers: csrfHeaders()
      }),
      env
    );

    expect(cancel.status).toBe(303);
    expect(cancel.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.drafts).toHaveLength(0);

    const redirectForm = new FormData();
    redirectForm.set("content", "===== Redirect Heading =====\n\nText");

    const redirected = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=redirect", {
        method: "POST",
        body: redirectForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(redirected.status).toBe(303);
    expect(redirected.headers.get("location")).toBe("/wiki/wiki/welcome#redirect-heading");
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
    const linkwizNamespace = await handleRequest(
      new Request("https://example.com/lib/exe/ajax.php?call=linkwiz&q=wiki:"),
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
    await expect(quick.text()).resolves.toContain("Matching pagenames");
    expect(suggestions.headers.get("content-type")).toBe("application/x-suggestions+json");
    await expect(suggestions.json()).resolves.toEqual(["welcome", ["welcome"], [], []]);
    const linkwizHtml = await linkwiz.text();
    expect(linkwizHtml).toContain('class="odd type_f"');
    expect(linkwizHtml).toContain('title="wiki:welcome"');
    const linkwizNamespaceHtml = await linkwizNamespace.text();
    expect(linkwizNamespaceHtml).toContain("jump to parent namespace");
    expect(linkwizNamespaceHtml).toContain('class="even type_f"');
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
    expect(install.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(install.text()).resolves.toContain("<h1>DokuWiki installer</h1>");
    expect(indexer.status).toBe(200);
    expect(indexer.headers.get("content-type")).toBe("image/gif");
    expect(taskrunner.status).toBe(200);
    expect(taskrunner.headers.get("content-type")).toBe("image/gif");
    expect(taskrunner.headers.get("cache-control")).toBe("no-store");
  });

  it("runs legacy DokuWiki indexer tasks for page ids", async () => {
    state.searchPostings = [
      {
        term: "stale",
        page_id: "wiki:welcome",
        frequency: 1,
        updated_at: "2026-05-01T00:00:00.000Z"
      }
    ];

    const debug = await handleRequest(
      new Request("https://example.com/lib/exe/indexer.php?id=Wiki:Welcome&debug=1"),
      env
    );
    const json = await handleRequest(
      new Request("https://example.com/lib/exe/taskrunner.php?id=wiki:missing", {
        headers: { accept: "application/json" }
      }),
      env
    );

    expect(debug.status).toBe(200);
    expect(debug.headers.get("content-type")).toContain("text/plain");
    await expect(debug.text()).resolves.toContain("Indexer: finished");
    expect(state.searchPostings).toContainEqual(
      expect.objectContaining({ page_id: "wiki:welcome", term: "imported" })
    );
    expect(state.searchPostings).not.toContainEqual(
      expect.objectContaining({ page_id: "wiki:welcome", term: "stale" })
    );
    expect(json.status).toBe(200);
    await expect(json.json()).resolves.toMatchObject({
      ok: true,
      task: "indexer",
      id: "wiki:missing",
      status: "missing"
    });
  });

  it("returns JSON for unsupported legacy endpoints when JSON is requested", async () => {
    const install = await handleRequest(
      new Request("https://example.com/install.php", { headers: { accept: "application/json" } }),
      env
    );

    expect(install.status).toBe(410);
    await expect(install.json()).resolves.toMatchObject({ status: "not_available" });
  });

  it("audits documented legacy URL compatibility routes", async () => {
    const redirects: Array<[string, number, string]> = [
      ["/", 302, "/wiki/wiki/welcome"],
      ["/index.php", 301, "/wiki/wiki/welcome"],
      ["/index.html", 301, "/wiki/wiki/welcome"],
      ["/wiki", 301, "/wiki/wiki/welcome"],
      ["/wiki/", 301, "/wiki/wiki/welcome"],
      ["/doku.php?id=Wiki:Welcome", 301, "/wiki/wiki/welcome"],
      ["/doku.php?id=Wiki:Welcome&do=edit", 301, "/wiki/wiki/welcome?do=edit"],
      ["/doku.php?id=Wiki:Welcome&do=revisions", 301, "/wiki/wiki/welcome?do=revisions"],
      ["/doku.php?id=Wiki:Welcome&do=backlink", 301, "/wiki/wiki/welcome?do=backlink"],
      ["/doku.php?id=Wiki:Welcome&do=source", 301, "/wiki/wiki/welcome?do=source"],
      ["/doku.php?id=Wiki:Welcome&do=subscribe", 301, "/wiki/wiki/welcome?do=subscribe"],
      ["/doku.php?id=Wiki:Welcome&do=check", 301, "/wiki/wiki/welcome?do=check"],
      ["/doku.php?id=Wiki:Welcome&do=denied", 301, "/wiki/wiki/welcome?do=denied"],
      ["/doku.php?id=Wiki:Welcome&do=locked", 301, "/wiki/wiki/welcome?do=locked"],
      ["/doku.php?id=Wiki:Welcome&do=conflict", 301, "/wiki/wiki/welcome?do=conflict"],
      ["/doku.php?id=Wiki:Welcome&do=cancel", 301, "/wiki/wiki/welcome?do=cancel"],
      ["/doku.php?id=Wiki:Welcome&do=recover", 301, "/wiki/wiki/welcome?do=recover"],
      ["/doku.php?id=Wiki:Welcome&do=draftdel", 301, "/wiki/wiki/welcome?do=draftdel"],
      ["/doku.php?id=Wiki:Welcome&do=authtoken", 301, "/wiki/wiki/welcome?do=authtoken"],
      ["/doku.php?id=Wiki:Welcome&do=plugin", 301, "/wiki/wiki/welcome?do=plugin"],
      ["/doku.php?id=Wiki:Welcome&do=media", 301, "/wiki/wiki/welcome?do=media"],
      [
        "/doku.php?id=Wiki:Welcome&do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z&rev2=wiki%3Awelcome%402026-05-07T00%3A00%3A00.000Z",
        301,
        "/wiki/wiki/welcome?do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z&rev2=wiki%3Awelcome%402026-05-07T00%3A00%3A00.000Z"
      ],
      ["/doku.php?id=Wiki:Welcome&do=export_raw", 301, "/wiki/wiki/welcome?do=export_raw"],
      [
        "/doku.php?id=Wiki:Welcome&do=export_code&codeblock=0",
        301,
        "/wiki/wiki/welcome?do=export_code&codeblock=0"
      ],
      ["/doku.php?id=Wiki:Welcome&do=export_xhtml", 301, "/wiki/wiki/welcome?do=export_xhtml"],
      [
        "/doku.php?id=Wiki:Welcome&do=export_htmlbody",
        301,
        "/wiki/wiki/welcome?do=export_xhtmlbody"
      ],
      [
        "/doku.php?id=Wiki:Welcome&do=export_metadata",
        301,
        "/wiki/wiki/welcome?do=export_metadata"
      ],
      ["/doku.php?id=Wiki:Welcome&do=export_odt", 301, "/wiki/wiki/welcome?do=export_odt"],
      ["/doku.php?do=admin", 301, "/admin"],
      ["/doku.php?do=admin&page=acl", 301, "/admin/acl"],
      ["/doku.php?do=admin&page=config", 301, "/admin/config"],
      ["/doku.php?do=admin&page=info", 301, "/diagnostics"],
      ["/doku.php?do=admin&page=logviewer", 301, "/admin/audit"],
      ["/doku.php?do=admin&page=usermanager", 301, "/admin/users"],
      ["/doku.php?do=register", 301, "/register"],
      ["/doku.php?do=profile", 301, "/profile"],
      ["/doku.php?do=resendpwd", 301, "/resendpwd"],
      ["/lib/exe/css.php?t=1", 301, "/dokuwiki.css?v=0.1.0"],
      ["/lib/exe/js.php?t=1", 301, "/dokuwiki.js?v=0.1.0"],
      ["/lib/exe/jquery.php", 301, "/dokuwiki.js?v=0.1.0"],
      ["/lib/exe/fetch.php?media=wiki:logo.svg&dl=1", 301, "/media/wiki/logo.svg?download=1"],
      [
        "/lib/exe/fetch.php?media=wiki:logo.svg&rev=20260506000000&dl=1",
        301,
        "/media/wiki/logo.svg?rev=20260506000000&download=1"
      ],
      [
        "/lib/exe/fetch.php?media=wiki:logo.svg&w=80&tok=abc123&cache=nocache",
        301,
        "/media/wiki/logo.svg?w=80&tok=abc123&cache=nocache"
      ],
      ["/lib/exe/detail.php?id=wiki:logo.svg", 301, "/media-detail/wiki/logo.svg"],
      ["/lib/exe/mediamanager.php?ns=wiki", 301, "/media-manager?ns=wiki"]
    ];

    for (const [path, status, location] of redirects) {
      const response = await handleRequest(new Request(`https://example.com${path}`), env);
      expect(response.status, path).toBe(status);
      expect(response.headers.get("location"), path).toBe(location);
      expect(response.headers.get("content-security-policy"), path).toContain("default-src 'self'");
    }

    const htmlRoutes: Array<[string, number, string]> = [
      ["/", 302, ""],
      ["/feed.php", 200, "application/rss+xml"],
      ["/feed", 200, "application/rss+xml"],
      ["/feed.xml", 200, "application/rss+xml"],
      ["/atom.xml", 200, "application/atom+xml"],
      ["/sitemap.xml", 200, "application/xml"],
      ["/sitemap", 200, "application/xml"],
      ["/robots.txt", 200, "text/plain"],
      ["/lib/exe/opensearch.php", 200, "application/xml"],
      ["/opensearch.xml", 200, "application/xml"],
      ["/lib/exe/manifest.php", 200, "application/manifest+json"],
      ["/manifest.webmanifest", 200, "application/manifest+json"],
      ["/install.php", 410, "text/html"],
      ["/doku.php?do=admin&page=extension", 501, "text/html"],
      ["/doku.php?do=admin&page=popularity", 501, "text/html"],
      ["/doku.php?do=admin&page=safefnrecode", 501, "text/html"],
      ["/doku.php?do=admin&page=styling", 501, "text/html"],
      ["/media-detail/wiki/logo.svg?mediado=diff&rev=media-rev-1", 200, "text/html"],
      ["/lib/exe/ajax.php?call=qsearch&q=welcome", 200, "text/html"],
      ["/lib/exe/ajax.php?call=suggestions&q=welcome", 200, "application/x-suggestions+json"],
      ["/lib/exe/ajax.php?call=linkwiz&q=welcome", 200, "text/html"],
      ["/lib/exe/ajax.php?call=index&idx=wiki", 200, "text/html"],
      ["/lib/exe/indexer.php", 200, "image/gif"],
      ["/lib/exe/xmlrpc.php", 501, "application/json"],
      ["/lib/exe/jsonrpc.php", 501, "application/json"],
      ["/lib/exe/openapi.php", 501, "application/json"],
      ["/lib/exe/taskrunner.php", 200, "image/gif"],
      ["/index?ns=wiki", 200, "text/html"]
    ];

    for (const [path, status, contentType] of htmlRoutes) {
      const response = await handleRequest(new Request(`https://example.com${path}`), env);
      expect(response.status, path).toBe(status);
      if (contentType) {
        expect(response.headers.get("content-type"), path).toContain(contentType);
      }
    }
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
    const noCache = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?cache=nocache"),
      env
    );
    const noCacheConditional = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?cache=nocache", {
        headers: {
          "if-none-match": '"current-media-hash"'
        }
      }),
      env
    );
    const resizedToken = mediaToken(
      "wiki:logo.svg",
      requestedMediaSize("80", null),
      TEST_DOKUWIKI_COOKIE_SALT
    );
    const resized = await handleRequest(
      new Request(`https://example.com/media/wiki/logo.svg?w=80&tok=${resizedToken}`),
      env
    );
    const invalidResized = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?w=80&tok=bad"),
      env
    );
    state.media.push({
      id: "wiki:pixel.png",
      namespace: "wiki",
      object_key: "media/current/wiki/pixel.png",
      mime_type: "image/png",
      byte_length: TEST_PIXEL_PNG.byteLength,
      content_hash: "pixel-media-hash",
      current_revision_id: "pixel-media-rev",
      is_deleted: 0,
      created_at: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:00:00.000Z"
    });
    const pixelResizedToken = mediaToken(
      "wiki:pixel.png",
      requestedMediaSize("4", null),
      TEST_DOKUWIKI_COOKIE_SALT
    );
    const pixelResized = await handleRequest(
      new Request(`https://example.com/media/wiki/pixel.png?w=4&tok=${pixelResizedToken}`),
      env
    );
    const revision = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?rev=media-rev-1"),
      env
    );
    state.metadata.push({
      subject_type: "page",
      subject_id: "wiki:welcome",
      key: "relation",
      value_json: JSON.stringify({
        media: {
          "wiki:logo.svg": true
        }
      }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    const detail = await handleRequest(
      new Request("https://example.com/media-detail/wiki/logo.svg"),
      env
    );
    const mediaDiff = await handleRequest(
      new Request("https://example.com/media-detail/wiki/logo.svg?mediado=diff&rev=media-rev-1"),
      env
    );
    state.media.push({
      id: "wiki:alpha.txt",
      namespace: "wiki",
      object_key: "media/current/wiki/alpha.txt",
      mime_type: "text/plain",
      byte_length: 42,
      content_hash: "alpha-media-hash",
      current_revision_id: "alpha-media-rev",
      is_deleted: 0,
      created_at: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:00:00.000Z"
    });
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
    expect(fetch.headers.get("cache-control")).toBe(
      "public, proxy-revalidate, no-transform, max-age=86400"
    );
    expect(fetch.headers.get("etag")).toBe('"fecd9e624768fd026cab0b594d0b836a"');
    expect(fetch.headers.get("last-modified")).toBe("Thu, 07 May 2026 00:00:00 GMT");
    expect(fetch.headers.get("content-disposition")).toBe('inline; filename="logo.svg";');
    expect(fetch.headers.get("accept-ranges")).toBe("bytes");
    expect(fetch.headers.get("x-dokuwiki-thumbnail-policy")).toBe("original");
    expect(resized.headers.get("x-dokuwiki-resize-policy")).toBe("unsupported");
    expect(invalidResized.status).toBe(412);
    await expect(invalidResized.text()).resolves.toBe("Precondition Failed");
    expect(pixelResized.status).toBe(200);
    expect(pixelResized.headers.get("content-type")).toBe("image/png");
    expect(pixelResized.headers.get("x-dokuwiki-resize-policy")).toBe("generated");
    const pixelBytes = new Uint8Array(await pixelResized.arrayBuffer());
    expect(pngDimensions(pixelBytes)).toEqual({ width: 4, height: 4 });
    await expect(fetch.text()).resolves.toBe("<svg>current</svg>");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("18");
    expect(head.headers.get("content-disposition")).toBe('inline; filename="logo.svg";');
    expect(head.headers.get("accept-ranges")).toBe("bytes");
    await expect(head.text()).resolves.toBe("");
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="logo.svg";');
    expect(noCache.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(noCache.headers.get("expires")).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
    expect(noCacheConditional.status).toBe(200);
    expect(revision.headers.get("cache-control")).toBe(
      "public, proxy-revalidate, no-transform, max-age=86400"
    );
    expect(revision.headers.get("etag")).toBe('"1912590ec0e578319276d01c8923e98c"');
    await expect(revision.text()).resolves.toBe("<svg>old</svg>");
    const detailHtml = await detail.text();
    expect(detailHtml).toContain('id="dokuwiki__detail"');
    expect(detailHtml).toContain('class="img_detail"');
    expect(detailHtml).toContain('id="page__revisions"');
    expect(detailHtml).toContain("Reference:");
    expect(detailHtml).toContain('href="/wiki/wiki/welcome"');
    expect(detailHtml).toContain("media-rev-current");
    expect(detailHtml).toContain("media-rev-1");
    const mediaDiffHtml = await mediaDiff.text();
    expect(mediaDiff.status).toBe(200);
    expect(mediaDiffHtml).toContain("Media diff");
    expect(mediaDiffHtml).toContain('id="mediamanager__diff"');
    expect(mediaDiffHtml).toContain("media-rev-1");
    expect(mediaDiffHtml).toContain("media-rev-current");
    const managerHtml = await manager.text();
    expect(managerHtml).toContain('id="media__manager"');
    expect(managerHtml).toContain('id="mediamgr__aside"');
    expect(managerHtml).toContain('id="mediamgr__content"');
    expect(managerHtml).toContain('id="media__tree"');
    expect(managerHtml).toContain('id="media__content"');
    expect(managerHtml).toContain('id="mediamanager__page"');
    expect(managerHtml).toContain("data-media-tree-toggle");
    expect(managerHtml).toContain("Media Files");
    expect(managerHtml).toContain("logo.svg");
    expect(managerHtml).toContain('class="idx media__manager media-grid"');
    expect(managerHtml).toContain('href="/media-manager?ns=wiki&amp;view=rows"');
    expect(managerHtml).toContain('id="dw__upload"');
    expect(managerHtml).toContain('id="upload__file"');
    expect(managerHtml).toContain('id="upload__name"');
    expect(managerHtml).toContain('id="dw__ow"');
    expect(managerHtml).toContain('id="media__upload_progress"');
    expect(managerHtml).toContain('id="dw__mediasearch"');
    expect(managerHtml).toContain('data-media-id="wiki:logo.svg"');
    expect(managerHtml).toContain('data-media-url="/media/wiki/logo.svg"');
    const rowManager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&view=rows&sort=date&order=desc"),
      env
    );
    const rowManagerHtml = await rowManager.text();
    expect(rowManagerHtml).toContain('class="idx media__manager media-rows"');
    expect(rowManagerHtml).toContain('class="media-manager__view-active"');
    expect(rowManagerHtml).toContain("Usage <code>{{:wiki:alpha.txt}}</code>");
    expect(rowManagerHtml.indexOf("alpha.txt")).toBeLessThan(rowManagerHtml.indexOf("logo.svg"));
    const descendingNameManager = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&sort=name&order=desc"),
      env
    );
    const descendingNameHtml = await descendingNameManager.text();
    expect(descendingNameHtml.indexOf("logo.svg")).toBeLessThan(
      descendingNameHtml.indexOf("alpha.txt")
    );
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

  it("enforces DokuWiki external media tokens before remote fetch redirects", async () => {
    const remoteUrl = "https://cdn.example/logo.png";
    const token = mediaToken(remoteUrl, requestedMediaSize(null, null), TEST_DOKUWIKI_COOKIE_SALT);
    const encoded = encodeURIComponent(remoteUrl);

    const invalid = await handleRequest(
      new Request(`https://example.com/lib/exe/fetch.php?tok=bad&media=${encoded}`),
      env
    );
    const redirect = await handleRequest(
      new Request(`https://example.com/lib/exe/fetch.php?tok=${token}&media=${encoded}`),
      env
    );

    expect(invalid.status).toBe(412);
    await expect(invalid.text()).resolves.toBe("Precondition Failed");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(remoteUrl);
  });

  it("downloads external image media when FETCHSIZE allows it", async () => {
    const remoteUrl = "https://cdn.example/logo.png";
    const token = mediaToken(remoteUrl, requestedMediaSize(null, null), TEST_DOKUWIKI_COOKIE_SALT);
    const encoded = encodeURIComponent(remoteUrl);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("pngbody", {
          headers: { "content-type": "image/png" }
        })
      )
      .mockResolvedValueOnce(
        new Response("oversized", {
          headers: { "content-type": "image/png" }
        })
      );

    try {
      env.FETCHSIZE = "32";
      const fetched = await handleRequest(
        new Request(`https://example.com/lib/exe/fetch.php?tok=${token}&media=${encoded}`),
        env
      );

      env.FETCHSIZE = "4";
      const oversized = await handleRequest(
        new Request(`https://example.com/lib/exe/fetch.php?tok=${token}&media=${encoded}`),
        env
      );

      expect(fetched.status).toBe(200);
      expect(fetched.headers.get("content-type")).toBe("image/png");
      expect(fetched.headers.get("content-disposition")).toBe('inline; filename="logo.png"');
      expect(fetched.headers.get("x-dokuwiki-remote-media")).toBe("fetched");
      await expect(fetched.text()).resolves.toBe("pngbody");
      expect(oversized.status).toBe(302);
      expect(oversized.headers.get("location")).toBe(remoteUrl);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      env.FETCHSIZE = undefined;
    }
  });

  it("searches media recursively and matches imported metadata fields", async () => {
    state.media.push({
      id: "wiki:albums:photo.jpg",
      namespace: "wiki:albums",
      object_key: "media/current/wiki/albums/photo.jpg",
      mime_type: "image/jpeg",
      byte_length: 128,
      content_hash: "photo-hash",
      current_revision_id: "photo-rev",
      is_deleted: 0,
      created_at: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:00:00.000Z"
    });
    state.metadata.push({
      subject_type: "media",
      subject_id: "wiki:albums:photo.jpg",
      key: "jpeg",
      value_json: JSON.stringify({
        fields: [{ label: "Title", value: "Sunset over the lake" }]
      }),
      updated_at: "2026-05-08T00:00:00.000Z"
    });

    const response = await handleRequest(
      new Request("https://example.com/media-manager?ns=wiki&q=sunset"),
      env
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("photo.jpg");
    expect(html).toContain("Search results for <strong>sunset</strong>");
    expect(html).not.toContain("No media found.");
  });

  it("answers conditional media fetches without R2 body reads", async () => {
    const r2Operations = { head: 0, get: 0, put: 0, delete: 0 };
    env.MEDIA_BUCKET = createR2Stub(r2Operations);

    const etag = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", {
        headers: { "if-none-match": '"fecd9e624768fd026cab0b594d0b836a"' }
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
    expect(etag.headers.get("etag")).toBe('"fecd9e624768fd026cab0b594d0b836a"');
    expect(etag.headers.get("content-length")).toBe(null);
    expect(etag.headers.get("content-disposition")).toBeNull();
    expect(modifiedSince.status).toBe(304);
    expect(r2Operations.get).toBe(0);
    expect(r2Operations.head).toBe(0);
  });

  it("serves current and old media byte ranges with DokuWiki-style headers", async () => {
    const current = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", {
        headers: { range: "bytes=0-4" }
      }),
      env
    );
    const oldRevision = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg?rev=media-rev-1", {
        headers: { range: "bytes=5-7" }
      }),
      env
    );
    const badRange = await handleRequest(
      new Request("https://example.com/media/wiki/logo.svg", {
        headers: { range: "bytes=99-100" }
      }),
      env
    );

    expect(current.status).toBe(206);
    expect(current.headers.get("accept-ranges")).toBe("bytes");
    expect(current.headers.get("content-range")).toBe("bytes 0-4/18");
    expect(current.headers.get("content-length")).toBe("5");
    expect(current.headers.get("content-disposition")).toBe('inline; filename="logo.svg";');
    await expect(current.text()).resolves.toBe("<svg>");

    expect(oldRevision.status).toBe(206);
    expect(oldRevision.headers.get("content-range")).toBe("bytes 5-7/14");
    expect(oldRevision.headers.get("etag")).toBe('"1912590ec0e578319276d01c8923e98c"');
    await expect(oldRevision.text()).resolves.toBe("old");

    expect(badRange.status).toBe(416);
    await expect(badRange.text()).resolves.toBe("Bad Range Request!");
  });

  it("forces media downloads from default and imported MIME configuration", async () => {
    state.media.push(
      {
        id: "wiki:archive.zip",
        namespace: "wiki",
        object_key: "media/current/wiki/archive.zip",
        mime_type: "application/zip",
        byte_length: 7,
        content_hash: "archive-hash",
        current_revision_id: "archive-rev",
        is_deleted: 0,
        created_at: "2026-05-08T00:00:00.000Z",
        updated_at: "2026-05-08T00:00:00.000Z"
      },
      {
        id: "wiki:readme.foo",
        namespace: "wiki",
        object_key: "media/current/wiki/readme.foo",
        mime_type: "text/x-foo",
        byte_length: 3,
        content_hash: "foo-hash",
        current_revision_id: "foo-rev",
        is_deleted: 0,
        created_at: "2026-05-08T00:00:00.000Z",
        updated_at: "2026-05-08T00:00:00.000Z"
      }
    );
    state.metadata.push({
      subject_type: "config",
      subject_id: "mime",
      key: "foo",
      value_json: JSON.stringify({
        extension: "foo",
        mimeType: "text/x-foo",
        forceDownload: true
      }),
      updated_at: "2026-05-08T00:00:00.000Z"
    });

    const archive = await handleRequest(
      new Request("https://example.com/media/wiki/archive.zip"),
      env
    );
    const custom = await handleRequest(
      new Request("https://example.com/media/wiki/readme.foo"),
      env
    );
    const inline = await handleRequest(new Request("https://example.com/media/wiki/logo.svg"), env);

    expect(archive.headers.get("content-disposition")).toBe('attachment; filename="archive.zip";');
    expect(custom.headers.get("content-disposition")).toBe('attachment; filename="readme.foo";');
    expect(inline.headers.get("content-disposition")).toBe('inline; filename="logo.svg";');
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

  it("uploads and displays parsed JPEG EXIF/IPTC metadata", async () => {
    const form = new FormData();
    form.set("ns", "wiki");
    form.set("summary", "Upload photo");
    form.set(
      "file",
      new File([uint8ArrayToArrayBuffer(jpegWithIptcMetadata())], "photo.jpg", {
        type: "image/jpeg"
      })
    );

    const response = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    const metadataRow = state.metadata.find(
      (record) =>
        record.subject_type === "media" &&
        record.subject_id === "wiki:photo.jpg" &&
        record.key === "jpeg"
    );
    const parsed = JSON.parse(String(metadataRow?.value_json));

    expect(parsed.tags).toMatchObject({
      "Iptc.Headline": "Uploaded headline",
      "Iptc.Caption": "Uploaded caption",
      "File.Width": "2",
      "File.Height": "3"
    });
    expect(parsed.display).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Title", value: "Uploaded headline" }),
        expect.objectContaining({ label: "Caption", value: "Uploaded caption" })
      ])
    );

    const detail = await handleRequest(
      new Request("https://example.com/media-detail/wiki/photo.jpg"),
      env
    );
    const html = await detail.text();

    expect(html).toContain("<dt>Title:</dt><dd>Uploaded headline</dd>");
    expect(html).toContain("<dt>Caption:</dt><dd>Uploaded caption</dd>");
    expect(html).toContain("<dt>Width:</dt><dd>2</dd>");
    expect(html).toContain("<dt>Height:</dt><dd>3</dd>");
  });

  it("accepts media uploads allowed by imported MIME configuration", async () => {
    state.metadata.push({
      subject_type: "config",
      subject_id: "mime",
      key: "foo",
      value_json: JSON.stringify({
        extension: "foo",
        mimeType: "text/x-foo",
        forceDownload: false
      }),
      updated_at: "2026-05-08T00:00:00.000Z"
    });

    const form = new FormData();
    form.set("ns", "wiki");
    form.set("summary", "Upload custom media");
    form.set("file", new File(["custom"], "custom.foo", { type: "text/x-foo" }));

    const response = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(state.media[0]).toMatchObject({
      id: "wiki:custom.foo",
      mime_type: "text/x-foo"
    });
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

  it("matches disabled media revision overwrite, history, delete, and revert behavior", async () => {
    env.MEDIAREVISIONS = "0";
    const initialRevisionCount = state.mediaRevisions.length;
    const uploadForm = new FormData();
    uploadForm.set("ns", "wiki");
    uploadForm.set("overwrite", "1");
    uploadForm.set("file", new File(["replacement"], "logo.svg", { type: "image/svg+xml" }));

    state.aclRules = [aclRule("*", "all", "@ALL", 8)];
    const deniedOverwrite = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: uploadForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(deniedOverwrite.status).toBe(403);
    await expect(deniedOverwrite.json()).resolves.toMatchObject({
      requiredPermission: 16
    });

    state.aclRules = seedAclRules();
    const overwrite = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: uploadForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );
    const revisions = await handleRequest(
      new Request("https://example.com/api/v1/media/revisions?id=wiki:logo.svg", {
        headers: { authorization: "Bearer test-token" }
      }),
      env
    );
    const detail = await handleRequest(
      new Request("https://example.com/media-detail/wiki/logo.svg"),
      env
    );
    const revertForm = new FormData();
    revertForm.set("id", "wiki:logo.svg");
    revertForm.set("revisionId", "media-rev-1");
    const revert = await handleRequest(
      new Request("https://example.com/api/media/revert", {
        method: "POST",
        body: revertForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );
    const deleteForm = new FormData();
    deleteForm.set("id", "wiki:logo.svg");
    const deleted = await handleRequest(
      new Request("https://example.com/api/media/delete", {
        method: "POST",
        body: deleteForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(overwrite.status).toBe(200);
    expect(state.media.find((media) => media.id === "wiki:logo.svg")).toMatchObject({
      byte_length: 11,
      is_deleted: 1
    });
    expect(state.mediaRevisions).toHaveLength(initialRevisionCount);
    await expect(revisions.json()).resolves.toMatchObject({ ok: true, revisions: [] });
    await expect(detail.text()).resolves.not.toContain("media__revert");
    expect(revert.status).toBe(404);
    await expect(revert.json()).resolves.toMatchObject({
      error: "Media revisions are disabled."
    });
    expect(deleted.status).toBe(200);
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

  it("honors the upstream iexssprotect toggle for SVG uploads", async () => {
    const blockedForm = new FormData();
    blockedForm.set("ns", "wiki");
    blockedForm.set(
      "file",
      new File(["<svg><script>alert(1)</script></svg>"], "bad.svg", {
        type: "image/svg+xml"
      })
    );

    const blocked = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: blockedForm,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(blocked.status).toBe(400);
    await expect(blocked.json()).resolves.toMatchObject({
      error: UPLOAD_XSS_MESSAGE
    });
    expect(state.media.some((media) => media.id === "wiki:bad.svg")).toBe(false);

    env.IEXSSPROTECT = "0";
    const allowedForm = new FormData();
    allowedForm.set("ns", "wiki");
    allowedForm.set(
      "file",
      new File(["<svg><script>alert(1)</script></svg>"], "trusted.svg", {
        type: "image/svg+xml"
      })
    );

    const allowed = await handleRequest(
      new Request("https://example.com/api/media/upload", {
        method: "POST",
        body: allowedForm,
        headers: csrfHeaders()
      }),
      env
    );

    expect(allowed.status).toBe(303);
    expect(allowed.headers.get("location")).toBe("/media-detail/wiki/trusted.svg");
    expect(state.media.find((media) => media.id === "wiki:trusted.svg")).toMatchObject({
      mime_type: "image/svg+xml"
    });
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

  it("blocks media deletes when refcheck finds relation metadata", async () => {
    state.metadata.push({
      subject_type: "page",
      subject_id: "wiki:welcome",
      key: "relation",
      value_json: JSON.stringify({
        references: {},
        media: {
          "wiki:logo.svg": true
        },
        firstimage: "wiki:logo.svg"
      }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    const initialRevisionCount = state.mediaRevisions.length;
    const form = new FormData();
    form.set("id", "wiki:logo.svg");
    form.set("summary", "Remove logo");

    const response = await handleRequest(
      new Request("https://example.com/api/media/delete", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Media file is still referenced.",
      id: "wiki:logo.svg",
      references: [
        {
          id: "wiki:welcome",
          title: "Welcome",
          updatedAt: "2026-05-07T00:00:00.000Z"
        }
      ]
    });
    expect(state.media.find((media) => media.id === "wiki:logo.svg")).toMatchObject({
      is_deleted: 0
    });
    expect(state.mediaRevisions).toHaveLength(initialRevisionCount);
  });

  it("allows media deletes when refcheck is disabled", async () => {
    env.REFCHECK = "0";
    state.metadata.push({
      subject_type: "page",
      subject_id: "wiki:welcome",
      key: "relation",
      value_json: JSON.stringify({
        media: {
          "wiki:logo.svg": true
        }
      }),
      updated_at: "2026-05-07T00:00:00.000Z"
    });
    const form = new FormData();
    form.set("id", "wiki:logo.svg");
    form.set("summary", "Remove stale logo");

    const response = await handleRequest(
      new Request("https://example.com/api/media/delete", {
        method: "POST",
        body: form,
        headers: csrfHeaders({ accept: "application/json" })
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      id: "wiki:logo.svg"
    });
    expect(state.media.find((media) => media.id === "wiki:logo.svg")).toMatchObject({
      is_deleted: 1
    });
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
        rendererVersion: 31,
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
        rendererVersion: 31,
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
    expect(html).toContain("<p><strong>This is an old revision of the document!</strong></p>");
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
      content: "====== Welcome ======\n\n===== Details =====\n\n==== More ====\n\nMore text."
    };

    const response = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="dw__toc"');
    expect(html).toContain('<a href="#details">Details</a>');
  });

  it("honors DokuWiki TOC and section edit settings", async () => {
    state.row = {
      ...currentPageRow(),
      content:
        "====== Welcome ======\n\n===== Details =====\n\n==== Hidden From TOC ====\n\nMore text."
    };
    const renderEnv = {
      ...env,
      TOC_MIN_HEADS: "2",
      MAX_TOC_LEVEL: "2",
      MAX_SECTION_EDIT_LEVEL: "1"
    } satisfies Env;

    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome"),
      renderEnv
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="dw__toc"');
    expect(html).toContain('<a href="#welcome">Welcome</a>');
    expect(html).toContain('<a href="#details">Details</a>');
    expect(html).not.toContain('<a href="#hidden-from-toc">Hidden From TOC</a>');
    expect(html).toContain('href="/wiki/wiki/welcome?do=edit&amp;section=1"');
    expect(html).not.toContain('href="/wiki/wiki/welcome?do=edit&amp;section=2"');
  });

  it("honors the DokuWiki useheading title setting", async () => {
    state.row = {
      ...currentPageRow(),
      title: "Stored title",
      content: "====== Heading title ======\n\nBody."
    };

    const defaultTitle = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome"),
      env
    );
    const headingTitle = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), {
      ...env,
      USE_HEADING: "1"
    } satisfies Env);

    await expect(defaultTitle.text()).resolves.toContain("<title>Stored title - Test Wiki</title>");
    await expect(headingTitle.text()).resolves.toContain(
      "<title>Heading title - Test Wiki</title>"
    );
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
    expect(html).toContain("This topic does not exist yet");
    expect(html).toContain("You've followed a link to a topic that doesn't exist yet.");
    expect(html).toContain(
      '<a class="action create" href="/wiki/missing/page?do=edit" rel="nofollow" title="Create this page">Create this page</a>'
    );
    expect(html).not.toContain('class="wikilink2" href="/wiki/missing/page?do=edit"');
    expect(html).toContain('<link rel="canonical" href="/wiki/missing/page">');
  });

  it("renders DokuWiki once-existed and no-revision pages", async () => {
    state.deleted = true;

    const deleted = await handleRequest(new Request("https://example.com/wiki/wiki/welcome"), env);

    expect(deleted.status).toBe(404);
    const deletedHtml = await deleted.text();
    expect(deletedHtml).toContain("This page does not exist anymore");
    expect(deletedHtml).toContain("You've followed a link to a page that no longer exists.");
    expect(deletedHtml).toContain('href="/wiki/wiki/welcome?do=revisions"');

    const missingRevision = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?rev=wiki%3Awelcome%40does-not-exist"),
      env
    );

    expect(missingRevision.status).toBe(404);
    const missingRevisionHtml = await missingRevision.text();
    expect(missingRevisionHtml).toContain("No such revision");
    expect(missingRevisionHtml).toContain("The specified revision doesn't exist.");
    expect(missingRevisionHtml).toContain('href="/wiki/wiki/welcome?do=revisions"');
  });

  it("honors SEND404 and canonical URL settings for missing pages", async () => {
    const configuredEnv = {
      ...env,
      SEND404: "0",
      CANONICAL_URLS: "1",
      BASE_URL: "https://wiki.example.test/",
      BASE_DIR: "/docs"
    } satisfies Env;

    const response = await handleRequest(
      new Request("https://example.com/wiki/missing/page"),
      configuredEnv
    );
    const redirect = await handleRequest(new Request("https://example.com/"), configuredEnv);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      '<link rel="canonical" href="https://wiki.example.test/docs/wiki/missing/page">'
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="https://wiki.example.test/docs/dokuwiki.css?v=0.1.0">'
    );
    expect(html).toContain('href="https://wiki.example.test/docs/wiki/missing/page?do=edit"');
    expect(redirect.headers.get("location")).toBe(
      "https://wiki.example.test/docs/wiki/wiki/welcome"
    );
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
    expect(lockCookie).toContain("Max-Age=900");
    expect(lockCookie).toContain("Secure");
    const html = await response.text();
    expect(html).toContain('name="baseRevisionId" value="wiki:welcome@2026-05-07T00:00:00.000Z"');
    expect(html).toContain('name="sectok" value="');
    expect(html).toContain('name="lockToken" value="');
    expect(html).toContain('id="dw__editform"');
    expect(html).toContain('id="tool__bar"');
    expect(html).toContain('id="edbtn__preview"');
    expect(html).toContain('data-draft-url="/api/pages/draft"');
    expect(html).toContain('data-draft-refresh-interval="30000"');
    expect(html).toContain('data-lock-url="/api/pages/lock"');
    expect(html).toContain('data-lock-refresh-delay="840000"');
    expect(html).toContain('name="minor" type="checkbox"');
  });

  it("honors LOCKTIME for edit locks and client refresh timing", async () => {
    env.LOCKTIME = "120";

    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=120");
    const html = await response.text();
    expect(html).toContain('data-lock-refresh-delay="60000"');
  });

  it("edits and saves only the requested page section", async () => {
    env.LOCKTIME = "0";
    state.row = {
      ...currentPageRow(),
      content:
        "====== Welcome ======\n\nIntro text.\n\n===== Target =====\n\nOld target.\n\n===== Other =====\n\nKeep me."
    };

    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit&section=2"),
      env
    );

    expect(edit.status).toBe(200);
    const editHtml = await edit.text();
    expect(editHtml).toContain('name="section" value="2"');
    expect(editHtml).toContain("[Target] ");
    expect(editHtml).toContain("Old target.");

    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("section", "2");
    form.set("content", "===== Target =====\n\nNew target.");
    form.set("summary", "[Target] Updated section");

    const save = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(save.status).toBe(303);
    expect(save.headers.get("location")).toBe("/wiki/wiki/welcome#target");
    expect(String(state.row?.content).replace(/\r\n/g, "\n")).toBe(
      "====== Welcome ======\n\nIntro text.\n\n===== Target =====\n\nNew target.\n===== Other =====\n\nKeep me."
    );
  });

  it("disables edit locks when LOCKTIME is zero", async () => {
    env.LOCKTIME = "0";

    const response = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("DW_LOCK_");
    const html = await response.text();
    expect(html).not.toContain('data-lock-url="/api/pages/lock"');
    expect(html).toContain('name="lockToken" value=""');
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
    const lockedHtml = await locked.text();
    expect(lockedHtml).toContain("<h1>Page locked</h1>");
    expect(lockedHtml).toContain("This page is currently locked for editing by another user.");
    expect(lockedHtml).toContain("<strong>Currently locked by:</strong> Anonymous");
    expect(lockedHtml).toContain("<strong>Lock expires at:</strong>");
    expect(lockedHtml).toContain("(15 min)");

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:34:56.000Z"));
    state.row = {
      id: "wiki:_template",
      namespace: "wiki",
      title: "_template",
      revision_id: "wiki:_template@2026-05-07T00:00:00.000Z",
      content:
        "====== @!!PAGE@ ======\n\nCreate @ID@ in @NS@ / @CURNS@ from @FILE@ by @USER@@NAME@@MAIL@ on @DATE@.",
      updated_at: "2026-05-07T00:00:00.000Z"
    };

    try {
      const response = await handleRequest(
        new Request("https://example.com/wiki/wiki/new_page?do=edit"),
        env
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('name="baseRevisionId" value=""');
      expect(html).toContain("====== New Page ======");
      expect(html).toContain(
        "Create wiki:new_page in wiki / wiki from new_page by  on 2026/05/08 12:34."
      );
    } finally {
      vi.useRealTimers();
    }
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
    state.row = {
      ...currentPageRow(),
      content: "====== Welcome ======\n\n<file txt example.txt>\n<unsafe>\n</file>"
    };
    const raw = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_raw"),
      env
    );
    const code = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_code&codeblock=0"),
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
    const metadata = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_metadata"),
      env
    );
    const unsupported = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=export_text"),
      env
    );

    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(raw.headers.get("content-disposition")).toBe("attachment; filename=welcome.txt");
    expect(raw.headers.get("x-robots-tag")).toBe("noindex");
    await expect(raw.text()).resolves.toContain("example.txt");

    expect(code.status).toBe(200);
    expect(code.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(code.headers.get("content-disposition")).toBe("attachment; filename=example.txt");
    expect(code.headers.get("x-robots-tag")).toBe("noindex");
    await expect(code.text()).resolves.toBe("<unsafe>");

    expect(xhtmlBody.status).toBe(200);
    expect(xhtmlBody.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(xhtmlBody.text()).resolves.toContain(
      'href="/wiki/wiki/welcome?do=export_code&amp;codeblock=0"'
    );

    expect(xhtml.status).toBe(200);
    const html = await xhtml.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<div class="dokuwiki export">');
    expect(html).toContain("<p>Older page.</p>");
    expect(xhtml.headers.get("x-robots-tag")).toBe("noindex");

    expect(metadata.status).toBe(204);
    expect(metadata.headers.get("x-robots-tag")).toBe("noindex");
    await expect(metadata.text()).resolves.toBe("");

    expect(unsupported.status).toBe(501);
    expect(unsupported.headers.get("x-robots-tag")).toBe("noindex");
    await expect(unsupported.text()).resolves.toContain("Unsupported export mode");
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
    expect(html).toContain("This is an old revision of the document!");
    expect(html).not.toContain("Old revision:");
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
    expect(html).toContain('name="rev2[0]"');
    expect(html).toContain("Link to this comparison view");
    expect(html).toContain('class="diff-deletedline"');
    expect(html).toContain('class="diff-addedline"');
    expect(html).toContain("<del>Older page.</del>");
    expect(html).toContain("<ins>Imported page.</ins>");

    const inline = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z&difftype=inline"
      ),
      env
    );
    const inlineHtml = await inline.text();
    expect(inline.status).toBe(200);
    expect(inlineHtml).toContain('class="diff diff_inline"');
    expect(inlineHtml).toContain('<td class="diff-lineheader">-</td>');
    expect(inlineHtml).toContain('<td class="diff-lineheader">+</td>');

    const reversed = await handleRequest(
      new Request(
        "https://example.com/wiki/wiki/welcome?do=diff&rev2%5B0%5D=wiki%3Awelcome%402026-05-07T00%3A00%3A00.000Z&rev2%5B1%5D=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );
    const reversedHtml = await reversed.text();
    expect(reversed.status).toBe(200);
    expect(reversedHtml.indexOf("2026-05-06T00:00:00.000Z")).toBeLessThan(
      reversedHtml.indexOf("2026-05-07T00:00:00.000Z")
    );

    const latest = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=diff"),
      env
    );
    expect(latest.status).toBe(200);
    await expect(latest.text()).resolves.toContain("Diff for wiki:welcome");
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
    state.changelog.push({
      id: "page:wiki:guide@2026-05-06T00:00:00.000Z",
      subject_type: "page",
      subject_id: "wiki:guide",
      revision_id: "wiki:guide@2026-05-06T00:00:00.000Z",
      user_name: "Seeder",
      ip: "127.0.0.1",
      change_type: "edit",
      summary: "Guide update",
      size_change: -4,
      created_at: "2026-05-06T00:00:00.000Z"
    });
    const response = await handleRequest(new Request("https://example.com/recent"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Recent changes");
    expect(html).toContain('id="dw__recent"');
    expect(html).toContain("Initial import");
    expect(html).toContain("/wiki/wiki/welcome");
    expect(html).toContain("2026/05/07 00:00");
    expect(html).toContain("sizechange positive");

    const paged = await handleRequest(new Request("https://example.com/recent?limit=1"), env);
    const pagedHtml = await paged.text();
    expect(paged.status).toBe(200);
    expect(pagedHtml).toContain('name="first[1]"');
    expect(pagedHtml).toContain("less recent &gt;&gt;");

    const older = await handleRequest(
      new Request("https://example.com/recent?limit=1&first%5B1%5D=1"),
      env
    );
    const olderHtml = await older.text();
    expect(older.status).toBe(200);
    expect(olderHtml).toContain("Guide update");
    expect(olderHtml).toContain("&lt;&lt; more recent");
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

  it("renders media changelog entries in recent changes and feeds", async () => {
    state.changelog.push({
      id: "media:wiki:logo.svg@2026-05-08T00:00:00.000Z",
      subject_type: "media",
      subject_id: "wiki:logo.svg",
      revision_id: "media-rev-current",
      user_name: "kiwi",
      ip: "203.0.113.20",
      change_type: "edit",
      summary: "Uploaded replacement logo",
      size_change: 18,
      created_at: "2026-05-08T00:00:00.000Z"
    });

    const mediaRecent = await handleRequest(
      new Request("https://example.com/recent?show_changes=mediafiles"),
      env
    );
    const pageRecent = await handleRequest(
      new Request("https://example.com/recent?show_changes=pages"),
      env
    );
    const mixedRecent = await handleRequest(
      new Request("https://example.com/recent?show_changes=both"),
      env
    );
    const mediaFeed = await handleRequest(
      new Request("https://example.com/feed.php?view=media"),
      env
    );
    const pageFeed = await handleRequest(
      new Request("https://example.com/feed.php?view=pages"),
      env
    );
    const mixedFeed = await handleRequest(
      new Request("https://example.com/feed.php?view=both"),
      env
    );

    const mediaRecentHtml = await mediaRecent.text();
    const pageRecentHtml = await pageRecent.text();
    const mixedRecentHtml = await mixedRecent.text();
    const mediaFeedXml = await mediaFeed.text();
    const pageFeedXml = await pageFeed.text();
    const mixedFeedXml = await mixedFeed.text();

    expect(mediaRecentHtml).toContain("/media-detail/wiki/logo.svg");
    expect(mediaRecentHtml).toContain("Uploaded replacement logo");
    expect(mediaRecentHtml).toContain('<span class="media-marker">media</span>');
    expect(mediaRecentHtml).not.toContain("wiki:welcome");
    expect(pageRecentHtml).toContain("wiki:welcome");
    expect(pageRecentHtml).not.toContain("/media-detail/wiki/logo.svg");
    expect(mixedRecentHtml).toContain("wiki:welcome");
    expect(mixedRecentHtml).toContain("/media-detail/wiki/logo.svg");

    expect(mediaFeedXml).toContain("<title>edit: wiki:logo.svg</title>");
    expect(mediaFeedXml).toContain("https://example.com/media-detail/wiki/logo.svg");
    expect(mediaFeedXml).not.toContain("wiki:welcome");
    expect(pageFeedXml).toContain("wiki:welcome");
    expect(pageFeedXml).not.toContain("wiki:logo.svg");
    expect(mixedFeedXml).toContain("wiki:welcome");
    expect(mixedFeedXml).toContain("wiki:logo.svg");
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
        "discovery:sitemap:https://example.com/sitemap.xml",
        "discovery:rss:https://example.com/feed.php",
        "discovery:atom:https://example.com/atom.xml"
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
    renderCache.set("discovery:sitemap:https://example.com/sitemap.xml", "stale sitemap");
    renderCache.set("discovery:rss:https://example.com/feed.php?view=media", "stale rss");
    renderCache.set("discovery:atom:https://example.com/atom.xml", "stale atom");

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
    expect(purgedKeys).toContain("discovery:sitemap:https://example.com/sitemap.xml");
    expect(purgedKeys).toContain("discovery:rss:https://example.com/feed.php?view=media");
    expect(purgedKeys).toContain("discovery:atom:https://example.com/atom.xml");
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
    await expect(autosaveDraft.json()).resolves.toMatchObject({
      ok: true,
      id: "wiki:welcome",
      draft: expect.stringContaining("Draft autosaved on")
    });

    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );
    const draftView = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=draft"),
      env
    );

    expect(edit.status).toBe(303);
    expect(edit.headers.get("location")).toBe("/wiki/wiki/welcome?do=draft");
    expect(draftView.status).toBe(200);
    const draftHtml = await draftView.text();
    expect(draftHtml).toContain("Draft file found");
    expect(draftHtml).toContain("DokuWiki automatically saved a draft");
    expect(draftHtml).toContain("Autosaved draft");
    expect(draftHtml).toContain("Draft autosaved on");
    expect(draftHtml).toContain("Autosaved text.");
    expect(draftHtml).toContain('name="do[recover]"');
    expect(draftHtml).toContain('name="do[draftdel]"');
    expect(draftHtml).toContain('name="do[show]"');

    const cancelDraft = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=show", {
        method: "POST",
        body: draft,
        headers: csrfHeaders()
      }),
      env
    );

    expect(cancelDraft.status).toBe(303);
    expect(cancelDraft.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.drafts).toHaveLength(1);

    const recoverDraft = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=recover", {
        method: "POST",
        body: draft,
        headers: csrfHeaders()
      }),
      env
    );

    expect(recoverDraft.status).toBe(200);
    const recoveredHtml = await recoverDraft.text();
    expect(recoveredHtml).toContain("Autosaved text.");
    expect(recoveredHtml).toContain("Draft autosaved on");

    draft.set("redirectTo", "/wiki/wiki/welcome");
    const deleteDraft = await handleRequest(
      new Request("https://example.com/api/pages/draft/delete", {
        method: "POST",
        body: draft,
        headers: csrfHeaders()
      }),
      env
    );

    expect(deleteDraft.status).toBe(303);
    expect(deleteDraft.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.drafts).toHaveLength(0);
  });

  it("honors USEDRAFT when rendering edit forms and draft saves", async () => {
    env.USEDRAFT = "0";

    const edit = await handleRequest(
      new Request("https://example.com/wiki/wiki/welcome?do=edit"),
      env
    );

    expect(edit.status).toBe(200);
    const html = await edit.text();
    expect(html).not.toContain('data-draft-url="/api/pages/draft"');
    expect(html).not.toContain('id="draft__status"');

    const draft = new FormData();
    draft.set("id", "wiki:welcome");
    draft.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    draft.set("content", "====== Draft disabled ======");

    const response = await handleRequest(
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, id: "wiki:welcome" });
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
    form.set("summary", "stale edit");

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
    const html = await response.text();
    expect(html).toContain("<h1>A newer version exists</h1>");
    expect(html).toContain('name="content" value="Changed."');
    expect(html).toContain('name="summary" value="stale edit"');
    expect(html).toContain('name="baseRevisionId" value="wiki:welcome@2026-05-07T00:00:00.000Z"');
    expect(html).toContain('<th colspan="2">Current revision</th>');
    expect(html).toContain('<th colspan="2">Your version</th>');
    expect(html).toContain("Changed.");
    expect(state.batches).toHaveLength(0);
  });

  it("cancels from the conflict form without saving", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("lockToken", "conflict-lock");
    form.set("do[cancel]", "1");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form,
        headers: csrfHeaders()
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
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
    expect(state.revisions[0]).toMatchObject({
      page_id: "wiki:new",
      content: "====== New ======\n\nCreated.",
      change_type: "delete",
      summary: "removed",
      size_change: -"====== New ======\n\nCreated.".length
    });
    expect(state.changelog[0]).toMatchObject({
      subject_id: "wiki:new",
      change_type: "delete",
      summary: "removed",
      size_change: -"====== New ======\n\nCreated.".length
    });
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

          if (sql.includes("subject_type = 'config'") && sql.includes("subject_id = 'mime'")) {
            const [key] = values;
            return (
              state.metadata.find(
                (record) =>
                  record.subject_type === "config" &&
                  record.subject_id === "mime" &&
                  record.key === key
              ) ?? null
            );
          }

          if (sql.includes("from metadata") && !sql.includes("from media")) {
            const [subjectId, key] = values;
            return (
              state.metadata.find(
                (record) =>
                  record.subject_type === "media" &&
                  record.subject_id === subjectId &&
                  record.key === key
              ) ?? null
            );
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

          if (sql.includes("from metadata m") && sql.includes("join pages p")) {
            const pageRows = currentPageSourceRows(state);
            const pageById = new Map(pageRows.map((page) => [String(page.id), page]));

            return {
              results: state.metadata
                .filter((record) => record.subject_type === "page" && record.key === "relation")
                .flatMap((record) => {
                  const page = pageById.get(String(record.subject_id));
                  if (!page) return [];

                  return [
                    {
                      subject_id: record.subject_id,
                      value_json: record.value_json,
                      title: page.title ?? null,
                      updated_at: page.updated_at
                    }
                  ];
                })
                .sort((left, right) =>
                  String(left.subject_id).localeCompare(String(right.subject_id))
                )
                .slice(0, Number.isFinite(limit) ? limit : 500)
            };
          }

          if (sql.includes("from metadata") && !sql.includes("from media")) {
            const [subjectType, subjectId] = values;
            return {
              results: state.metadata
                .filter(
                  (record) => record.subject_type === subjectType && record.subject_id === subjectId
                )
                .map((record) => ({ key: record.key, value_json: record.value_json }))
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

          if (sql.includes("from media") && sql.includes("namespace = ?")) {
            const recursiveSearch = sql.includes("metadata.subject_id = media.id");
            const namespace = String(recursiveSearch ? values[0] : idOrLimit);
            const query = sql.includes("like")
              ? String(recursiveSearch ? (values[4] ?? "") : (values[1] ?? ""))
                  .replaceAll("%", "")
                  .replaceAll("\\", "")
                  .toLowerCase()
              : "";
            const inNamespace = (media: Record<string, unknown>) =>
              !namespace ||
              media.namespace === namespace ||
              String(media.namespace ?? "").startsWith(`${namespace}:`);
            const matchesMetadata = (media: Record<string, unknown>) =>
              state.metadata.some(
                (record) =>
                  record.subject_type === "media" &&
                  record.subject_id === media.id &&
                  String(record.value_json).toLowerCase().includes(query)
              );
            const sortMediaRows = (rows: Record<string, unknown>[]) => {
              const direction = sql.includes(" desc") ? -1 : 1;
              const key = sql.includes("order by updated_at") ? "updated_at" : "id";
              return rows.sort(
                (left, right) =>
                  direction * String(left[key] ?? "").localeCompare(String(right[key] ?? ""))
              );
            };
            return {
              results: applyPagination(
                sortMediaRows(
                  state.media.filter(
                    (media) =>
                      inNamespace(media) &&
                      media.is_deleted === 0 &&
                      (!query ||
                        String(media.id).toLowerCase().includes(query) ||
                        String(media.mime_type).toLowerCase().includes(query) ||
                        matchesMetadata(media))
                  )
                ),
                200
              )
            };
          }

          if (sql.includes("from media") && sql.includes("id in")) {
            return {
              results: state.media
                .filter((media) => media.is_deleted === 0 && values.includes(media.id))
                .map((media) => ({ id: media.id }))
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
            const subjectType = sql.includes("subject_type in")
              ? "both"
              : values.includes("media")
                ? "media"
                : "page";
            const namespacePattern = values.find(
              (value): value is string => typeof value === "string" && value.endsWith(":%")
            );
            const namespace = namespacePattern?.slice(0, -2);
            const groupBySubject = sql.includes("recent_rank = 1");
            const rows = state.changelog
              .filter((change) => {
                if (subjectType !== "both" && change.subject_type !== subjectType) return false;
                if (namespace && !String(change.subject_id).startsWith(`${namespace}:`)) {
                  return false;
                }
                if (sql.includes("change_type <> 'minor'") && change.change_type === "minor") {
                  return false;
                }
                if (sql.includes("change_type = 'create'") && change.change_type !== "create") {
                  return false;
                }
                return true;
              })
              .sort(
                (left, right) =>
                  String(right.created_at).localeCompare(String(left.created_at)) ||
                  String(right.id).localeCompare(String(left.id))
              );
            const groupedRows = groupBySubject
              ? rows.filter(
                  (change, index, all) =>
                    all.findIndex(
                      (candidate) =>
                        candidate.subject_type === change.subject_type &&
                        candidate.subject_id === change.subject_id
                    ) === index
                )
              : rows;
            return {
              results: applyPagination(groupedRows, 50)
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

      if (mediaStatement) {
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

        if (mediaRevisionStatement) {
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
      }

      if (mediaDeleteStatement) {
        const [currentRevisionId, updatedAt, id] = mediaDeleteStatement.values;
        const existingMedia = state.media.find((media) => media.id === id);

        if (existingMedia) {
          existingMedia.current_revision_id = currentRevisionId;
          existingMedia.is_deleted = 1;
          existingMedia.updated_at = updatedAt;
        }

        if (mediaRevisionStatement) {
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
    ["media/current/wiki/archive.zip", "zipbody"],
    ["media/current/wiki/readme.foo", "foo"],
    ["media/current/wiki/pixel.png", uint8ArrayToArrayBuffer(TEST_PIXEL_PNG)],
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

function base64Bytes(value: string): Uint8Array {
  return Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
}

function jpegWithIptcMetadata(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...jpegSegment(0xed, [
      ...asciiBytes("Photoshop 3.0\0"),
      ...iptcRecordBytes(105, "Uploaded headline"),
      ...iptcRecordBytes(120, "Uploaded caption")
    ]),
    ...jpegSof0(2, 3),
    0xff,
    0xd9
  ]);
}

function jpegSegment(marker: number, data: number[]): number[] {
  const length = data.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}

function jpegSof0(width: number, height: number): number[] {
  return jpegSegment(0xc0, [
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0
  ]);
}

function iptcRecordBytes(dataset: number, value: string): number[] {
  const data = asciiBytes(value);
  return [0x1c, 0x02, dataset, (data.length >> 8) & 0xff, data.length & 0xff, ...data];
}

function asciiBytes(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20)
  };
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
