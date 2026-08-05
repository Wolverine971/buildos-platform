-- supabase/tests/20260804037000_agentic_chat_worker_lifecycle_observations.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 12.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

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

SELECT pg_temp.assert_true(
	has_table_privilege(
		'service_role',
		'public.agentic_chat_worker_lifecycle_observations',
		'SELECT'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.agentic_chat_worker_lifecycle_observations',
		'SELECT'
	)
	AND NOT has_table_privilege(
		'anon',
		'public.agentic_chat_worker_lifecycle_observations',
		'SELECT'
	),
	'lifecycle projection grants are not service-only'
);

-- A completed bounded read turn owns all ten lifecycle meanings, but none is
-- persisted as an extra public reconnect event.
SELECT pg_temp.seed_timing_turn(
	'fe300000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	'fe600000-0000-4000-8000-000000000001',
	'fe700000-0000-4000-8000-000000000001',
	'lifecycle-read', 1, false, false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_semantic_event(
	'fe300000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	1,
	'fe800000-0000-5000-8000-000000000001',
	'fixture answer',
	'stream',
	'agent_state',
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"agent_state","state":"thinking","details":"Planning the first step..."}'::jsonb
);
SELECT public.persist_agentic_chat_semantic_event(
	'fe300000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	1,
	'fe800000-0000-5000-8000-000000000002',
	'fixture answer',
	'tool',
	'tool_call',
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"tool_call","tool_call_id":"read-1","tool_name":"get_project_overview","arguments":{}}'::jsonb
);
SELECT public.persist_agentic_chat_semantic_event(
	'fe300000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	1,
	'fe800000-0000-5000-8000-000000000003',
	'fixture answer',
	'tool',
	'tool_result',
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"tool_result","tool_call_id":"read-1","tool_name":"get_project_overview","result":{"summary":"ready"}}'::jsonb
);
SELECT public.persist_agentic_chat_semantic_event(
	'fe300000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	1,
	'fe800000-0000-5000-8000-000000000004',
	'fixture answer',
	'stream',
	'turn_phase',
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"turn_phase","turn_phase":"finalizing","message":"Finalizing the response..."}'::jsonb
);
RESET ROLE;

INSERT INTO public.chat_prompt_snapshots (
	id, turn_run_id, session_id, user_id, snapshot_version, prompt_variant,
	system_prompt, model_messages, system_prompt_sha256, messages_sha256,
	system_prompt_chars, message_chars, approx_prompt_tokens
) VALUES (
	'fe900000-0000-5000-8000-000000000001',
	'fe300000-0000-4000-8000-000000000001',
	'fe300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'agentic_chat_worker_prompt_v1',
	'fastchat_lite_v1',
	'Fixture only',
	'[{"role":"system","content":"Fixture only"}]'::jsonb,
	repeat('a', 64),
	repeat('b', 64),
	12,
	12,
	3
);
UPDATE public.chat_turn_runs
SET prompt_snapshot_id = 'fe900000-0000-5000-8000-000000000001'
WHERE id = 'fe300000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'fe300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000001',
	'fe500000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'fea00000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model"}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"completed","finished_reason":"stop","usage":{"total_tokens":16}}'::jsonb
);
RESET ROLE;

CREATE TEMP TABLE lifecycle_public_event_counts AS
SELECT count(*) AS event_count
FROM public.chat_turn_events
WHERE turn_run_id = 'fe300000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY observation_sequence_index) = ARRAY[
			'turn_intent_resolved',
			'prepared_prompt_cache_checked',
			'tool_call_emitted',
			'first_tool_call_planning_cue_emitted',
			'tool_result_received',
			'turn_phase_changed',
			'turn_outcome_resolved',
			'orchestration_interventions',
			'done_emitted',
			'prompt_snapshot_created'
		]::text[]
		FROM public.agentic_chat_worker_lifecycle_observations
		WHERE turn_run_id = 'fe300000-0000-4000-8000-000000000001'
	),
	'completed one-read lifecycle projection does not match the pinned golden order'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = (SELECT event_count FROM lifecycle_public_event_counts)
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fe300000-0000-4000-8000-000000000001'
	),
	'reading the private lifecycle projection mutated the public reconnect stream'
);

-- Failed provider turns deliberately omit success-only outcome/intervention
-- observations while retaining admission, terminal, and snapshot evidence.
SELECT pg_temp.seed_timing_turn(
	'fe300000-0000-4000-8000-000000000002',
	'fe400000-0000-4000-8000-000000000002',
	'fe500000-0000-4000-8000-000000000002',
	'fe600000-0000-4000-8000-000000000002',
	'fe700000-0000-4000-8000-000000000002',
	'lifecycle-failed', 1, false, false
);

INSERT INTO public.chat_prompt_snapshots (
	id, turn_run_id, session_id, user_id, snapshot_version, prompt_variant,
	system_prompt, model_messages, system_prompt_sha256, messages_sha256,
	system_prompt_chars, message_chars, approx_prompt_tokens
) VALUES (
	'fe900000-0000-5000-8000-000000000002',
	'fe300000-0000-4000-8000-000000000002',
	'fe300000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'agentic_chat_worker_prompt_v1',
	'fastchat_lite_v1',
	'Fixture only',
	'[{"role":"system","content":"Fixture only"}]'::jsonb,
	repeat('c', 64),
	repeat('d', 64),
	12,
	12,
	3
);
UPDATE public.chat_turn_runs
SET prompt_snapshot_id = 'fe900000-0000-5000-8000-000000000002'
WHERE id = 'fe300000-0000-4000-8000-000000000002';

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'fe300000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'fe400000-0000-4000-8000-000000000002',
	'fe500000-0000-4000-8000-000000000002',
	1,
	'failed',
	'provider_error',
	'provider_request_failed',
	NULL,
	'fixture answer',
	'{"completion_status":"failed"}'::jsonb,
	NULL,
	NULL,
	0,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"failed","finished_reason":"provider_error","failure_code":"provider_request_failed","usage":{"total_tokens":0}}'::jsonb
);
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY observation_sequence_index) = ARRAY[
			'turn_intent_resolved',
			'prepared_prompt_cache_checked',
			'done_emitted',
			'prompt_snapshot_created'
		]::text[]
		FROM public.agentic_chat_worker_lifecycle_observations
		WHERE turn_run_id = 'fe300000-0000-4000-8000-000000000002'
	),
	'failed-provider lifecycle projection added success-only observations'
);
RESET ROLE;

SELECT 'phase4_slice12_worker_lifecycle_observations_ok' AS result;
