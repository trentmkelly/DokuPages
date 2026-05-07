export interface CurrentPage {
  id: string;
  title: string | null;
  revisionId: string;
  content: string;
  updatedAt: string;
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
      )
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

function extractTitle(content: string): string | null {
  const match = content.match(/^(={2,6})\s*(.*?)\s*\1\s*$/m);
  return match?.[2]?.trim() || null;
}

async function sha256(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
