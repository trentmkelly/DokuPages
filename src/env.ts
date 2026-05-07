export interface Env {
  DB: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  RENDER_CACHE: KVNamespace;
  PAGE_LOCKS?: DurableObjectNamespace;
  SITE_NAME?: string;
  START_PAGE?: string;
  SESSION_COOKIE_NAME?: string;
  APP_VERSION?: string;
  CF_PAGES_BRANCH?: string;
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_URL?: string;
}
