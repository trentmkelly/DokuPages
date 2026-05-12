export type WikiTimestamp = string;

export interface PageRecord {
  id: string;
  namespace: string;
  title: string | null;
  currentRevisionId: string | null;
  isDeleted: boolean;
  createdAt: WikiTimestamp;
  updatedAt: WikiTimestamp;
}

export interface PageRevisionRecord {
  id: string;
  pageId: string;
  content: string;
  contentHash: string;
  authorId: string | null;
  authorName: string | null;
  summary: string;
  changeType: "create" | "edit" | "minor" | "delete" | "revert";
  sizeChange: number;
  createdAt: WikiTimestamp;
}

export interface MediaRecord {
  id: string;
  namespace: string;
  objectKey: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  currentRevisionId: string | null;
  isDeleted: boolean;
  createdAt: WikiTimestamp;
  updatedAt: WikiTimestamp;
}

export interface MediaRevisionRecord {
  id: string;
  mediaId: string;
  objectKey: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  authorId: string | null;
  summary: string;
  changeType: "create" | "edit" | "delete" | "revert";
  createdAt: WikiTimestamp;
}

export interface MetadataRecord {
  subjectType: "page" | "media" | "config" | "plugin";
  subjectId: string;
  key: string;
  value: unknown;
  updatedAt: WikiTimestamp;
}

export interface ChangelogRecord {
  id: string;
  subjectType: "page" | "media";
  subjectId: string;
  revisionId: string | null;
  userId: string | null;
  userName: string | null;
  ip: string | null;
  changeType: string;
  summary: string;
  sizeChange: number;
  createdAt: WikiTimestamp;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: WikiTimestamp;
}

export interface AclRuleRecord {
  id: string;
  scope: string;
  principalType: "user" | "group" | "all";
  principal: string;
  permission: number;
  createdAt: WikiTimestamp;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  passwordHash: string | null;
  isDisabled: boolean;
  createdAt: WikiTimestamp;
  updatedAt: WikiTimestamp;
}

export interface LockRecord {
  subjectType: "page" | "media";
  subjectId: string;
  ownerId: string;
  token: string;
  expiresAt: WikiTimestamp;
}

export interface DraftRecord {
  id: string;
  pageId: string;
  userId: string | null;
  content: string;
  baseRevisionId: string | null;
  updatedAt: WikiTimestamp;
}

export interface RenderedCacheRecord {
  cacheKey: string;
  subjectType: "page" | "media";
  subjectId: string;
  revisionId: string | null;
  contentHash: string;
  renderedHtml: string;
  createdAt: WikiTimestamp;
  expiresAt: WikiTimestamp | null;
}

export interface SearchHitRecord {
  pageId: string;
  frequency: number;
  updatedAt: WikiTimestamp;
}

export interface PageStore {
  getPage(id: string): Promise<PageRecord | null>;
  getPageRevision(revisionId: string): Promise<PageRevisionRecord | null>;
  listPageRevisions(pageId: string, limit: number, cursor?: string): Promise<PageRevisionRecord[]>;
  savePageRevision(revision: PageRevisionRecord): Promise<void>;
}

export interface MediaStore {
  getMedia(id: string): Promise<MediaRecord | null>;
  getMediaRevision(revisionId: string): Promise<MediaRevisionRecord | null>;
  listMediaRevisions(
    mediaId: string,
    limit: number,
    cursor?: string
  ): Promise<MediaRevisionRecord[]>;
  saveMedia(media: MediaRecord, body: ReadableStream<Uint8Array> | ArrayBuffer): Promise<void>;
}

export interface MetadataStore {
  getMetadata(
    subjectType: MetadataRecord["subjectType"],
    subjectId: string
  ): Promise<MetadataRecord[]>;
  putMetadata(record: MetadataRecord): Promise<void>;
}

export interface AclStore {
  listAllRules(): Promise<AclRuleRecord[]>;
  listRules(scope: string): Promise<AclRuleRecord[]>;
  putRule(rule: AclRuleRecord): Promise<void>;
  deleteRule(id: string): Promise<void>;
  deleteMatchingRules(
    scope: string,
    principalType: AclRuleRecord["principalType"],
    principal: string
  ): Promise<void>;
}

export interface ChangelogStore {
  listChanges(
    subjectType: ChangelogRecord["subjectType"],
    subjectId: string,
    limit: number
  ): Promise<ChangelogRecord[]>;
  appendChange(change: ChangelogRecord): Promise<void>;
}

export interface AuditLogStore {
  listEntries(limit: number, offset?: number): Promise<AuditLogRecord[]>;
  appendEntry(entry: AuditLogRecord): Promise<void>;
  deleteEntriesBefore(createdBefore: WikiTimestamp): Promise<void>;
}

export interface UserStore {
  getUserByUsername(username: string): Promise<UserRecord | null>;
  putUser(user: UserRecord): Promise<void>;
}

export interface DraftStore {
  getDraft(id: string): Promise<DraftRecord | null>;
  putDraft(draft: DraftRecord): Promise<void>;
  deleteDraft(id: string): Promise<void>;
}

export interface LockStore {
  acquire(lock: LockRecord): Promise<boolean>;
  release(subjectType: LockRecord["subjectType"], subjectId: string, token: string): Promise<void>;
}

export interface RenderedCacheStore {
  getRendered(cacheKey: string): Promise<RenderedCacheRecord | null>;
  putRendered(record: RenderedCacheRecord): Promise<void>;
  purgeSubject(subjectType: RenderedCacheRecord["subjectType"], subjectId: string): Promise<void>;
}

export interface SearchStore {
  indexPage(pageId: string, terms: Map<string, number>, updatedAt: WikiTimestamp): Promise<void>;
  deletePage(pageId: string): Promise<void>;
  search(terms: string[], limit: number): Promise<SearchHitRecord[]>;
}
