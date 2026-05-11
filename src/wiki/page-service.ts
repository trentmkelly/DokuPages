import { cleanPageId, pageIdToRoutePath } from "./page-id";
import { extractInternalPageLinks } from "./page-links";
import { cleanMediaId, mediaName } from "./media-service";
import { renderWikiText, type TocItem } from "./render";
import type { UserDisplaySource } from "./user-display";
import {
  buildSearchTermFrequencies,
  makeSearchSnippet,
  parseFulltextSearchQuery,
  searchIndexWordLength,
  type ParsedFulltextSearchQuery,
  type SearchOperand,
  type SearchRpnToken,
  type SearchWildcard,
  type SearchWordOperand
} from "./search";

export interface CurrentPage {
  id: string;
  title: string | null;
  revisionId: string;
  content: string;
  updatedAt: string;
  author: UserDisplaySource | null;
}

export interface PageRevision {
  id: string;
  pageId: string;
  content: string;
  summary: string;
  changeType: "create" | "edit" | "minor" | "delete" | "revert";
  sizeChange: number;
  createdAt: string;
  author: UserDisplaySource | null;
}

export interface RecentChange {
  id: string;
  subjectType: "page" | "media";
  subjectId: string;
  revisionId: string | null;
  userName: string | null;
  user: UserDisplaySource | null;
  ip: string | null;
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

export interface PageLookupOptions {
  inNamespace?: boolean;
  inTitle?: boolean;
  startPage?: string;
  limit?: number;
}

export interface WantedPage {
  id: string;
  referrers: PageLinkReference[];
}

export interface PageDraft {
  id: string;
  pageId: string;
  content: string;
  baseRevisionId: string | null;
  updatedAt: string;
}

export interface RebuildSearchIndexResult {
  pageCount: number;
  termCount: number;
  postingCount: number;
}

export interface PageSearchIndexTaskResult {
  id: string;
  status: "indexed" | "missing";
  termCount: number;
  postingCount: number;
}

export interface RecentChangeListOptions {
  namespace?: string;
  groupBySubject?: boolean;
  includeMinor?: boolean;
  onlyCreates?: boolean;
  since?: string;
  subjectType?: "pages" | "media" | "both";
}

export interface SavePageInput {
  id: string;
  content: string;
  summary: string;
  baseRevisionId: string | null;
  changeType?: "create" | "edit" | "minor" | "delete" | "revert";
  authorId?: string | null;
  authorName?: string | null;
  ip?: string | null;
  language?: string;
  now?: Date;
}

export type SavePageResult =
  | {
      ok: true;
      page: CurrentPage;
      changeType: "create" | "edit" | "minor" | "delete" | "revert";
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
  author_id: string | null;
  author_name: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_email: string | null;
}

interface PageRevisionRow {
  id: string;
  page_id: string;
  content: string;
  summary: string;
  change_type: PageRevision["changeType"];
  size_change: number;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_email: string | null;
}

interface RecentChangeRow {
  id: string;
  subject_type: "page" | "media";
  subject_id: string;
  revision_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_username: string | null;
  user_display_name: string | null;
  user_email: string | null;
  ip: string | null;
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

interface PageReferenceRow {
  id: string;
  title: string | null;
  updated_at: string;
}

interface NamespacePageRow {
  id: string;
  namespace: string;
  title: string | null;
  updated_at: string;
}

interface CurrentPageSourceRow {
  id: string;
  namespace: string;
  title: string | null;
  content: string;
  updated_at: string;
}

interface RelationMetadataRow {
  subject_id: string;
  value_json: string;
  title: string | null;
  updated_at: string;
}

interface PageDraftRow {
  id: string;
  page_id: string;
  content: string;
  base_revision_id: string | null;
  updated_at: string;
}

const MAX_METADATA_REFERENCE_ROWS = 1000;

export async function getCurrentPage(db: D1Database, id: string): Promise<CurrentPage | null> {
  const row = await db
    .prepare(
      `select p.id, p.title, p.current_revision_id as revision_id, r.content, p.updated_at,
              r.author_id, r.author_name,
              u.username as author_username,
              u.display_name as author_display_name,
              u.email as author_email
       from pages p
       join page_revisions r on r.id = p.current_revision_id
       left join users u on u.id = r.author_id
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
    updatedAt: row.updated_at,
    author: userDisplaySource({
      userId: row.author_id,
      userName: row.author_name,
      username: row.author_username,
      displayName: row.author_display_name,
      email: row.author_email
    })
  };
}

export async function getPageRevision(
  db: D1Database,
  revisionId: string
): Promise<PageRevision | null> {
  const row = await db
    .prepare(
      `select r.id, r.page_id, r.content, r.summary, r.change_type, r.size_change, r.created_at,
              r.author_id, r.author_name,
              u.username as author_username,
              u.display_name as author_display_name,
              u.email as author_email
       from page_revisions r
       left join users u on u.id = r.author_id
       where r.id = ?`
    )
    .bind(revisionId)
    .first<PageRevisionRow>();

  return row ? mapRevision(row) : null;
}

export async function listPageRevisions(
  db: D1Database,
  pageId: string,
  limit = 50,
  offset = 0
): Promise<PageRevision[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);
  const result = await db
    .prepare(
      `select r.id, r.page_id, r.content, r.summary, r.change_type, r.size_change, r.created_at,
              r.author_id, r.author_name,
              u.username as author_username,
              u.display_name as author_display_name,
              u.email as author_email
       from page_revisions r
       left join users u on u.id = r.author_id
       where r.page_id = ?
       order by r.created_at desc
       limit ? offset ?`
    )
    .bind(pageId, safeLimit, safeOffset)
    .all<PageRevisionRow>();

  return result.results.map(mapRevision);
}

export async function listRecentChanges(
  db: D1Database,
  limit = 50,
  offset = 0,
  options: RecentChangeListOptions = {}
): Promise<RecentChange[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);
  const where: string[] = [];
  const values: unknown[] = [];
  const namespace = cleanPageId(options.namespace ?? "");
  const subjectType = options.subjectType ?? "pages";

  if (subjectType === "both") {
    where.push("c.subject_type in ('page', 'media')");
  } else {
    where.push("c.subject_type = ?");
    values.push(subjectType === "media" ? "media" : "page");
  }

  if (namespace) {
    where.push("c.subject_id like ?");
    values.push(`${namespace}:%`);
  }

  if (options.includeMinor === false) {
    where.push("c.change_type <> 'minor'");
  }

  if (options.onlyCreates) {
    where.push("c.change_type = 'create'");
  }

  if (options.since) {
    where.push("c.created_at >= ?");
    values.push(options.since);
  }

  const whereSql = where.join(" and ");
  const sql = options.groupBySubject
    ? `select id, subject_type, subject_id, revision_id, user_id, user_name,
              user_username, user_display_name, user_email,
              ip, change_type, summary, size_change, created_at
       from (
         select c.id, c.subject_type, c.subject_id, c.revision_id, c.user_id, c.user_name,
                u.username as user_username,
                u.display_name as user_display_name,
                u.email as user_email,
                c.ip, c.change_type, c.summary, c.size_change, c.created_at,
                row_number() over (partition by c.subject_type, c.subject_id order by c.created_at desc, c.id desc) as recent_rank
         from changelog c
         left join users u on u.id = c.user_id
           or (c.user_id is null and lower(u.username) = lower(c.user_name))
         where ${whereSql}
       )
       where recent_rank = 1
       order by created_at desc, id desc
       limit ? offset ?`
    : `select c.id, c.subject_type, c.subject_id, c.revision_id, c.user_id, c.user_name,
              u.username as user_username,
              u.display_name as user_display_name,
              u.email as user_email,
              c.ip, c.change_type, c.summary, c.size_change, c.created_at
       from changelog c
       left join users u on u.id = c.user_id
         or (c.user_id is null and lower(u.username) = lower(c.user_name))
       where ${whereSql}
       order by c.created_at desc, c.id desc
       limit ? offset ?`;
  const result = await db
    .prepare(sql)
    .bind(...values, safeLimit, safeOffset)
    .all<RecentChangeRow>();

  return result.results.map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    revisionId: row.revision_id,
    userName: row.user_name,
    user: userDisplaySource({
      userId: row.user_id,
      userName: row.user_name,
      username: row.user_username,
      displayName: row.user_display_name,
      email: row.user_email
    }),
    ip: row.ip,
    changeType: row.change_type,
    summary: row.summary,
    sizeChange: row.size_change,
    createdAt: row.created_at
  }));
}

export async function searchPages(
  db: D1Database,
  query: string,
  namespace = "",
  limit = 25,
  language = "en"
): Promise<PageSearchResult[]> {
  const parsedQuery = parseFulltextSearchQuery(query, language);
  if (parsedQuery.rpn.length === 0) return [];
  if (parsedQuery.simpleTerms.length > 0) {
    return searchPagesSimple(db, parsedQuery, namespace, limit);
  }

  return searchPagesWithQueryPlan(db, parsedQuery, namespace, limit);
}

async function searchPagesSimple(
  db: D1Database,
  parsedQuery: ParsedFulltextSearchQuery,
  namespace = "",
  limit = 25
): Promise<PageSearchResult[]> {
  const terms = parsedQuery.simpleTerms;
  if (terms.length === 0) return [];

  const safeLimit = Math.max(1, Math.min(limit, 50));
  const placeholders = terms.map(() => "?").join(", ");
  const namespaceClause = namespace ? " and p.namespace = ?" : "";
  const requiredTermCount = terms.length;
  const result = await db
    .prepare(
      `select p.id, p.title, r.content, p.updated_at, sum(sp.frequency) as score
       from search_postings sp
       join pages p on p.id = sp.page_id
       join page_revisions r on r.id = p.current_revision_id
       where sp.term in (${placeholders}) and p.is_deleted = 0${namespaceClause}
       group by p.id
       having count(distinct sp.term) = ${requiredTermCount}
       order by score desc,
                (length(p.id) - length(replace(p.id, ':', ''))) asc,
                p.id asc
       limit ?`
    )
    .bind(...terms, ...(namespace ? [namespace] : []), safeLimit)
    .all<PageSearchRow>();

  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: makeSearchSnippet(row.content, parsedQuery.highlight),
    score: row.score,
    updatedAt: row.updated_at
  }));
}

async function searchPagesWithQueryPlan(
  db: D1Database,
  parsedQuery: ParsedFulltextSearchQuery,
  namespace = "",
  limit = 25
): Promise<PageSearchResult[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const pages = await listSearchPageSources(db, 5_000);
  if (pages.length === 0) return [];

  const pageRows = new Map(pages.map((page) => [page.id, page]));
  const wordHits = await buildSearchWordHitMaps(db, parsedQuery);
  const evaluated = evaluateSearchRpn(parsedQuery.rpn, pages, wordHits);
  const rows = [...evaluated.entries()]
    .map(([id, score]) => ({ page: pageRows.get(id), score }))
    .filter((entry): entry is { page: CurrentPageSourceRow; score: number } => {
      if (!entry.page) return false;
      return !namespace || entry.page.namespace === namespace;
    })
    .sort((a, b) => b.score - a.score || compareSearchPageIds(a.page.id, b.page.id))
    .slice(0, safeLimit);

  return rows.map(({ page, score }) => ({
    id: page.id,
    title: page.title,
    snippet: makeSearchSnippet(page.content, parsedQuery.highlight),
    score,
    updatedAt: page.updated_at
  }));
}

async function buildSearchWordHitMaps(
  db: D1Database,
  parsedQuery: ParsedFulltextSearchQuery
): Promise<Map<string, Map<string, number>>> {
  const wordOperands = uniqueWordOperands(parsedQuery.rpn);
  const exactTerms = new Set<string>();
  const resolvedTerms = new Map<string, string[]>();

  for (const operand of wordOperands) {
    if (operand.wildcard === "none") {
      exactTerms.add(operand.lookupTerm);
      resolvedTerms.set(wordOperandKey(operand), [operand.lookupTerm]);
      continue;
    }

    const matchingTerms = await resolveWildcardSearchTerms(db, operand);
    resolvedTerms.set(wordOperandKey(operand), matchingTerms);
    for (const term of matchingTerms) {
      exactTerms.add(term);
    }
  }

  const postings = await listSearchPostingsForTerms(db, [...exactTerms]);
  const postingsByTerm = new Map<string, Array<{ pageId: string; frequency: number }>>();
  for (const posting of postings) {
    const bucket = postingsByTerm.get(posting.term) ?? [];
    bucket.push({ pageId: posting.page_id, frequency: posting.frequency });
    postingsByTerm.set(posting.term, bucket);
  }

  const hitMaps = new Map<string, Map<string, number>>();
  for (const operand of wordOperands) {
    const pageHits = new Map<string, number>();
    for (const term of resolvedTerms.get(wordOperandKey(operand)) ?? []) {
      for (const posting of postingsByTerm.get(term) ?? []) {
        pageHits.set(posting.pageId, (pageHits.get(posting.pageId) ?? 0) + posting.frequency);
      }
    }
    hitMaps.set(wordOperandKey(operand), pageHits);
  }

  return hitMaps;
}

function evaluateSearchRpn(
  rpn: SearchRpnToken[],
  pages: CurrentPageSourceRow[],
  wordHits: Map<string, Map<string, number>>
): Map<string, number> {
  const universe = new Map(pages.map((page) => [page.id, 0]));
  const stack: Array<Map<string, number>> = [];

  for (const token of rpn) {
    if (typeof token !== "string") {
      stack.push(evaluateSearchOperand(token, pages, wordHits));
      continue;
    }

    if (token === "NOT") {
      const value = stack.pop() ?? new Map<string, number>();
      stack.push(complementSearchHits(universe, value));
      continue;
    }

    const right = stack.pop() ?? new Map<string, number>();
    const left = stack.pop() ?? new Map<string, number>();
    stack.push(token === "AND" ? intersectSearchHits(left, right) : uniteSearchHits(left, right));
  }

  return stack.pop() ?? new Map<string, number>();
}

function evaluateSearchOperand(
  operand: SearchOperand,
  pages: CurrentPageSourceRow[],
  wordHits: Map<string, Map<string, number>>
): Map<string, number> {
  if (operand.kind === "word") {
    return new Map(wordHits.get(wordOperandKey(operand)) ?? []);
  }

  if (operand.kind === "phrase") {
    const phrase = operand.phrase.toLowerCase();
    return new Map(
      pages
        .filter((page) => page.content.toLowerCase().includes(phrase))
        .map((page) => [page.id, 0])
    );
  }

  const namespace = cleanPageId(operand.namespace);
  const prefix = namespace ? `${namespace}:` : "";
  return new Map(
    pages.filter((page) => prefix && page.id.startsWith(prefix)).map((page) => [page.id, 0])
  );
}

function intersectSearchHits(
  left: Map<string, number>,
  right: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [id, score] of left) {
    if (right.has(id)) {
      result.set(id, score + (right.get(id) ?? 0));
    }
  }
  return result;
}

function uniteSearchHits(
  left: Map<string, number>,
  right: Map<string, number>
): Map<string, number> {
  const result = new Map(left);
  for (const [id, score] of right) {
    result.set(id, (result.get(id) ?? 0) + score);
  }
  return result;
}

function complementSearchHits(
  universe: Map<string, number>,
  excluded: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const id of universe.keys()) {
    if (!excluded.has(id)) result.set(id, 0);
  }
  return result;
}

function compareSearchPageIds(left: string, right: string): number {
  const leftDepth = left.split(":").length;
  const rightDepth = right.split(":").length;
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;
  return left.localeCompare(right);
}

function pageIdWithoutNamespaceOrStart(id: string, startPage: string): string {
  const name = pageNameFromId(id);
  const startName = pageNameFromId(startPage);
  if (name && name !== startName) return name;

  const namespace = id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
  return namespace ? pageNameFromId(namespace) || startName : startName;
}

function pageNameFromId(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

function uniqueWordOperands(rpn: SearchRpnToken[]): SearchWordOperand[] {
  const operands = new Map<string, SearchWordOperand>();
  for (const token of rpn) {
    if (typeof token === "object" && token.kind === "word") {
      operands.set(wordOperandKey(token), token);
    }
  }
  return [...operands.values()];
}

function wordOperandKey(operand: SearchWordOperand): string {
  return `${operand.wildcard}:${operand.term}`;
}

async function resolveWildcardSearchTerms(
  db: D1Database,
  operand: SearchWordOperand
): Promise<string[]> {
  const pattern = likePatternForWildcard(operand.lookupTerm, operand.wildcard);
  if (!pattern) return [];

  const result = await db
    .prepare(
      `select term
       from search_terms
       where term like ? escape '\\'
       order by document_count desc, term asc
       limit 256`
    )
    .bind(pattern)
    .all<SearchTermRow>();

  return result.results.map((row) => row.term);
}

function likePatternForWildcard(term: string, wildcard: SearchWildcard): string | null {
  if (wildcard === "none" || !term) return null;
  const escaped = escapeSqlLike(term);
  if (wildcard === "prefix") return `${escaped}%`;
  if (wildcard === "suffix") return `%${escaped}`;
  return `%${escaped}%`;
}

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function listSearchPostingsForTerms(
  db: D1Database,
  terms: string[]
): Promise<Array<{ term: string; page_id: string; frequency: number }>> {
  if (terms.length === 0) return [];

  const rows: Array<{ term: string; page_id: string; frequency: number }> = [];
  for (let index = 0; index < terms.length; index += 100) {
    const chunk = terms.slice(index, index + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `select term, page_id, frequency
         from search_postings
         where term in (${placeholders})`
      )
      .bind(...chunk)
      .all<{ term: string; page_id: string; frequency: number }>();
    rows.push(...result.results);
  }

  return rows;
}

export async function listNamespacePages(
  db: D1Database,
  namespace: string,
  limit = 200,
  offset = 0
): Promise<NamespacePage[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const safeOffset = Math.max(0, offset);
  const result = await db
    .prepare(
      `select id, namespace, title, updated_at
       from pages
       where namespace = ? and is_deleted = 0
       order by id
       limit ? offset ?`
    )
    .bind(namespace, safeLimit, safeOffset)
    .all<NamespacePageRow>();

  return result.results.map((row) => ({
    id: row.id,
    namespace: row.namespace,
    title: row.title,
    updatedAt: row.updated_at
  }));
}

export async function listAllPages(db: D1Database, limit = 500): Promise<PageLinkReference[]> {
  const result = await db
    .prepare(
      `select id, title, updated_at
       from pages
       where is_deleted = 0
       order by id
       limit ?`
    )
    .bind(Math.max(1, Math.min(limit, 1000)))
    .all<Pick<NamespacePageRow, "id" | "title" | "updated_at">>();

  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at
  }));
}

export async function lookupPages(
  db: D1Database,
  query: string,
  options: PageLookupOptions = {}
): Promise<PageLinkReference[]> {
  const cleanQuery = cleanPageId(query);
  if (!cleanQuery) return [];

  const lowerQuery = cleanQuery.toLowerCase();
  const lowerRawQuery = query.trim().toLowerCase();
  const pages = await listAllPages(db, Math.max(options.limit ?? 500, 500));
  const matches = pages.filter((page) => {
    const idTarget = options.inNamespace
      ? page.id
      : pageIdWithoutNamespaceOrStart(page.id, options.startPage ?? "start");
    if (idTarget.toLowerCase().includes(lowerQuery)) return true;
    return Boolean(options.inTitle && page.title?.toLowerCase().includes(lowerRawQuery));
  });

  return matches
    .sort((left, right) => compareSearchPageIds(left.id, right.id))
    .slice(0, Math.max(1, Math.min(options.limit ?? 500, 1000)));
}

export async function listExistingPageIds(
  db: D1Database,
  pageIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(pageIds.map((pageId) => cleanPageId(pageId)).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `select id
       from pages
       where is_deleted = 0 and id in (${placeholders})`
    )
    .bind(...ids)
    .all<{ id: string }>();

  return new Set(result.results.map((row) => row.id));
}

export async function listBacklinks(
  db: D1Database,
  targetPageId: string,
  limit = 200
): Promise<PageLinkReference[]> {
  const metadataBacklinks = await readBacklinkMetadataIds(db, targetPageId);
  if (metadataBacklinks) {
    return listPageReferencesByIds(
      db,
      metadataBacklinks.filter((pageId) => pageId !== targetPageId),
      limit
    );
  }

  const relationBacklinks = await listBacklinkIdsFromRelationMetadata(db, targetPageId);
  if (relationBacklinks) {
    return listPageReferencesByIds(db, relationBacklinks, limit);
  }

  return listBacklinksFromCurrentSources(db, targetPageId, limit);
}

export async function listOrphanPages(db: D1Database, limit = 200): Promise<PageLinkReference[]> {
  const relations = await listRelationMetadataRows(db);
  if (relations) {
    const incoming = incomingPageIdsFromRelationMetadata(relations);
    const pages = await listAllPages(db, MAX_METADATA_REFERENCE_ROWS);
    return pages
      .filter((page) => !incoming.has(page.id))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  }

  return listOrphanPagesFromCurrentSources(db, limit);
}

export async function listWantedPages(db: D1Database, limit = 200): Promise<WantedPage[]> {
  const relations = await listRelationMetadataRows(db);
  if (relations) {
    return listWantedPagesFromRelationMetadata(db, relations, limit);
  }

  return listWantedPagesFromCurrentSources(db, limit);
}

async function listBacklinksFromCurrentSources(
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

async function listOrphanPagesFromCurrentSources(
  db: D1Database,
  limit = 200
): Promise<PageLinkReference[]> {
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

async function listWantedPagesFromCurrentSources(
  db: D1Database,
  limit = 200
): Promise<WantedPage[]> {
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

async function readBacklinkMetadataIds(
  db: D1Database,
  targetPageId: string
): Promise<string[] | null> {
  const row = await db
    .prepare(
      `select value_json
       from metadata
       where subject_type = 'page'
         and subject_id = ?
         and key = 'backlinks'`
    )
    .bind(targetPageId)
    .first<{ value_json: string }>();

  if (!row || typeof row.value_json !== "string") return null;

  return parsePageIdArray(row.value_json);
}

async function listBacklinkIdsFromRelationMetadata(
  db: D1Database,
  targetPageId: string
): Promise<string[] | null> {
  const relations = await listRelationMetadataRows(db);
  if (!relations) return null;

  return relations
    .filter((row) => row.subject_id !== targetPageId)
    .filter((row) =>
      Object.prototype.hasOwnProperty.call(relationReferences(row.value_json), targetPageId)
    )
    .map((row) => row.subject_id);
}

async function listRelationMetadataRows(db: D1Database): Promise<RelationMetadataRow[] | null> {
  const result = await db
    .prepare(
      `select m.subject_id, m.value_json, p.title, p.updated_at
       from metadata m
       join pages p on p.id = m.subject_id
       where m.subject_type = 'page'
         and m.key = 'relation'
         and p.is_deleted = 0
       order by m.subject_id
       limit ?`
    )
    .bind(MAX_METADATA_REFERENCE_ROWS)
    .all<RelationMetadataRow>();

  return result.results.length > 0 ? result.results : null;
}

async function listPageReferencesByIds(
  db: D1Database,
  pageIds: readonly string[],
  limit: number
): Promise<PageLinkReference[]> {
  const ids = uniquePageIds(pageIds).slice(0, MAX_METADATA_REFERENCE_ROWS);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `select id, title, updated_at
       from pages
       where is_deleted = 0 and id in (${placeholders})`
    )
    .bind(...ids)
    .all<PageReferenceRow>();
  const order = new Map(ids.map((id, index) => [id, index]));
  const safeLimit = Math.max(1, Math.min(limit, 500));

  return result.results
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, safeLimit)
    .map(mapPageReferenceRow);
}

async function listWantedPagesFromRelationMetadata(
  db: D1Database,
  relations: RelationMetadataRow[],
  limit: number
): Promise<WantedPage[]> {
  const existing = new Set(
    (await listAllPages(db, MAX_METADATA_REFERENCE_ROWS)).map((page) => page.id)
  );
  const wanted = new Map<string, PageLinkReference[]>();

  for (const row of relations) {
    const referrer = mapRelationMetadataReference(row);
    for (const pageId of Object.keys(relationReferences(row.value_json))) {
      const clean = cleanPageId(pageId);
      if (!clean || existing.has(clean)) continue;

      const referrers = wanted.get(clean) ?? [];
      referrers.push(referrer);
      wanted.set(clean, referrers);
    }
  }

  const safeLimit = Math.max(1, Math.min(limit, 500));
  return [...wanted.entries()]
    .map(([id, referrers]) => ({
      id,
      referrers: uniquePageReferences(referrers)
    }))
    .sort((a, b) => b.referrers.length - a.referrers.length || a.id.localeCompare(b.id))
    .slice(0, safeLimit);
}

function incomingPageIdsFromRelationMetadata(relations: RelationMetadataRow[]): Set<string> {
  const incoming = new Set<string>();

  for (const row of relations) {
    for (const pageId of Object.keys(relationReferences(row.value_json))) {
      const clean = cleanPageId(pageId);
      if (clean && clean !== row.subject_id) incoming.add(clean);
    }
  }

  return incoming;
}

function relationReferences(valueJson: string): Record<string, unknown> {
  const parsed = parseJsonObject(valueJson);
  const relation = objectValue(parsed.relation);
  const source = Object.keys(relation).length > 0 ? relation : parsed;
  return objectValue(source.references);
}

function parsePageIdArray(valueJson: string): string[] {
  try {
    const parsed = JSON.parse(valueJson);
    if (!Array.isArray(parsed)) return [];
    return uniquePageIds(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return [];
  }
}

function parseJsonObject(valueJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(valueJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function uniquePageIds(pageIds: readonly string[]): string[] {
  return [...new Set(pageIds.map((pageId) => cleanPageId(pageId)).filter(Boolean))];
}

function uniquePageReferences(referrers: readonly PageLinkReference[]): PageLinkReference[] {
  const unique = new Map<string, PageLinkReference>();
  for (const referrer of referrers) {
    if (!unique.has(referrer.id)) unique.set(referrer.id, referrer);
  }
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function mapRelationMetadataReference(row: RelationMetadataRow): PageLinkReference {
  return {
    id: row.subject_id,
    title: row.title,
    updatedAt: row.updated_at
  };
}

function mapPageReferenceRow(row: PageReferenceRow): PageLinkReference {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at
  };
}

export async function getPageDraft(db: D1Database, pageId: string): Promise<PageDraft | null> {
  const row = await db
    .prepare(
      `select id, page_id, content, base_revision_id, updated_at
       from drafts
       where id = ?`
    )
    .bind(draftId(pageId))
    .first<PageDraftRow>();

  return row ? mapDraft(row) : null;
}

export async function savePageDraft(
  db: D1Database,
  pageId: string,
  content: string,
  baseRevisionId: string | null,
  userId: string | null = null,
  now = new Date()
): Promise<PageDraft> {
  const updatedAt = now.toISOString();
  const id = draftId(pageId);

  await db
    .prepare(
      `insert into drafts (id, page_id, user_id, content, base_revision_id, updated_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         user_id = excluded.user_id,
         content = excluded.content,
         base_revision_id = excluded.base_revision_id,
         updated_at = excluded.updated_at`
    )
    .bind(id, pageId, userId, content, baseRevisionId, updatedAt)
    .run();

  return {
    id,
    pageId,
    content,
    baseRevisionId,
    updatedAt
  };
}

export async function deletePageDraft(db: D1Database, pageId: string): Promise<void> {
  await db.prepare("delete from drafts where id = ?").bind(draftId(pageId)).run();
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
  const isDelete = input.content.trim() === "";
  const fallbackTitle = input.id.includes(":")
    ? input.id.slice(input.id.lastIndexOf(":") + 1)
    : input.id;
  const title =
    isDelete && current
      ? (current.title ?? fallbackTitle)
      : (extractTitle(input.content) ?? fallbackTitle);
  const defaultChangeType = isDelete ? "delete" : current ? "edit" : "create";
  const changeType =
    input.changeType === "minor" && defaultChangeType !== "edit"
      ? defaultChangeType
      : (input.changeType ?? defaultChangeType);
  const summary = input.summary || (isDelete ? "removed" : "");
  const sizeChange = input.content.length - (current?.content.length ?? 0);
  const revisionContent = isDelete && current ? current.content : input.content;
  const contentHash = await sha256(revisionContent);
  const indexedTerms = await listIndexedTerms(db, input.id);
  const searchTerms = isDelete
    ? new Map<string, number>()
    : buildSearchTermFrequencies(input.content, title, input.language, input.id);
  const renderedMetadata = isDelete
    ? null
    : renderWikiText(input.content, { pageId: input.id, sectionEdit: false });
  const outgoingLinks = renderedMetadata ? pageDependencies(renderedMetadata.dependencies) : [];
  const mediaLinks = renderedMetadata ? mediaDependencies(renderedMetadata.dependencies) : [];
  const existingLinkIds = await listExistingPageIds(db, outgoingLinks);
  if (!isDelete) existingLinkIds.add(input.id);
  const existingMediaIds = await listExistingMediaIds(db, mediaLinks);
  const previousMetadata = await readDokuWikiPageMetadata(db, input.id);
  const pageCreatedAt = current ? ((await getPageCreatedAt(db, input.id)) ?? now) : now;
  const previousOutgoingLinks = current ? extractInternalPageLinks(current.content, input.id) : [];
  const backlinkTargets = [...new Set([...previousOutgoingLinks, ...outgoingLinks, input.id])];
  const backlinkMetadata = await buildBacklinkMetadata(
    db,
    input.id,
    isDelete ? null : input.content,
    backlinkTargets
  );
  const pageMetadata = buildPageMetadata({
    title,
    revisionId,
    namespace,
    contentHash,
    content: input.content,
    isDelete,
    renderedMetadata,
    outgoingLinks,
    existingLinkIds,
    mediaLinks,
    existingMediaIds,
    previousMetadata,
    pageCreatedAt,
    modifiedAt: now,
    changeType,
    summary,
    authorId: input.authorId ?? null,
    authorName: input.authorName ?? null,
    ip: input.ip ?? null
  });

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
        revisionContent,
        contentHash,
        input.authorId ?? null,
        input.authorName ?? null,
        summary,
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
        summary,
        sizeChange,
        now
      ),
    ...buildSearchIndexStatements(db, input.id, searchTerms, indexedTerms, now),
    ...buildPageMetadataStatements(db, input.id, now, pageMetadata),
    ...buildBacklinkMetadataStatements(db, backlinkMetadata, now)
  ]);

  return {
    ok: true,
    changeType,
    page: {
      id: input.id,
      title,
      revisionId,
      content: input.content,
      updatedAt: now,
      author: userDisplaySource({
        userId: input.authorId ?? null,
        userName: input.authorName ?? null
      })
    }
  };
}

export async function rebuildSearchIndex(
  db: D1Database,
  now = new Date(),
  limit = 5_000,
  language = "en"
): Promise<RebuildSearchIndexResult> {
  const pages = await listCurrentPageSources(db, limit);
  const updatedAt = now.toISOString();
  const termDocumentCounts = new Map<string, number>();
  const postings: Array<{ term: string; pageId: string; frequency: number }> = [];

  for (const page of pages) {
    const title = page.title ?? pageTitleFromId(page.id);
    const terms = buildSearchTermFrequencies(page.content, title, language, page.id);

    for (const [term, frequency] of terms) {
      postings.push({ term, pageId: page.id, frequency });
      termDocumentCounts.set(term, (termDocumentCounts.get(term) ?? 0) + 1);
    }
  }

  const statements: D1PreparedStatement[] = [
    db.prepare("delete from search_postings"),
    db.prepare("delete from search_terms")
  ];

  for (const [term, documentCount] of termDocumentCounts) {
    statements.push(
      db
        .prepare(
          `insert into search_terms (term, term_length, document_count)
           values (?, ?, ?)`
        )
        .bind(term, searchIndexWordLength(term), documentCount)
    );
  }

  for (const posting of postings) {
    statements.push(
      db
        .prepare(
          `insert into search_postings (term, page_id, frequency, updated_at)
           values (?, ?, ?, ?)`
        )
        .bind(posting.term, posting.pageId, posting.frequency, updatedAt)
    );
  }

  await db.batch(statements);

  return {
    pageCount: pages.length,
    termCount: termDocumentCounts.size,
    postingCount: postings.length
  };
}

export async function rebuildPageSearchIndex(
  db: D1Database,
  id: string,
  now = new Date(),
  language = "en"
): Promise<PageSearchIndexTaskResult> {
  const page = await getCurrentPage(db, id);
  const previousTerms = await listIndexedTerms(db, id);
  const updatedAt = now.toISOString();

  if (!page) {
    await db.batch(buildSearchIndexStatements(db, id, new Map(), previousTerms, updatedAt));

    return {
      id,
      status: "missing",
      termCount: 0,
      postingCount: 0
    };
  }

  const title = page.title ?? pageTitleFromId(page.id);
  const terms = buildSearchTermFrequencies(page.content, title, language, page.id);
  await db.batch(buildSearchIndexStatements(db, id, terms, previousTerms, updatedAt));

  return {
    id,
    status: "indexed",
    termCount: terms.size,
    postingCount: terms.size
  };
}

interface DokuWikiPageMetadata {
  current?: Record<string, unknown>;
  persistent?: Record<string, unknown>;
}

interface PageMetadataBuildInput {
  title: string;
  revisionId: string;
  namespace: string;
  contentHash: string;
  content: string;
  isDelete: boolean;
  renderedMetadata: ReturnType<typeof renderWikiText> | null;
  outgoingLinks: string[];
  existingLinkIds: ReadonlySet<string>;
  mediaLinks: string[];
  existingMediaIds: ReadonlySet<string>;
  previousMetadata: DokuWikiPageMetadata | null;
  pageCreatedAt: string;
  modifiedAt: string;
  changeType: SavePageInput["changeType"];
  summary: string;
  authorId: string | null;
  authorName: string | null;
  ip: string | null;
}

interface PageMetadataInput {
  title: string;
  revisionId: string;
  namespace: string;
  contentHash: string;
  outgoingLinks: string[];
  mediaLinks: string[];
  isDeleted: boolean;
  size: number;
  wordCount: number;
  description: {
    abstract: string;
    tableofcontents: Array<{ hid: string; title: string; type: "ul"; level: number }>;
  };
  relation: {
    references: Record<string, boolean>;
    media: Record<string, boolean>;
    firstimage: string;
  };
  date: {
    created: number;
    modified: number;
  };
  contributor: Record<string, string | null>;
  dokuwiki: {
    current: Record<string, unknown>;
    persistent: Record<string, unknown>;
  };
}

function buildPageMetadataStatements(
  db: D1Database,
  pageId: string,
  updatedAt: string,
  metadata: PageMetadataInput
): D1PreparedStatement[] {
  return Object.entries(metadata).map(([key, value]) =>
    db
      .prepare(
        `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
         values ('page', ?, ?, ?, ?)
         on conflict(subject_type, subject_id, key) do update set
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .bind(pageId, key, JSON.stringify(value), updatedAt)
  );
}

function buildBacklinkMetadataStatements(
  db: D1Database,
  backlinks: ReadonlyMap<string, string[]>,
  updatedAt: string
): D1PreparedStatement[] {
  return [...backlinks.entries()].map(([pageId, referrers]) =>
    db
      .prepare(
        `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
         values ('page', ?, 'backlinks', ?, ?)
         on conflict(subject_type, subject_id, key) do update set
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .bind(pageId, JSON.stringify(referrers), updatedAt)
  );
}

function buildPageMetadata(input: PageMetadataBuildInput): PageMetadataInput {
  const previousPersistent = objectValue(input.previousMetadata?.persistent);
  const previousDate = objectValue(previousPersistent.date);
  const created = numericValue(previousDate.created) ?? unixSeconds(input.pageCreatedAt);
  const modified = unixSeconds(input.modifiedAt);
  const contributor = {
    ...recordValue(previousPersistent.contributor)
  } as Record<string, string | null>;
  const isMinorEdit = input.changeType === "minor";

  if (input.authorId && !input.isDelete && input.changeType !== "create" && !isMinorEdit) {
    contributor[input.authorId] = input.authorName;
  }

  const persistent: Record<string, unknown> = {
    ...previousPersistent,
    date: {
      ...previousDate,
      created,
      modified
    },
    user:
      stringValue(previousPersistent.user) ||
      (input.changeType === "create" ? (input.authorId ?? "") : ""),
    creator:
      stringValue(previousPersistent.creator) ||
      (input.changeType === "create" ? (input.authorName ?? "") : ""),
    contributor,
    last_change: {
      date: modified,
      type: input.changeType ?? (input.isDelete ? "delete" : "edit"),
      user: input.authorId ?? "",
      sum: input.summary,
      ip: input.ip
    }
  };

  const description = input.isDelete
    ? { abstract: "", tableofcontents: [] }
    : {
        abstract: pageAbstract(input.renderedMetadata?.html ?? ""),
        tableofcontents: tableOfContentsMetadata(input.renderedMetadata?.toc ?? [])
      };
  const relation = {
    references: Object.fromEntries(
      input.outgoingLinks.map((pageId) => [pageId, input.existingLinkIds.has(pageId)])
    ),
    media: Object.fromEntries(
      input.mediaLinks.map((mediaId) => [mediaId, input.existingMediaIds.has(mediaId)])
    ),
    firstimage: input.isDelete ? "" : firstImageFromContent(input.content)
  };
  const current: Record<string, unknown> = {
    ...persistent,
    title: input.title,
    description,
    relation,
    date: {
      ...objectValue(persistent.date),
      modified
    },
    internal: {
      cache: !input.renderedMetadata?.noCache,
      toc: !input.renderedMetadata?.noToc,
      noCache: Boolean(input.renderedMetadata?.noCache),
      noToc: Boolean(input.renderedMetadata?.noToc)
    }
  };

  return {
    title: input.title,
    revisionId: input.revisionId,
    namespace: input.namespace,
    contentHash: input.contentHash,
    outgoingLinks: input.outgoingLinks,
    mediaLinks: input.mediaLinks,
    isDeleted: input.isDelete,
    size: input.content.length,
    wordCount: countWords(input.content),
    description,
    relation,
    date: {
      created,
      modified
    },
    contributor,
    dokuwiki: {
      current,
      persistent
    }
  };
}

async function getPageCreatedAt(db: D1Database, pageId: string): Promise<string | null> {
  const row = await db
    .prepare("select created_at from pages where id = ?")
    .bind(pageId)
    .first<{ created_at: string }>();

  return row?.created_at ?? null;
}

async function readDokuWikiPageMetadata(
  db: D1Database,
  pageId: string
): Promise<DokuWikiPageMetadata | null> {
  const row = await db
    .prepare(
      `select value_json
       from metadata
       where subject_type = 'page'
         and subject_id = ?
         and key = 'dokuwiki'`
    )
    .bind(pageId)
    .first<{ value_json: string }>();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.value_json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as DokuWikiPageMetadata;
  } catch {
    return null;
  }
}

async function listExistingMediaIds(
  db: D1Database,
  mediaIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(mediaIds.map((mediaId) => cleanMediaId(mediaId)).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `select id
       from media
       where is_deleted = 0 and id in (${placeholders})`
    )
    .bind(...ids)
    .all<{ id: string }>();

  return new Set(result.results.map((row) => row.id));
}

async function buildBacklinkMetadata(
  db: D1Database,
  sourcePageId: string,
  sourceContent: string | null,
  targetPageIds: readonly string[]
): Promise<Map<string, string[]>> {
  const targets = new Set(targetPageIds.map((id) => cleanPageId(id)).filter(Boolean));
  const backlinks = new Map([...targets].map((id) => [id, [] as string[]]));
  if (targets.size === 0) return backlinks;

  const sources = await listCurrentPageSources(db, 500);
  const sawSource = sources.some((source) => source.id === sourcePageId);
  const effectiveSources =
    sourceContent === null
      ? sources.filter((source) => source.id !== sourcePageId)
      : [
          ...sources.map((source) =>
            source.id === sourcePageId ? { ...source, content: sourceContent } : source
          ),
          ...(sawSource
            ? []
            : [
                {
                  id: sourcePageId,
                  namespace: sourcePageId.includes(":")
                    ? sourcePageId.slice(0, sourcePageId.lastIndexOf(":"))
                    : "",
                  title: null,
                  content: sourceContent,
                  updated_at: new Date(0).toISOString()
                }
              ])
        ];

  for (const source of effectiveSources) {
    for (const linkedPageId of extractInternalPageLinks(source.content, source.id)) {
      if (linkedPageId === source.id || !targets.has(linkedPageId)) continue;
      backlinks.get(linkedPageId)?.push(source.id);
    }
  }

  for (const [target, referrers] of backlinks) {
    backlinks.set(
      target,
      [...new Set(referrers)].sort((a, b) => a.localeCompare(b))
    );
  }

  return backlinks;
}

function pageDependencies(
  dependencies: ReturnType<typeof renderWikiText>["dependencies"]
): string[] {
  return dependencies
    .filter((dependency) => dependency.subjectType === "page")
    .map((dependency) => dependency.subjectId);
}

function mediaDependencies(
  dependencies: ReturnType<typeof renderWikiText>["dependencies"]
): string[] {
  return dependencies
    .filter((dependency) => dependency.subjectType === "media")
    .map((dependency) => dependency.subjectId);
}

function tableOfContentsMetadata(
  toc: readonly TocItem[]
): Array<{ hid: string; title: string; type: "ul"; level: number }> {
  return toc.map((item) => ({
    hid: item.id,
    title: item.title,
    type: "ul",
    level: item.level
  }));
}

function pageAbstract(html: string): string {
  const withImageText = html.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, (_match, alt) =>
    alt ? `[${decodeHtmlEntities(String(alt))}]` : ""
  );
  const withoutFootnotes = withImageText.replace(/<div class="footnotes">[\s\S]*?<\/div>\s*$/i, "");
  const text = decodeHtmlEntities(
    withoutFootnotes
      .replace(/<(h[1-6]|p|div|li|tr|pre|blockquote)\b[^>]*>/gi, "\n")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function firstImageFromContent(content: string): string {
  for (const match of content.matchAll(/\{\{([^}|?]+)(?:\?[^}|]*)?(?:\|[^}]*)?\}\}/g)) {
    const raw = match[1].trim();
    const id = isExternalMediaId(raw) ? raw : cleanMediaId(raw);
    if (isImageId(id)) return id;
  }

  return "";
}

function isExternalMediaId(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function isImageId(id: string): boolean {
  return /\.(?:jpe?g|gif|png|webp|svg)$/i.test(mediaName(id));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordValue(value: unknown): Record<string, string | null> {
  const object = objectValue(value);
  return Object.fromEntries(
    Object.entries(object).filter((entry): entry is [string, string | null] => {
      const value = entry[1];
      return typeof value === "string" || value === null;
    })
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unixSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function countWords(content: string): number {
  return content.match(/[A-Za-z0-9][A-Za-z0-9_-]*/g)?.length ?? 0;
}

export function pagePath(id: string): string {
  return pageIdToRoutePath(id);
}

function mapRevision(row: PageRevisionRow): PageRevision {
  return {
    id: row.id,
    pageId: row.page_id,
    content: row.content,
    summary: row.summary,
    changeType: row.change_type,
    sizeChange: row.size_change,
    createdAt: row.created_at,
    author: userDisplaySource({
      userId: row.author_id,
      userName: row.author_name,
      username: row.author_username,
      displayName: row.author_display_name,
      email: row.author_email
    })
  };
}

function userDisplaySource(input: {
  userId?: string | null;
  userName?: string | null;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
}): UserDisplaySource | null {
  const userId = input.userId ?? null;
  const username = input.username ?? null;
  const fallbackName = input.userName ?? null;
  const displayName = input.displayName ?? null;
  const email = input.email ?? null;

  if (!userId && !username && !fallbackName && !displayName && !email) return null;

  return {
    userId,
    username: username ?? (userId ? null : fallbackName),
    displayName,
    email,
    fallbackName,
    knownUser: Boolean(username)
  };
}

function mapDraft(row: PageDraftRow): PageDraft {
  return {
    id: row.id,
    pageId: row.page_id,
    content: row.content,
    baseRevisionId: row.base_revision_id,
    updatedAt: row.updated_at
  };
}

function draftId(pageId: string): string {
  return `draft:${pageId}:anonymous`;
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
      `select p.id, p.namespace, p.title, r.content, p.updated_at
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

async function listSearchPageSources(
  db: D1Database,
  limit: number
): Promise<CurrentPageSourceRow[]> {
  const result = await db
    .prepare(
      `select p.id, p.namespace, p.title, r.content, p.updated_at
       from pages p
       join page_revisions r on r.id = p.current_revision_id
       where p.is_deleted = 0
       order by p.updated_at desc
       limit ?`
    )
    .bind(Math.max(1, Math.min(limit, 5_000)))
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
  const previousTermSet = new Set(previousTerms);
  const nextTermSet = new Set(terms.keys());
  const statements = [db.prepare("delete from search_postings where page_id = ?").bind(pageId)];

  for (const [term, frequency] of terms) {
    statements.push(
      db
        .prepare(
          `insert into search_terms (term, term_length, document_count)
           values (?, ?, 0)
           on conflict(term) do update set
             term_length = excluded.term_length`
        )
        .bind(term, searchIndexWordLength(term)),
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

  for (const term of nextTermSet) {
    if (previousTermSet.has(term)) continue;
    statements.push(
      db
        .prepare(
          `update search_terms
           set document_count = document_count + 1
           where term = ?`
        )
        .bind(term)
    );
  }

  for (const term of previousTermSet) {
    if (nextTermSet.has(term)) continue;
    statements.push(
      db
        .prepare(
          `update search_terms
           set document_count = max(document_count - 1, 0)
           where term = ?`
        )
        .bind(term)
    );
  }

  statements.push(db.prepare("delete from search_terms where document_count = 0").bind());

  return statements;
}

function extractTitle(content: string): string | null {
  const match = content.match(/^(={2,6})\s*(.*?)\s*\1\s*$/m);
  return match?.[2]?.trim() || null;
}

function pageTitleFromId(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

async function sha256(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
