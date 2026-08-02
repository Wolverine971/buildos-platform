-- supabase/tests/20260802032000_native_search_query_cache.test.sql
-- Disposable PostgreSQL verification for the native-search cross-instance cache.
-- Prerequisite: apply 20260802032000_native_search_query_cache.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
	if not coalesce(p_condition, false) then
		raise exception 'assertion_failed: %', p_message;
	end if;
end;
$$;

select pg_temp.assert_true(
	not has_table_privilege('anon', 'public.native_search_cache', 'select'),
	'anon must not read native search cache rows'
);
select pg_temp.assert_true(
	not has_table_privilege('authenticated', 'public.native_search_cache', 'select'),
	'authenticated users must not read native search cache rows'
);
select pg_temp.assert_true(
	has_table_privilege('service_role', 'public.native_search_cache', 'select'),
	'service role must read native search cache rows'
);
select pg_temp.assert_true(
	not has_function_privilege(
		'authenticated',
		'public.claim_native_search_cache(text,text,text,uuid,integer)',
		'execute'
	),
	'authenticated users must not claim cache entries'
);

select public.claim_native_search_cache(
	repeat('a', 64),
	'tavily-v1',
	'native-search-discovery-v1',
	'10000000-0000-4000-8000-000000000001',
	45
) as first_claim \gset

select pg_temp.assert_true(
	:'first_claim'::jsonb ->> 'state' = 'owner',
	'first caller must own a missing cache entry'
);

select public.claim_native_search_cache(
	repeat('a', 64),
	'tavily-v1',
	'native-search-discovery-v1',
	'10000000-0000-4000-8000-000000000002',
	45
) as waiting_claim \gset

select pg_temp.assert_true(
	:'waiting_claim'::jsonb ->> 'state' = 'wait',
	'a second caller must wait behind the live owner lease'
);
select pg_temp.assert_true(
	public.probe_native_search_cache(
		repeat('a', 64),
		'tavily-v1',
		'native-search-discovery-v1'
	),
	'probe must recognize a live owner that can satisfy a shared caller'
);

select pg_temp.assert_true(
	not public.complete_native_search_cache(
		repeat('a', 64),
		'10000000-0000-4000-8000-000000000002',
		'{"query":"wrong owner"}'::jsonb,
		300,
		'tavily',
		null,
		2
	),
	'a non-owner must not complete the cache claim'
);

select pg_temp.assert_true(
	public.complete_native_search_cache(
		repeat('a', 64),
		'10000000-0000-4000-8000-000000000001',
		'{"fetchedAt":"2026-08-02T12:00:00.000Z","discovery":{"query":"cached","results":[],"diagnostics":{"provider":"tavily","adapterVersion":"tavily-v1"}}}'::jsonb,
		300,
		'tavily',
		'request-1',
		2
	),
	'the owner must complete its live claim'
);

select public.claim_native_search_cache(
	repeat('a', 64),
	'tavily-v1',
	'native-search-discovery-v1',
	'10000000-0000-4000-8000-000000000002',
	45
) as cached_claim \gset

select pg_temp.assert_true(
	:'cached_claim'::jsonb ->> 'state' = 'hit'
		and :'cached_claim'::jsonb #>> '{response,discovery,query}' = 'cached',
	'a completed entry must return its provider-neutral response'
);
select pg_temp.assert_true(
	public.probe_native_search_cache(
		repeat('a', 64),
		'tavily-v1',
		'native-search-discovery-v1'
	),
	'probe must see a fresh ready entry'
);
select pg_temp.assert_true(
	(select hit_count = 1 from public.native_search_cache where cache_key = repeat('a', 64)),
	'a cache hit must increment the hit counter'
);

-- An adapter/result-contract version change invalidates the old payload and
-- atomically transfers ownership without needing a second row.
select public.claim_native_search_cache(
	repeat('a', 64),
	'tavily-v2',
	'native-search-discovery-v2',
	'10000000-0000-4000-8000-000000000003',
	45
) as version_claim \gset

select pg_temp.assert_true(
	:'version_claim'::jsonb ->> 'state' = 'owner',
	'a new adapter/response version must not consume an old payload'
);
select pg_temp.assert_true(
	(select response is null and provider_credits is null
		from public.native_search_cache where cache_key = repeat('a', 64)),
	'reclaim must clear the previous payload and miss-only usage'
);

-- An owner failure can release immediately so another instance does not wait
-- for the lease timeout.
select pg_temp.assert_true(
	public.release_native_search_cache(
		repeat('a', 64),
		'10000000-0000-4000-8000-000000000003'
	),
	'the live owner must be able to release a failed claim'
);
select pg_temp.assert_true(
	not exists (select 1 from public.native_search_cache where cache_key = repeat('a', 64)),
	'releasing a pending claim must remove it'
);

-- A crashed owner is recoverable after its lease expires.
select public.claim_native_search_cache(
	repeat('b', 64),
	'tavily-v1',
	'native-search-discovery-v1',
	'20000000-0000-4000-8000-000000000001',
	5
) as abandoned_claim \gset
update public.native_search_cache
set lease_expires_at = clock_timestamp() - interval '1 second'
where cache_key = repeat('b', 64);

select public.claim_native_search_cache(
	repeat('b', 64),
	'tavily-v1',
	'native-search-discovery-v1',
	'20000000-0000-4000-8000-000000000002',
	45
) as recovery_claim \gset

select pg_temp.assert_true(
	:'recovery_claim'::jsonb ->> 'state' = 'owner'
		and (
			select owner_token = '20000000-0000-4000-8000-000000000002'::uuid
			from public.native_search_cache
			where cache_key = repeat('b', 64)
		),
	'an expired owner lease must be reclaimable by another instance'
);
select pg_temp.assert_true(
	public.invalidate_native_search_cache(repeat('b', 64)),
	'service code must be able to invalidate a malformed cache payload or abandoned row'
);
select pg_temp.assert_true(
	not exists (select 1 from public.native_search_cache where cache_key = repeat('b', 64)),
	'invalidation must remove the exact cache key'
);

rollback;
