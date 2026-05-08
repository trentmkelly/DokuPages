create table if not exists password_reset_tokens (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null unique,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create index if not exists idx_password_reset_tokens_user_created
  on password_reset_tokens (user_id, created_at desc);

create index if not exists idx_password_reset_tokens_expires
  on password_reset_tokens (expires_at);

insert or ignore into schema_versions (version, applied_at)
values (6, datetime('now'));
