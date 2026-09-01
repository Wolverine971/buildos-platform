-- supabase/tests/20260901070000_web_page_evidence_account_deletion_cascade.production_verify.sql
-- Full-schema verification. Apply the matching migration before running.
-- This contract requires pgTAP and the hosted account-deletion schema.

begin;

select plan(4);

insert into public.users (id, name)
values ('71000000-0000-4000-8000-000000000001', 'Web Evidence Purge Fixture');

insert into public.web_page_visits (id, user_id, url, final_url, normalized_url, status_code)
values (
	'71000000-0000-4000-8000-000000000002',
	'71000000-0000-4000-8000-000000000001',
	'https://example.com/account-purge',
	'https://example.com/account-purge',
	'https://example.com/account-purge',
	200
);

insert into public.web_page_versions (
	id, web_page_visit_id, version_number, content_hash, requested_url,
	final_url, status_code, content, content_format, fetched_at,
	extraction_method, extraction_version
)
values (
	'71000000-0000-4000-8000-000000000003',
	'71000000-0000-4000-8000-000000000002',
	1, repeat('a', 64), 'https://example.com/account-purge',
	'https://example.com/account-purge', 200, 'account deletion evidence',
	'text', now(), 'text', 'account-purge-test-v1'
);

insert into public.web_page_evidence_chunks (
	id, page_version_id, chunk_index, start_offset, end_offset,
	selector, content, content_hash
)
values (
	'71000000-0000-4000-8000-000000000004',
	'71000000-0000-4000-8000-000000000003',
	0, 0, 8, 'char:0-8', 'account', repeat('b', 64)
);

update public.web_page_visits
set current_version_id = '71000000-0000-4000-8000-000000000003'
where id = '71000000-0000-4000-8000-000000000002';

select public.finalize_account_deletion_database(
	'71000000-0000-4000-8000-000000000001'
);

select is(
	(select count(*) from public.users where id = '71000000-0000-4000-8000-000000000001'),
	0::bigint,
	'account deletion removes the public user'
);
select is(
	(select count(*) from public.web_page_visits where id = '71000000-0000-4000-8000-000000000002'),
	0::bigint,
	'account deletion removes the user-scoped page visit'
);
select is(
	(select count(*) from public.web_page_versions where id = '71000000-0000-4000-8000-000000000003'),
	0::bigint,
	'account deletion cascades through immutable page versions'
);
select is(
	(select count(*) from public.web_page_evidence_chunks where id = '71000000-0000-4000-8000-000000000004'),
	0::bigint,
	'account deletion cascades through immutable evidence chunks'
);

select * from finish();
rollback;
