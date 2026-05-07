create table if not exists schema_versions (
  version integer primary key,
  applied_at text not null
);

create table if not exists pages (
  id text primary key,
  namespace text not null default '',
  title text,
  current_revision_id text,
  is_deleted integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists page_revisions (
  id text primary key,
  page_id text not null references pages(id),
  content text not null,
  content_hash text not null,
  author_id text,
  author_name text,
  summary text not null default '',
  change_type text not null check (change_type in ('create', 'edit', 'minor', 'delete', 'revert')),
  size_change integer not null default 0,
  created_at text not null
);

create index if not exists idx_page_revisions_page_created
  on page_revisions (page_id, created_at desc);

create table if not exists media (
  id text primary key,
  namespace text not null default '',
  object_key text not null,
  mime_type text not null,
  byte_length integer not null,
  content_hash text not null,
  current_revision_id text,
  is_deleted integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists media_revisions (
  id text primary key,
  media_id text not null references media(id),
  object_key text not null,
  mime_type text not null,
  byte_length integer not null,
  content_hash text not null,
  author_id text,
  summary text not null default '',
  change_type text not null check (change_type in ('create', 'edit', 'delete', 'revert')),
  created_at text not null
);

create index if not exists idx_media_revisions_media_created
  on media_revisions (media_id, created_at desc);

create table if not exists metadata (
  subject_type text not null check (subject_type in ('page', 'media', 'config', 'plugin')),
  subject_id text not null,
  key text not null,
  value_json text not null,
  updated_at text not null,
  primary key (subject_type, subject_id, key)
);

create table if not exists changelog (
  id text primary key,
  subject_type text not null check (subject_type in ('page', 'media')),
  subject_id text not null,
  revision_id text,
  user_id text,
  user_name text,
  ip text,
  change_type text not null,
  summary text not null default '',
  size_change integer not null default 0,
  created_at text not null
);

create index if not exists idx_changelog_subject_created
  on changelog (subject_type, subject_id, created_at desc);

create table if not exists acl_rules (
  id text primary key,
  scope text not null,
  principal_type text not null check (principal_type in ('user', 'group', 'all')),
  principal text not null,
  permission integer not null,
  created_at text not null
);

create index if not exists idx_acl_rules_scope
  on acl_rules (scope);

create table if not exists users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  email text,
  password_hash text,
  is_disabled integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists groups (
  id text primary key,
  name text not null unique,
  created_at text not null
);

create table if not exists user_groups (
  user_id text not null references users(id),
  group_id text not null references groups(id),
  created_at text not null,
  primary key (user_id, group_id)
);

create table if not exists sessions (
  id text primary key,
  user_id text references users(id),
  token_hash text not null,
  expires_at text not null,
  created_at text not null
);

create table if not exists drafts (
  id text primary key,
  page_id text not null,
  user_id text,
  content text not null,
  base_revision_id text,
  updated_at text not null
);

create table if not exists subscriptions (
  id text primary key,
  subject_type text not null check (subject_type in ('page', 'namespace')),
  subject_id text not null,
  user_id text not null references users(id),
  digest_interval text not null default 'daily',
  created_at text not null
);

create table if not exists search_terms (
  term text primary key,
  document_count integer not null default 0
);

create table if not exists search_postings (
  term text not null references search_terms(term),
  page_id text not null references pages(id),
  frequency integer not null,
  updated_at text not null,
  primary key (term, page_id)
);

create table if not exists rendered_cache (
  cache_key text primary key,
  subject_type text not null,
  subject_id text not null,
  revision_id text,
  content_hash text not null,
  rendered_html text not null,
  created_at text not null,
  expires_at text
);

create table if not exists plugin_settings (
  plugin text not null,
  key text not null,
  value_json text not null,
  updated_at text not null,
  primary key (plugin, key)
);

create table if not exists audit_log (
  id text primary key,
  actor_id text,
  action text not null,
  target_type text not null,
  target_id text,
  details_json text not null default '{}',
  created_at text not null
);

create table if not exists import_jobs (
  id text primary key,
  source_path text not null,
  status text not null,
  counts_json text not null default '{}',
  errors_json text not null default '[]',
  started_at text not null,
  finished_at text
);

insert or ignore into schema_versions (version, applied_at)
values (1, datetime('now'));
