-- supabase/tests/20260901070000_web_page_evidence_account_deletion_cascade.test.sql
-- Disposable PostgreSQL verification for account-purge cascade ownership.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/web_page_evidence_account_deletion_cascade_base.sql
\ir ../migrations/20260901070000_web_page_evidence_account_deletion_cascade.sql

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

insert into public.web_page_visits (id, user_id)
values (
	'71000000-0000-4000-8000-000000000002',
	'71000000-0000-4000-8000-000000000001'
);
insert into public.web_page_versions (id, web_page_visit_id, title)
values (
	'71000000-0000-4000-8000-000000000003',
	'71000000-0000-4000-8000-000000000002',
	'Immutable page'
);
update public.web_page_visits
set current_version_id = '71000000-0000-4000-8000-000000000003'
where id = '71000000-0000-4000-8000-000000000002';
insert into public.web_page_evidence_chunks (id, page_version_id, content)
values (
	'71000000-0000-4000-8000-000000000004',
	'71000000-0000-4000-8000-000000000003',
	'account deletion evidence'
);

select pg_temp.assert_true(
	(select tgtype & 8 = 0 from pg_trigger where tgname = 'web_page_versions_immutable'),
	'immutable version trigger must not intercept parent-driven deletes'
);
select pg_temp.assert_true(
	(select tgtype & 8 = 0 from pg_trigger where tgname = 'web_page_evidence_chunks_immutable'),
	'immutable chunk trigger must not intercept parent-driven deletes'
);

delete from public.web_page_visits
where id = '71000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
	(select count(*) = 0 from public.web_page_versions),
	'deleting a visit must cascade through immutable versions'
);
select pg_temp.assert_true(
	(select count(*) = 0 from public.web_page_evidence_chunks),
	'deleting a visit must cascade through immutable evidence chunks'
);

rollback;
