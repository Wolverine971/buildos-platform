-- supabase/tests/20260813060000_agentic_chat_terminal_pending_intent_metadata.test.sql
-- Disposable PostgreSQL verification for P5 S3 terminal pending-intent metadata.
-- Requires the composed Phase 2C fixture and pg_temp.seed_timing_turn helper.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_turn_intent_artifact(
	p_turn_run_id uuid,
	p_artifact_id uuid,
	p_intent jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
		artifact_version, history_source, history, prepared, content_hash,
		history_bytes, content_bytes, created_at, retain_until
	) VALUES (
		p_artifact_id,
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		NULL,
		'agentic_chat_input_v2',
		'admission_window',
		'[]'::jsonb,
		jsonb_build_object(
			'sourcePreparedPromptId', NULL,
			'contextPayload', '{}'::jsonb,
			'conversationSummary', NULL,
			'surfaceProfile', 'fixture',
			'systemPrompt', 'fixture',
			'promptSections', '[]'::jsonb,
			'toolSurface', '{}'::jsonb,
			'sessionSnapshot', jsonb_build_object(
				'summary', NULL,
				'agent_metadata', '{}'::jsonb
			),
			'contextUsageSnapshot', jsonb_build_object(
				'estimatedTokens', 10,
				'tokenBudget', 1000,
				'usagePercent', 1,
				'tokensRemaining', 990,
				'status', 'ok'
			),
			'turnIntent', p_intent
		),
		repeat('a', 64),
		2,
		1024,
		clock_timestamp(),
		clock_timestamp() + interval '7 days 1 minute'
	);

	UPDATE public.chat_turn_runs
	SET input_artifact_id = p_artifact_id
	WHERE id = p_turn_run_id;
END;
$$;

SELECT pg_temp.assert_true(
	public.agentic_chat_expected_write_tool_names_v1(
		'{
			"requiresWrite":true,
			"action":"update",
			"entityKind":"task",
			"operations":[
				{"action":"update","entityKind":"task"},
				{"action":"create","entityKind":"document"},
				{"action":"update","entityKind":"task"}
			]
		}'::jsonb
	) = '["update_onto_task","create_onto_document"]'::jsonb,
	'database derivation preserves ordered unique legacy write-tool expectations'
);

-- An unfulfilled write stores one legacy-shaped pending intent atomically.
SELECT pg_temp.seed_timing_turn(
	'c1310000-0000-4000-8000-000000000001',
	'c1410000-0000-4000-8000-000000000001',
	'c1510000-0000-4000-8000-000000000001',
	'c1610000-0000-4000-8000-000000000001',
	'c1710000-0000-4000-8000-000000000001',
	'pending-intent-unfulfilled',
	1,
	false,
	false
);
UPDATE public.chat_turn_runs
SET context_type = 'project',
	project_id = 'c1010000-0000-4000-8000-000000000001'
WHERE id = 'c1310000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_turn_intent_artifact(
	'c1310000-0000-4000-8000-000000000001',
	'c1810000-0000-4000-8000-000000000001',
	'{
		"version":1,
		"requiresWrite":true,
		"action":"create",
		"entityKind":"document",
		"operations":[{"action":"create","entityKind":"document"}],
		"source":"current_message",
		"originalRequestText":"Create a handoff document.",
		"originatingTurnRunId":null,
		"clearPending":false,
		"expectedWriteToolNames":["create_onto_document"]
	}'::jsonb
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c1310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c1410000-0000-4000-8000-000000000001',
	'c1510000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'c1910000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_intent' @> '{
			"version":1,
			"requiresWrite":true,
			"action":"create",
			"entityKind":"document",
			"operations":[{"action":"create","entityKind":"document"}],
			"status":"pending",
			"contextType":"project",
			"projectId":"c1010000-0000-4000-8000-000000000001",
			"originalRequestText":"Create a handoff document.",
			"originatingTurnRunId":"c1310000-0000-4000-8000-000000000001",
			"lastFinishedReason":"stop"
		}'::jsonb
		AND (agent_metadata->'fastchat_pending_turn_intent'->>'expiresAt')::timestamptz
			- (agent_metadata->'fastchat_pending_turn_intent'->>'updatedAt')::timestamptz
			= interval '24 hours'
		FROM public.chat_sessions
		WHERE id = 'c1310000-0000-4000-8000-000000000001'
	),
	'unfulfilled durable outcome stores the exact bounded pending continuation'
);

-- A successful durable write fulfills the same immutable intent and clears it.
SELECT pg_temp.seed_timing_turn(
	'c1320000-0000-4000-8000-000000000001',
	'c1420000-0000-4000-8000-000000000001',
	'c1520000-0000-4000-8000-000000000001',
	'c1620000-0000-4000-8000-000000000001',
	'c1720000-0000-4000-8000-000000000001',
	'pending-intent-fulfilled',
	1,
	false,
	false
);
SELECT pg_temp.seed_turn_intent_artifact(
	'c1320000-0000-4000-8000-000000000001',
	'c1820000-0000-4000-8000-000000000001',
	'{
		"version":1,
		"requiresWrite":true,
		"action":"update",
		"entityKind":"task",
		"operations":[{"action":"update","entityKind":"task"}],
		"source":"current_message",
		"originalRequestText":"Mark the task done.",
		"originatingTurnRunId":null,
		"clearPending":false,
		"expectedWriteToolNames":["update_onto_task"]
	}'::jsonb
);
INSERT INTO public.chat_tool_executions (
	id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
	provider_tool_call_id, tool_name, tool_category, gateway_op, help_path,
	sequence_index, arguments, result, result_count, zero_result,
	execution_time_ms, tokens_consumed, success, error_message,
	requires_user_action, affected_entities, effect_id, created_at
) VALUES (
	'c1a20000-0000-5000-8000-000000000001',
	'c1320000-0000-4000-8000-000000000001',
	NULL,
	'c1320000-0000-4000-8000-000000000001',
	'terminal-timing-stream-pending-intent-fulfilled',
	'terminal-timing-client-pending-intent-fulfilled',
	'pending-intent-write-1',
	'update_onto_task',
	'write',
	'onto.task.update',
	NULL,
	1,
	'{}'::jsonb,
	'{"ok":true}'::jsonb,
	NULL,
	NULL,
	5,
	NULL,
	true,
	NULL,
	false,
	'[]'::jsonb,
	NULL,
	clock_timestamp()
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c1320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c1420000-0000-4000-8000-000000000001',
	'c1520000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'c1920000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":1}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_intent' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'c1320000-0000-4000-8000-000000000001'
	),
	'a successful durable expected write clears pending intent in the terminal transaction'
);

-- A structured abandon/clear turn clears prior session state without a write.
SELECT pg_temp.seed_timing_turn(
	'c1330000-0000-4000-8000-000000000001',
	'c1430000-0000-4000-8000-000000000001',
	'c1530000-0000-4000-8000-000000000001',
	'c1630000-0000-4000-8000-000000000001',
	'c1730000-0000-4000-8000-000000000001',
	'pending-intent-clear',
	1,
	false,
	false
);
UPDATE public.chat_sessions
SET agent_metadata = '{"keep":{"nested":true},"fastchat_pending_turn_intent":{"status":"pending"}}'::jsonb
WHERE id = 'c1330000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_turn_intent_artifact(
	'c1330000-0000-4000-8000-000000000001',
	'c1830000-0000-4000-8000-000000000001',
	'{
		"version":1,
		"requiresWrite":false,
		"action":null,
		"entityKind":"unknown",
		"operations":[],
		"source":"none",
		"originalRequestText":null,
		"originatingTurnRunId":null,
		"clearPending":true,
		"expectedWriteToolNames":[]
	}'::jsonb
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c1330000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c1430000-0000-4000-8000-000000000001',
	'c1530000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'c1930000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_intent' = 'null'::jsonb
			AND agent_metadata->'keep' = '{"nested":true}'::jsonb
		FROM public.chat_sessions
		WHERE id = 'c1330000-0000-4000-8000-000000000001'
	),
	'clearPending shallow-merges only the pending key and preserves unrelated session metadata'
);

-- Admission rejects a mismatched expected tool list before the artifact exists.
SELECT pg_temp.seed_timing_turn(
	'c1340000-0000-4000-8000-000000000001',
	'c1440000-0000-4000-8000-000000000001',
	'c1540000-0000-4000-8000-000000000001',
	'c1640000-0000-4000-8000-000000000001',
	'c1740000-0000-4000-8000-000000000001',
	'pending-intent-invalid',
	1,
	false,
	false
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT pg_temp.seed_turn_intent_artifact(
				'c1340000-0000-4000-8000-000000000001',
				'c1840000-0000-4000-8000-000000000001',
				'{
					"version":1,
					"requiresWrite":true,
					"action":"create",
					"entityKind":"document",
					"operations":[{"action":"create","entityKind":"document"}],
					"source":"current_message",
					"originalRequestText":"Create a document.",
					"originatingTurnRunId":null,
					"clearPending":false,
					"expectedWriteToolNames":["update_onto_task"]
				}'::jsonb
			)
		$statement$,
		'agentic_chat_turn_intent_invalid_expected_tools'
	),
	'mismatched derived write-tool expectations fail artifact admission'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.chat_turn_input_artifacts
		WHERE id = 'c1840000-0000-4000-8000-000000000001'
	),
	'invalid structured intent leaves no artifact'
);

-- Rolling artifacts without turnIntent retain their existing terminal behavior.
SELECT pg_temp.seed_timing_turn(
	'c1350000-0000-4000-8000-000000000001',
	'c1450000-0000-4000-8000-000000000001',
	'c1550000-0000-4000-8000-000000000001',
	'c1650000-0000-4000-8000-000000000001',
	'c1750000-0000-4000-8000-000000000001',
	'pending-intent-rolling',
	1,
	false,
	false
);
UPDATE public.chat_sessions
SET agent_metadata = '{"rolling":true}'::jsonb
WHERE id = 'c1350000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c1350000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c1450000-0000-4000-8000-000000000001',
	'c1550000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'c1950000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata = '{"rolling":true}'::jsonb
		FROM public.chat_sessions
		WHERE id = 'c1350000-0000-4000-8000-000000000001'
	),
	'rolling artifacts without structured intent remain unaffected'
);

-- Session-scope corruption aborts the whole terminal statement, including the
-- assistant message and terminal event that precede the AFTER trigger.
SELECT pg_temp.seed_timing_turn(
	'c1360000-0000-4000-8000-000000000001',
	'c1460000-0000-4000-8000-000000000001',
	'c1560000-0000-4000-8000-000000000001',
	'c1660000-0000-4000-8000-000000000001',
	'c1760000-0000-4000-8000-000000000001',
	'pending-intent-atomic-rollback',
	1,
	false,
	false
);
SELECT pg_temp.seed_turn_intent_artifact(
	'c1360000-0000-4000-8000-000000000001',
	'c1860000-0000-4000-8000-000000000001',
	'{
		"version":1,
		"requiresWrite":true,
		"action":"create",
		"entityKind":"document",
		"operations":[{"action":"create","entityKind":"document"}],
		"source":"current_message",
		"originalRequestText":"Create a document.",
		"originatingTurnRunId":null,
		"clearPending":false,
		"expectedWriteToolNames":["create_onto_document"]
	}'::jsonb
);
INSERT INTO public.users (id)
VALUES ('fa200000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
UPDATE public.chat_sessions
SET user_id = 'fa200000-0000-4000-8000-000000000001'
WHERE id = 'c1360000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.finalize_agentic_chat_turn(
				'c1360000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'c1460000-0000-4000-8000-000000000001',
				'c1560000-0000-4000-8000-000000000001',
				1,
				'completed',
				'stop',
				NULL,
				'c1960000-0000-4000-8000-000000000001',
				'fixture answer',
				'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
				10,
				6,
				16,
				'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
				'{"type":"done","finished_reason":"stop"}'::jsonb
			)
		$statement$,
		'agentic_chat_terminal_session_metadata_scope_mismatch'
	),
	'session ownership corruption rejects terminal metadata coupling'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND assistant_message_id IS NULL
		FROM public.chat_turn_runs
		WHERE id = 'c1360000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_messages
		WHERE id = 'c1960000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_events
		WHERE turn_run_id = 'c1360000-0000-4000-8000-000000000001'
			AND event_type = 'done'
	),
	'session metadata failure rolls back message, event, and terminal turn truth'
);

SELECT pg_temp.assert_true(
	has_function_privilege('service_role',
		'public.agentic_chat_expected_write_tool_names_v1(jsonb)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated',
		'public.agentic_chat_expected_write_tool_names_v1(jsonb)', 'EXECUTE')
	AND NOT has_function_privilege('anon',
		'public.agentic_chat_expected_write_tool_names_v1(jsonb)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated',
		'public.validate_agentic_chat_turn_intent_snapshot_v1()', 'EXECUTE')
	AND NOT has_function_privilege('anon',
		'public.apply_agentic_chat_terminal_pending_intent_v1()', 'EXECUTE'),
	'helper and trigger functions keep the intended service-only/direct-deny boundary'
);

SELECT 'agentic_chat_terminal_pending_intent_metadata_ok' AS result;
