-- supabase/migrations/20260502000004_add_web_page_visit_structured_data.sql
-- Store sanitized JSON-LD/schema.org data extracted during web visits.

alter table web_page_visits
  add column if not exists structured_data jsonb;

comment on column web_page_visits.structured_data is
  'Sanitized structured data extracted from page JSON-LD/schema.org blocks';
