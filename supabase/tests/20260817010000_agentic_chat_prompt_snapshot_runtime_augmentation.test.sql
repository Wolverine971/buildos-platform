-- supabase/tests/20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir 20260813050000_agentic_chat_prompt_snapshot_tool_definitions.test.sql

CREATE OR REPLACE FUNCTION pg_temp.persist_snapshot_v3(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_prompt_snapshot_id uuid,
	p_model_messages jsonb
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.persist_agentic_chat_prompt_snapshot_v3(
		p_turn_run_id,
		'f1000000-0000-4000-8000-000000000001',
		p_queue_job_id,
		p_processing_token,
		1,
		p_prompt_snapshot_id,
		p_model_messages,
		'[]'::jsonb,
		repeat('a', 64),
		repeat('b', 64),
		repeat('d', 64),
		char_length(p_model_messages#>>'{0,content}'),
		(
			SELECT sum(char_length(item->>'content'))::integer
			FROM jsonb_array_elements(p_model_messages) messages(item)
		),
		(
			SELECT sum(ceil(char_length(item->>'content') / 4.0))::integer
			FROM jsonb_array_elements(p_model_messages) messages(item)
		)
	);
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_prompt_snapshot_v3(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_prompt_snapshot_v3(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_prompt_snapshot_v3(uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text,text,text,integer,integer,integer)',
		'EXECUTE'
	),
	'v3 prompt snapshot grants are not service-only'
);

-- Close the final running turn retained by the imported v2 rejection case.
UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = clock_timestamp(),
	terminal_event_id = id::text || ':' || execution_generation || ':' || last_event_sequence
WHERE id = 'f4000000-0000-4000-8000-000000000005';

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000006',
	'f3000000-0000-4000-8000-000000000006',
	'f9000000-0000-4000-8000-000000000006',
	'f5000000-0000-4000-8000-000000000006',
	'f6000000-0000-4000-8000-000000000006',
	'f8000000-0000-4000-8000-000000000006',
	'v3-runtime-system-guidance', 1, false, false
);
UPDATE public.chat_turn_input_artifacts
SET prepared = jsonb_set(
	prepared,
	'{toolSurface}',
	'{"surfaceProfile":"fixture","toolNames":[],"definitions":[]}'::jsonb
)
WHERE id = 'f6000000-0000-4000-8000-000000000006';

CREATE TEMP TABLE snapshot_v3_receipts (kind text, receipt jsonb);
GRANT ALL ON snapshot_v3_receipts TO service_role;
SET ROLE service_role;
INSERT INTO snapshot_v3_receipts VALUES (
	'persisted',
	pg_temp.persist_snapshot_v3(
		'f4000000-0000-4000-8000-000000000006',
		'f3000000-0000-4000-8000-000000000006',
		'f9000000-0000-4000-8000-000000000006',
		'f7000000-0000-5000-8000-000000000006',
		'[
			{"role":"system","content":"Fixture only"},
			{"role":"assistant","content":"Prior answer"},
			{"role":"system","content":"Use only the reviewed worker tool surface."},
			{"role":"system","content":"Apply the reviewed mutation ordering."},
			{"role":"user","content":"Current request"}
		]'::jsonb
	)
), (
	'replay',
	pg_temp.persist_snapshot_v3(
		'f4000000-0000-4000-8000-000000000006',
		'f3000000-0000-4000-8000-000000000006',
		'f9000000-0000-4000-8000-000000000006',
		'f7000000-0000-5000-8000-000000000006',
		'[
			{"role":"system","content":"Fixture only"},
			{"role":"assistant","content":"Prior answer"},
			{"role":"system","content":"Use only the reviewed worker tool surface."},
			{"role":"system","content":"Apply the reviewed mutation ordering."},
			{"role":"user","content":"Current request"}
		]'::jsonb
	)
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'persisted'
		AND receipt->>'message_chars' = '118'
		FROM snapshot_v3_receipts WHERE kind = 'persisted')
	AND (SELECT receipt->>'outcome' = 'already_persisted'
		FROM snapshot_v3_receipts WHERE kind = 'replay')
	AND (
		SELECT jsonb_array_length(model_messages) = 5
			AND model_messages#>>'{2,role}' = 'system'
			AND model_messages#>>'{2,content}' = 'Use only the reviewed worker tool surface.'
			AND model_messages#>>'{4,role}' = 'user'
			AND message_chars = 118
			AND prompt_sections#>>'{runtime_message_augmentation,inserted_system_message_count}' = '2'
		FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000006'
	),
	'exact runtime-augmented provider messages were not persisted and replayed'
);

UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = clock_timestamp(),
	terminal_event_id = id::text || ':' || execution_generation || ':' || last_event_sequence
WHERE id = 'f4000000-0000-4000-8000-000000000006';

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000007',
	'f3000000-0000-4000-8000-000000000007',
	'f9000000-0000-4000-8000-000000000007',
	'f5000000-0000-4000-8000-000000000007',
	'f6000000-0000-4000-8000-000000000007',
	'f8000000-0000-4000-8000-000000000007',
	'v3-invalid-runtime-role', 1, false, false
);
UPDATE public.chat_turn_input_artifacts
SET prepared = jsonb_set(
	prepared,
	'{toolSurface}',
	'{"surfaceProfile":"fixture","toolNames":[],"definitions":[]}'::jsonb
)
WHERE id = 'f6000000-0000-4000-8000-000000000007';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT pg_temp.persist_snapshot_v3(
			'f4000000-0000-4000-8000-000000000007',
			'f3000000-0000-4000-8000-000000000007',
			'f9000000-0000-4000-8000-000000000007',
			'f7000000-0000-5000-8000-000000000007',
			'[
				{"role":"system","content":"Fixture only"},
				{"role":"assistant","content":"Prior answer"},
				{"role":"assistant","content":"Untrusted runtime insertion"},
				{"role":"user","content":"Current request"}
			]'::jsonb
		)$$,
		'agentic_chat_prompt_snapshot_invalid_runtime_augmentation'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000007'
	),
	'non-system runtime message bypassed the augmentation fence or left a partial snapshot'
);
RESET ROLE;

SELECT 'agentic_chat_prompt_snapshot_runtime_augmentation_ok' AS result;
