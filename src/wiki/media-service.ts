import { cleanPageId } from "./page-id";

export interface CurrentMedia {
  id: string;
  namespace: string;
  objectKey: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRevision {
  id: string;
  mediaId: string;
  objectKey: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  changeType: "create" | "edit" | "delete" | "revert";
  summary: string;
  createdAt: string;
}

interface CurrentMediaRow {
  id: string;
  namespace: string;
  object_key: string;
  mime_type: string;
  byte_length: number;
  content_hash: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MediaRevisionRow {
  id: string;
  media_id: string;
  object_key: string;
  mime_type: string;
  byte_length: number;
  content_hash: string;
  change_type: MediaRevision["changeType"];
  summary: string;
  created_at: string;
}

const MIME_TYPES = new Map([
  ["gif", "image/gif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["txt", "text/plain; charset=utf-8"],
  ["pdf", "application/pdf"],
  ["zip", "application/zip"],
  ["json", "application/json; charset=utf-8"]
]);

export function cleanMediaId(rawId: string): string {
  return cleanPageId(rawId);
}

export function mediaNamespace(id: string): string {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
}

export function mediaName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

export function mediaPath(id: string): string {
  return `/media/${cleanMediaId(id)
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function mediaDetailPath(id: string): string {
  return `/media-detail/${cleanMediaId(id)
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function detectMimeType(id: string): string {
  const extension = mediaName(id).split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES.get(extension) ?? "application/octet-stream";
}

export async function getCurrentMedia(db: D1Database, id: string): Promise<CurrentMedia | null> {
  const row = await db
    .prepare(
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, created_at, updated_at
       from media
       where id = ? and is_deleted = 0`
    )
    .bind(id)
    .first<CurrentMediaRow>();

  return row ? mapCurrentMedia(row) : null;
}

export async function getMediaRevision(
  db: D1Database,
  revisionId: string
): Promise<MediaRevision | null> {
  const row = await db
    .prepare(
      `select id, media_id, object_key, mime_type, byte_length, content_hash,
              change_type, summary, created_at
       from media_revisions
       where id = ?`
    )
    .bind(revisionId)
    .first<MediaRevisionRow>();

  return row ? mapMediaRevision(row) : null;
}

export async function listNamespaceMedia(
  db: D1Database,
  namespace: string,
  limit = 200
): Promise<CurrentMedia[]> {
  const result = await db
    .prepare(
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, created_at, updated_at
       from media
       where namespace = ? and is_deleted = 0
       order by id asc
       limit ?`
    )
    .bind(namespace, Math.max(1, Math.min(limit, 500)))
    .all<CurrentMediaRow>();

  return result.results.map(mapCurrentMedia);
}

function mapCurrentMedia(row: CurrentMediaRow): CurrentMedia {
  return {
    id: row.id,
    namespace: row.namespace,
    objectKey: row.object_key,
    mimeType: row.mime_type || detectMimeType(row.id),
    byteLength: row.byte_length,
    contentHash: row.content_hash,
    currentRevisionId: row.current_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMediaRevision(row: MediaRevisionRow): MediaRevision {
  return {
    id: row.id,
    mediaId: row.media_id,
    objectKey: row.object_key,
    mimeType: row.mime_type || detectMimeType(row.media_id),
    byteLength: row.byte_length,
    contentHash: row.content_hash,
    changeType: row.change_type,
    summary: row.summary,
    createdAt: row.created_at
  };
}
