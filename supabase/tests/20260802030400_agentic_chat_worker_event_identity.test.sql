-- supabase/tests/20260802030400_agentic_chat_worker_event_identity.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 4A.
-- Prerequisite: apply 20260802030000 through 20260802030400 after the terminal
-- control legacy-event fixture. Never run this proof against a linked database.

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

SELECT pg_temp.assert_true(
	(
		SELECT events.execution_generation = 0
			AND events.event_id = events.turn_run_id::text || ':0:1'
		FROM public.chat_turn_events events
		WHERE events.id = 'de000000-0000-4000-8000-000000000040'
	),
	'legacy event was not deterministically backfilled to generation zero'
);

SELECT pg_temp.assert_true(
	(
		SELECT columns.is_nullable = 'NO'
			AND columns.column_default IS NOT NULL
		FROM information_schema.columns
		WHERE columns.table_schema = 'public'
			AND columns.table_name = 'chat_turn_events'
			AND columns.column_name = 'event_id'
	)
		AND NOT EXISTS (
			SELECT 1
			FROM public.chat_turn_events events
			WHERE events.event_id = ''
		),
	'event_id is not insert-optional or its compatibility sentinel persisted'
);

	SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint constraints
		WHERE constraints.conrelid = 'public.chat_turn_events'::regclass
			AND constraints.conname = 'uq_chat_turn_events_sequence'
	)
		AND EXISTS (
			SELECT 1
			FROM pg_index indexes
			WHERE indexes.indexrelid = 'public.uq_chat_turn_events_generation_sequence'::regclass
				AND indexes.indisunique AND indexes.indisvalid AND indexes.indisready
		)
		AND EXISTS (
			SELECT 1
			FROM pg_index indexes
			WHERE indexes.indexrelid = 'public.uq_chat_turn_events_event_id'::regclass
				AND indexes.indisunique AND indexes.indisvalid AND indexes.indisready
		),
	'validated replacement event keys are not active or legacy key remains'
);

BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.chat_turn_events (
	id, turn_run_id, session_id, user_id, stream_run_id,
	execution_generation, sequence_index, phase, event_type, payload
)
SELECT
	'de000000-0000-4000-8000-000000000001',
	turns.id, turns.session_id, turns.user_id, turns.stream_run_id,
	turns.execution_generation, 1, 'model', 'text_delta',
	'{"type":"text_delta","delta":"ok"}'::jsonb
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT events.event_id = events.turn_run_id::text
			|| ':' || events.execution_generation::text || ':1'
		FROM public.chat_turn_events events
		WHERE events.id = 'de000000-0000-4000-8000-000000000001'
	),
		'insert trigger did not derive the deterministic event id'
	);
	SELECT pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.chat_turn_events events
			WHERE events.id = 'de000000-0000-4000-8000-000000000001'
				AND events.event_id = ''
		),
		'event-id insert sentinel escaped the validator'
	);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_turn_events (
				id, turn_run_id, session_id, user_id, stream_run_id,
				execution_generation, sequence_index, phase, event_type, payload
			)
			SELECT
				'de000000-0000-4000-8000-000000000002',
				turns.id, turns.session_id, turns.user_id, turns.stream_run_id,
				turns.execution_generation - 1, 2, 'model', 'text_delta', '{}'::jsonb
			FROM public.chat_turn_runs turns
			WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_turn_event_stale_generation'
	),
	'stale execution generation could append a durable event'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			UPDATE public.chat_turn_events
			SET payload = '{"rewritten":true}'::jsonb
			WHERE id = 'de000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_turn_event_is_immutable'
	),
	'durable event content remained mutable'
);
ROLLBACK;

-- Disable only the write validator inside a rollback transaction to prove the
-- replacement database key itself permits the same sequence in two generations
-- while rejecting a duplicate within one generation.
BEGIN;
ALTER TABLE public.chat_turn_events DISABLE TRIGGER trg_chat_turn_events_validate;
INSERT INTO public.chat_turn_events (
	id, turn_run_id, session_id, user_id, stream_run_id,
	execution_generation, sequence_index, event_id, phase, event_type, payload
)
SELECT
	gen_random_uuid(), turns.id, turns.session_id, turns.user_id, turns.stream_run_id,
	generation, 7,
	turns.id::text || ':' || generation::text || ':7',
	'test', 'text_delta', '{}'::jsonb
FROM public.chat_turn_runs turns
CROSS JOIN (VALUES (41), (42)) AS generations(generation)
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.chat_turn_events
	 WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'
		AND sequence_index = 7) = 2,
	'generation-scoped key still rejected a valid sequence restart'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_turn_events (
				id, turn_run_id, session_id, user_id, stream_run_id,
				execution_generation, sequence_index, event_id, phase, event_type, payload
			)
			SELECT gen_random_uuid(), turns.id, turns.session_id, turns.user_id,
				turns.stream_run_id, 42, 7, turns.id::text || ':42:7',
				'test', 'text_delta', '{}'::jsonb
			FROM public.chat_turn_runs turns
			WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
		$test$,
		'duplicate key value violates unique constraint'
	),
	'generation-local duplicate sequence was accepted'
);
ROLLBACK;

SELECT pg_temp.assert_true(
	NOT has_table_privilege('anon', 'public.chat_turn_events', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_events', 'INSERT')
		AND has_table_privilege('service_role', 'public.chat_turn_events', 'INSERT'),
	'event table write grants are not server-only'
);

SELECT 'phase2b_event_identity_ok' AS result;
