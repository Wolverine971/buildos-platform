-- supabase/tests/20260801030000_agentic_chat_worker_active_status_index.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2A Slice 3.
-- Prerequisite: apply 20260801030000 through 20260801030400 in order.
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
DECLARE
	v_status_definition text;
BEGIN
	SELECT pg_get_constraintdef(constraints.oid)
	INTO v_status_definition
	FROM pg_constraint constraints
	WHERE constraints.conrelid = 'public.chat_turn_runs'::regclass
		AND constraints.conname = 'chk_chat_turn_runs_status';

	PERFORM pg_temp.assert_true(
		v_status_definition LIKE '%queued%'
		AND v_status_definition LIKE '%running%'
		AND v_status_definition LIKE '%completed%'
		AND v_status_definition LIKE '%failed%'
		AND v_status_definition LIKE '%cancelled%',
		'expanded chat-turn status constraint is absent'
	);
	PERFORM pg_temp.assert_true(
		to_regclass('public.uq_chat_turn_runs_one_active_per_session') IS NOT NULL,
		'queued/running active-turn index is absent'
	);
	PERFORM pg_temp.assert_true(
		to_regclass('public.uq_chat_turn_runs_one_running_per_session') IS NULL,
		'running-only active-turn index still exists'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT indexes.indisvalid AND indexes.indisunique
			FROM pg_index indexes
			WHERE indexes.indexrelid =
				'public.uq_chat_turn_runs_one_active_per_session'::regclass
		),
		'queued/running active-turn index is not valid and unique'
	);
END;
$$;

INSERT INTO public.users (id)
VALUES
	('c1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000002');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	(
		'c2000000-0000-4000-8000-000000000001',
		'c1000000-0000-4000-8000-000000000001',
		'global',
		'active'
	),
	(
		'c2000000-0000-4000-8000-000000000002',
		'c1000000-0000-4000-8000-000000000002',
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
	execution_mode
)
VALUES (
	'c3000000-0000-4000-8000-000000000001',
	'c2000000-0000-4000-8000-000000000001',
	'c1000000-0000-4000-8000-000000000001',
	'phase2a-active-index-queued',
	'global',
	'Queued worker fixture',
	'queued',
	'worker_realtime'
);

DO $$
DECLARE
	v_rejected boolean := false;
	v_constraint_name text;
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_runs (
			id, session_id, user_id, stream_run_id, context_type,
			request_message, status
		) VALUES (
			'c3000000-0000-4000-8000-000000000002',
			'c2000000-0000-4000-8000-000000000001',
			'c1000000-0000-4000-8000-000000000001',
			'phase2a-active-index-running-conflict',
			'global',
			'Conflicting legacy turn',
			'running'
		);
	EXCEPTION
		WHEN unique_violation THEN
			GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
			v_rejected :=
				v_constraint_name = 'uq_chat_turn_runs_one_active_per_session';
	END;
	PERFORM pg_temp.assert_true(
		v_rejected,
		'queued/running conflict was not rejected by the replacement index'
	);
END;
$$;

-- Terminal rows do not consume the active-session slot.
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, context_type,
	request_message, status
)
VALUES (
	'c3000000-0000-4000-8000-000000000003',
	'c2000000-0000-4000-8000-000000000001',
	'c1000000-0000-4000-8000-000000000001',
	'phase2a-active-index-completed',
	'global',
	'Terminal fixture',
	'completed'
);

-- The legacy writer still omits every worker-only command field and receives
-- the Phase 2A compatibility defaults.
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, context_type,
	request_message, status
)
VALUES (
	'c3000000-0000-4000-8000-000000000004',
	'c2000000-0000-4000-8000-000000000002',
	'c1000000-0000-4000-8000-000000000002',
	'phase2a-active-index-legacy',
	'global',
	'Legacy-compatible fixture',
	'running'
);

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT execution_mode = 'legacy_sse'
				AND request_payload = '{}'::jsonb
				AND request_payload_version = 'legacy_v1'
				AND execution_generation = 0
			FROM public.chat_turn_runs
			WHERE id = 'c3000000-0000-4000-8000-000000000004'
		),
		'legacy insert lost Phase 2A compatibility defaults'
	);

	BEGIN
		INSERT INTO public.chat_turn_runs (
			id, session_id, user_id, stream_run_id, context_type,
			request_message, status
		) VALUES (
			'c3000000-0000-4000-8000-000000000005',
			'c2000000-0000-4000-8000-000000000002',
			'c1000000-0000-4000-8000-000000000002',
			'phase2a-active-index-unsupported',
			'global',
			'Unsupported status fixture',
			'waiting'
		);
	EXCEPTION
		WHEN check_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'unsupported turn status was accepted');
END;
$$;

-- Exercise the documented rollback while no queued worker can execute.
UPDATE public.chat_turn_runs
SET
	status = 'cancelled',
	finished_reason = 'phase2a_rollback_fixture',
	finished_at = clock_timestamp()
WHERE status = 'queued';

CREATE UNIQUE INDEX uq_chat_turn_runs_one_running_per_session
	ON public.chat_turn_runs (session_id)
	WHERE status = 'running';

DROP INDEX public.uq_chat_turn_runs_one_active_per_session;

ALTER TABLE public.chat_turn_runs
	ADD CONSTRAINT chk_chat_turn_runs_status_legacy
	CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
	NOT VALID;

ALTER TABLE public.chat_turn_runs
	VALIDATE CONSTRAINT chk_chat_turn_runs_status_legacy;

ALTER TABLE public.chat_turn_runs
	DROP CONSTRAINT chk_chat_turn_runs_status;

ALTER TABLE public.chat_turn_runs
	RENAME CONSTRAINT chk_chat_turn_runs_status_legacy TO chk_chat_turn_runs_status;

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	PERFORM pg_temp.assert_true(
		to_regclass('public.uq_chat_turn_runs_one_running_per_session') IS NOT NULL
		AND to_regclass('public.uq_chat_turn_runs_one_active_per_session') IS NULL,
		'active-index rollback did not restore the running-only guard'
	);

	BEGIN
		INSERT INTO public.chat_turn_runs (
			id, session_id, user_id, stream_run_id, context_type,
			request_message, status
		) VALUES (
			'c3000000-0000-4000-8000-000000000006',
			'c2000000-0000-4000-8000-000000000001',
			'c1000000-0000-4000-8000-000000000001',
			'phase2a-active-index-rollback-queued',
			'global',
			'Rollback queued fixture',
			'queued'
		);
	EXCEPTION
		WHEN check_violation THEN v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'rollback status check still accepts queued');
END;
$$;

SELECT 'phase2a_active_status_index_ok' AS result;
