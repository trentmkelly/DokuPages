-- Local development seed data for the DokuWiki Pages.dev port.
-- Apply after migrations with:
--   npm run db:migrate:local
--   npm run db:seed:local

insert into pages (id, namespace, title, current_revision_id, is_deleted, created_at, updated_at)
values
  ('wiki:welcome', 'wiki', 'Welcome', 'wiki:welcome@2026-05-07T00:00:00.000Z', 0, '2026-05-07T00:00:00.000Z', '2026-05-07T00:00:00.000Z'),
  ('wiki:syntax', 'wiki', 'Formatting Syntax', 'wiki:syntax@2026-05-07T00:00:00.000Z', 0, '2026-05-07T00:00:00.000Z', '2026-05-07T00:00:00.000Z'),
  ('sidebar', '', 'Sidebar', 'sidebar@2026-05-07T00:00:00.000Z', 0, '2026-05-07T00:00:00.000Z', '2026-05-07T00:00:00.000Z'),
  ('playground:playground', 'playground', 'Playground', 'playground:playground@2026-05-07T00:00:00.000Z', 0, '2026-05-07T00:00:00.000Z', '2026-05-07T00:00:00.000Z')
on conflict(id) do update set
  namespace = excluded.namespace,
  title = excluded.title,
  current_revision_id = excluded.current_revision_id,
  is_deleted = excluded.is_deleted,
  updated_at = excluded.updated_at;

insert or replace into page_revisions (
  id, page_id, content, content_hash, author_id, author_name, summary, change_type, size_change, created_at
) values
  (
    'wiki:welcome@2026-05-07T00:00:00.000Z',
    'wiki:welcome',
    '====== Welcome to your new DokuWiki ======

Congratulations, your wiki is now up and running on Cloudflare Pages.

Use the [[wiki:syntax|syntax page]] as a quick rendering check, then try editing the [[playground:playground|playground]].

===== Customize your Wiki =====

The Pages port stores pages in D1 and media objects in R2 when the bucket is configured.
',
    'c4ea9664bf2271f32c77de31c412673ef10f722fb47fd5f788088d9347bbdbaf',
    null,
    'Local seed',
    'Local seed page',
    'create',
    338,
    '2026-05-07T00:00:00.000Z'
  ),
  (
    'wiki:syntax@2026-05-07T00:00:00.000Z',
    'wiki:syntax',
    '====== Formatting Syntax ======

DokuWiki supports **bold**, //italic//, __underlined__, and ''monospaced'' text.

===== Links =====

Internal links use [[wiki:welcome|page ids]]. External links use plain URLs like https://www.dokuwiki.org/.

===== Lists =====

  * First item
  * Second item
    * Nested item

===== Code =====

<code>
console.log("Hello from Pages");
</code>
',
    'bb45659d1a4d8c5ff432f3f68f2af177e37a1ef3f86a9bb7d188b79d4b7fb7cb',
    null,
    'Local seed',
    'Local seed syntax page',
    'create',
    382,
    '2026-05-07T00:00:00.000Z'
  ),
  (
    'sidebar@2026-05-07T00:00:00.000Z',
    'sidebar',
    '====== Navigation ======

  * [[wiki:welcome|Welcome]]
  * [[wiki:syntax|Syntax]]
  * [[playground:playground|Playground]]
',
    '7aa34498e30e33ff45ee3a40ad3804a6dcc0fceaa449c389f3ca35809593a4e5',
    null,
    'Local seed',
    'Local seed sidebar',
    'create',
    119,
    '2026-05-07T00:00:00.000Z'
  ),
  (
    'playground:playground@2026-05-07T00:00:00.000Z',
    'playground:playground',
    '====== Playground ======

This page is safe to edit during local development.
',
    '1397bc6924d5ba6deb6e9f38897e587b8f84ad118822cc3b0fdbbc398952389e',
    null,
    'Local seed',
    'Local seed playground',
    'create',
    70,
    '2026-05-07T00:00:00.000Z'
  );

delete from search_postings
where page_id in ('wiki:welcome', 'wiki:syntax', 'sidebar', 'playground:playground');

insert into search_terms (term, term_length, document_count)
values
  ('welcome', 7, 0),
  ('dokuwiki', 8, 0),
  ('cloudflare', 10, 0),
  ('pages', 5, 0),
  ('syntax', 6, 0),
  ('playground', 10, 0),
  ('sidebar', 7, 0)
on conflict(term) do update set
  term_length = excluded.term_length;

insert into search_postings (term, page_id, frequency, updated_at)
values
  ('welcome', 'wiki:welcome', 4, '2026-05-07T00:00:00.000Z'),
  ('dokuwiki', 'wiki:welcome', 2, '2026-05-07T00:00:00.000Z'),
  ('cloudflare', 'wiki:welcome', 1, '2026-05-07T00:00:00.000Z'),
  ('pages', 'wiki:welcome', 2, '2026-05-07T00:00:00.000Z'),
  ('syntax', 'wiki:syntax', 4, '2026-05-07T00:00:00.000Z'),
  ('dokuwiki', 'wiki:syntax', 1, '2026-05-07T00:00:00.000Z'),
  ('playground', 'playground:playground', 4, '2026-05-07T00:00:00.000Z'),
  ('sidebar', 'sidebar', 4, '2026-05-07T00:00:00.000Z')
on conflict(term, page_id) do update set
  frequency = excluded.frequency,
  updated_at = excluded.updated_at;

update search_terms
set document_count = (
  select count(*)
  from search_postings
  where search_postings.term = search_terms.term
);

insert or replace into changelog (
  id, subject_type, subject_id, revision_id, user_id, user_name, ip, change_type, summary, size_change, created_at
) values
  ('page:wiki:welcome@2026-05-07T00:00:00.000Z', 'page', 'wiki:welcome', 'wiki:welcome@2026-05-07T00:00:00.000Z', null, 'Local seed', null, 'create', 'Local seed page', 338, '2026-05-07T00:00:00.000Z'),
  ('page:wiki:syntax@2026-05-07T00:00:00.000Z', 'page', 'wiki:syntax', 'wiki:syntax@2026-05-07T00:00:00.000Z', null, 'Local seed', null, 'create', 'Local seed syntax page', 382, '2026-05-07T00:00:00.000Z'),
  ('page:sidebar@2026-05-07T00:00:00.000Z', 'page', 'sidebar', 'sidebar@2026-05-07T00:00:00.000Z', null, 'Local seed', null, 'create', 'Local seed sidebar', 119, '2026-05-07T00:00:00.000Z'),
  ('page:playground:playground@2026-05-07T00:00:00.000Z', 'page', 'playground:playground', 'playground:playground@2026-05-07T00:00:00.000Z', null, 'Local seed', null, 'create', 'Local seed playground', 70, '2026-05-07T00:00:00.000Z');

insert or replace into metadata (subject_type, subject_id, key, value_json, updated_at)
values
  ('config', 'runtime', 'site', '{"siteName":"DokuWiki Pages","startPage":"wiki:welcome","language":"en"}', '2026-05-07T00:00:00.000Z'),
  ('page', 'wiki:welcome', 'relation', '{"references":{"wiki:syntax":true,"playground:playground":true}}', '2026-05-07T00:00:00.000Z');

insert or replace into import_jobs (
  id, source_path, status, counts_json, errors_json, started_at, finished_at
) values (
  'local-seed',
  'seed/local.sql',
  'finished',
  '{"pages":4,"pageRevisions":4,"searchTerms":7}',
  '[]',
  '2026-05-07T00:00:00.000Z',
  '2026-05-07T00:00:00.000Z'
);
