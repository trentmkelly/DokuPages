create table if not exists cache_dependencies (
  cache_key text not null,
  dependency_type text not null check (dependency_type in ('page', 'media')),
  dependency_id text not null,
  primary key (cache_key, dependency_type, dependency_id)
);

create index if not exists idx_cache_dependencies_subject
  on cache_dependencies (dependency_type, dependency_id, cache_key);
