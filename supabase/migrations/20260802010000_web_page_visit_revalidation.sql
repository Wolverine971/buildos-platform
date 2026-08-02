-- supabase/migrations/20260802010000_web_page_visit_revalidation.sql
-- Add HTTP validators and an explicit freshness timestamp to the shared page cache.
-- Stale entries can now be conditionally revalidated instead of being served forever
-- or downloaded in full when the origin content has not changed.

begin;

alter table public.web_page_visits
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists last_fetched_at timestamptz;

update public.web_page_visits
set last_fetched_at = coalesce(last_visited_at, created_at, now())
where last_fetched_at is null;

alter table public.web_page_visits
  alter column last_fetched_at set default now(),
  alter column last_fetched_at set not null;

comment on column public.web_page_visits.etag is
  'Origin ETag used for If-None-Match conditional revalidation.';
comment on column public.web_page_visits.last_modified is
  'Origin Last-Modified value used for If-Modified-Since conditional revalidation.';
comment on column public.web_page_visits.last_fetched_at is
  'Last successful full fetch or HTTP 304 revalidation time; drives cache freshness TTL.';

commit;
