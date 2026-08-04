-- supabase/migrations/20260804020000_native_search_page_evidence_versions.sql
-- Phase 2 native web search: immutable page versions and stable evidence coordinates.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.web_page_versions (
	id uuid primary key default gen_random_uuid(),
	web_page_visit_id uuid not null,
	version_number integer not null,
	content_hash text not null,
	requested_url text not null,
	final_url text not null,
	canonical_url text,
	status_code integer not null,
	content_type text,
	title text,
	meta jsonb,
	structured_data jsonb,
	content text not null,
	content_format text not null,
	excerpt text,
	bytes integer,
	fetched_at timestamptz not null,
	etag text,
	last_modified text,
	extraction_method text not null,
	extraction_version text not null,
	parser text,
	extraction_strategy text,
	created_at timestamptz not null default now(),
	constraint web_page_versions_visit_fk
		foreign key (web_page_visit_id) references public.web_page_visits(id) on delete restrict,
	constraint web_page_versions_version_number_check check (version_number > 0),
	constraint web_page_versions_content_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
	constraint web_page_versions_content_check check (
		char_length(content) > 0 and octet_length(content) <= 2097152
	),
	constraint web_page_versions_content_format_check check (content_format in ('markdown', 'text')),
	constraint web_page_versions_status_code_check check (status_code between 100 and 599),
	constraint web_page_versions_bytes_check check (bytes is null or bytes >= 0),
	constraint web_page_versions_extraction_method_check
		check (extraction_method in ('static', 'browser', 'pdf', 'text')),
	constraint web_page_versions_extraction_version_check
		check (length(extraction_version) between 1 and 100),
	constraint web_page_versions_urls_check check (
		length(requested_url) between 1 and 8192
		and length(final_url) between 1 and 8192
		and (canonical_url is null or length(canonical_url) between 1 and 8192)
	),
	constraint web_page_versions_visit_version_unique
		unique (web_page_visit_id, version_number),
	constraint web_page_versions_visit_hash_unique
		unique (web_page_visit_id, content_hash),
	constraint web_page_versions_visit_id_unique
		unique (web_page_visit_id, id)
);

create table public.web_page_evidence_chunks (
	id uuid primary key default gen_random_uuid(),
	page_version_id uuid not null,
	chunk_index integer not null,
	start_offset integer not null,
	end_offset integer not null,
	selector text not null,
	content text not null,
	content_hash text not null,
	created_at timestamptz not null default now(),
	constraint web_page_evidence_chunks_version_fk
		foreign key (page_version_id) references public.web_page_versions(id) on delete restrict,
	constraint web_page_evidence_chunks_index_check check (chunk_index >= 0),
	constraint web_page_evidence_chunks_offsets_check
		check (start_offset >= 0 and end_offset > start_offset),
	constraint web_page_evidence_chunks_selector_check check (length(selector) between 1 and 100),
	constraint web_page_evidence_chunks_content_check check (
		char_length(content) > 0 and char_length(content) <= 4000
	),
	constraint web_page_evidence_chunks_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
	constraint web_page_evidence_chunks_version_index_unique unique (page_version_id, chunk_index)
);

alter table public.web_page_visits
	add column if not exists current_version_id uuid;

alter table public.web_page_visits
	add constraint web_page_visits_current_version_fk
	foreign key (id, current_version_id)
	references public.web_page_versions(web_page_visit_id, id)
	deferrable initially immediate;

create index web_page_versions_fetched_at_idx
	on public.web_page_versions (web_page_visit_id, fetched_at desc);
create index web_page_evidence_chunks_version_offsets_idx
	on public.web_page_evidence_chunks (page_version_id, start_offset, end_offset);

comment on table public.web_page_versions is
	'Immutable, content-addressed snapshots for globally cache-eligible web pages.';
comment on table public.web_page_evidence_chunks is
	'Immutable evidence chunks with zero-based Unicode code-point offsets into one page version.';
comment on column public.web_page_visits.current_version_id is
	'Current immutable content version for this mutable URL identity/cache row.';
comment on column public.web_page_evidence_chunks.selector is
	'Stable citation selector formatted as char:<start_offset>-<end_offset>.';

alter table public.web_page_versions enable row level security;
alter table public.web_page_evidence_chunks enable row level security;
revoke all privileges on table public.web_page_versions
	from public, anon, authenticated, service_role;
revoke all privileges on table public.web_page_evidence_chunks
	from public, anon, authenticated, service_role;
grant select on table public.web_page_versions to service_role;
grant select on table public.web_page_evidence_chunks to service_role;

create or replace function public.prevent_web_page_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
	raise exception using
		errCode = '55000',
		message = 'web_page_evidence_is_immutable';
end;
$function$;

revoke all on function public.prevent_web_page_evidence_mutation() from public;

create trigger web_page_versions_immutable
	before update or delete on public.web_page_versions
	for each row execute function public.prevent_web_page_evidence_mutation();
create trigger web_page_evidence_chunks_immutable
	before update or delete on public.web_page_evidence_chunks
	for each row execute function public.prevent_web_page_evidence_mutation();

-- Backfill the current cache snapshot as version 1. Existing page content was
-- already hashed by the JavaScript persistence path, but recomputing here makes
-- the immutable hash authoritative and covers legacy rows defensively.
insert into public.web_page_versions (
	web_page_visit_id,
	version_number,
	content_hash,
	requested_url,
	final_url,
	canonical_url,
	status_code,
	content_type,
	title,
	meta,
	structured_data,
	content,
	content_format,
	excerpt,
	bytes,
	fetched_at,
	etag,
	last_modified,
	extraction_method,
	extraction_version,
	parser,
	extraction_strategy,
	created_at
)
select
	visit.id,
	1,
	encode(extensions.digest(convert_to(visit.markdown, 'UTF8'), 'sha256'), 'hex'),
	visit.url,
	visit.final_url,
	visit.canonical_url,
	visit.status_code,
	visit.content_type,
	visit.title,
	visit.meta,
	visit.structured_data,
	visit.markdown,
	'markdown',
	visit.excerpt,
	visit.bytes,
	visit.last_fetched_at,
	visit.etag,
	visit.last_modified,
	'static',
	'legacy-web-page-visit-v1',
	'text',
	null,
	coalesce(visit.created_at, now())
from public.web_page_visits visit
where visit.markdown is not null
	and char_length(visit.markdown) > 0
on conflict (web_page_visit_id, content_hash) do nothing;

insert into public.web_page_evidence_chunks (
	page_version_id,
	chunk_index,
	start_offset,
	end_offset,
	selector,
	content,
	content_hash
)
select
	version.id,
	(chunk_window.start_offset / 1400)::integer,
	chunk_window.start_offset,
	least(chunk_window.start_offset + 1600, char_length(version.content)),
	format(
		'char:%s-%s',
		chunk_window.start_offset,
		least(chunk_window.start_offset + 1600, char_length(version.content))
	),
	substring(
		version.content
		from chunk_window.start_offset + 1
		for least(1600, char_length(version.content) - chunk_window.start_offset)
	),
	encode(
		extensions.digest(
			convert_to(
				substring(
					version.content
					from chunk_window.start_offset + 1
					for least(1600, char_length(version.content) - chunk_window.start_offset)
				),
				'UTF8'
			),
			'sha256'
		),
		'hex'
	)
from public.web_page_versions version
cross join lateral generate_series(
	0,
	greatest(char_length(version.content) - 1, 0),
	1400
) as chunk_window(start_offset)
on conflict (page_version_id, chunk_index) do nothing;

update public.web_page_visits visit
set current_version_id = version.id
from public.web_page_versions version
where version.web_page_visit_id = visit.id
	and version.version_number = 1
	and visit.current_version_id is null;

create or replace function public.get_current_web_page_evidence(
	p_web_page_visit_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
	select jsonb_build_object(
		'page_visit_id', visit.id,
		'page_version_id', version.id,
		'version_number', version.version_number,
		'content_hash', version.content_hash,
		'content_length', char_length(version.content),
		'fetched_at', version.fetched_at,
		'extraction_method', version.extraction_method,
		'extraction_version', version.extraction_version,
		'chunks', coalesce(
			(
				select jsonb_agg(
					jsonb_build_object(
						'id', chunk.id,
						'chunk_index', chunk.chunk_index,
						'start_offset', chunk.start_offset,
						'end_offset', chunk.end_offset,
						'selector', chunk.selector,
						'content_hash', chunk.content_hash
					)
					order by chunk.chunk_index
				)
				from public.web_page_evidence_chunks chunk
				where chunk.page_version_id = version.id
			),
			'[]'::jsonb
		)
	)
	from public.web_page_visits visit
	join public.web_page_versions version on version.id = visit.current_version_id
	where visit.id = p_web_page_visit_id;
$function$;

create or replace function public.persist_web_page_evidence_version(
	p_web_page_visit_id uuid,
	p_content_hash text,
	p_content text,
	p_requested_url text default null,
	p_final_url text default null,
	p_canonical_url text default null,
	p_status_code integer default 200,
	p_content_type text default null,
	p_title text default null,
	p_meta jsonb default null,
	p_structured_data jsonb default null,
	p_content_format text default 'markdown',
	p_excerpt text default null,
	p_bytes integer default null,
	p_fetched_at timestamptz default now(),
	p_etag text default null,
	p_last_modified text default null,
	p_extraction_method text default 'static',
	p_extraction_version text default 'web-visit-v1',
	p_parser text default null,
	p_extraction_strategy text default null,
	p_chunks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
	v_visit public.web_page_visits%rowtype;
	v_version public.web_page_versions%rowtype;
	v_version_number integer;
	v_chunk jsonb;
	v_chunk_index integer;
	v_start_offset integer;
	v_end_offset integer;
	v_chunk_content text;
	v_chunk_hash text;
	v_expected_index integer := 0;
	v_previous_start integer := -1;
	v_previous_end integer := 0;
	v_content_length integer;
	v_created boolean := false;
begin
	if p_web_page_visit_id is null
		or p_content_hash is null
		or p_content_hash !~ '^[0-9a-f]{64}$'
		or p_content is null
		or char_length(p_content) = 0
		or octet_length(p_content) > 2097152
		or p_content_format not in ('markdown', 'text')
		or p_status_code not between 100 and 599
		or p_extraction_method not in ('static', 'browser', 'pdf', 'text')
		or p_extraction_version is null
		or length(p_extraction_version) not between 1 and 100
		or p_chunks is null
		or jsonb_typeof(p_chunks) <> 'array'
		or jsonb_array_length(p_chunks) not between 1 and 200 then
		raise exception 'web_page_evidence_invalid_input';
	end if;

	if p_content_hash <> encode(digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex') then
		raise exception 'web_page_evidence_content_hash_mismatch';
	end if;

	select visit.*
	into v_visit
	from public.web_page_visits visit
	where visit.id = p_web_page_visit_id
	for update;

	if not found then
		raise exception 'web_page_evidence_visit_not_found';
	end if;

	v_content_length := char_length(p_content);
	for v_chunk in select value from jsonb_array_elements(p_chunks)
	loop
		begin
			v_chunk_index := (v_chunk ->> 'chunk_index')::integer;
			v_start_offset := (v_chunk ->> 'start_offset')::integer;
			v_end_offset := (v_chunk ->> 'end_offset')::integer;
			v_chunk_content := v_chunk ->> 'content';
			v_chunk_hash := v_chunk ->> 'content_hash';
		exception when others then
			raise exception 'web_page_evidence_invalid_chunk';
		end;

		if v_chunk_index <> v_expected_index
			or v_start_offset < 0
			or v_end_offset <= v_start_offset
			or v_end_offset > v_content_length
			or v_start_offset <= v_previous_start
			or (v_expected_index = 0 and v_start_offset <> 0)
			or (v_expected_index > 0 and v_start_offset > v_previous_end)
			or v_chunk_content is null
			or char_length(v_chunk_content) = 0
			or char_length(v_chunk_content) > 4000
			or v_chunk_content <> substring(
				p_content from v_start_offset + 1 for v_end_offset - v_start_offset
			)
			or v_chunk_hash is null
			or v_chunk_hash !~ '^[0-9a-f]{64}$'
			or v_chunk_hash <> encode(
				digest(convert_to(v_chunk_content, 'UTF8'), 'sha256'),
				'hex'
			) then
			raise exception 'web_page_evidence_invalid_chunk';
		end if;

		v_previous_start := v_start_offset;
		v_previous_end := v_end_offset;
		v_expected_index := v_expected_index + 1;
	end loop;

	if v_previous_end <> v_content_length then
		raise exception 'web_page_evidence_incomplete_chunk_coverage';
	end if;

	select version.*
	into v_version
	from public.web_page_versions version
	where version.web_page_visit_id = p_web_page_visit_id
		and version.content_hash = p_content_hash;

	if not found then
		select coalesce(max(version.version_number), 0) + 1
		into v_version_number
		from public.web_page_versions version
		where version.web_page_visit_id = p_web_page_visit_id;

		insert into public.web_page_versions (
			web_page_visit_id,
			version_number,
			content_hash,
			requested_url,
			final_url,
			canonical_url,
			status_code,
			content_type,
			title,
			meta,
			structured_data,
			content,
			content_format,
			excerpt,
			bytes,
			fetched_at,
			etag,
			last_modified,
			extraction_method,
			extraction_version,
			parser,
			extraction_strategy
		) values (
			p_web_page_visit_id,
			v_version_number,
			p_content_hash,
			coalesce(nullif(p_requested_url, ''), v_visit.url),
			coalesce(nullif(p_final_url, ''), v_visit.final_url),
			p_canonical_url,
			p_status_code,
			p_content_type,
			p_title,
			p_meta,
			p_structured_data,
			p_content,
			p_content_format,
			p_excerpt,
			p_bytes,
			coalesce(p_fetched_at, now()),
			p_etag,
			p_last_modified,
			p_extraction_method,
			p_extraction_version,
			p_parser,
			p_extraction_strategy
		)
		returning * into v_version;

		for v_chunk in select value from jsonb_array_elements(p_chunks)
		loop
			v_chunk_index := (v_chunk ->> 'chunk_index')::integer;
			v_start_offset := (v_chunk ->> 'start_offset')::integer;
			v_end_offset := (v_chunk ->> 'end_offset')::integer;
			v_chunk_content := v_chunk ->> 'content';
			v_chunk_hash := v_chunk ->> 'content_hash';
			insert into public.web_page_evidence_chunks (
				page_version_id,
				chunk_index,
				start_offset,
				end_offset,
				selector,
				content,
				content_hash
			) values (
				v_version.id,
				v_chunk_index,
				v_start_offset,
				v_end_offset,
				format('char:%s-%s', v_start_offset, v_end_offset),
				v_chunk_content,
				v_chunk_hash
			);
		end loop;
		v_created := true;
	end if;

	update public.web_page_visits
	set current_version_id = v_version.id
	where id = p_web_page_visit_id;

	return public.get_current_web_page_evidence(p_web_page_visit_id)
		|| jsonb_build_object('created', v_created);
end;
$function$;

revoke all on function public.get_current_web_page_evidence(uuid)
	from public, anon, authenticated;
revoke all on function public.persist_web_page_evidence_version(
	uuid, text, text, text, text, text, integer, text, text, jsonb, jsonb,
	text, text, integer, timestamptz, text, text, text, text, text, text, jsonb
)
	from public, anon, authenticated;
grant execute on function public.get_current_web_page_evidence(uuid) to service_role;
grant execute on function public.persist_web_page_evidence_version(
	uuid, text, text, text, text, text, integer, text, text, jsonb, jsonb,
	text, text, integer, timestamptz, text, text, text, text, text, text, jsonb
)
	to service_role;

commit;
