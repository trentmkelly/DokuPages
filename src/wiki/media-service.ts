import { cleanPageId, cleanRoutePageId } from "./page-id";
import { getMimeTypeForExtension } from "./mime";
import { parseJpegMetadata } from "./jpeg-metadata";

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

export interface MediaListOptions {
  sort?: "name" | "date";
  order?: "asc" | "desc";
}

export interface MediaUsageReference {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface SaveMediaUploadInput {
  id: string;
  body: ArrayBuffer;
  mimeType?: string | null;
  summary: string;
  overwrite?: boolean;
  mediaRevisions?: boolean;
  authorId?: string | null;
  authorName?: string | null;
  ip?: string | null;
  now?: Date;
}

export type SaveMediaUploadResult =
  | {
      ok: true;
      media: CurrentMedia;
      revision: MediaRevision;
      changeType: "create" | "edit";
    }
  | {
      ok: false;
      reason: "exists";
    };

export interface DeleteMediaInput {
  id: string;
  summary: string;
  refcheck?: boolean;
  mediaRevisions?: boolean;
  authorId?: string | null;
  authorName?: string | null;
  ip?: string | null;
  now?: Date;
}

export type DeleteMediaResult =
  | {
      ok: true;
      revision: MediaRevision;
    }
  | {
      ok: false;
      reason: "not_found";
    }
  | {
      ok: false;
      reason: "in_use";
      references: MediaUsageReference[];
    };

export interface RevertMediaInput {
  id: string;
  revisionId: string;
  summary: string;
  authorId?: string | null;
  authorName?: string | null;
  ip?: string | null;
  now?: Date;
}

export type RevertMediaResult =
  | {
      ok: true;
      media: CurrentMedia;
      revision: MediaRevision;
    }
  | {
      ok: false;
      reason: "not_found" | "delete_revision";
    };

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

interface StoredMediaRow extends CurrentMediaRow {
  is_deleted: number;
}

interface StoredMedia extends CurrentMedia {
  isDeleted: boolean;
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

interface MediaUsageReferenceRow {
  subject_id: string;
  value_json: string;
  title: string | null;
  updated_at: string;
}

interface MetadataRow {
  value_json: string;
}

const MAX_MEDIA_USAGE_REFERENCES = 500;

export function isExternalMediaId(value: string): boolean {
  return /^(?:https?|ftp):\/\//i.test(value.trim());
}

export function cleanMediaId(rawId: string): string {
  return cleanPageId(rawId);
}

export function cleanMediaRouteId(rawPath: string): string {
  return cleanRoutePageId(rawPath);
}

export function mediaNamespace(id: string): string {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : "";
}

export function mediaName(id: string): string {
  if (isExternalMediaId(id)) return externalMediaName(id);
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
  return getMimeTypeForExtension(extension) ?? "application/octet-stream";
}

function externalMediaName(id: string): string {
  try {
    const parsed = new URL(id);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : parsed.hostname;
  } catch {
    return id;
  }
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

async function getStoredMedia(db: D1Database, id: string): Promise<StoredMedia | null> {
  const row = await db
    .prepare(
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, is_deleted, created_at, updated_at
       from media
       where id = ?`
    )
    .bind(id)
    .first<StoredMediaRow>();

  return row ? mapStoredMedia(row) : null;
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

export async function listMediaRevisions(
  db: D1Database,
  mediaId: string,
  limit = 50,
  cursor?: string
): Promise<MediaRevision[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = cursor
    ? await db
        .prepare(
          `select id, media_id, object_key, mime_type, byte_length, content_hash,
                  change_type, summary, created_at
           from media_revisions
           where media_id = ? and created_at < ?
           order by created_at desc
           limit ?`
        )
        .bind(mediaId, cursor, safeLimit)
        .all<MediaRevisionRow>()
    : await db
        .prepare(
          `select id, media_id, object_key, mime_type, byte_length, content_hash,
                  change_type, summary, created_at
           from media_revisions
           where media_id = ?
           order by created_at desc
           limit ?`
        )
        .bind(mediaId, safeLimit)
        .all<MediaRevisionRow>();

  return result.results.map(mapMediaRevision);
}

export async function listMediaUsageReferences(
  db: D1Database,
  mediaId: string,
  limit = MAX_MEDIA_USAGE_REFERENCES
): Promise<MediaUsageReference[]> {
  const id = cleanMediaId(mediaId);
  if (!id) return [];

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
    .bind(MAX_MEDIA_USAGE_REFERENCES)
    .all<MediaUsageReferenceRow>();
  const safeLimit = Math.max(1, Math.min(limit, MAX_MEDIA_USAGE_REFERENCES));

  return result.results
    .filter((row) => relationMediaUses(row.value_json, id))
    .slice(0, safeLimit)
    .map((row) => ({
      id: row.subject_id,
      title: row.title,
      updatedAt: row.updated_at
    }));
}

export async function listNamespaceMedia(
  db: D1Database,
  namespace: string,
  limit = 200,
  offset = 0,
  options: MediaListOptions = {}
): Promise<CurrentMedia[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const safeOffset = Math.max(0, offset);
  const orderBy = mediaOrderBySql(options);
  const result = await db
    .prepare(
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, created_at, updated_at
       from media
       where namespace = ? and is_deleted = 0
       order by ${orderBy}
       limit ? offset ?`
    )
    .bind(namespace, safeLimit, safeOffset)
    .all<CurrentMediaRow>();

  return result.results.map(mapCurrentMedia);
}

export async function searchMedia(
  db: D1Database,
  namespace: string,
  query: string,
  limit = 200,
  offset = 0,
  options: MediaListOptions = {}
): Promise<CurrentMedia[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const safeOffset = Math.max(0, offset);
  const pattern = likePattern(query);
  const orderBy = mediaOrderBySql(options);
  const result = await db
    .prepare(
      `select id, namespace, object_key, mime_type, byte_length, content_hash,
              current_revision_id, created_at, updated_at
       from media
       where namespace = ? and is_deleted = 0
         and (id like ? escape '\\' or mime_type like ? escape '\\')
       order by ${orderBy}
       limit ? offset ?`
    )
    .bind(namespace, pattern, pattern, safeLimit, safeOffset)
    .all<CurrentMediaRow>();

  return result.results.map(mapCurrentMedia);
}

export async function getMediaMetadata<T = unknown>(
  db: D1Database,
  id: string,
  key: string
): Promise<T | null> {
  const row = await db
    .prepare(
      `select value_json
       from metadata
       where subject_type = 'media' and subject_id = ? and key = ?`
    )
    .bind(cleanMediaId(id), key)
    .first<MetadataRow>();

  if (!row) return null;

  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

function mediaOrderBySql(options: MediaListOptions): string {
  const direction = options.order === "desc" ? "desc" : "asc";
  if (options.sort === "date") {
    return `updated_at ${direction}, id asc`;
  }
  return `id ${direction}`;
}

export async function saveMediaUpload(
  db: D1Database,
  bucket: R2Bucket,
  input: SaveMediaUploadInput
): Promise<SaveMediaUploadResult> {
  const id = cleanMediaId(input.id);
  const current = await getCurrentMedia(db, id);

  if (current && !input.overwrite) {
    return { ok: false, reason: "exists" };
  }

  const now = (input.now ?? new Date()).toISOString();
  const namespace = mediaNamespace(id);
  const revisionId = `${id}@${now}`;
  const objectKey = mediaRevisionObjectKey(id, revisionId);
  const mimeType = input.mimeType || detectMimeType(id);
  const byteLength = input.body.byteLength;
  const contentHash = await sha256(input.body);
  const changeType = current ? "edit" : "create";
  const summary = input.summary;
  const sizeChange = byteLength - (current?.byteLength ?? 0);
  const mediaRevisions = input.mediaRevisions ?? true;
  const jpegMetadata = parseJpegMetadata(id, input.body, mimeType);

  await bucket.put(objectKey, input.body, {
    httpMetadata: {
      contentType: mimeType
    },
    customMetadata: {
      mediaId: id,
      revisionId,
      contentHash
    }
  });

  try {
    await db.batch([
      db
        .prepare(
          `insert into media (
             id, namespace, object_key, mime_type, byte_length, content_hash,
             current_revision_id, is_deleted, created_at, updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
           on conflict(id) do update set
             namespace = excluded.namespace,
             object_key = excluded.object_key,
             mime_type = excluded.mime_type,
             byte_length = excluded.byte_length,
             content_hash = excluded.content_hash,
             current_revision_id = excluded.current_revision_id,
             is_deleted = 0,
             updated_at = excluded.updated_at`
        )
        .bind(id, namespace, objectKey, mimeType, byteLength, contentHash, revisionId, now, now),
      ...(mediaRevisions
        ? [
            db
              .prepare(
                `insert into media_revisions (
                   id, media_id, object_key, mime_type, byte_length, content_hash,
                   author_id, summary, change_type, created_at
                 ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                revisionId,
                id,
                objectKey,
                mimeType,
                byteLength,
                contentHash,
                input.authorId ?? null,
                summary,
                changeType,
                now
              )
          ]
        : []),
      db
        .prepare(
          `insert into changelog (
             id, subject_type, subject_id, revision_id, user_id, user_name, ip,
             change_type, summary, size_change, created_at
           ) values (?, 'media', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          `media:${revisionId}`,
          id,
          revisionId,
          input.authorId ?? null,
          input.authorName ?? null,
          input.ip ?? null,
          changeType,
          summary,
          sizeChange,
          now
        ),
      ...buildMediaMetadataStatements(db, id, now, {
        namespace,
        revisionId,
        objectKey,
        mimeType,
        contentHash,
        size: byteLength,
        ...(jpegMetadata ? { jpeg: jpegMetadata } : {})
      })
    ]);
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }

  return {
    ok: true,
    changeType,
    media: {
      id,
      namespace,
      objectKey,
      mimeType,
      byteLength,
      contentHash,
      currentRevisionId: revisionId,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    },
    revision: {
      id: revisionId,
      mediaId: id,
      objectKey,
      mimeType,
      byteLength,
      contentHash,
      changeType,
      summary,
      createdAt: now
    }
  };
}

export async function deleteMedia(
  db: D1Database,
  input: DeleteMediaInput
): Promise<DeleteMediaResult> {
  const id = cleanMediaId(input.id);
  const current = await getCurrentMedia(db, id);

  if (!current) {
    return { ok: false, reason: "not_found" };
  }

  if (input.refcheck) {
    const references = await listMediaUsageReferences(db, id);
    if (references.length > 0) {
      return { ok: false, reason: "in_use", references };
    }
  }

  const now = (input.now ?? new Date()).toISOString();
  const revisionId = `${id}@${now}`;
  const summary = input.summary || "Deleted media";
  const mediaRevisions = input.mediaRevisions ?? true;

  await db.batch([
    db
      .prepare(
        `update media
         set current_revision_id = ?, is_deleted = 1, updated_at = ?
         where id = ?`
      )
      .bind(revisionId, now, id),
    ...(mediaRevisions
      ? [
          db
            .prepare(
              `insert into media_revisions (
                 id, media_id, object_key, mime_type, byte_length, content_hash,
                 author_id, summary, change_type, created_at
               ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              revisionId,
              id,
              current.objectKey,
              current.mimeType,
              current.byteLength,
              current.contentHash,
              input.authorId ?? null,
              summary,
              "delete",
              now
            )
        ]
      : []),
    db
      .prepare(
        `insert into changelog (
           id, subject_type, subject_id, revision_id, user_id, user_name, ip,
           change_type, summary, size_change, created_at
         ) values (?, 'media', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `media:${revisionId}`,
        id,
        revisionId,
        input.authorId ?? null,
        input.authorName ?? null,
        input.ip ?? null,
        "delete",
        summary,
        -current.byteLength,
        now
      ),
    ...buildMediaMetadataStatements(db, id, now, {
      namespace: current.namespace,
      revisionId,
      objectKey: current.objectKey,
      deleted: true,
      deletedAt: now
    })
  ]);

  return {
    ok: true,
    revision: {
      id: revisionId,
      mediaId: id,
      objectKey: current.objectKey,
      mimeType: current.mimeType,
      byteLength: current.byteLength,
      contentHash: current.contentHash,
      changeType: "delete",
      summary,
      createdAt: now
    }
  };
}

export async function revertMedia(
  db: D1Database,
  input: RevertMediaInput
): Promise<RevertMediaResult> {
  const id = cleanMediaId(input.id);
  const target = await getMediaRevision(db, input.revisionId);

  if (!target || target.mediaId !== id) {
    return { ok: false, reason: "not_found" };
  }

  if (target.changeType === "delete") {
    return { ok: false, reason: "delete_revision" };
  }

  const current = await getStoredMedia(db, id);
  const now = (input.now ?? new Date()).toISOString();
  const namespace = mediaNamespace(id);
  const revisionId = `${id}@${now}`;
  const summary = input.summary || `Reverted to ${target.createdAt}`;
  const sizeChange = target.byteLength - (current && !current.isDeleted ? current.byteLength : 0);

  await db.batch([
    db
      .prepare(
        `insert into media (
           id, namespace, object_key, mime_type, byte_length, content_hash,
           current_revision_id, is_deleted, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         on conflict(id) do update set
           namespace = excluded.namespace,
           object_key = excluded.object_key,
           mime_type = excluded.mime_type,
           byte_length = excluded.byte_length,
           content_hash = excluded.content_hash,
           current_revision_id = excluded.current_revision_id,
           is_deleted = 0,
           updated_at = excluded.updated_at`
      )
      .bind(
        id,
        namespace,
        target.objectKey,
        target.mimeType,
        target.byteLength,
        target.contentHash,
        revisionId,
        now,
        now
      ),
    db
      .prepare(
        `insert into media_revisions (
           id, media_id, object_key, mime_type, byte_length, content_hash,
           author_id, summary, change_type, created_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        revisionId,
        id,
        target.objectKey,
        target.mimeType,
        target.byteLength,
        target.contentHash,
        input.authorId ?? null,
        summary,
        "revert",
        now
      ),
    db
      .prepare(
        `insert into changelog (
           id, subject_type, subject_id, revision_id, user_id, user_name, ip,
           change_type, summary, size_change, created_at
         ) values (?, 'media', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `media:${revisionId}`,
        id,
        revisionId,
        input.authorId ?? null,
        input.authorName ?? null,
        input.ip ?? null,
        "revert",
        summary,
        sizeChange,
        now
      ),
    ...buildMediaMetadataStatements(db, id, now, {
      namespace,
      revisionId,
      objectKey: target.objectKey,
      mimeType: target.mimeType,
      contentHash: target.contentHash,
      size: target.byteLength,
      deleted: false,
      revertedFromRevisionId: target.id
    })
  ]);

  return {
    ok: true,
    media: {
      id,
      namespace,
      objectKey: target.objectKey,
      mimeType: target.mimeType,
      byteLength: target.byteLength,
      contentHash: target.contentHash,
      currentRevisionId: revisionId,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    },
    revision: {
      id: revisionId,
      mediaId: id,
      objectKey: target.objectKey,
      mimeType: target.mimeType,
      byteLength: target.byteLength,
      contentHash: target.contentHash,
      changeType: "revert",
      summary,
      createdAt: now
    }
  };
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

function mapStoredMedia(row: StoredMediaRow): StoredMedia {
  return {
    ...mapCurrentMedia(row),
    isDeleted: row.is_deleted === 1
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

function relationMediaUses(valueJson: string, mediaId: string): boolean {
  const media = relationMedia(valueJson);
  return Object.keys(media).some((candidate) => cleanMediaId(candidate) === mediaId);
}

function relationMedia(valueJson: string): Record<string, unknown> {
  const parsed = parseJsonObject(valueJson);
  const directRelation = objectValue(parsed.relation);
  const currentRelation = objectValue(objectValue(parsed.current).relation);
  const relation = Object.keys(directRelation).length > 0 ? directRelation : currentRelation;
  const source = Object.keys(relation).length > 0 ? relation : parsed;
  return objectValue(source.media);
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mediaRevisionObjectKey(id: string, revisionId: string): string {
  const path = id
    .split(":")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `media/revisions/${path}/${encodeURIComponent(revisionId)}`;
}

function buildMediaMetadataStatements(
  db: D1Database,
  id: string,
  updatedAt: string,
  metadata: Record<string, unknown>
): D1PreparedStatement[] {
  return Object.entries(metadata).map(([key, value]) =>
    db
      .prepare(
        `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
         values ('media', ?, ?, ?, ?)
         on conflict(subject_type, subject_id, key) do update set
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .bind(id, key, JSON.stringify(value), updatedAt)
  );
}

async function sha256(value: ArrayBuffer): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function likePattern(query: string): string {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}
