import type { PageRecord, PageRevisionRecord, PageStore } from "./interfaces";

type PageRow = {
  id: string;
  namespace: string;
  title: string | null;
  current_revision_id: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
};

type PageRevisionRow = {
  id: string;
  page_id: string;
  content: string;
  content_hash: string;
  author_id: string | null;
  author_name: string | null;
  summary: string;
  change_type: PageRevisionRecord["changeType"];
  size_change: number;
  created_at: string;
};

export class D1PageStore implements PageStore {
  constructor(private readonly db: D1Database) {}

  async getPage(id: string): Promise<PageRecord | null> {
    const row = await this.db
      .prepare(
        `select id, namespace, title, current_revision_id, is_deleted, created_at, updated_at
         from pages
         where id = ?`
      )
      .bind(id)
      .first<PageRow>();

    return row ? mapPage(row) : null;
  }

  async getPageRevision(revisionId: string): Promise<PageRevisionRecord | null> {
    const row = await this.db
      .prepare(
        `select id, page_id, content, content_hash, author_id, author_name, summary,
                change_type, size_change, created_at
         from page_revisions
         where id = ?`
      )
      .bind(revisionId)
      .first<PageRevisionRow>();

    return row ? mapPageRevision(row) : null;
  }

  async listPageRevisions(pageId: string, limit: number): Promise<PageRevisionRecord[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await this.db
      .prepare(
        `select id, page_id, content, content_hash, author_id, author_name, summary,
                change_type, size_change, created_at
         from page_revisions
         where page_id = ?
         order by created_at desc
         limit ?`
      )
      .bind(pageId, safeLimit)
      .all<PageRevisionRow>();

    return result.results.map(mapPageRevision);
  }

  async savePageRevision(revision: PageRevisionRecord): Promise<void> {
    const namespace = revision.pageId.includes(":")
      ? revision.pageId.slice(0, revision.pageId.lastIndexOf(":"))
      : "";
    const title = revision.pageId.includes(":")
      ? revision.pageId.slice(revision.pageId.lastIndexOf(":") + 1)
      : revision.pageId;

    await this.db.batch([
      this.db
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
        .bind(
          revision.pageId,
          namespace,
          title,
          revision.id,
          revision.changeType === "delete" ? 1 : 0,
          revision.createdAt,
          revision.createdAt
        ),
      this.db
        .prepare(
          `insert into page_revisions (
             id, page_id, content, content_hash, author_id, author_name, summary,
             change_type, size_change, created_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          revision.id,
          revision.pageId,
          revision.content,
          revision.contentHash,
          revision.authorId,
          revision.authorName,
          revision.summary,
          revision.changeType,
          revision.sizeChange,
          revision.createdAt
        )
    ]);
  }
}

function mapPage(row: PageRow): PageRecord {
  return {
    id: row.id,
    namespace: row.namespace,
    title: row.title,
    currentRevisionId: row.current_revision_id,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPageRevision(row: PageRevisionRow): PageRevisionRecord {
  return {
    id: row.id,
    pageId: row.page_id,
    content: row.content,
    contentHash: row.content_hash,
    authorId: row.author_id,
    authorName: row.author_name,
    summary: row.summary,
    changeType: row.change_type,
    sizeChange: row.size_change,
    createdAt: row.created_at
  };
}
