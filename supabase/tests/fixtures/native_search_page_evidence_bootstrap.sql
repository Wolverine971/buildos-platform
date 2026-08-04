-- supabase/tests/fixtures/native_search_page_evidence_bootstrap.sql
-- Minimal disposable schema needed before applying the immutable page-evidence migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then
		create role anon nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then
		create role authenticated nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'service_role') then
		create role service_role nologin bypassrls;
	end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create table public.web_page_visits (
	id uuid primary key,
	url text not null,
	final_url text not null,
	canonical_url text,
	normalized_url text not null unique,
	status_code integer not null,
	content_type text,
	title text,
	meta jsonb,
	structured_data jsonb,
	markdown text,
	excerpt text,
	content_hash text,
	visit_count integer not null default 1,
	first_visited_at timestamptz not null default now(),
	last_visited_at timestamptz not null default now(),
	last_fetched_at timestamptz not null default now(),
	etag text,
	last_modified text,
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

alter table public.web_page_visits enable row level security;

insert into public.web_page_visits (
	id,
	url,
	final_url,
	canonical_url,
	normalized_url,
	status_code,
	content_type,
	title,
	meta,
	structured_data,
	markdown,
	excerpt,
	content_hash,
	last_fetched_at,
	etag,
	last_modified,
	bytes
) values (
	'10000000-0000-4000-8000-000000000001',
	'https://example.com/legacy',
	'https://example.com/legacy',
	'https://example.com/legacy',
	'https://example.com/legacy',
	200,
	'text/html',
	'Legacy evidence',
	'{"description":"legacy page"}',
	'[{"type":"Article"}]',
	'Legacy 😀 evidence body.',
	'Legacy evidence body.',
	repeat('0', 64),
	'2026-08-04T12:00:00.000Z',
	'"legacy-v1"',
	'Mon, 03 Aug 2026 12:00:00 GMT',
	128
);
