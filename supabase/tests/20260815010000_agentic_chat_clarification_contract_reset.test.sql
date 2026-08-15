-- supabase/tests/20260815010000_agentic_chat_clarification_contract_reset.test.sql
-- Requires the composed Agentic Chat fixture plus the pg_temp helpers from
-- 20260814010000/20260814011000. PSQL-ONLY / DISPOSABLE DATABASE ONLY.
-- Never run against a linked database.

\set ON_ERROR_STOP on

-- Clarification is an ordered reset for work proposed in the current turn,
-- but it must preserve an older in-scope pending commission.
SELECT pg_temp.seed_timing_turn(
	'f1310000-0000-4000-8000-000000000001',
	'f1410000-0000-4000-8000-000000000001',
	'f1510000-0000-4000-8000-000000000001',
	'f1610000-0000-4000-8000-000000000001',
	'f1710000-0000-4000-8000-000000000001',
	'clarification-preserves-prior-contract', 1, false, false
);
UPDATE public.chat_turn_runs
SET context_type = 'project', project_id = 'f1010000-0000-4000-8000-000000000001'
WHERE id = 'f1310000-0000-4000-8000-000000000001';
UPDATE public.chat_sessions
SET agent_metadata = COALESCE(agent_metadata, '{}'::jsonb) || '{
	"fastchat_pending_turn_contract":{
		"version":1,
		"contract":{"version":1,"source":"declared","outcomes":[{
			"id":"prior-title","action":"update","entityKind":"task",
			"targetIds":["f2010000-0000-4000-8000-000000000001"],
			"requiredFields":["title"],"minimumSuccessfulEffects":1
		}]},
		"contextType":"project","projectId":"f1010000-0000-4000-8000-000000000001",
		"originatingTurnRunId":null,"createdAt":"2026-08-14T00:00:00.000Z",
		"finishedReason":"length"
	}
}'::jsonb
WHERE id = 'f1310000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_contract_execution(
	'f1310000-0000-4000-8000-000000000001',
	'f1810000-0000-4000-8000-000000000001',
	'premature-contract', 1, 'declare_turn_contract',
	'{"outcomes":[{"id":"guessed-completion","action":"complete","entity_kind":"task","target_ids":["f2020000-0000-4000-8000-000000000001"],"required_fields":["state_key"],"minimum_successful_effects":1}]}'::jsonb,
	'{"status":"declared"}'::jsonb, true
);
SELECT pg_temp.seed_contract_execution(
	'f1310000-0000-4000-8000-000000000001',
	'f1820000-0000-4000-8000-000000000001',
	'withheld-guessed-write', 2, 'update_onto_task',
	'{"task_id":"f2020000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	'{}'::jsonb, false
);
SELECT pg_temp.seed_contract_execution(
	'f1310000-0000-4000-8000-000000000001',
	'f1830000-0000-4000-8000-000000000001',
	'clarify-guessed-target', 3, 'request_turn_clarification',
	'{"reason":"Several tasks are plausible.","question":"Which task should I complete?"}'::jsonb,
	'{"status":"clarification_required","requires_user_action":true}'::jsonb, true
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'f1310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'f1410000-0000-4000-8000-000000000001',
	'f1510000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'f1910000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":2,"tool_call_count":3}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract'->'contract'->'outcomes' =
			'[{
				"id":"prior-title","action":"update","entityKind":"task",
				"targetIds":["f2010000-0000-4000-8000-000000000001"],
				"requiredFields":["title"],"minimumSuccessfulEffects":1
			}]'::jsonb
		FROM public.chat_sessions
		WHERE id = 'f1310000-0000-4000-8000-000000000001'
	),
	'clarification preserves the older in-scope pending contract only: ' || COALESCE((
		SELECT (agent_metadata->'fastchat_pending_turn_contract'->'contract'->'outcomes')::text
		FROM public.chat_sessions
		WHERE id = 'f1310000-0000-4000-8000-000000000001'
	), 'missing')
);

-- Without an older pending commission, clarification discards the current
-- declaration and every failed mutation proposed before it.
SELECT pg_temp.seed_timing_turn(
	'f1320000-0000-4000-8000-000000000001',
	'f1420000-0000-4000-8000-000000000001',
	'f1520000-0000-4000-8000-000000000001',
	'f1620000-0000-4000-8000-000000000001',
	'f1720000-0000-4000-8000-000000000001',
	'clarification-clears-current-contract', 1, false, false
);
UPDATE public.chat_turn_runs
SET context_type = 'project', project_id = 'f1020000-0000-4000-8000-000000000001'
WHERE id = 'f1320000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_contract_execution(
	'f1320000-0000-4000-8000-000000000001',
	'f1840000-0000-4000-8000-000000000001',
	'premature-contract-without-prior', 1, 'declare_turn_contract',
	'{"outcomes":[{"id":"guessed-completion","action":"complete","entity_kind":"task","target_ids":["f2030000-0000-4000-8000-000000000001"],"required_fields":["state_key"],"minimum_successful_effects":1}]}'::jsonb,
	'{"status":"declared"}'::jsonb, true
);
SELECT pg_temp.seed_contract_execution(
	'f1320000-0000-4000-8000-000000000001',
	'f1850000-0000-4000-8000-000000000001',
	'failed-write-without-prior', 2, 'update_onto_task',
	'{"task_id":"f2030000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	'{}'::jsonb, false
);
SELECT pg_temp.seed_contract_execution(
	'f1320000-0000-4000-8000-000000000001',
	'f1860000-0000-4000-8000-000000000001',
	'clarify-without-prior', 3, 'request_turn_clarification',
	'{"reason":"Several tasks are plausible.","question":"Which task should I complete?"}'::jsonb,
	'{"status":"clarification_required","requires_user_action":true}'::jsonb, true
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'f1320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'f1420000-0000-4000-8000-000000000001',
	'f1520000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'f1920000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":2,"tool_call_count":3}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'f1320000-0000-4000-8000-000000000001'
	),
	'clarification clears current-turn declarations and failed writes without prior work'
);

SELECT 'agentic_chat_clarification_contract_reset_ok' AS result;
