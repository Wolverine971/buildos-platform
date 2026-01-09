-- supabase/migrations/20260315000000_add_web_page_visits.sql
-- Global web page visit storage for markdown snapshots + metadata

create table if not exists web_page_visits (
  id uuid primary key default uuid_generate_v4(),
  url text not null,
  final_url text not null,
  canonical_url text,
  normalized_url text not null,
  status_code integer not null,
  content_type text,
  title text,
  meta jsonb,
  markdown text,
  excerpt text,
  content_hash text,
  visit_count integer not null default 1,
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  last_fetch_ms integer,
  last_llm_ms integer,
  last_llm_model text,
  llm_prompt_tokens integer,
  llm_completion_tokens integer,
  llm_total_tokens integer,
  bytes integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table web_page_visits is 'Global deduped web page markdown snapshots with metadata and visit metrics';

-- Indexes
create unique index if not exists idx_web_page_visits_normalized_url
  on web_page_visits (normalized_url);

create index if not exists idx_web_page_visits_last_visited
  on web_page_visits (last_visited_at desc);

-- Keep updated_at current
drop trigger if exists trg_web_page_visits_updated_at on web_page_visits;
create trigger trg_web_page_visits_updated_at
  before update on web_page_visits
  for each row execute function set_updated_at();

-- RLS
alter table web_page_visits enable row level security;

drop policy if exists "Authenticated users can read web page visits" on web_page_visits;
create policy "Authenticated users can read web page visits"
  on web_page_visits for select
  using (auth.role() = 'authenticated');
