create table if not exists email_deliveries (
  id text primary key,
  kind text not null,
  recipient text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider text not null,
  provider_message_id text,
  error_message text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_email_deliveries_kind_created
  on email_deliveries (kind, created_at desc);

create index if not exists idx_email_deliveries_status_created
  on email_deliveries (status, created_at desc);

insert or ignore into schema_versions (version, applied_at)
values (5, datetime('now'));
