-- supabase/tests/20260804020000_native_search_page_evidence_versions.test.sql
-- Disposable PostgreSQL verification for immutable page versions and evidence chunks.
-- Prerequisite: run fixtures/native_search_page_evidence_bootstrap.sql, then apply
-- 20260804020000_native_search_page_evidence_versions.sql and
-- 20260804020100_native_search_evidence_receipt_format.sql.
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
	not has_table_privilege('anon', 'public.web_page_versions', 'select')
		and not has_table_privilege('authenticated', 'public.web_page_versions', 'select')
		and has_table_privilege('service_role', 'public.web_page_versions', 'select'),
	'page versions must remain service-only'
);
select pg_temp.assert_true(
	not has_table_privilege('anon', 'public.web_page_evidence_chunks', 'select')
		and not has_table_privilege('authenticated', 'public.web_page_evidence_chunks', 'select')
		and has_table_privilege('service_role', 'public.web_page_evidence_chunks', 'select'),
	'evidence chunks must remain service-only'
);
select pg_temp.assert_true(
	not has_function_privilege(
		'authenticated',
		'public.persist_web_page_evidence_version(uuid,text,text,text,text,text,integer,text,text,jsonb,jsonb,text,text,integer,timestamptz,text,text,text,text,text,text,jsonb)',
		'execute'
	)
		and has_function_privilege(
			'service_role',
			'public.persist_web_page_evidence_version(uuid,text,text,text,text,text,integer,text,text,jsonb,jsonb,text,text,integer,timestamptz,text,text,text,text,text,text,jsonb)',
			'execute'
		),
	'only the service role may persist immutable evidence'
);

-- The legacy mutable snapshot must become immutable version 1 with an
-- authoritative recomputed hash, stable coordinates, and a current pointer.
select pg_temp.assert_true(
	(
		select version.version_number = 1
			and visit.current_version_id = version.id
			and version.content_hash = encode(
				extensions.digest(convert_to(visit.markdown, 'UTF8'), 'sha256'),
				'hex'
			)
		from public.web_page_visits visit
		join public.web_page_versions version
			on version.web_page_visit_id = visit.id
		where visit.id = '10000000-0000-4000-8000-000000000001'
	),
	'legacy page content must backfill as authoritative version 1'
);
select pg_temp.assert_true(
	(
		select count(*) = 1
			and min(chunk.start_offset) = 0
			and max(chunk.end_offset) = char_length(version.content)
		from public.web_page_versions version
		join public.web_page_evidence_chunks chunk on chunk.page_version_id = version.id
		where version.web_page_visit_id = '10000000-0000-4000-8000-000000000001'
		group by version.content
	),
	'legacy evidence chunks must cover the complete Unicode page content'
);

select public.get_current_web_page_evidence(
	'10000000-0000-4000-8000-000000000001'
) as legacy_receipt \gset

select pg_temp.assert_true(
	:'legacy_receipt'::jsonb ->> 'version_number' = '1'
		and :'legacy_receipt'::jsonb ->> 'content_format' = 'markdown'
		and (:'legacy_receipt'::jsonb ->> 'content_length')::integer =
			char_length('Legacy 😀 evidence body.')
		and not (:'legacy_receipt'::jsonb #> '{chunks,0}') ? 'content'
		and :'legacy_receipt'::jsonb #>> '{chunks,0,selector}' =
			format('char:0-%s', char_length('Legacy 😀 evidence body.')),
	'current evidence receipts must expose stable references without duplicating chunk bodies'
);

select 'Updated 😀 evidence body with grounded claims.'::text as new_content \gset
select encode(
	extensions.digest(convert_to(:'new_content', 'UTF8'), 'sha256'),
	'hex'
) as new_hash \gset
select jsonb_build_array(
	jsonb_build_object(
		'chunk_index', 0,
		'start_offset', 0,
		'end_offset', char_length(:'new_content'),
		'content', :'new_content',
		'content_hash', :'new_hash'
	)
) as new_chunks \gset

set local role service_role;
select public.persist_web_page_evidence_version(
	p_web_page_visit_id => '10000000-0000-4000-8000-000000000001',
	p_content_hash => :'new_hash',
	p_content => :'new_content',
	p_requested_url => 'https://example.com/legacy',
	p_final_url => 'https://example.com/legacy',
	p_status_code => 200,
	p_content_type => 'text/html',
	p_title => 'Updated evidence',
	p_content_format => 'markdown',
	p_fetched_at => '2026-08-04T13:00:00.000Z',
	p_extraction_method => 'static',
	p_extraction_version => 'web-visit-v1',
	p_parser => 'reader',
	p_chunks => :'new_chunks'::jsonb
) as created_receipt \gset
reset role;

select pg_temp.assert_true(
	:'created_receipt'::jsonb ->> 'created' = 'true'
		and :'created_receipt'::jsonb ->> 'version_number' = '2'
		and :'created_receipt'::jsonb ->> 'content_hash' = :'new_hash'
		and (:'created_receipt'::jsonb ->> 'content_length')::integer =
			char_length(:'new_content'),
	'a changed page must create and select immutable version 2'
);
select pg_temp.assert_true(
	(select count(*) = 2 from public.web_page_versions
		where web_page_visit_id = '10000000-0000-4000-8000-000000000001'),
	'new content must preserve version 1 instead of overwriting it'
);

-- Repeating identical content is content-addressed and idempotent.
set local role service_role;
select public.persist_web_page_evidence_version(
	p_web_page_visit_id => '10000000-0000-4000-8000-000000000001',
	p_content_hash => :'new_hash',
	p_content => :'new_content',
	p_chunks => :'new_chunks'::jsonb
) as duplicate_receipt \gset
reset role;

select pg_temp.assert_true(
	:'duplicate_receipt'::jsonb ->> 'created' = 'false'
		and :'duplicate_receipt'::jsonb ->> 'page_version_id' =
			:'created_receipt'::jsonb ->> 'page_version_id'
		and (select count(*) = 2 from public.web_page_versions
			where web_page_visit_id = '10000000-0000-4000-8000-000000000001'),
	'identical content must reuse its immutable version without duplicate chunks'
);

do $$
begin
	begin
		perform public.persist_web_page_evidence_version(
			p_web_page_visit_id => '10000000-0000-4000-8000-000000000001',
			p_content_hash => repeat('f', 64),
			p_content => 'hash mismatch',
			p_chunks => jsonb_build_array(
				jsonb_build_object(
					'chunk_index', 0,
					'start_offset', 0,
					'end_offset', 13,
					'content', 'hash mismatch',
					'content_hash', repeat('f', 64)
				)
			)
		);
		raise exception 'expected_hash_mismatch';
	exception when others then
		if sqlerrm <> 'web_page_evidence_content_hash_mismatch' then
			raise;
		end if;
	end;
end;
$$;

select pg_temp.assert_true(
	(select count(*) = 2 from public.web_page_versions
		where web_page_visit_id = '10000000-0000-4000-8000-000000000001'),
	'invalid evidence must not leave a partial version'
);

do $$
begin
	begin
		update public.web_page_versions
		set title = 'mutated'
		where web_page_visit_id = '10000000-0000-4000-8000-000000000001';
		raise exception 'expected_immutable_rejection';
	exception when sqlstate '55000' then
		if sqlerrm <> 'web_page_evidence_is_immutable' then
			raise;
		end if;
	end;
end;
$$;

rollback;
