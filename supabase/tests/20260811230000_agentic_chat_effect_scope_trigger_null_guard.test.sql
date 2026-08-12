-- supabase/tests/20260811230000_agentic_chat_effect_scope_trigger_null_guard.test.sql
-- Disposable PostgreSQL verification for the null-effect trigger guard.
-- Prerequisite: apply agentic_chat_worker_phase2b_effect_base.sql, then
-- 20260731150000_agentic_chat_legacy_atomic_admission.sql,
-- 20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql,
-- 20260801041000_agentic_chat_worker_effect_foundation.sql,
-- 20260804035100_chat_tool_execution_provider_call_identity.sql, and
-- 20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT pg_get_triggerdef(oid) LIKE '%WHEN ((new.effect_id IS NOT NULL))%'
		FROM pg_catalog.pg_trigger
		WHERE tgrelid = 'public.chat_tool_executions'::regclass
			AND tgname = 'trg_chat_tool_executions_effect_scope'
			AND NOT tgisinternal
	),
	'effect-scope trigger must skip null-effect telemetry'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.chat_turn_effects',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'authenticated callers must retain no direct effect-ledger access'
);

INSERT INTO public.users (id)
VALUES ('e1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	(
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'project',
		'active'
	),
	(
		'e2000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000001',
		'project',
		'active'
	);

INSERT INTO public.chat_messages (
	id,
	session_id,
	user_id,
	role,
	content
)
VALUES (
	'e3000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'assistant',
	'Completed.'
);

INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	client_turn_id,
	context_type,
	request_message,
	status,
	execution_mode,
	execution_generation
)
VALUES
	(
		'e4000000-0000-4000-8000-000000000001',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'effect-null-guard-stream-1',
		'effect-null-guard-client-1',
		'project',
		'update the project',
		'running',
		'legacy_sse',
		1
	),
	(
		'e4000000-0000-4000-8000-000000000002',
		'e2000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000001',
		'effect-null-guard-stream-2',
		'effect-null-guard-client-2',
		'project',
		'update another project',
		'running',
		'worker_realtime',
		1
	);

-- The disposable foundation fixture does not model the production table's
-- legacy user grants. Add only the privileges needed to reproduce PostgREST's
-- authenticated INSERT ... ON CONFLICT DO UPDATE, then roll them back below.
GRANT SELECT, INSERT, UPDATE
	ON TABLE public.chat_tool_executions
	TO authenticated;

SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"e1000000-0000-4000-8000-000000000001"}',
	true
);
SET LOCAL ROLE authenticated;

-- Incremental crash-recovery persistence writes the mutation result first,
-- before the assistant message exists.
INSERT INTO public.chat_tool_executions (
	id,
	session_id,
	stream_run_id,
	client_turn_id,
	provider_tool_call_id,
	tool_name,
	tool_category,
	sequence_index,
	success,
	arguments,
	result,
	turn_run_id
)
VALUES (
	'e5000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'effect-null-guard-stream-1',
	'effect-null-guard-client-1',
	'provider-call-null-effect-1',
	'update_onto_task',
	'ontology_action',
	1,
	true,
	'{"task_id":"task-1"}'::jsonb,
	'{"phase":"incremental"}'::jsonb,
	'e4000000-0000-4000-8000-000000000001'
);

-- Reproduce the end-of-turn bulk UPSERT. Naming turn_run_id in the conflict
-- update fires an UPDATE OF turn_run_id trigger even though its value and the
-- null effect_id do not change.
INSERT INTO public.chat_tool_executions (
	id,
	message_id,
	session_id,
	stream_run_id,
	client_turn_id,
	provider_tool_call_id,
	tool_name,
	tool_category,
	sequence_index,
	success,
	arguments,
	result,
	turn_run_id
)
VALUES (
	'e5000000-0000-4000-8000-000000000002',
	'e3000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'effect-null-guard-stream-1',
	'effect-null-guard-client-1',
	'provider-call-null-effect-1',
	'update_onto_task',
	'ontology_action',
	1,
	true,
	'{"task_id":"task-1"}'::jsonb,
	'{"phase":"final"}'::jsonb,
	'e4000000-0000-4000-8000-000000000001'
)
ON CONFLICT (turn_run_id, provider_tool_call_id)
DO UPDATE SET
	message_id = EXCLUDED.message_id,
	session_id = EXCLUDED.session_id,
	stream_run_id = EXCLUDED.stream_run_id,
	client_turn_id = EXCLUDED.client_turn_id,
	tool_name = EXCLUDED.tool_name,
	tool_category = EXCLUDED.tool_category,
	sequence_index = EXCLUDED.sequence_index,
	success = EXCLUDED.success,
	arguments = EXCLUDED.arguments,
	result = EXCLUDED.result,
	turn_run_id = EXCLUDED.turn_run_id;

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND bool_and(effect_id IS NULL)
			AND bool_and(message_id = 'e3000000-0000-4000-8000-000000000001')
			AND bool_and(result = '{"phase":"final"}'::jsonb)
		FROM public.chat_tool_executions
		WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000001'
	),
	'authenticated null-effect UPSERT did not reconcile the incremental row'
);

-- The guard must not weaken worker effect-to-turn validation.
INSERT INTO public.chat_turn_effects (
	id,
	turn_run_id,
	session_id,
	user_id,
	execution_generation,
	tool_name,
	operation_name,
	canonical_argument_hash,
	downstream_idempotency_supported
)
VALUES (
	'e6000000-0000-4000-8000-000000000001',
	'e4000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	1,
	'update_onto_task',
	'update_task',
	repeat('a', 64),
	true
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_tool_executions (
				id,
				session_id,
				provider_tool_call_id,
				tool_name,
				tool_category,
				sequence_index,
				success,
				arguments,
				turn_run_id,
				effect_id
			)
			VALUES (
				'e5000000-0000-4000-8000-000000000003',
				'e2000000-0000-4000-8000-000000000002',
				'provider-call-cross-turn-1',
				'update_onto_task',
				'ontology_action',
				1,
				true,
				'{}'::jsonb,
				'e4000000-0000-4000-8000-000000000002',
				'e6000000-0000-4000-8000-000000000001'
			)
		$test$,
		'agentic_chat_tool_effect_scope_mismatch'
	),
	'effect-linked cross-turn telemetry bypassed scope validation'
);

ROLLBACK;

SELECT 'agentic_chat_effect_scope_trigger_null_guard_ok' AS result;
