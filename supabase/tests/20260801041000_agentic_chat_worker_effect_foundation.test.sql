-- supabase/tests/20260801041000_agentic_chat_worker_effect_foundation.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 1.
-- Prerequisite: apply 20260801041000_agentic_chat_worker_effect_foundation.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
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

BEGIN;

SELECT pg_temp.assert_true(
	to_regclass('public.chat_turn_effects') IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'chat_tool_executions'
				AND column_name = 'effect_id'
		),
	'effect table or telemetry link is missing'
);

SELECT pg_temp.assert_true(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.chat_turn_effects'::regclass
	)
		AND NOT has_table_privilege('anon', 'public.chat_turn_effects', 'SELECT,INSERT,UPDATE,DELETE')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_effects', 'SELECT,INSERT,UPDATE,DELETE')
		AND has_table_privilege('service_role', 'public.chat_turn_effects', 'SELECT,INSERT,UPDATE,DELETE'),
	'effect ledger is not server-only'
);

INSERT INTO public.users (id)
VALUES ('b1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'project', 'active');

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
		'b3000000-0000-4000-8000-000000000001',
		'b2000000-0000-4000-8000-000000000001',
		'b1000000-0000-4000-8000-000000000001',
		'phase2b-effect-stream-1',
		'phase2b-effect-client-1',
		'project',
		'mutate one',
		'running',
		'worker_realtime',
		1
	),
	(
		'b3000000-0000-4000-8000-000000000002',
		'b2000000-0000-4000-8000-000000000002',
		'b1000000-0000-4000-8000-000000000001',
		'phase2b-effect-stream-2',
		'phase2b-effect-client-2',
		'project',
		'mutate two',
		'running',
		'worker_realtime',
		1
	);

INSERT INTO public.chat_turn_effects (
	id,
	turn_run_id,
	session_id,
	user_id,
	execution_generation,
	tool_name,
	operation_name,
	canonical_argument_hash,
	provider_tool_call_id,
	downstream_idempotency_supported
)
VALUES (
	'b4000000-0000-4000-8000-000000000001',
	'b3000000-0000-4000-8000-000000000001',
	'b2000000-0000-4000-8000-000000000001',
	'b1000000-0000-4000-8000-000000000001',
	1,
	'task_update',
	'update_task',
	repeat('a', 64),
	'provider-call-a',
	true
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_turn_effects (
				id, turn_run_id, session_id, user_id, execution_generation,
				tool_name, operation_name, canonical_argument_hash,
				downstream_idempotency_supported
			) VALUES (
				'b4000000-0000-4000-8000-000000000002',
				'b3000000-0000-4000-8000-000000000001',
				'b2000000-0000-4000-8000-000000000002',
				'b1000000-0000-4000-8000-000000000001',
				1, 'task_update', 'update_task', repeat('b', 64), true
			)
		$test$,
		'fk_chat_turn_effects_turn_scope'
	),
	'cross-session effect scope was accepted'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_turn_effects (
				id, turn_run_id, session_id, user_id, execution_generation,
				tool_name, operation_name, canonical_argument_hash,
				downstream_idempotency_supported
			) VALUES (
				'b4000000-0000-4000-8000-000000000003',
				'b3000000-0000-4000-8000-000000000001',
				'b2000000-0000-4000-8000-000000000001',
				'b1000000-0000-4000-8000-000000000001',
				1, 'task_update', 'update_task', 'not-a-hash', true
			)
		$test$,
		'chk_chat_turn_effects_argument_hash'
	),
	'invalid effect hash/timeline was accepted'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_turn_effects (
				id, turn_run_id, session_id, user_id, execution_generation,
				tool_name, operation_name, canonical_argument_hash,
				state, started_at, downstream_idempotency_supported
			) VALUES (
				'b4000000-0000-4000-8000-000000000005',
				'b3000000-0000-4000-8000-000000000001',
				'b2000000-0000-4000-8000-000000000001',
				'b1000000-0000-4000-8000-000000000001',
				1, 'task_update', 'update_task', repeat('d', 64),
				'started', clock_timestamp(), true
			)
		$test$,
		'agentic_chat_effect_must_start_reserved'
	),
	'effect bypassed the reserved initial state'
);

UPDATE public.chat_turn_effects
SET state = 'started', started_at = clock_timestamp()
WHERE id = 'b4000000-0000-4000-8000-000000000001';

UPDATE public.chat_turn_effects
SET
	state = 'succeeded',
	finished_at = clock_timestamp(),
	downstream_receipt = '{"task_id":"receipt-1"}'::jsonb
WHERE id = 'b4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			UPDATE public.chat_turn_effects
			SET state = 'started', finished_at = NULL, downstream_receipt = NULL
			WHERE id = 'b4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_effect_finished_at_is_immutable'
	),
	'terminal effect was reopened'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			UPDATE public.chat_turn_effects
			SET provider_tool_call_id = 'provider-call-b'
			WHERE id = 'b4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_effect_terminal_is_immutable'
	),
	'terminal effect telemetry was mutated'
);

INSERT INTO public.chat_tool_executions (
	id, tool_name, sequence_index, success, arguments, turn_run_id, effect_id
)
VALUES (
	'b5000000-0000-4000-8000-000000000001',
	'task_update',
	1,
	true,
	'{}'::jsonb,
	'b3000000-0000-4000-8000-000000000001',
	'b4000000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_tool_executions (
				id, tool_name, sequence_index, success, arguments, turn_run_id, effect_id
			) VALUES (
				'b5000000-0000-4000-8000-000000000002',
				'task_update', 2, true, '{}'::jsonb,
				'b3000000-0000-4000-8000-000000000002',
				'b4000000-0000-4000-8000-000000000001'
			)
		$test$,
		'agentic_chat_tool_effect_scope_mismatch'
	),
	'cross-turn tool effect link was accepted'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			DELETE FROM public.chat_turn_effects
			WHERE id = 'b4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_active_effect_cannot_be_deleted'
	),
	'active-turn effect was deleted'
);

UPDATE public.chat_turn_runs
SET status = 'completed', finished_at = clock_timestamp()
WHERE id = 'b3000000-0000-4000-8000-000000000001';

DELETE FROM public.chat_turn_effects
WHERE id = 'b4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT effect_id IS NULL
		FROM public.chat_tool_executions
		WHERE id = 'b5000000-0000-4000-8000-000000000001'
	),
	'effect deletion did not clear the nullable telemetry link'
);

INSERT INTO public.chat_turn_effects (
	id,
	turn_run_id,
	session_id,
	user_id,
	execution_generation,
	tool_name,
	operation_name,
	canonical_argument_hash,
	downstream_idempotency_supported,
	provider_tool_call_id
)
VALUES (
	'b4000000-0000-4000-8000-000000000004',
	'b3000000-0000-4000-8000-000000000001',
	'b2000000-0000-4000-8000-000000000001',
	'b1000000-0000-4000-8000-000000000001',
	1,
	'task_update',
	'update_task',
	repeat('c', 64),
	false,
	'provider-call-uncertain'
);

UPDATE public.chat_turn_effects
SET state = 'started', started_at = clock_timestamp()
WHERE id = 'b4000000-0000-4000-8000-000000000004';

UPDATE public.chat_turn_effects
SET state = 'uncertain', finished_at = clock_timestamp(), failure_code = 'receipt_unknown'
WHERE id = 'b4000000-0000-4000-8000-000000000004';

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			DELETE FROM public.chat_turn_effects
			WHERE id = 'b4000000-0000-4000-8000-000000000004'
		$test$,
		'agentic_chat_uncertain_effect_cannot_be_deleted'
	),
	'uncertain effect was deleted without reconciliation'
);

ROLLBACK;

DROP TRIGGER trg_chat_tool_executions_effect_scope ON public.chat_tool_executions;
DROP FUNCTION public.validate_agentic_chat_tool_effect_scope();
ALTER TABLE public.chat_tool_executions DROP COLUMN effect_id;
DROP TABLE public.chat_turn_effects;
DROP FUNCTION public.enforce_agentic_chat_effect_transition();
DROP FUNCTION public.reject_protected_agentic_chat_effect_delete();

SELECT pg_temp.assert_true(
	to_regclass('public.chat_turn_effects') IS NULL
		AND NOT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'chat_tool_executions'
				AND column_name = 'effect_id'
		)
		AND to_regclass('public.chat_turn_stream_state') IS NOT NULL
		AND to_regclass('public.chat_turn_signals') IS NOT NULL
		AND to_regprocedure('public.reset_stalled_jobs(text,text[],text[])') IS NOT NULL
		AND to_regprocedure(
			'public.admit_legacy_agentic_chat_turn(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,boolean,text,timestamptz,text,jsonb,integer,integer,integer,integer)'
		) IS NOT NULL,
	'effect rollback removed a Phase 2A or legacy admission primitive'
);

\ir 20260731150000_agentic_chat_legacy_atomic_admission.test.sql

SELECT 'phase2b_effect_foundation_ok' AS result;
