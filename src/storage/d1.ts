import type {
  AclRuleRecord,
  AclStore,
  AuditLogRecord,
  AuditLogStore,
  ChangelogRecord,
  ChangelogStore,
  DraftRecord,
  DraftStore,
  MediaRecord,
  MediaRevisionRecord,
  MediaStore,
  MetadataRecord,
  MetadataStore,
  PageRecord,
  PageRevisionRecord,
  PageStore,
  RenderedCacheRecord,
  RenderedCacheStore,
  SearchHitRecord,
  SearchStore,
  UserRecord,
  UserStore
} from "./interfaces";
import { searchIndexWordLength } from "../wiki/search";

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

type MediaRow = {
  id: string;
  namespace: string;
  object_key: string;
  mime_type: string;
  byte_length: number;
  content_hash: string;
  current_revision_id: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
};

type MediaRevisionRow = {
  id: string;
  media_id: string;
  object_key: string;
  mime_type: string;
  byte_length: number;
  content_hash: string;
  author_id: string | null;
  summary: string;
  change_type: MediaRevisionRecord["changeType"];
  created_at: string;
};

type MetadataRow = {
  subject_type: MetadataRecord["subjectType"];
  subject_id: string;
  key: string;
  value_json: string;
  updated_at: string;
};

type AclRuleRow = {
  id: string;
  scope: string;
  principal_type: AclRuleRecord["principalType"];
  principal: string;
  permission: number;
  created_at: string;
};

type ChangelogRow = {
  id: string;
  subject_type: ChangelogRecord["subjectType"];
  subject_id: string;
  revision_id: string | null;
  user_id: string | null;
  user_name: string | null;
  ip: string | null;
  change_type: string;
  summary: string;
  size_change: number;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string;
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
};

type DraftRow = {
  id: string;
  page_id: string;
  user_id: string | null;
  content: string;
  base_revision_id: string | null;
  updated_at: string;
};

type RenderedCacheRow = {
  cache_key: string;
  subject_type: RenderedCacheRecord["subjectType"];
  subject_id: string;
  revision_id: string | null;
  content_hash: string;
  rendered_html: string;
  created_at: string;
  expires_at: string | null;
};

type SearchTermRow = {
  term: string;
};

type SearchHitRow = {
  page_id: string;
  frequency: number;
  updated_at: string;
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

export class D1MediaStore implements MediaStore {
  constructor(private readonly db: D1Database) {}

  async getMedia(id: string): Promise<MediaRecord | null> {
    const row = await this.db
      .prepare(
        `select id, namespace, object_key, mime_type, byte_length, content_hash,
                current_revision_id, is_deleted, created_at, updated_at
         from media
         where id = ?`
      )
      .bind(id)
      .first<MediaRow>();

    return row ? mapMedia(row) : null;
  }

  async getMediaRevision(revisionId: string): Promise<MediaRevisionRecord | null> {
    const row = await this.db
      .prepare(
        `select id, media_id, object_key, mime_type, byte_length, content_hash,
                author_id, summary, change_type, created_at
         from media_revisions
         where id = ?`
      )
      .bind(revisionId)
      .first<MediaRevisionRow>();

    return row ? mapMediaRevision(row) : null;
  }

  async listMediaRevisions(mediaId: string, limit: number): Promise<MediaRevisionRecord[]> {
    const safeLimit = clampLimit(limit, 100);
    const result = await this.db
      .prepare(
        `select id, media_id, object_key, mime_type, byte_length, content_hash,
                author_id, summary, change_type, created_at
         from media_revisions
         where media_id = ?
         order by created_at desc
         limit ?`
      )
      .bind(mediaId, safeLimit)
      .all<MediaRevisionRow>();

    return result.results.map(mapMediaRevision);
  }

  async saveMedia(
    media: MediaRecord,
    body: ReadableStream<Uint8Array> | ArrayBuffer
  ): Promise<void> {
    void body;

    await this.db
      .prepare(
        `insert into media (
           id, namespace, object_key, mime_type, byte_length, content_hash,
           current_revision_id, is_deleted, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           namespace = excluded.namespace,
           object_key = excluded.object_key,
           mime_type = excluded.mime_type,
           byte_length = excluded.byte_length,
           content_hash = excluded.content_hash,
           current_revision_id = excluded.current_revision_id,
           is_deleted = excluded.is_deleted,
           updated_at = excluded.updated_at`
      )
      .bind(
        media.id,
        media.namespace,
        media.objectKey,
        media.mimeType,
        media.byteLength,
        media.contentHash,
        media.currentRevisionId,
        media.isDeleted ? 1 : 0,
        media.createdAt,
        media.updatedAt
      )
      .run();
  }
}

export class D1MetadataStore implements MetadataStore {
  constructor(private readonly db: D1Database) {}

  async getMetadata(
    subjectType: MetadataRecord["subjectType"],
    subjectId: string
  ): Promise<MetadataRecord[]> {
    const result = await this.db
      .prepare(
        `select subject_type, subject_id, key, value_json, updated_at
         from metadata
         where subject_type = ? and subject_id = ?
         order by key asc`
      )
      .bind(subjectType, subjectId)
      .all<MetadataRow>();

    return result.results.map(mapMetadata);
  }

  async putMetadata(record: MetadataRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(subject_type, subject_id, key) do update set
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        record.subjectType,
        record.subjectId,
        record.key,
        JSON.stringify(record.value),
        record.updatedAt
      )
      .run();
  }
}

export class D1AclStore implements AclStore {
  constructor(private readonly db: D1Database) {}

  async listAllRules(): Promise<AclRuleRecord[]> {
    const result = await this.db
      .prepare(
        `select id, scope, principal_type, principal, permission, created_at
         from acl_rules
         order by scope asc, principal_type asc, principal asc`
      )
      .bind()
      .all<AclRuleRow>();

    return result.results.map(mapAclRule);
  }

  async listRules(scope: string): Promise<AclRuleRecord[]> {
    const result = await this.db
      .prepare(
        `select id, scope, principal_type, principal, permission, created_at
         from acl_rules
         where scope = ?
         order by principal_type asc, principal asc`
      )
      .bind(scope)
      .all<AclRuleRow>();

    return result.results.map(mapAclRule);
  }

  async putRule(rule: AclRuleRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into acl_rules (id, scope, principal_type, principal, permission, created_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           scope = excluded.scope,
           principal_type = excluded.principal_type,
           principal = excluded.principal,
           permission = excluded.permission`
      )
      .bind(
        rule.id,
        rule.scope,
        rule.principalType,
        rule.principal,
        rule.permission,
        rule.createdAt
      )
      .run();
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.prepare("delete from acl_rules where id = ?").bind(id).run();
  }

  async deleteMatchingRules(
    scope: string,
    principalType: AclRuleRecord["principalType"],
    principal: string
  ): Promise<void> {
    await this.db
      .prepare("delete from acl_rules where scope = ? and principal_type = ? and principal = ?")
      .bind(scope, principalType, principal)
      .run();
  }
}

export class D1ChangelogStore implements ChangelogStore {
  constructor(private readonly db: D1Database) {}

  async listChanges(
    subjectType: ChangelogRecord["subjectType"],
    subjectId: string,
    limit: number
  ): Promise<ChangelogRecord[]> {
    const result = await this.db
      .prepare(
        `select id, subject_type, subject_id, revision_id, user_id, user_name, ip,
                change_type, summary, size_change, created_at
         from changelog
         where subject_type = ? and subject_id = ?
         order by created_at desc
         limit ?`
      )
      .bind(subjectType, subjectId, clampLimit(limit, 100))
      .all<ChangelogRow>();

    return result.results.map(mapChangelog);
  }

  async appendChange(change: ChangelogRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into changelog (
           id, subject_type, subject_id, revision_id, user_id, user_name, ip,
           change_type, summary, size_change, created_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        change.id,
        change.subjectType,
        change.subjectId,
        change.revisionId,
        change.userId,
        change.userName,
        change.ip,
        change.changeType,
        change.summary,
        change.sizeChange,
        change.createdAt
      )
      .run();
  }
}

export class D1AuditLogStore implements AuditLogStore {
  constructor(private readonly db: D1Database) {}

  async listEntries(limit: number, offset = 0): Promise<AuditLogRecord[]> {
    const result = await this.db
      .prepare(
        `select id, actor_id, action, target_type, target_id, details_json, created_at
         from audit_log
         order by created_at desc, id desc
         limit ? offset ?`
      )
      .bind(clampLimit(limit, 200), Math.max(0, offset))
      .all<AuditLogRow>();

    return result.results.map(mapAuditLog);
  }

  async appendEntry(entry: AuditLogRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into audit_log (
           id, actor_id, action, target_type, target_id, details_json, created_at
         ) values (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.id,
        entry.actorId,
        entry.action,
        entry.targetType,
        entry.targetId,
        JSON.stringify(entry.details),
        entry.createdAt
      )
      .run();
  }

  async deleteEntriesBefore(createdBefore: string): Promise<void> {
    await this.db.prepare("delete from audit_log where created_at < ?").bind(createdBefore).run();
  }
}

export class D1UserStore implements UserStore {
  constructor(private readonly db: D1Database) {}

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(
        `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
         from users
         where username = ?`
      )
      .bind(username)
      .first<UserRow>();

    return row ? mapUser(row) : null;
  }

  async putUser(user: UserRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into users (
           id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           username = excluded.username,
           display_name = excluded.display_name,
           email = excluded.email,
           password_hash = excluded.password_hash,
           is_disabled = excluded.is_disabled,
           updated_at = excluded.updated_at`
      )
      .bind(
        user.id,
        user.username,
        user.displayName,
        user.email,
        user.passwordHash,
        user.isDisabled ? 1 : 0,
        user.createdAt,
        user.updatedAt
      )
      .run();
  }
}

export class D1DraftStore implements DraftStore {
  constructor(private readonly db: D1Database) {}

  async getDraft(id: string): Promise<DraftRecord | null> {
    const row = await this.db
      .prepare(
        `select id, page_id, user_id, content, base_revision_id, updated_at
         from drafts
         where id = ?`
      )
      .bind(id)
      .first<DraftRow>();

    return row ? mapDraft(row) : null;
  }

  async putDraft(draft: DraftRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into drafts (id, page_id, user_id, content, base_revision_id, updated_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           page_id = excluded.page_id,
           user_id = excluded.user_id,
           content = excluded.content,
           base_revision_id = excluded.base_revision_id,
           updated_at = excluded.updated_at`
      )
      .bind(
        draft.id,
        draft.pageId,
        draft.userId,
        draft.content,
        draft.baseRevisionId,
        draft.updatedAt
      )
      .run();
  }

  async deleteDraft(id: string): Promise<void> {
    await this.db.prepare("delete from drafts where id = ?").bind(id).run();
  }
}

export class D1RenderedCacheStore implements RenderedCacheStore {
  constructor(private readonly db: D1Database) {}

  async getRendered(cacheKey: string): Promise<RenderedCacheRecord | null> {
    const row = await this.db
      .prepare(
        `select cache_key, subject_type, subject_id, revision_id, content_hash,
                rendered_html, created_at, expires_at
         from rendered_cache
         where cache_key = ?
           and (expires_at is null or expires_at > datetime('now'))`
      )
      .bind(cacheKey)
      .first<RenderedCacheRow>();

    return row ? mapRenderedCache(row) : null;
  }

  async putRendered(record: RenderedCacheRecord): Promise<void> {
    await this.db
      .prepare(
        `insert into rendered_cache (
           cache_key, subject_type, subject_id, revision_id, content_hash,
           rendered_html, created_at, expires_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(cache_key) do update set
           subject_type = excluded.subject_type,
           subject_id = excluded.subject_id,
           revision_id = excluded.revision_id,
           content_hash = excluded.content_hash,
           rendered_html = excluded.rendered_html,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`
      )
      .bind(
        record.cacheKey,
        record.subjectType,
        record.subjectId,
        record.revisionId,
        record.contentHash,
        record.renderedHtml,
        record.createdAt,
        record.expiresAt
      )
      .run();
  }

  async purgeSubject(
    subjectType: RenderedCacheRecord["subjectType"],
    subjectId: string
  ): Promise<void> {
    await this.db
      .prepare("delete from rendered_cache where subject_type = ? and subject_id = ?")
      .bind(subjectType, subjectId)
      .run();
  }
}

export class D1SearchStore implements SearchStore {
  constructor(private readonly db: D1Database) {}

  async indexPage(pageId: string, terms: Map<string, number>, updatedAt: string): Promise<void> {
    const existing = await this.db
      .prepare("select term from search_postings where page_id = ?")
      .bind(pageId)
      .all<SearchTermRow>();
    const previousTerms = new Set(existing.results.map((row) => row.term));
    const nextTerms = new Set(terms.keys());
    const statements: D1PreparedStatement[] = [
      this.db.prepare("delete from search_postings where page_id = ?").bind(pageId)
    ];

    for (const [term, frequency] of terms) {
      statements.push(
        this.db
          .prepare(
            `insert into search_terms (term, term_length, document_count)
             values (?, ?, 0)
             on conflict(term) do update set
               term_length = excluded.term_length`
          )
          .bind(term, searchIndexWordLength(term)),
        this.db
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

    for (const term of nextTerms) {
      if (previousTerms.has(term)) continue;
      statements.push(
        this.db
          .prepare(
            `update search_terms
             set document_count = document_count + 1
             where term = ?`
          )
          .bind(term)
      );
    }

    for (const term of previousTerms) {
      if (nextTerms.has(term)) continue;
      statements.push(
        this.db
          .prepare(
            `update search_terms
             set document_count = max(document_count - 1, 0)
             where term = ?`
          )
          .bind(term)
      );
    }

    statements.push(this.db.prepare("delete from search_terms where document_count = 0").bind());

    await this.db.batch(statements);
  }

  async deletePage(pageId: string): Promise<void> {
    const existing = await this.db
      .prepare("select term from search_postings where page_id = ?")
      .bind(pageId)
      .all<SearchTermRow>();
    const statements: D1PreparedStatement[] = [
      this.db.prepare("delete from search_postings where page_id = ?").bind(pageId)
    ];

    for (const row of existing.results) {
      statements.push(
        this.db
          .prepare(
            `update search_terms
             set document_count = max(document_count - 1, 0)
             where term = ?`
          )
          .bind(row.term)
      );
    }

    statements.push(this.db.prepare("delete from search_terms where document_count = 0").bind());

    await this.db.batch(statements);
  }

  async search(terms: string[], limit: number): Promise<SearchHitRecord[]> {
    const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
    if (normalizedTerms.length === 0) return [];

    const placeholders = normalizedTerms.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `select page_id, sum(frequency) as frequency, max(updated_at) as updated_at
         from search_postings
         where term in (${placeholders})
         group by page_id
         order by frequency desc, updated_at desc
         limit ?`
      )
      .bind(...normalizedTerms, clampLimit(limit, 100))
      .all<SearchHitRow>();

    return result.results.map((row) => ({
      pageId: row.page_id,
      frequency: row.frequency,
      updatedAt: row.updated_at
    }));
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

function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    namespace: row.namespace,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    byteLength: row.byte_length,
    contentHash: row.content_hash,
    currentRevisionId: row.current_revision_id,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMediaRevision(row: MediaRevisionRow): MediaRevisionRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    byteLength: row.byte_length,
    contentHash: row.content_hash,
    authorId: row.author_id,
    summary: row.summary,
    changeType: row.change_type,
    createdAt: row.created_at
  };
}

function mapMetadata(row: MetadataRow): MetadataRecord {
  return {
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    key: row.key,
    value: JSON.parse(row.value_json) as unknown,
    updatedAt: row.updated_at
  };
}

function mapAclRule(row: AclRuleRow): AclRuleRecord {
  return {
    id: row.id,
    scope: row.scope,
    principalType: row.principal_type,
    principal: row.principal,
    permission: row.permission,
    createdAt: row.created_at
  };
}

function mapChangelog(row: ChangelogRow): ChangelogRecord {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    revisionId: row.revision_id,
    userId: row.user_id,
    userName: row.user_name,
    ip: row.ip,
    changeType: row.change_type,
    summary: row.summary,
    sizeChange: row.size_change,
    createdAt: row.created_at
  };
}

function mapAuditLog(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
    createdAt: row.created_at
  };
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    passwordHash: row.password_hash,
    isDisabled: row.is_disabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDraft(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    pageId: row.page_id,
    userId: row.user_id,
    content: row.content,
    baseRevisionId: row.base_revision_id,
    updatedAt: row.updated_at
  };
}

function mapRenderedCache(row: RenderedCacheRow): RenderedCacheRecord {
  return {
    cacheKey: row.cache_key,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    revisionId: row.revision_id,
    contentHash: row.content_hash,
    renderedHtml: row.rendered_html,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function clampLimit(limit: number, max: number): number {
  return Math.max(1, Math.min(limit, max));
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
