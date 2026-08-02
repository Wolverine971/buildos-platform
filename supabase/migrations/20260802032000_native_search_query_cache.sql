-- supabase/migrations/20260802032000_native_search_query_cache.sql
-- Phase 2 native web search: service-only, cross-instance discovery cache.
--
-- The cache key is a SHA-256 digest of the normalized request plus adapter and
-- response-shaping versions. No plaintext user query is stored as a key. An
-- expiring owner lease provides database-backed single-flight without holding
-- a database transaction open across provider network I/O.

begin;

create table public.native_search_cache (
	cache_key text primary key,
	adapter_version text not null,
	response_version text not null,
	status text not null default 'pending',
	response jsonb,
	provider text,
	provider_request_id text,
	provider_credits numeric,
	owner_token uuid,
	lease_expires_at timestamptz,
	fetched_at timestamptz,
	expires_at timestamptz not null default now(),
	hit_count bigint not null default 0,
	last_hit_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint native_search_cache_key_sha256_check
		check (cache_key ~ '^[0-9a-f]{64}$'),
	constraint native_search_cache_adapter_version_check
		check (length(adapter_version) between 1 and 100),
	constraint native_search_cache_response_version_check
		check (length(response_version) between 1 and 100),
	constraint native_search_cache_status_check
		check (status in ('pending', 'ready')),
	constraint native_search_cache_provider_check
		check (provider is null or length(provider) between 1 and 64),
	constraint native_search_cache_provider_request_id_check
		check (provider_request_id is null or length(provider_request_id) <= 300),
	constraint native_search_cache_provider_credits_check
		check (provider_credits is null or provider_credits > 0),
	constraint native_search_cache_hit_count_check
		check (hit_count >= 0),
	constraint native_search_cache_state_check check (
		(
			status = 'pending'
			and response is null
			and owner_token is not null
			and lease_expires_at is not null
			and fetched_at is null
		)
		or
		(
			status = 'ready'
			and jsonb_typeof(response) = 'object'
			and owner_token is null
			and lease_expires_at is null
			and fetched_at is not null
		)
	)
);

comment on table public.native_search_cache is
	'Service-only, versioned discovery-result cache with expiring cross-instance single-flight claims.';
comment on column public.native_search_cache.cache_key is
	'SHA-256 of the normalized request, discovery adapter version, and response-shaping version.';
comment on column public.native_search_cache.provider_credits is
	'Provider-reported usage for internal provenance; cache-hit callers must not bill these credits again.';

create index native_search_cache_expires_at_idx
	on public.native_search_cache (expires_at);
create index native_search_cache_pending_lease_idx
	on public.native_search_cache (lease_expires_at)
	where status = 'pending';

alter table public.native_search_cache enable row level security;
revoke all privileges on table public.native_search_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.native_search_cache to service_role;

create or replace function public.claim_native_search_cache(
	p_cache_key text,
	p_adapter_version text,
	p_response_version text,
	p_owner_token uuid,
	p_lease_seconds integer default 45
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
	v_now timestamptz := clock_timestamp();
	v_lease_seconds integer;
	v_row public.native_search_cache%rowtype;
begin
	if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
		or p_adapter_version is null or length(p_adapter_version) not between 1 and 100
		or p_response_version is null or length(p_response_version) not between 1 and 100
		or p_owner_token is null then
		raise exception 'native_search_cache_invalid_claim';
	end if;
	v_lease_seconds := greatest(5, least(coalesce(p_lease_seconds, 45), 120));

	insert into public.native_search_cache (
		cache_key,
		adapter_version,
		response_version,
		status,
		owner_token,
		lease_expires_at,
		expires_at
	) values (
		p_cache_key,
		p_adapter_version,
		p_response_version,
		'pending',
		p_owner_token,
		v_now + make_interval(secs => v_lease_seconds),
		v_now
	)
	on conflict (cache_key) do nothing;

	select cache.*
	into v_row
	from public.native_search_cache cache
	where cache.cache_key = p_cache_key
	for update;

	if v_row.adapter_version = p_adapter_version
		and v_row.response_version = p_response_version
		and v_row.status = 'ready'
		and v_row.expires_at > v_now then
		update public.native_search_cache
		set hit_count = hit_count + 1,
			last_hit_at = v_now,
			updated_at = v_now
		where cache_key = p_cache_key;
		return jsonb_build_object(
			'state', 'hit',
			'response', v_row.response,
			'fetched_at', v_row.fetched_at,
			'expires_at', v_row.expires_at
		);
	end if;

	if v_row.adapter_version = p_adapter_version
		and v_row.response_version = p_response_version
		and v_row.status = 'pending'
		and v_row.owner_token = p_owner_token
		and v_row.lease_expires_at > v_now then
		return jsonb_build_object(
			'state', 'owner',
			'lease_expires_at', v_row.lease_expires_at
		);
	end if;

	if v_row.adapter_version = p_adapter_version
		and v_row.response_version = p_response_version
		and v_row.status = 'pending'
		and v_row.lease_expires_at > v_now then
		return jsonb_build_object(
			'state', 'wait',
			'lease_expires_at', v_row.lease_expires_at
		);
	end if;

	update public.native_search_cache
	set adapter_version = p_adapter_version,
		response_version = p_response_version,
		status = 'pending',
		response = null,
		provider = null,
		provider_request_id = null,
		provider_credits = null,
		owner_token = p_owner_token,
		lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
		fetched_at = null,
		expires_at = v_now,
		updated_at = v_now
	where cache_key = p_cache_key;

	return jsonb_build_object(
		'state', 'owner',
		'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
	);
end;
$function$;

create or replace function public.complete_native_search_cache(
	p_cache_key text,
	p_owner_token uuid,
	p_response jsonb,
	p_ttl_seconds integer default 300,
	p_provider text default null,
	p_provider_request_id text default null,
	p_provider_credits numeric default null
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
	v_now timestamptz := clock_timestamp();
	v_ttl_seconds integer;
begin
	if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
		or p_owner_token is null
		or p_response is null
		or jsonb_typeof(p_response) <> 'object'
		or pg_column_size(p_response) > 1048576
		or (p_provider is not null and length(p_provider) not between 1 and 64)
		or (p_provider_request_id is not null and length(p_provider_request_id) > 300)
		or (p_provider_credits is not null and p_provider_credits <= 0) then
		raise exception 'native_search_cache_invalid_completion';
	end if;
	v_ttl_seconds := greatest(1, least(coalesce(p_ttl_seconds, 300), 3600));

	update public.native_search_cache
	set status = 'ready',
		response = p_response,
		provider = p_provider,
		provider_request_id = p_provider_request_id,
		provider_credits = p_provider_credits,
		owner_token = null,
		lease_expires_at = null,
		fetched_at = v_now,
		expires_at = v_now + make_interval(secs => v_ttl_seconds),
		updated_at = v_now
	where cache_key = p_cache_key
		and status = 'pending'
		and owner_token = p_owner_token;

	return found;
end;
$function$;

create or replace function public.release_native_search_cache(
	p_cache_key text,
	p_owner_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
	if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
		or p_owner_token is null then
		raise exception 'native_search_cache_invalid_release';
	end if;

	delete from public.native_search_cache
	where cache_key = p_cache_key
		and status = 'pending'
		and owner_token = p_owner_token;

	return found;
end;
$function$;

create or replace function public.invalidate_native_search_cache(
	p_cache_key text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
	if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$' then
		raise exception 'native_search_cache_invalid_invalidation';
	end if;

	delete from public.native_search_cache
	where cache_key = p_cache_key;

	return found;
end;
$function$;

create or replace function public.probe_native_search_cache(
	p_cache_key text,
	p_adapter_version text,
	p_response_version text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
	select exists (
		select 1
		from public.native_search_cache cache
		where cache.cache_key = p_cache_key
			and cache.adapter_version = p_adapter_version
			and cache.response_version = p_response_version
			and (
				(cache.status = 'ready' and cache.expires_at > now())
				or (cache.status = 'pending' and cache.lease_expires_at > now())
			)
	);
$function$;

revoke all on function public.claim_native_search_cache(text, text, text, uuid, integer)
	from public, anon, authenticated;
revoke all on function public.complete_native_search_cache(text, uuid, jsonb, integer, text, text, numeric)
	from public, anon, authenticated;
revoke all on function public.release_native_search_cache(text, uuid)
	from public, anon, authenticated;
revoke all on function public.invalidate_native_search_cache(text)
	from public, anon, authenticated;
revoke all on function public.probe_native_search_cache(text, text, text)
	from public, anon, authenticated;

grant execute on function public.claim_native_search_cache(text, text, text, uuid, integer)
	to service_role;
grant execute on function public.complete_native_search_cache(text, uuid, jsonb, integer, text, text, numeric)
	to service_role;
grant execute on function public.release_native_search_cache(text, uuid)
	to service_role;
grant execute on function public.invalidate_native_search_cache(text)
	to service_role;
grant execute on function public.probe_native_search_cache(text, text, text)
	to service_role;

commit;
