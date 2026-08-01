-- Disposable PostgreSQL verification for Agentic Chat Phase 2A Slice 1.
-- Prerequisite: apply 20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql.
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

INSERT INTO public.users (id)
VALUES
	('a1000000-0000-4000-8000-000000000001'),
	('a1000000-0000-4000-8000-000000000002');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	(
		'a2000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'global',
		'active'
	),
	(
		'a2000000-0000-4000-8000-000000000002',
		'a1000000-0000-4000-8000-000000000002',
		'global',
		'active'
	);

INSERT INTO public.agentic_chat_prepared_prompts (
	id,
	user_id,
	session_id,
	context_type
)
VALUES (
	'a3000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001',
	'a2000000-0000-4000-8000-000000000001',
	'global'
);

-- Old legacy inserts remain valid and receive compatible defaults.
INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	client_turn_id,
	context_type,
	request_message,
	status
)
VALUES
	(
		'a4000000-0000-4000-8000-000000000001',
		'a2000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'phase2a-stream-1',
		'a6000000-0000-4000-8000-000000000001',
		'global',
		'Legacy-compatible request',
		'running'
	),
	(
		'a4000000-0000-4000-8000-000000000002',
		'a2000000-0000-4000-8000-000000000002',
		'a1000000-0000-4000-8000-000000000002',
		'phase2a-stream-2',
		'a6000000-0000-4000-8000-000000000002',
		'global',
		'Oversize artifact fixture',
		'running'
	);

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT request_payload = '{}'::jsonb
				AND request_payload_version = 'legacy_v1'
				AND correlation_id IS NOT NULL
				AND execution_mode = 'legacy_sse'
				AND execution_generation = 0
				AND last_event_sequence = 0
			FROM public.chat_turn_runs
			WHERE id = 'a4000000-0000-4000-8000-000000000001'
		),
		'legacy insert did not receive Phase 2A-compatible defaults'
	);
END;
$$;

INSERT INTO public.chat_turn_input_artifacts (
	id,
	turn_run_id,
	session_id,
	user_id,
	source_prepared_prompt_id,
	artifact_version,
	history_source,
	history,
	prepared,
	content_hash,
	history_bytes,
	content_bytes
)
VALUES (
	'a5000000-0000-4000-8000-000000000001',
	'a4000000-0000-4000-8000-000000000001',
	'a2000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001',
	'a3000000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2',
	'admission_window',
	'[{"sourceMessageId":null,"role":"user","content":"prior","attachments":[],"toolCalls":[],"toolCallId":null}]'::jsonb,
	'{"sourcePreparedPromptId":"a3000000-0000-4000-8000-000000000001","contextPayload":{},"conversationSummary":null,"surfaceProfile":"lite","systemPrompt":"system","promptSections":[],"toolSurface":{}}'::jsonb,
	repeat('a', 64),
	128,
	512
);

UPDATE public.chat_turn_runs
SET
	input_artifact_id = 'a5000000-0000-4000-8000-000000000001',
	history_cutoff_at = clock_timestamp(),
	history_message_ids = ARRAY[]::uuid[],
	stale_context_policy = 'fail_after_max_queue_residence'
WHERE id = 'a4000000-0000-4000-8000-000000000001';

DO $$
DECLARE
	rejected boolean := false;
BEGIN
	BEGIN
		UPDATE public.chat_turn_input_artifacts
		SET content_hash = repeat('b', 64)
		WHERE id = 'a5000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			rejected := SQLERRM = 'agentic_chat_input_artifact_is_immutable';
	END;
	PERFORM pg_temp.assert_true(rejected, 'input artifact update was not rejected');

	rejected := false;
	BEGIN
		UPDATE public.chat_turn_runs
		SET execution_mode = 'worker_realtime'
		WHERE id = 'a4000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			rejected := SQLERRM = 'agentic_chat_execution_mode_is_immutable';
	END;
	PERFORM pg_temp.assert_true(rejected, 'execution mode update was not rejected');

	rejected := false;
	BEGIN
		DELETE FROM public.chat_turn_input_artifacts
		WHERE id = 'a5000000-0000-4000-8000-000000000001';
	EXCEPTION
		WHEN OTHERS THEN
			rejected := SQLERRM = 'agentic_chat_active_input_artifact_cannot_be_deleted';
	END;
	PERFORM pg_temp.assert_true(rejected, 'active input artifact delete was not rejected');
END;
$$;

-- Relationship scope is enforced by the database, not just by worker code.
DO $$
DECLARE rejected boolean := false;
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_input_artifacts (
			id, turn_run_id, session_id, user_id, artifact_version, history_source,
			history, prepared, content_hash, history_bytes, content_bytes
		) VALUES (
			'a5000000-0000-4000-8000-000000000099',
			'a4000000-0000-4000-8000-000000000002',
			'a2000000-0000-4000-8000-000000000001',
			'a1000000-0000-4000-8000-000000000001',
			'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb,
			repeat('b', 64), 2, 128
		);
	EXCEPTION
		WHEN foreign_key_violation THEN rejected := true;
	END;
	PERFORM pg_temp.assert_true(rejected, 'cross-turn artifact scope was accepted');
END;
$$;

-- The locked 256 KiB history cap is enforced before worker execution exists.
DO $$
DECLARE rejected boolean := false;
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_input_artifacts (
			id, turn_run_id, session_id, user_id, artifact_version, history_source,
			history, prepared, content_hash, history_bytes, content_bytes
		) VALUES (
			'a5000000-0000-4000-8000-000000000002',
			'a4000000-0000-4000-8000-000000000002',
			'a2000000-0000-4000-8000-000000000002',
			'a1000000-0000-4000-8000-000000000002',
			'agentic_chat_input_v2', 'admission_window',
			jsonb_build_array(jsonb_build_object('content', repeat('x', 262145))),
			'{}'::jsonb, repeat('c', 64), 300000, 300000
		);
	EXCEPTION
		WHEN check_violation THEN rejected := true;
	END;
	PERFORM pg_temp.assert_true(rejected, 'oversize history artifact was accepted');
END;
$$;

-- Terminal retention cleanup may remove the artifact and clears the turn link.
UPDATE public.chat_turn_runs
SET status = 'completed', finished_at = clock_timestamp()
WHERE id = 'a4000000-0000-4000-8000-000000000001';

DELETE FROM public.chat_turn_input_artifacts
WHERE id = 'a5000000-0000-4000-8000-000000000001';

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(SELECT input_artifact_id IS NULL FROM public.chat_turn_runs
		 WHERE id = 'a4000000-0000-4000-8000-000000000001'),
		'terminal artifact deletion did not clear the turn link'
	);
END;
$$;

-- Privilege/policy receipts for the Phase 2A trust boundary.
DO $$
DECLARE cleanup_fn regprocedure := to_regprocedure(
	'public.cleanup_expired_agentic_chat_prepared_prompts()'
);
BEGIN
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('anon', 'public.chat_turn_input_artifacts', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_input_artifacts', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_input_artifacts', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_input_artifacts', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_input_artifacts', 'DELETE'),
		'client role can access input artifacts'
	);
	PERFORM pg_temp.assert_true(
		has_table_privilege('service_role', 'public.chat_turn_input_artifacts', 'SELECT')
		AND has_table_privilege('service_role', 'public.chat_turn_input_artifacts', 'INSERT')
		AND NOT has_table_privilege('service_role', 'public.chat_turn_input_artifacts', 'UPDATE')
		AND has_table_privilege('service_role', 'public.chat_turn_input_artifacts', 'DELETE'),
		'service role artifact privileges are not least-privilege'
	);
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('authenticated', 'public.agentic_chat_prepared_prompts', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.agentic_chat_prepared_prompts', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.agentic_chat_prepared_prompts', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.agentic_chat_prepared_prompts', 'DELETE'),
		'authenticated role retains prepared-prompt content access'
	);
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', cleanup_fn, 'EXECUTE')
		AND NOT has_function_privilege('authenticated', cleanup_fn, 'EXECUTE')
		AND has_function_privilege('service_role', cleanup_fn, 'EXECUTE'),
		'prepared-prompt cleanup execution boundary is incorrect'
	);
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('authenticated', 'public.chat_turn_runs', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_runs', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_events', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_checkpoints', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.chat_turn_checkpoints', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.chat_prompt_snapshots', 'INSERT'),
		'authenticated legacy direct-write grants remain'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM pg_policies
			WHERE schemaname = 'public'
				AND tablename IN (
					'agentic_chat_prepared_prompts',
					'chat_turn_input_artifacts'
				)
				AND 'authenticated' = ANY(roles)
		),
		'authenticated prepared/input-artifact policy remains'
	);
END;
$$;

SELECT 'phase2a_trust_foundation_ok' AS result;
