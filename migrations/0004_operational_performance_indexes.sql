create index if not exists idx_import_jobs_started
  on import_jobs (started_at desc);

create index if not exists idx_import_jobs_status_started
  on import_jobs (status, started_at desc);
