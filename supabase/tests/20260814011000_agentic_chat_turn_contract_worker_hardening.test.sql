-- supabase/tests/20260814011000_agentic_chat_turn_contract_worker_hardening.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

-- Explicit cancellation clears a prior contract without requiring a data
-- mutation and also clears lexical compatibility metadata.
SELECT pg_temp.seed_timing_turn(
	'e1310000-0000-4000-8000-000000000001',
	'e1410000-0000-4000-8000-000000000001',
	'e1510000-0000-4000-8000-000000000001',
	'e1610000-0000-4000-8000-000000000001',
	'e1710000-0000-4000-8000-000000000001',
	'contract-explicit-cancel', 1, false, false
);
UPDATE public.chat_turn_runs
SET context_type = 'project', project_id = 'e1010000-0000-4000-8000-000000000001'
WHERE id = 'e1310000-0000-4000-8000-000000000001';
UPDATE public.chat_sessions
SET agent_metadata = agent_metadata || '{
	"fastchat_pending_turn_contract":{
		"version":1,
		"contract":{"version":1,"source":"declared","outcomes":[{
			"id":"old-title","action":"update","entityKind":"task",
			"targetIds":["e2110000-0000-4000-8000-000000000001"],
			"requiredFields":["title"],"minimumSuccessfulEffects":1
		}]},
		"contextType":"project","projectId":"e1010000-0000-4000-8000-000000000001",
		"originatingTurnRunId":null,"createdAt":"2026-08-14T00:00:00.000Z",
		"finishedReason":"length"
	},
	"fastchat_pending_turn_intent":{"version":1,"status":"pending"}
}'::jsonb
WHERE id = 'e1310000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_contract_execution(
	'e1310000-0000-4000-8000-000000000001',
	'e1810000-0000-4000-8000-000000000001',
	'cancel-old-contract', 1, 'cancel_turn_contract',
	'{"reason":"The user explicitly cancelled the previous update."}'::jsonb,
	'{"status":"cancelled"}'::jsonb, true
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e1310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'e1410000-0000-4000-8000-000000000001',
	'e1510000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'e1910000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":1}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
			AND agent_metadata->'fastchat_pending_turn_intent' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'e1310000-0000-4000-8000-000000000001'
	),
	'explicit cancellation clears semantic and lexical pending metadata'
);

-- Lifecycle actions require lifecycle evidence. A document archive declaration
-- is fulfilled by an update whose durable state is actually archived.
SELECT pg_temp.seed_timing_turn(
	'e1320000-0000-4000-8000-000000000001',
	'e1420000-0000-4000-8000-000000000001',
	'e1520000-0000-4000-8000-000000000001',
	'e1620000-0000-4000-8000-000000000001',
	'e1720000-0000-4000-8000-000000000001',
	'contract-lifecycle-archive', 1, false, false
);
SELECT pg_temp.seed_contract_execution(
	'e1320000-0000-4000-8000-000000000001',
	'e1820000-0000-4000-8000-000000000001',
	'declare-archive', 1, 'declare_turn_contract',
	'{"outcomes":[{"id":"archive-document","action":"archive","entity_kind":"document","target_ids":["e2210000-0000-4000-8000-000000000001"],"required_fields":["state_key"],"minimum_successful_effects":1}]}'::jsonb,
	'{"status":"declared"}'::jsonb, true
);
SELECT pg_temp.seed_contract_execution(
	'e1320000-0000-4000-8000-000000000001',
	'e1830000-0000-4000-8000-000000000001',
	'archive-document', 2, 'update_onto_document',
	'{"document_id":"e2210000-0000-4000-8000-000000000001","state_key":"archived"}'::jsonb,
	'{"document":{"id":"e2210000-0000-4000-8000-000000000001","state_key":"archived"}}'::jsonb,
	true
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e1320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'e1420000-0000-4000-8000-000000000001',
	'e1520000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'e1920000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":2}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'e1320000-0000-4000-8000-000000000001'
	),
	'a matching lifecycle update fulfills an archive contract'
);

-- Failed direct writes retain the exact requested effect fields rather than a
-- tool-name-only obligation that an unrelated future update could satisfy.
SELECT pg_temp.seed_timing_turn(
	'e1330000-0000-4000-8000-000000000001',
	'e1430000-0000-4000-8000-000000000001',
	'e1530000-0000-4000-8000-000000000001',
	'e1630000-0000-4000-8000-000000000001',
	'e1730000-0000-4000-8000-000000000001',
	'contract-implicit-fields', 1, false, false
);
SELECT pg_temp.seed_contract_execution(
	'e1330000-0000-4000-8000-000000000001',
	'e1840000-0000-4000-8000-000000000001',
	'failed-title-update', 1, 'update_onto_task',
	'{"task_id":"e2310000-0000-4000-8000-000000000001","title":"Requested title"}'::jsonb,
	'{}'::jsonb, false
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e1330000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'e1430000-0000-4000-8000-000000000001',
	'e1530000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'e1930000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":1}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract'->'contract'->'outcomes' @>
			'[{"action":"update","entityKind":"task","targetIds":["e2310000-0000-4000-8000-000000000001"],"requiredFields":["title"]}]'::jsonb
		FROM public.chat_sessions
		WHERE id = 'e1330000-0000-4000-8000-000000000001'
	),
	'implicit failed-write contracts preserve requested fields'
);

-- Multiple successful updates may cumulatively supply the required fields for
-- one target, while still counting that target as one distinct effect.
SELECT pg_temp.seed_timing_turn(
	'e1340000-0000-4000-8000-000000000001',
	'e1440000-0000-4000-8000-000000000001',
	'e1540000-0000-4000-8000-000000000001',
	'e1640000-0000-4000-8000-000000000001',
	'e1740000-0000-4000-8000-000000000001',
	'contract-cumulative-fields', 1, false, false
);
SELECT pg_temp.seed_contract_execution(
	'e1340000-0000-4000-8000-000000000001',
	'e1850000-0000-4000-8000-000000000001',
	'declare-cumulative', 1, 'declare_turn_contract',
	'{"outcomes":[{"id":"update-task","action":"update","entity_kind":"task","target_ids":["e2410000-0000-4000-8000-000000000001"],"required_fields":["title","description"],"minimum_successful_effects":1}]}'::jsonb,
	'{"status":"declared"}'::jsonb, true
);
SELECT pg_temp.seed_contract_execution(
	'e1340000-0000-4000-8000-000000000001',
	'e1860000-0000-4000-8000-000000000001',
	'update-title', 2, 'update_onto_task',
	'{"task_id":"e2410000-0000-4000-8000-000000000001","title":"New title"}'::jsonb,
	'{"task":{"id":"e2410000-0000-4000-8000-000000000001"}}'::jsonb, true
);
SELECT pg_temp.seed_contract_execution(
	'e1340000-0000-4000-8000-000000000001',
	'e1870000-0000-4000-8000-000000000001',
	'update-description', 3, 'update_onto_task',
	'{"task_id":"e2410000-0000-4000-8000-000000000001","description":"New description"}'::jsonb,
	'{"task":{"id":"e2410000-0000-4000-8000-000000000001"}}'::jsonb, true
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e1340000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'e1440000-0000-4000-8000-000000000001',
	'e1540000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'e1940000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":3}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'e1340000-0000-4000-8000-000000000001'
	),
	'required fields accumulate across successful updates to one target'
);

-- An old project contract is removed when the terminal turn belongs to a new
-- project scope, even if no contract control tool runs in that turn.
SELECT pg_temp.seed_timing_turn(
	'e1350000-0000-4000-8000-000000000001',
	'e1450000-0000-4000-8000-000000000001',
	'e1550000-0000-4000-8000-000000000001',
	'e1650000-0000-4000-8000-000000000001',
	'e1750000-0000-4000-8000-000000000001',
	'contract-scope-shift', 1, false, false
);
UPDATE public.chat_turn_runs
SET context_type = 'project', project_id = 'e1020000-0000-4000-8000-000000000001'
WHERE id = 'e1350000-0000-4000-8000-000000000001';
UPDATE public.chat_sessions
SET agent_metadata = agent_metadata || '{
	"fastchat_pending_turn_contract":{
		"version":1,
		"contract":{"version":1,"source":"declared","outcomes":[{
			"id":"wrong-project","action":"update","entityKind":"task",
			"targetIds":["e2510000-0000-4000-8000-000000000001"],
			"requiredFields":["title"],"minimumSuccessfulEffects":1
		}]},
		"contextType":"project","projectId":"e1010000-0000-4000-8000-000000000001",
		"originatingTurnRunId":null,"createdAt":"2026-08-14T00:00:00.000Z",
		"finishedReason":"length"
	}
}'::jsonb
WHERE id = 'e1350000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e1350000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'e1450000-0000-4000-8000-000000000001',
	'e1550000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'e1950000-0000-4000-8000-000000000001', 'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_contract_true(
	(
		SELECT agent_metadata->'fastchat_pending_turn_contract' = 'null'::jsonb
		FROM public.chat_sessions
		WHERE id = 'e1350000-0000-4000-8000-000000000001'
	),
	'an out-of-scope pending contract is cleared'
);

SELECT 'agentic_chat_turn_contract_worker_hardening_ok' AS result;
