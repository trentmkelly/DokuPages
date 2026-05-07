export interface Env {
  DB: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  RENDER_CACHE: KVNamespace;
  PAGE_LOCKS?: DurableObjectNamespace;
  SITE_NAME?: string;
  START_PAGE?: string;
  WIKI_LANG?: string;
  SESSION_COOKIE_NAME?: string;
  HIDE_PAGES?: string;
  SNEAKY_INDEX?: string;
  APP_VERSION?: string;
  API_BEARER_TOKEN?: string;
  API_CORS_ORIGINS?: string;
  CF_PAGES_BRANCH?: string;
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_URL?: string;
}
