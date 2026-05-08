alter table search_terms
  add column term_length integer not null default 0;

update search_terms
set term_length = length(cast(term as blob))
where term_length = 0;

create index if not exists idx_search_terms_length_term
  on search_terms (term_length, term);
