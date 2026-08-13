-- supabase/tests/20260813050000_agentic_chat_prompt_snapshot_tool_definitions.test.sql
-- Disposable PostgreSQL verification for Agentic Chat P5 S2.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir 20260804032000_agentic_chat_prompt_snapshot.test.sql

CREATE OR REPLACE FUNCTION pg_temp.persist_snapshot_v2(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_prompt_snapshot_id uuid,
	p_tool_definitions jsonb,
	p_tools_hash text DEFAULT repeat('d', 64)
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.persist_agentic_chat_prompt_snapshot_v2(
		p_turn_run_id,
		'f1000000-0000-4000-8000-000000000001',
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_prompt_snapshot_id,
		'[
			{"role":"system","content":"Fixture only"},
			{"role":"assistant","content":"Prior answer"},
			{"role":"user","content":"Current request"}
		]'::jsonb,
		p_tool_definitions,
		repeat('a', 64),
		repeat('b', 64),
		p_tools_hash,
		12,
		39,
		10
	);
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_prompt_snapshot_v2(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_prompt_snapshot_v2(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_prompt_snapshot_v2(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_prompt_snapshot(uuid,uuid,uuid,uuid,integer,uuid,jsonb,text,text,integer,integer,integer)',
		'EXECUTE'
	),
	'v2 prompt snapshot grants or rollout compatibility are incorrect'
);

-- A turn snapshotted by a v1 worker can be resumed by v2 after deployment.
-- The v2 replay must fill the previously-null exact tool fields even though
-- the turn has since terminalized.
UPDATE public.chat_turn_input_artifacts
SET prepared = jsonb_set(
	prepared,
	'{toolSurface}',
	'{"surfaceProfile":"fixture","toolNames":[],"definitions":[]}'::jsonb
)
WHERE id = 'f6000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.persist_snapshot_v2(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001',
		1,
		'f7000000-0000-5000-8000-000000000001',
		'[]'::jsonb
	)->>'outcome' = 'already_persisted',
	'v1 snapshot was not accepted for v2 backfill'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT tool_definitions = '[]'::jsonb
			AND tools_sha256 = repeat('d', 64)
			AND prompt_sections#>>'{actual_tool_surface,tool_definition_count}' = '0'
		FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
	),
	'v1 snapshot exact tool fields were not backfilled by v2'
);

-- The imported v1 cancellation case intentionally leaves a running turn.
-- Close it before seeding the next case under the one-running-turn invariant.
UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = clock_timestamp(),
	terminal_event_id = id::text || ':' || execution_generation || ':' || last_event_sequence
WHERE id = 'f4000000-0000-4000-8000-000000000002';

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000004',
	'f3000000-0000-4000-8000-000000000004',
	'f9000000-0000-4000-8000-000000000004',
	'f5000000-0000-4000-8000-000000000004',
	'f6000000-0000-4000-8000-000000000004',
	'f8000000-0000-4000-8000-000000000004',
	'v2-success', 1, false, false
);
UPDATE public.chat_turn_input_artifacts
SET prepared = jsonb_set(
	prepared,
	'{toolSurface}',
	'{
		"surfaceProfile":"fixture",
		"toolNames":["get_project_overview"],
		"definitions":[]
	}'::jsonb
)
WHERE id = 'f6000000-0000-4000-8000-000000000004';

CREATE TEMP TABLE snapshot_v2_receipts (kind text, receipt jsonb);
GRANT ALL ON snapshot_v2_receipts TO service_role;
SET ROLE service_role;
INSERT INTO snapshot_v2_receipts VALUES (
	'persisted',
	pg_temp.persist_snapshot_v2(
		'f4000000-0000-4000-8000-000000000004',
		'f3000000-0000-4000-8000-000000000004',
		'f9000000-0000-4000-8000-000000000004',
		1,
		'f7000000-0000-5000-8000-000000000004',
		'[{
			"type":"function",
			"function":{
				"name":"get_project_overview",
				"description":"Read the project overview.",
				"parameters":{"type":"object","properties":{}}
			}
		}]'::jsonb
	)
), (
	'replay',
	pg_temp.persist_snapshot_v2(
		'f4000000-0000-4000-8000-000000000004',
		'f3000000-0000-4000-8000-000000000004',
		'f9000000-0000-4000-8000-000000000004',
		1,
		'f7000000-0000-5000-8000-000000000004',
		'[{
			"type":"function",
			"function":{
				"name":"get_project_overview",
				"description":"Read the project overview.",
				"parameters":{"type":"object","properties":{}}
			}
		}]'::jsonb
	)
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'persisted'
		AND receipt->>'tools_sha256' = repeat('d', 64)
		AND receipt->>'tool_definition_count' = '1'
		FROM snapshot_v2_receipts WHERE kind = 'persisted')
	AND (SELECT receipt->>'outcome' = 'already_persisted'
		FROM snapshot_v2_receipts WHERE kind = 'replay')
	AND (
		SELECT jsonb_array_length(tool_definitions) = 1
			AND tool_definitions#>>'{0,function,name}' = 'get_project_overview'
			AND tools_sha256 = repeat('d', 64)
			AND prompt_sections#>>'{actual_tool_surface,tool_definition_count}' = '1'
			AND prompt_sections#>>'{actual_tool_surface,tool_names,0}' = 'get_project_overview'
		FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000004'
	),
	'exact tool definitions were not atomically persisted or replayed'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT pg_temp.persist_snapshot_v2(
			'f4000000-0000-4000-8000-000000000004',
			'f3000000-0000-4000-8000-000000000004',
			'f9000000-0000-4000-8000-000000000004',
			1,
			'f7000000-0000-5000-8000-000000000004',
			'[{
				"type":"function",
				"function":{
					"name":"get_project_overview",
					"description":"Changed definition.",
					"parameters":{"type":"object","properties":{}}
				}
			}]'::jsonb
		)$$,
		'agentic_chat_prompt_snapshot_tool_replay_conflict'
	),
	'conflicting tool-definition replay was not rejected'
);
RESET ROLE;

UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = clock_timestamp(),
	terminal_event_id = id::text || ':' || execution_generation || ':' || last_event_sequence
WHERE id = 'f4000000-0000-4000-8000-000000000004';

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000005',
	'f3000000-0000-4000-8000-000000000005',
	'f9000000-0000-4000-8000-000000000005',
	'f5000000-0000-4000-8000-000000000005',
	'f6000000-0000-4000-8000-000000000005',
	'f8000000-0000-4000-8000-000000000005',
	'v2-unavailable', 1, false, false
);
UPDATE public.chat_turn_input_artifacts
SET prepared = jsonb_set(
	prepared,
	'{toolSurface}',
	'{"surfaceProfile":"fixture","toolNames":[],"definitions":[]}'::jsonb
)
WHERE id = 'f6000000-0000-4000-8000-000000000005';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT pg_temp.persist_snapshot_v2(
			'f4000000-0000-4000-8000-000000000005',
			'f3000000-0000-4000-8000-000000000005',
			'f9000000-0000-4000-8000-000000000005',
			1,
			'f7000000-0000-5000-8000-000000000005',
			'[{
				"type":"function",
				"function":{
					"name":"get_project_overview",
					"description":"Read the project overview.",
					"parameters":{"type":"object","properties":{}}
				}
			}]'::jsonb
		)$$,
		'agentic_chat_prompt_snapshot_tool_not_in_artifact_surface'
	)
	AND
	NOT EXISTS (
		SELECT 1 FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000005'
	),
	'unavailable tool bypassed the immutable artifact surface or left a partial snapshot'
);
RESET ROLE;

SELECT 'agentic_chat_prompt_snapshot_tool_definitions_ok' AS result;
