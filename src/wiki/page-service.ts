import { extractInternalPageLinks } from "./page-links";
import { buildSearchTermFrequencies, makeSearchSnippet, parseSearchQuery } from "./search";

export interface CurrentPage {
  id: string;
  title: string | null;
  revisionId: string;
  content: string;
  updatedAt: string;
}

export interface PageRevision {
  id: string;
  pageId: string;
  content: string;
  summary: string;
  changeType: "create" | "edit" | "minor" | "delete" | "revert";
  sizeChange: number;
  createdAt: string;
}

export interface RecentChange {
  id: string;
  subjectId: string;
  revisionId: string | null;
  userName: string | null;
  changeType: string;
  summary: string;
  sizeChange: number;
  createdAt: string;
}

export interface PageSearchResult {
  id: string;
  title: string | null;
  snippet: string;
  score: number;
  updatedAt: string;
}

export interface NamespacePage {
  id: string;
  namespace: string;
  title: string | null;
  updatedAt: string;
}

export interface PageLinkReference {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface WantedPage {
  id: string;
  referrers: PageLinkReference[];
}

export interface SavePageInput {
  id: string;
  content: string;
  summary: string;
  baseRevisionId: string | null;
  authorId?: string | null;
  authorName?: string | null;
  ip?: string | null;
  now?: Date;
}

export type SavePageResult =
  | {
      ok: true;
      page: CurrentPage;
      changeType: "create" | "edit" | "delete";
    }
  | {
      ok: false;
      reason: "conflict";
      currentRevisionId: string | null;
    };

interface CurrentPageRow {
  id: string;
  title: string | null;
  revision_id: string;
  content: string;
  updated_at: string;
}

interface PageRevisionRow {
  id: string;
  page_id: string;
  content: string;
  summary: string;
  change_type: PageRevision["changeType"];
  size_change: number;
  created_at: string;
}

interface RecentChangeRow {
  id: string;
  subject_id: string;
  revision_id: string | null;
  user_name: string | null;
  change_type: string;
  summary: string;
  size_change: number;
  created_at: string;
}

interface SearchTermRow {
  term: string;
}

interface PageSearchRow {
  id: string;
  title: string | null;
  content: string;
  updated_at: string;
  score: number;
}

interface NamespacePageRow {
  id: string;
  namespace: string;
  title: string | null;
  updated_at: string;
}

interface CurrentPageSourceRow {
  id: string;
  title: string | null;
  content: string;
  updated_at: string;
}

export async function getCurrentPage(db: D1Database, id: string): Promise<CurrentPage | null> {
  const row = await db
    .prepare(
      `select p.id, p.title, p.current_revision_id as revision_id, r.content, p.updated_at
       from pages p
       join page_revisions r on r.id = p.current_revision_id
       where p.id = ? and p.is_deleted = 0`
    )
    .bind(id)
    .first<CurrentPageRow>();

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    revisionId: row.revision_id,
    content: row.content,
    updatedAt: row.updated_at
  };
}

export async function getPageRevision(
  db: D1Database,
  revisionId: string
): Promise<PageRevision | null> {
  const row = await db
    .prepare(
      `select id, page_id, content, summary, change_type, size_change, created_at
       from page_revisions
       where id = ?`
    )
    .bind(revisionId)
    .first<PageRevisionRow>();

  return row ? mapRevision(row) : null;
}

export async function listPageRevisions(
  db: D1Database,
  pageId: string,
  limit = 50
): Promise<PageRevision[]> {
  const result = await db
    .prepare(
      `select id, page_id, content, summary, change_type, size_change, created_at
       from page_revisions
       where page_id = ?
       order by created_at desc
       limit ?`
    )
    .bind(pageId, Math.max(1, Math.min(limit, 100)))
    .all<PageRevisionRow>();

  return result.results.map(mapRevision);
}

export async function listRecentChanges(db: D1Database, limit = 50): Promise<RecentChange[]> {
  const result = await db
    .prepare(
      `select id, subject_id, revision_id, user_name, change_type, summary, size_change, created_at
       from changelog
       where subject_type = 'page'
       order by created_at desc
       limit ?`
    )
    .bind(Math.max(1, Math.min(limit, 100)))
    .all<RecentChangeRow>();

  return result.results.map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    revisionId: row.revision_id,
    userName: row.user_name,
    changeType: row.change_type,
    summary: row.summary,
    sizeChange: row.size_change,
    createdAt: row.created_at
  }));
}

export async function searchPages(
  db: D1Database,
  query: string,
  limit = 25
): Promise<PageSearchResult[]> {
  const terms = parseSearchQuery(query);
  if (terms.length === 0) return [];

  const safeLimit = Math.max(1, Math.min(limit, 50));
  const placeholders = terms.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `select p.id, p.title, r.content, p.updated_at, sum(sp.frequency) as score
       from search_postings sp
       join pages p on p.id = sp.page_id
       join page_revisions r on r.id = p.current_revision_id
       where sp.term in (${placeholders}) and p.is_deleted = 0
       group by p.id
       order by score desc, p.updated_at desc
       limit ?`
    )
    .bind(...terms, safeLimit)
    .all<PageSearchRow>();

  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: makeSearchSnippet(row.content, terms),
    score: row.score,
    updatedAt: row.updated_at
  }));
}

export async function listNamespacePages(
  db: D1Database,
  namespace: string,
  limit = 200
): Promise<NamespacePage[]> {
  const result = await db
    .prepare(
      `select id, namespace, title, updated_at
       from pages
       where namespace = ? and is_deleted = 0
       order by id
       limit ?`
    )
    .bind(namespace, Math.max(1, Math.min(limit, 500)))
    .all<NamespacePageRow>();

  return result.results.map((row) => ({
    id: row.id,
    namespace: row.namespace,
    title: row.title,
    updatedAt: row.updated_at
  }));
}

export async function listBacklinks(
  db: D1Database,
  targetPageId: string,
  limit = 200
): Promise<PageLinkReference[]> {
  const pages = await listCurrentPageSources(db, limit);

  return pages
    .filter((page) => page.id !== targetPageId)
    .filter((page) => extractInternalPageLinks(page.content, page.id).includes(targetPageId))
    .map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updated_at
    }));
}

export async function listOrphanPages(db: D1Database, limit = 200): Promise<PageLinkReference[]> {
  const pages = await listCurrentPageSources(db, limit);
  const incoming = new Set(
    pages.flatMap((page) => extractInternalPageLinks(page.content, page.id))
  );

  return pages
    .filter((page) => !incoming.has(page.id))
    .map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updated_at
    }));
}

export async function listWantedPages(db: D1Database, limit = 200): Promise<WantedPage[]> {
  const pages = await listCurrentPageSources(db, limit);
  const existing = new Set(pages.map((page) => page.id));
  const wanted = new Map<string, PageLinkReference[]>();

  for (const page of pages) {
    for (const link of extractInternalPageLinks(page.content, page.id)) {
      if (existing.has(link)) continue;

      const referrers = wanted.get(link) ?? [];
      referrers.push({
        id: page.id,
        title: page.title,
        updatedAt: page.updated_at
      });
      wanted.set(link, referrers);
    }
  }

  return [...wanted.entries()]
    .map(([id, referrers]) => ({ id, referrers }))
    .sort((a, b) => b.referrers.length - a.referrers.length || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(limit, 500)));
}

export async function savePage(db: D1Database, input: SavePageInput): Promise<SavePageResult> {
  const current = await getCurrentPage(db, input.id);
  const currentRevisionId = current?.revisionId ?? null;

  if ((input.baseRevisionId || null) !== currentRevisionId) {
    return {
      ok: false,
      reason: "conflict",
      currentRevisionId
    };
  }

  const now = (input.now ?? new Date()).toISOString();
  const revisionId = `${input.id}@${now}`;
  const namespace = input.id.includes(":") ? input.id.slice(0, input.id.lastIndexOf(":")) : "";
  const title =
    extractTitle(input.content) ??
    (input.id.includes(":") ? input.id.slice(input.id.lastIndexOf(":") + 1) : input.id);
  const isDelete = input.content.trim() === "";
  const changeType = isDelete ? "delete" : current ? "edit" : "create";
  const sizeChange = input.content.length - (current?.content.length ?? 0);
  const contentHash = await sha256(input.content);
  const indexedTerms = await listIndexedTerms(db, input.id);
  const searchTerms = isDelete
    ? new Map<string, number>()
    : buildSearchTermFrequencies(input.content, title);

  await db.batch([
    db
      .prepare(
        `insert into pages (id, namespace, title, current_revision_id, is_deleted, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           namespace = excluded.namespace,
           title = excluded.title,
           current_revision_id = excluded.current_revision_id,
           is_deleted = excluded.is_deleted,
           updated_at = excluded.updated_at`
      )
      .bind(input.id, namespace, title, revisionId, isDelete ? 1 : 0, now, now),
    db
      .prepare(
        `insert into page_revisions (
           id, page_id, content, content_hash, author_id, author_name, summary,
           change_type, size_change, created_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        revisionId,
        input.id,
        input.content,
        contentHash,
        input.authorId ?? null,
        input.authorName ?? null,
        input.summary,
        changeType,
        sizeChange,
        now
      ),
    db
      .prepare(
        `insert into changelog (
           id, subject_type, subject_id, revision_id, user_id, user_name, ip,
           change_type, summary, size_change, created_at
         ) values (?, 'page', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `page:${revisionId}`,
        input.id,
        revisionId,
        input.authorId ?? null,
        input.authorName ?? null,
        input.ip ?? null,
        changeType,
        input.summary,
        sizeChange,
        now
      ),
    ...buildSearchIndexStatements(db, input.id, searchTerms, indexedTerms, now)
  ]);

  return {
    ok: true,
    changeType,
    page: {
      id: input.id,
      title,
      revisionId,
      content: input.content,
      updatedAt: now
    }
  };
}

export function pagePath(id: string): string {
  return `/wiki/${id
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function mapRevision(row: PageRevisionRow): PageRevision {
  return {
    id: row.id,
    pageId: row.page_id,
    content: row.content,
    summary: row.summary,
    changeType: row.change_type,
    sizeChange: row.size_change,
    createdAt: row.created_at
  };
}

async function listIndexedTerms(db: D1Database, pageId: string): Promise<string[]> {
  const result = await db
    .prepare(
      `select term
       from search_postings
       where page_id = ?`
    )
    .bind(pageId)
    .all<SearchTermRow>();

  return result.results.map((row) => row.term);
}

async function listCurrentPageSources(
  db: D1Database,
  limit: number
): Promise<CurrentPageSourceRow[]> {
  const result = await db
    .prepare(
      `select p.id, p.title, r.content, p.updated_at
       from pages p
       join page_revisions r on r.id = p.current_revision_id
       where p.is_deleted = 0
       order by p.id
       limit ?`
    )
    .bind(Math.max(1, Math.min(limit, 500)))
    .all<CurrentPageSourceRow>();

  return result.results;
}

function buildSearchIndexStatements(
  db: D1Database,
  pageId: string,
  terms: Map<string, number>,
  previousTerms: string[],
  updatedAt: string
): D1PreparedStatement[] {
  const impactedTerms = new Set([...previousTerms, ...terms.keys()]);
  const statements = [db.prepare("delete from search_postings where page_id = ?").bind(pageId)];

  for (const [term, frequency] of terms) {
    statements.push(
      db
        .prepare(
          `insert into search_terms (term, document_count)
           values (?, 0)
           on conflict(term) do nothing`
        )
        .bind(term),
      db
        .prepare(
          `insert into search_postings (term, page_id, frequency, updated_at)
           values (?, ?, ?, ?)
           on conflict(term, page_id) do update set
             frequency = excluded.frequency,
             updated_at = excluded.updated_at`
        )
        .bind(term, pageId, frequency, updatedAt)
    );
  }

  for (const term of impactedTerms) {
    statements.push(
      db
        .prepare(
          `update search_terms
           set document_count = (
             select count(*)
             from search_postings
             where search_postings.term = search_terms.term
           )
           where term = ?`
        )
        .bind(term),
      db.prepare("delete from search_terms where term = ? and document_count = 0").bind(term)
    );
  }

  return statements;
}

function extractTitle(content: string): string | null {
  const match = content.match(/^(={2,6})\s*(.*?)\s*\1\s*$/m);
  return match?.[2]?.trim() || null;
}

async function sha256(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
