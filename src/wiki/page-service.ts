export interface CurrentPage {
  id: string;
  title: string | null;
  revisionId: string;
  content: string;
  updatedAt: string;
}

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
