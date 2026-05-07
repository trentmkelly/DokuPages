import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import type { Env } from "../src/env";

interface D1StubState {
  row: Record<string, unknown> | null;
  revisions: Record<string, unknown>[];
  changelog: Record<string, unknown>[];
  searchPostings: Record<string, unknown>[];
  deleted: boolean;
  batches: unknown[][];
}

const state: D1StubState = {
  row: currentPageRow(),
  revisions: seedRevisions(),
  changelog: seedChangelog(),
  searchPostings: seedSearchPostings(),
  deleted: false,
  batches: []
};

const purgedKeys: string[] = [];
const cachePuts: string[] = [];
const renderCache = new Map<string, string>();

const env = {
  DB: createD1Stub(state),
  MEDIA_BUCKET: {} as R2Bucket,
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
  PAGE_LOCKS: {} as DurableObjectNamespace,
  SITE_NAME: "Test Wiki"
} satisfies Env;

describe("handleRequest", () => {
  beforeEach(() => {
    state.row = currentPageRow();
    state.revisions = seedRevisions();
    state.changelog = seedChangelog();
    state.searchPostings = seedSearchPostings();
    state.deleted = false;
    state.batches = [];
    purgedKeys.length = 0;
    cachePuts.length = 0;
    renderCache.clear();
  });

  it("returns health information for the API health route", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      bindings: {
        d1: true,
        r2: true,
        kv: true,
        durableObjects: true
      }
    });
  });

  it("handles wiki routes through the Pages Function router", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/Wiki/Welcome"), env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('<h1 id="welcome">Welcome</h1>');
    expect(cachePuts).toContain("page:wiki:welcome");
  });

  it("uses matching rendered page cache entries", async () => {
    renderCache.set(
      "page:wiki:welcome",
      JSON.stringify({
        revisionId: "wiki:welcome@2026-05-07T00:00:00.000Z",
        title: "Cached Welcome",
        html: "<p>Cached body.</p>"
      })
    );

    const response = await handleRequest(new Request("https://example.com/wiki/Wiki/Welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Cached body.");
    expect(html).not.toContain("Imported page.");
    expect(cachePuts).toHaveLength(0);
  });

  it("refreshes stale rendered page cache entries", async () => {
    renderCache.set(
      "page:wiki:welcome",
      JSON.stringify({
        revisionId: "stale",
        title: "Stale",
        html: "<p>Stale body.</p>"
      })
    );

    const response = await handleRequest(new Request("https://example.com/wiki/Wiki/Welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Imported page.");
    expect(cachePuts).toContain("page:wiki:welcome");
  });

  it("returns 404 when a wiki page does not exist", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/Missing/Page"), env);

    expect(response.status).toBe(404);
  });

  it("renders an edit form for existing pages", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=edit"),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      'name="baseRevisionId" value="wiki:welcome@2026-05-07T00:00:00.000Z"'
    );
  });

  it("returns source text for existing pages", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=source"),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("Imported page.");
  });

  it("renders page revision history", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=revisions"),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Revisions for wiki:welcome");
    expect(html).toContain("Initial import");
    expect(html).toContain("wiki%3Awelcome%402026-05-07T00%3A00%3A00.000Z");
  });

  it("renders an old page revision", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/Wiki/Welcome?rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
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
        "https://example.com/wiki/Wiki/Welcome?do=diff&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
      ),
      env
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Diff for wiki:welcome");
    expect(html).toContain("<del>Older page.</del>");
    expect(html).toContain("<ins>Imported page.</ins>");
  });

  it("renders a revert form for an old page revision", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/wiki/Wiki/Welcome?do=revert&rev=wiki%3Awelcome%402026-05-06T00%3A00%3A00.000Z"
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
        body: form
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
  });

  it("renders search results from the page index", async () => {
    const response = await handleRequest(new Request("https://example.com/search?q=welcome"), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Search");
    expect(html).toContain("/wiki/wiki/welcome");
    expect(html).toContain("Imported page.");
  });

  it("handles DokuWiki-style page search actions", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=search&q=welcome"),
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
  });

  it("renders backlinks for a page", async () => {
    const response = await handleRequest(
      new Request("https://example.com/wiki/Wiki/Welcome?do=backlink"),
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

  it("previews submitted wiki text", async () => {
    const form = new FormData();
    form.set("content", "====== Preview ======\n\n**Text**");

    const response = await handleRequest(
      new Request("https://example.com/api/pages/preview", {
        method: "POST",
        body: form
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      title: "Preview"
    });
  });

  it("saves page edits with optimistic concurrency and redirects to the page", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "wiki:welcome@2026-05-07T00:00:00.000Z");
    form.set("content", "====== Updated ======\n\nChanged.");
    form.set("summary", "Updated page");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form
      }),
      env
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/wiki/wiki/welcome");
    expect(state.row?.title).toBe("Updated");
    expect(state.batches).toHaveLength(1);
    expect(purgedKeys).toContain("page:wiki:welcome");
  });

  it("returns conflicts when the base revision is stale", async () => {
    const form = new FormData();
    form.set("id", "wiki:welcome");
    form.set("baseRevisionId", "stale");
    form.set("content", "Changed.");

    const response = await handleRequest(
      new Request("https://example.com/api/pages", {
        method: "POST",
        body: form
      }),
      env
    );

    expect(response.status).toBe(409);
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
        body: create
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
        body: remove
      }),
      env
    );

    expect(deleteResponse.status).toBe(303);
    expect(state.deleted).toBe(true);
    expect(state.searchPostings.some((posting) => posting.page_id === "wiki:new")).toBe(false);
  });

  it("falls back to static assets for non-dynamic routes", async () => {
    const response = await handleRequest(
      new Request("https://example.com/"),
      env,
      async () => new Response("static asset")
    );

    await expect(response.text()).resolves.toBe("static asset");
  });
});

function createD1Stub(state: D1StubState): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        sql,
        values,
        first: async () => {
          const [id] = values;
          if (sql.includes("from page_revisions") && !sql.includes("join")) {
            return state.revisions.find((revision) => revision.id === id) ?? null;
          }

          return !state.deleted && state.row?.id === id ? state.row : null;
        },
        all: async () => {
          const [idOrLimit, rawLimit] = values;
          const limit = typeof rawLimit === "number" ? rawLimit : Number(idOrLimit);

          if (sql.includes("from search_postings") && sql.includes("where page_id = ?")) {
            return {
              results: state.searchPostings
                .filter((posting) => posting.page_id === idOrLimit)
                .map((posting) => ({ term: posting.term }))
            };
          }

          if (sql.includes("from search_postings sp")) {
            const terms = values.slice(0, -1);
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
                .filter(([pageId]) => !state.deleted && state.row?.id === pageId)
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

          if (sql.includes("from pages") && sql.includes("where namespace = ?")) {
            return {
              results: currentPageSourceRows(state)
                .filter((page) => page.namespace === idOrLimit)
                .slice(0, Number.isFinite(limit) ? limit : 200)
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
              results: state.revisions
                .filter((revision) => revision.page_id === idOrLimit)
                .slice(0, Number.isFinite(limit) ? limit : 50)
            };
          }

          if (sql.includes("from changelog")) {
            return {
              results: state.changelog.slice(0, Number.isFinite(limit) ? limit : 50)
            };
          }

          return { results: [] };
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
          ,
          changeType,
          summary,
          sizeChange,
          createdAt
        ] = changelogStatement.values;

        state.changelog.unshift({
          id: changelogId,
          subject_type: "page",
          subject_id: subjectId,
          revision_id: revisionId,
          user_name: userName,
          change_type: changeType,
          summary,
          size_change: sizeChange,
          created_at: createdAt
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
      }

      return [];
    }
  } as unknown as D1Database;
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
