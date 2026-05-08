create table if not exists email_notification_events (
  id text primary key,
  subject_type text not null check (subject_type in ('page')),
  subject_id text not null,
  revision_id text not null,
  change_type text not null,
  summary text not null default '',
  actor_id text,
  actor_name text,
  created_at text not null
);

create index if not exists idx_email_notification_events_subject_created
  on email_notification_events (subject_type, subject_id, created_at desc);

create table if not exists email_digest_deliveries (
  subscription_id text not null references subscriptions(id) on delete cascade,
  event_id text not null references email_notification_events(id),
  delivered_at text not null,
  primary key (subscription_id, event_id)
);

insert or ignore into schema_versions (version, applied_at)
values (7, datetime('now'));
