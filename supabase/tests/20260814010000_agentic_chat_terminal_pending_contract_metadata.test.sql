-- supabase/tests/20260814010000_agentic_chat_terminal_pending_contract_metadata.test.sql
-- Disposable PostgreSQL verification for semantic pending-turn contracts.
-- Requires the composed Phase 2C fixture and pg_temp.seed_timing_turn helper.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_contract_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_contract_execution(
	p_turn_run_id uuid,
	p_id uuid,
	p_provider_call_id text,
	p_sequence integer,
	p_tool_name text,
	p_arguments jsonb,
	p_result jsonb,
	p_success boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = p_turn_run_id;
	INSERT INTO public.chat_tool_executions (
		id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
		provider_tool_call_id, tool_name, tool_category, gateway_op, help_path,
		sequence_index, arguments, result, result_count, zero_result,
		execution_time_ms, tokens_consumed, success, error_message,
		requires_user_action, affected_entities, created_at
	) VALUES (
		p_id, v_turn.session_id, NULL, v_turn.id, v_turn.stream_run_id, v_turn.client_turn_id,
		p_provider_call_id, p_tool_name,
		CASE WHEN p_tool_name = 'declare_turn_contract' THEN NULL ELSE 'write' END,
		NULL, NULL, p_sequence, p_arguments, p_result, NULL, NULL,
		1, NULL, p_success, CASE WHEN p_success THEN NULL ELSE 'fixture failure' END,
		false, '[]'::jsonb, clock_timestamp()
	);
END;
$$;

-- One of two required targets remains unfinished and is the only outcome
-- persisted. A tool-name match alone cannot satisfy cardinality or targets.
SELECT pg_temp.seed_timing_turn(
	'd1310000-0000-4000-8000-000000000001',
	'd1410000-0000-4000-8000-000000000001',
	'd1510000-0000-4000-8000-000000000001',
	'd1610000-0000-4000-8000-000000000001',
	'd1710000-0000-4000-8000-000000000001',
	'pending-contract-partial',
	1,
	false,
	false
);
UPDATE public.chat_turn_runs
SET context_type = 'project',
	project_id = 'd1010000-0000-4000-8000-000000000001'
WHERE id = 'd1310000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_contract_execution(
	'd1310000-0000-4000-8000-000000000001',
	'd1810000-0000-4000-8000-000000000001',
	'contract-partial',
	1,
	'declare_turn_contract',
	'{"outcomes":[{"id":"organize-two","action":"organize","entity_kind":"document","target_ids":["d2010000-0000-4000-8000-000000000001","d2020000-0000-4000-8000-000000000001"],"minimum_successful_effects":2}]}'::jsonb,
	'{"status":"declared"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1310000-0000-4000-8000-000000000001',
	'd1820000-0000-4000-8000-000000000001',
	'move-partial',
	2,
	'move_document_in_tree',
	'{"project_id":"d1010000-0000-4000-8000-000000000001","document_id":"d2010000-0000-4000-8000-000000000001","new_parent_id":"d2030000-0000-4000-8000-000000000001"}'::jsonb,
	'{"status":"moved"}'::jsonb,
	true
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'd1310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'd1410000-0000-4000-8000-000000000001',
	'd1510000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'd1910000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":2}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' @> '{
			"version":1,
			"contract":{"version":1,"source":"declared","outcomes":[{
				"id":"organize-two",
				"action":"organize",
				"entityKind":"document",
				"targetIds":["d2010000-0000-4000-8000-000000000001","d2020000-0000-4000-8000-000000000001"],
				"minimumSuccessfulEffects":2
			}]},
			"contextType":"project",
			"projectId":"d1010000-0000-4000-8000-000000000001"
		}'::jsonb
		AND agent_metadata->'fastchat_pending_turn_intent' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'd1310000-0000-4000-8000-000000000001'
	),
	'partial multi-effect contract persists while lexical pending intent is cleared'
);

-- Both distinct target effects fulfill the declaration and clear carry-forward.
SELECT pg_temp.seed_timing_turn(
	'd1320000-0000-4000-8000-000000000001',
	'd1420000-0000-4000-8000-000000000001',
	'd1520000-0000-4000-8000-000000000001',
	'd1620000-0000-4000-8000-000000000001',
	'd1720000-0000-4000-8000-000000000001',
	'pending-contract-fulfilled',
	1,
	false,
	false
);
SELECT pg_temp.seed_contract_execution(
	'd1320000-0000-4000-8000-000000000001',
	'd1830000-0000-4000-8000-000000000001',
	'contract-fulfilled',
	1,
	'declare_turn_contract',
	'{"outcomes":[{"id":"organize-two","action":"organize","entity_kind":"document","target_ids":["d2010000-0000-4000-8000-000000000001","d2020000-0000-4000-8000-000000000001"],"minimum_successful_effects":2}]}'::jsonb,
	'{"status":"declared"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1320000-0000-4000-8000-000000000001',
	'd1840000-0000-4000-8000-000000000001',
	'move-a',
	2,
	'move_document_in_tree',
	'{"document_id":"d2010000-0000-4000-8000-000000000001","new_parent_id":"d2030000-0000-4000-8000-000000000001"}'::jsonb,
	'{"status":"moved"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1320000-0000-4000-8000-000000000001',
	'd1850000-0000-4000-8000-000000000001',
	'move-b',
	3,
	'move_document_in_tree',
	'{"document_id":"d2020000-0000-4000-8000-000000000001","new_parent_id":"d2030000-0000-4000-8000-000000000001"}'::jsonb,
	'{"status":"moved"}'::jsonb,
	true
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'd1320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'd1420000-0000-4000-8000-000000000001',
	'd1520000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'd1920000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":3}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'd1320000-0000-4000-8000-000000000001'
	),
	'fulfilled multi-effect contract clears carry-forward metadata'
);

-- Different execution ids against the same entity are still one semantic
-- effect for cardinality. Provider retries cannot manufacture completion.
SELECT pg_temp.seed_timing_turn(
	'd1330000-0000-4000-8000-000000000001',
	'd1430000-0000-4000-8000-000000000001',
	'd1530000-0000-4000-8000-000000000001',
	'd1630000-0000-4000-8000-000000000001',
	'd1730000-0000-4000-8000-000000000001',
	'pending-contract-duplicate-target',
	1,
	false,
	false
);
SELECT pg_temp.seed_contract_execution(
	'd1330000-0000-4000-8000-000000000001',
	'd1860000-0000-4000-8000-000000000001',
	'contract-duplicate-target',
	1,
	'declare_turn_contract',
	'{"outcomes":[{"id":"move-two-documents","action":"move","entity_kind":"document","target_ids":[],"minimum_successful_effects":2}]}'::jsonb,
	'{"status":"declared"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1330000-0000-4000-8000-000000000001',
	'd1870000-0000-4000-8000-000000000001',
	'move-duplicate-a',
	2,
	'move_document_in_tree',
	'{"document_id":"d2010000-0000-4000-8000-000000000001","new_parent_id":"d2030000-0000-4000-8000-000000000001"}'::jsonb,
	'{"status":"moved"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1330000-0000-4000-8000-000000000001',
	'd1880000-0000-4000-8000-000000000001',
	'move-duplicate-b',
	3,
	'move_document_in_tree',
	'{"document_id":"d2010000-0000-4000-8000-000000000001","new_parent_id":"d2040000-0000-4000-8000-000000000001"}'::jsonb,
	'{"status":"moved"}'::jsonb,
	true
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'd1330000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'd1430000-0000-4000-8000-000000000001',
	'd1530000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'd1930000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":3}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract'->'contract'->'outcomes' @>
			'[{"id":"move-two-documents","minimumSuccessfulEffects":2}]'::jsonb
		FROM public.chat_sessions
		WHERE id = 'd1330000-0000-4000-8000-000000000001'
	),
	'repeated writes against one entity count as one semantic effect'
);

-- Required fields are enforced per target, not as a union across the batch.
SELECT pg_temp.seed_timing_turn(
	'd1340000-0000-4000-8000-000000000001',
	'd1440000-0000-4000-8000-000000000001',
	'd1540000-0000-4000-8000-000000000001',
	'd1640000-0000-4000-8000-000000000001',
	'd1740000-0000-4000-8000-000000000001',
	'pending-contract-per-target-fields',
	1,
	false,
	false
);
SELECT pg_temp.seed_contract_execution(
	'd1340000-0000-4000-8000-000000000001',
	'd1890000-0000-4000-8000-000000000001',
	'contract-per-target-fields',
	1,
	'declare_turn_contract',
	'{"outcomes":[{"id":"complete-two-tasks","action":"update","entity_kind":"task","target_ids":["d2110000-0000-4000-8000-000000000001","d2120000-0000-4000-8000-000000000001"],"required_fields":["state_key"],"minimum_successful_effects":2}]}'::jsonb,
	'{"status":"declared"}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1340000-0000-4000-8000-000000000001',
	'd18a0000-0000-4000-8000-000000000001',
	'update-task-state',
	2,
	'update_onto_task',
	'{"task_id":"d2110000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	'{"task":{"id":"d2110000-0000-4000-8000-000000000001","state_key":"done"}}'::jsonb,
	true
);
SELECT pg_temp.seed_contract_execution(
	'd1340000-0000-4000-8000-000000000001',
	'd18b0000-0000-4000-8000-000000000001',
	'update-task-title-only',
	3,
	'update_onto_task',
	'{"task_id":"d2120000-0000-4000-8000-000000000001","title":"Renamed only"}'::jsonb,
	'{"task":{"id":"d2120000-0000-4000-8000-000000000001","title":"Renamed only"}}'::jsonb,
	true
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'd1340000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'd1440000-0000-4000-8000-000000000001',
	'd1540000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'd1940000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":3}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract'->'contract'->'outcomes' @>
			'[{"id":"complete-two-tasks","requiredFields":["state_key"]}]'::jsonb
		FROM public.chat_sessions
		WHERE id = 'd1340000-0000-4000-8000-000000000001'
	),
	'required fields must be present on every declared target effect'
);

SELECT 'agentic_chat_terminal_pending_contract_metadata_ok' AS result;
