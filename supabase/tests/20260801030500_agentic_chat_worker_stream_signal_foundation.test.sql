-- supabase/tests/20260801030500_agentic_chat_worker_stream_signal_foundation.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2A Slice 4.
-- Prerequisite: apply 20260801030500_agentic_chat_worker_stream_signal_foundation.sql.
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

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		to_regclass('public.chat_turn_stream_state') IS NOT NULL,
		'stream-state table is absent'
	);
	PERFORM pg_temp.assert_true(
		to_regclass('public.chat_turn_signals') IS NOT NULL,
		'signal table is absent'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT relrowsecurity
			FROM pg_class
			WHERE oid = 'public.chat_turn_stream_state'::regclass
		) AND (
			SELECT relrowsecurity
			FROM pg_class
			WHERE oid = 'public.chat_turn_signals'::regclass
		),
		'worker control tables do not have RLS enabled'
	);
END;
$$;

INSERT INTO public.users (id)
VALUES
	('e1000000-0000-4000-8000-000000000001'),
	('e1000000-0000-4000-8000-000000000002'),
	('e1000000-0000-4000-8000-000000000003');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	(
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'global',
		'active'
	),
	(
		'e2000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000002',
		'global',
		'active'
	),
	(
		'e2000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'global',
		'active'
	);

INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	context_type,
	request_message,
	status,
	execution_mode,
	execution_generation
)
VALUES
	(
		'e3000000-0000-4000-8000-000000000001',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'phase2a-stream-signal-running-1',
		'global',
		'Stream and signal fixture',
		'running',
		'worker_realtime',
		1
	),
	(
		'e3000000-0000-4000-8000-000000000002',
		'e2000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000002',
		'phase2a-stream-signal-running-2',
		'global',
		'Negative control fixture',
		'running',
		'worker_realtime',
		2
	),
	(
		'e3000000-0000-4000-8000-000000000003',
		'e2000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'phase2a-stream-signal-terminal',
		'global',
		'Terminal negative control fixture',
		'completed',
		'worker_realtime',
		1
	);

INSERT INTO public.chat_turn_stream_state (
	turn_run_id,
	session_id,
	user_id,
	execution_generation,
	snapshot_sequence,
	durable_through_sequence,
	projection_durable_sequence,
	assistant_text,
	projection
)
VALUES (
	'e3000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	1,
	3,
	3,
	2,
	'hello',
	'{"phase":"stream","semanticEvents":[{"sequence":2}]}'::jsonb
);

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT snapshot_sequence = 3
				AND durable_through_sequence = 3
				AND projection_durable_sequence = 2
				AND assistant_text = 'hello'
				AND NOT reconcile_required
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
		),
		'stream-state defaults or complete prefix are incorrect'
	);

	BEGIN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation
		) VALUES (
			'e3000000-0000-4000-8000-000000000002',
			'e2000000-0000-4000-8000-000000000001',
			'e1000000-0000-4000-8000-000000000001',
			2
		);
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_stream_state_scope_mismatch';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'cross-turn stream scope was accepted');

	v_rejected := false;
	BEGIN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation
		) VALUES (
			'e3000000-0000-4000-8000-000000000002',
			'e2000000-0000-4000-8000-000000000002',
			'e1000000-0000-4000-8000-000000000002',
			1
		);
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_stream_state_generation_mismatch';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'stale-generation stream state was accepted');

	v_rejected := false;
	BEGIN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation,
			snapshot_sequence, durable_through_sequence,
			projection_durable_sequence
		) VALUES (
			'e3000000-0000-4000-8000-000000000002',
			'e2000000-0000-4000-8000-000000000002',
			'e1000000-0000-4000-8000-000000000002',
			2, 1, 1, 2
		);
	EXCEPTION
		WHEN check_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'invalid stream cursor ordering was accepted');

	v_rejected := false;
	BEGIN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation, assistant_text
		) VALUES (
			'e3000000-0000-4000-8000-000000000002',
			'e2000000-0000-4000-8000-000000000002',
			'e1000000-0000-4000-8000-000000000002',
			2,
			repeat('x', 2097153)
		);
	EXCEPTION
		WHEN check_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'stream text above 2 MiB was accepted');
END;
$$;

-- A generation's text is a complete monotonic prefix and its cursors cannot regress.
DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	BEGIN
		UPDATE public.chat_turn_stream_state
		SET assistant_text = 'hell'
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_stream_state_prefix_regression';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'stream prefix truncation was accepted');

	v_rejected := false;
	BEGIN
		UPDATE public.chat_turn_stream_state
		SET
			snapshot_sequence = 2,
			durable_through_sequence = 2,
			projection_durable_sequence = 2
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_stream_state_sequence_regression';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'stream cursor regression was accepted');

	UPDATE public.chat_turn_stream_state
	SET
		assistant_text = 'hello world',
		snapshot_sequence = 4,
		durable_through_sequence = 4,
		projection_durable_sequence = 3,
		reconcile_required = true
	WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';

	PERFORM pg_temp.assert_true(
		(
			SELECT assistant_text = 'hello world'
				AND snapshot_sequence = 4
				AND durable_through_sequence = 4
				AND projection_durable_sequence = 3
				AND reconcile_required
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
		),
		'valid stream append/projection update was rejected'
	);
END;
$$;

-- A new execution generation resets every cursor and the complete text prefix.
UPDATE public.chat_turn_runs
SET execution_generation = 2
WHERE id = 'e3000000-0000-4000-8000-000000000001';

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	BEGIN
		UPDATE public.chat_turn_stream_state
		SET execution_generation = 2
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_stream_state_generation_reset_required';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'generation advanced without a stream reset');

	UPDATE public.chat_turn_stream_state
	SET
		execution_generation = 2,
		snapshot_sequence = 0,
		durable_through_sequence = 0,
		projection_durable_sequence = 0,
		assistant_text = '',
		projection = '{"phase":"llm"}'::jsonb,
		reconcile_required = false
	WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';

	PERFORM pg_temp.assert_true(
		(
			SELECT execution_generation = 2
				AND snapshot_sequence = 0
				AND assistant_text = ''
				AND projection = '{"phase":"llm"}'::jsonb
				AND NOT reconcile_required
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
		),
		'valid generation reset was rejected'
	);
END;
$$;

-- Signals exist only for a matching first accepted running-turn cancellation.
DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_signals (
			id, turn_run_id, session_id, user_id, reason, source
		) VALUES (
			'e4000000-0000-4000-8000-000000000002',
			'e3000000-0000-4000-8000-000000000002',
			'e2000000-0000-4000-8000-000000000002',
			'e1000000-0000-4000-8000-000000000002',
			'timeout',
			'worker'
		);
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_signal_without_matching_cancel_request';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'signal without an accepted cancel was accepted');
END;
$$;

UPDATE public.chat_turn_runs
SET
	cancel_requested_at = clock_timestamp(),
	cancel_reason = 'user_cancelled'
WHERE id = 'e3000000-0000-4000-8000-000000000001';

INSERT INTO public.chat_turn_signals (
	id,
	turn_run_id,
	session_id,
	user_id,
	reason,
	source
)
VALUES (
	'e4000000-0000-4000-8000-000000000001',
	'e3000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'user_cancelled',
	'browser'
);

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT signal_version = 'agentic_chat_signal_v1'
				AND kind = 'cancel'
				AND consumed_at IS NULL
				AND consumed_by_generation IS NULL
			FROM public.chat_turn_signals
			WHERE id = 'e4000000-0000-4000-8000-000000000001'
		),
		'signal defaults are incorrect'
	);

	BEGIN
		INSERT INTO public.chat_turn_signals (
			id, turn_run_id, session_id, user_id, reason, source
		) VALUES (
			'e4000000-0000-4000-8000-000000000099',
			'e3000000-0000-4000-8000-000000000001',
			'e2000000-0000-4000-8000-000000000001',
			'e1000000-0000-4000-8000-000000000001',
			'user_cancelled',
			'browser'
		);
	EXCEPTION
		WHEN unique_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'second cancel signal for one turn was accepted');

	v_rejected := false;
	BEGIN
		UPDATE public.chat_turn_signals
		SET reason = 'superseded'
		WHERE id = 'e4000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_signal_content_is_immutable';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'signal content mutation was accepted');

	v_rejected := false;
	BEGIN
		UPDATE public.chat_turn_signals
		SET consumed_at = clock_timestamp()
		WHERE id = 'e4000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_signal_consumption_must_be_atomic';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'partial signal consumption was accepted');

	v_rejected := false;
	BEGIN
		UPDATE public.chat_turn_signals
		SET
			consumed_at = clock_timestamp(),
			consumed_by_generation = 1
		WHERE id = 'e4000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_signal_stale_generation';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'stale generation consumed a signal');

	UPDATE public.chat_turn_signals
	SET
		consumed_at = clock_timestamp(),
		consumed_by_generation = 2
	WHERE id = 'e4000000-0000-4000-8000-000000000001';

	v_rejected := false;
	BEGIN
		UPDATE public.chat_turn_signals
		SET consumed_at = consumed_at + interval '1 second'
		WHERE id = 'e4000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_signal_consumption_is_immutable';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'signal consumption acknowledgement was rewritten');
END;
$$;

-- New worker-owned tables are server-only from their first migration.
DO $$
DECLARE
	v_stream_fn regprocedure := to_regprocedure(
		'public.validate_agentic_chat_stream_state_write()'
	);
	v_signal_fn regprocedure := to_regprocedure(
		'public.validate_agentic_chat_signal_write()'
	);
	v_retention_fn regprocedure := to_regprocedure(
		'public.enforce_agentic_chat_control_row_retention()'
	);
BEGIN
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('anon', 'public.chat_turn_stream_state', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_stream_state', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_stream_state', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_stream_state', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_stream_state', 'DELETE')
		AND NOT has_table_privilege('anon', 'public.chat_turn_signals', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_signals', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_signals', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_signals', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_signals', 'DELETE'),
		'client role can access stream/signal control tables'
	);
	PERFORM pg_temp.assert_true(
		has_table_privilege('service_role', 'public.chat_turn_stream_state', 'SELECT')
		AND has_table_privilege('service_role', 'public.chat_turn_stream_state', 'INSERT')
		AND has_table_privilege('service_role', 'public.chat_turn_stream_state', 'UPDATE')
		AND has_table_privilege('service_role', 'public.chat_turn_stream_state', 'DELETE')
		AND has_table_privilege('service_role', 'public.chat_turn_signals', 'SELECT')
		AND has_table_privilege('service_role', 'public.chat_turn_signals', 'INSERT')
		AND has_table_privilege('service_role', 'public.chat_turn_signals', 'UPDATE')
		AND has_table_privilege('service_role', 'public.chat_turn_signals', 'DELETE'),
		'service-role stream/signal privileges are incomplete'
	);
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_stream_fn, 'EXECUTE')
		AND NOT has_function_privilege('authenticated', v_stream_fn, 'EXECUTE')
		AND NOT has_function_privilege('anon', v_signal_fn, 'EXECUTE')
		AND NOT has_function_privilege('authenticated', v_signal_fn, 'EXECUTE')
		AND NOT has_function_privilege('anon', v_retention_fn, 'EXECUTE')
		AND NOT has_function_privilege('authenticated', v_retention_fn, 'EXECUTE'),
		'client role can execute stream/signal trigger functions'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM pg_policies
			WHERE schemaname = 'public'
				AND tablename IN ('chat_turn_stream_state', 'chat_turn_signals')
				AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles))
		),
		'client stream/signal policy exists'
	);
END;
$$;

-- Active rows cannot be deleted. Terminal rows remain for seven full days.
DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	BEGIN
		DELETE FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_active_control_row_cannot_be_deleted';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'active stream state was deleted');

	v_rejected := false;
	BEGIN
		DELETE FROM public.chat_turn_signals
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_active_control_row_cannot_be_deleted';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'active signal was deleted');

	UPDATE public.chat_turn_runs
	SET
		status = 'cancelled',
		finished_at = clock_timestamp(),
		terminalized_at = clock_timestamp()
	WHERE id = 'e3000000-0000-4000-8000-000000000001';

	v_rejected := false;
	BEGIN
		DELETE FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_control_row_retention_not_elapsed';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'recent terminal stream state was deleted');

	v_rejected := false;
	BEGIN
		DELETE FROM public.chat_turn_signals
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			v_rejected := SQLERRM = 'agentic_chat_control_row_retention_not_elapsed';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'recent terminal signal was deleted');

	UPDATE public.chat_turn_runs
	SET
		finished_at = clock_timestamp() - interval '8 days',
		terminalized_at = clock_timestamp() - interval '8 days'
	WHERE id = 'e3000000-0000-4000-8000-000000000001';

	v_rejected := false;
	BEGIN
		DELETE FROM public.chat_turn_runs
		WHERE id = 'e3000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN foreign_key_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(
		v_rejected,
		'parent deletion bypassed explicit control-row retention cleanup'
	);

	DELETE FROM public.chat_turn_signals
	WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';
	DELETE FROM public.chat_turn_stream_state
	WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001';

	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.chat_turn_signals
			WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
		) AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
		),
		'expired terminal control rows were not deleted'
	);
END;
$$;

-- Exercise the exact additive-schema rollback while worker routing is disabled.
DROP TABLE public.chat_turn_signals;
DROP TABLE public.chat_turn_stream_state;
DROP FUNCTION public.validate_agentic_chat_signal_write();
DROP FUNCTION public.validate_agentic_chat_stream_state_write();
DROP FUNCTION public.enforce_agentic_chat_control_row_retention();

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		to_regclass('public.chat_turn_stream_state') IS NULL
		AND to_regclass('public.chat_turn_signals') IS NULL,
		'stream/signal rollback left a control table behind'
	);
	PERFORM pg_temp.assert_true(
		to_regprocedure('public.validate_agentic_chat_signal_write()') IS NULL
		AND to_regprocedure('public.validate_agentic_chat_stream_state_write()') IS NULL
		AND to_regprocedure('public.enforce_agentic_chat_control_row_retention()') IS NULL,
		'stream/signal rollback left a trigger function behind'
	);
	PERFORM pg_temp.assert_true(
		to_regclass('public.chat_turn_runs') IS NOT NULL
		AND to_regclass('public.chat_turn_input_artifacts') IS NOT NULL,
		'stream/signal rollback damaged the earlier Phase 2A foundation'
	);
END;
$$;

SELECT 'phase2a_stream_signal_foundation_ok' AS result;
