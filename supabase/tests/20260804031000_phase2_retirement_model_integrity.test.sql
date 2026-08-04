-- supabase/tests/20260804031000_phase2_retirement_model_integrity.test.sql
-- Disposable verification for Phase 2 retirement and modeling hardening.
-- Apply migrations 20260804030000 and 20260804031000 first.
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
	to_regclass('public.onto_decisions') is null
		and to_regclass('public.notes') is null
		and to_regclass('public.brain_dumps') is null
		and to_regclass('public.brain_dump_links') is null
		and to_regtype('public.brain_dump_status') is null,
	'Phase 2 retired relations or enum still exist'
);

select pg_temp.assert_true(
	(
		select count(*) = 5
			and sum(row_count) = 1347
			and bool_and(sha256 ~ '^[0-9a-f]{64}$')
		from private.schema_retirement_archives
		where archive_package = 'retired-schema-2026-08-04T15-24-36-082Z'
			and dataset in (
				'onto_decisions',
				'onto_decision_edges',
				'notes',
				'brain_dumps',
				'brain_dump_links'
			)
	),
	'Phase 2 archive receipts are incomplete or malformed'
);

select pg_temp.assert_true(
	not exists (
		select 1
		from pg_constraint
		where conname in (
			'error_logs_brain_dump_id_fkey',
			'llm_usage_logs_brain_dump_id_fkey',
			'project_questions_answer_brain_dump_id_fkey'
		)
	),
	'legacy brain dump foreign keys still exist'
);

select pg_temp.assert_true(
	exists (
		select 1
		from pg_constraint
		where conname = 'onto_projects_created_by_fkey'
			and convalidated
			and pg_get_constraintdef(oid) like 'FOREIGN KEY (created_by) REFERENCES onto_actors(id)%'
	),
	'onto_projects.created_by is not a validated actor foreign key'
);

select pg_temp.assert_true(
	exists (
		select 1
		from pg_constraint
		where conname = 'question_tree_proposals_child_node_run_fkey'
			and convalidated
			and pg_get_constraintdef(oid) like 'FOREIGN KEY (run_id, child_node_id) REFERENCES question_tree_nodes(run_id, id)%'
	)
	and exists (
		select 1
		from pg_constraint
		where conname = 'question_tree_proposals_duplicate_node_run_fkey'
			and convalidated
			and pg_get_constraintdef(oid) like 'FOREIGN KEY (run_id, duplicate_of_node_id) REFERENCES question_tree_nodes(run_id, id)%'
	)
	and exists (
		select 1
		from pg_constraint
		where conname = 'question_tree_events_node_run_fkey'
			and convalidated
			and pg_get_constraintdef(oid) like 'FOREIGN KEY (run_id, node_id) REFERENCES question_tree_nodes(run_id, id)%'
	),
	'Question Tree node references are not run-scoped'
);

select pg_temp.assert_true(
	not has_table_privilege('anon', 'public.question_tree_runs', 'select')
		and not has_table_privilege('anon', 'public.question_tree_nodes', 'select')
		and not has_table_privilege('anon', 'public.question_tree_proposals', 'select')
		and not has_table_privilege('anon', 'public.question_tree_events', 'select')
		and has_table_privilege('authenticated', 'public.question_tree_runs', 'select')
		and not has_table_privilege('authenticated', 'public.question_tree_runs', 'insert')
		and has_table_privilege('service_role', 'public.question_tree_runs', 'insert'),
	'Question Tree table privileges do not match the admin-read/service-write model'
);

select 'phase2_retirement_model_integrity_ok' as result;

rollback;
