create index if not exists idx_changelog_type_created
  on changelog (subject_type, created_at desc);

create index if not exists idx_pages_deleted_id
  on pages (is_deleted, id);

create index if not exists idx_pages_namespace_deleted_id
  on pages (namespace, is_deleted, id);

create index if not exists idx_media_namespace_deleted_id
  on media (namespace, is_deleted, id);

create index if not exists idx_search_postings_page
  on search_postings (page_id);

create index if not exists idx_rendered_cache_subject
  on rendered_cache (subject_type, subject_id);

create index if not exists idx_audit_log_created
  on audit_log (created_at desc, id desc);

create index if not exists idx_sessions_user
  on sessions (user_id);
