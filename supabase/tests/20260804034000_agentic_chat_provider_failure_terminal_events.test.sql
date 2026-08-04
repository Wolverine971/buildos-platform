-- supabase/tests/20260804034000_agentic_chat_provider_failure_terminal_events.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 9.
-- Run after the Slice 6 timing test in the same disposable psql session.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.finalize_agentic_chat_turn_with_failure_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,text,uuid,jsonb,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.finalize_agentic_chat_turn_with_failure_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,text,uuid,jsonb,uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.finalize_agentic_chat_turn_with_failure_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,text,uuid,jsonb,uuid)',
		'EXECUTE'
	),
	'provider failure wrapper grants are not service-only'
);

SELECT pg_temp.seed_timing_turn(
	'fd000000-0000-4000-8000-000000000001',
	'fd000000-0000-4000-8000-000000000002',
	'fd000000-0000-4000-8000-000000000003',
	'fd000000-0000-4000-8000-000000000004',
	'fd000000-0000-4000-8000-000000000005',
	'provider-failure', 2, true, false
);

CREATE TEMP TABLE provider_failure_receipt (receipt jsonb);
GRANT ALL ON provider_failure_receipt TO service_role;
SET ROLE service_role;
INSERT INTO provider_failure_receipt
SELECT public.finalize_agentic_chat_turn_with_failure_events(
	'fd000000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd000000-0000-4000-8000-000000000002',
	'fd000000-0000-4000-8000-000000000003',
	1,
	'failed',
	'error',
	'permanent',
	NULL,
	'fixture answer',
	'{"worker_runtime":"agentic_chat_v1"}'::jsonb,
	NULL,
	NULL,
	NULL,
	'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"failed","finished_reason":"error","failure_code":"permanent","usage":{"total_tokens":0}}'::jsonb,
	'An error occurred while streaming.',
	'fd000000-0000-5000-8000-000000000006',
	jsonb_set(
		pg_temp.timing_draft('fd000000-0000-4000-8000-000000000001'),
		'{finished_reason}',
		'"error"'::jsonb
	),
	'fd000000-0000-5000-8000-000000000007'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'finalized'
			AND receipt->>'status' = 'failed'
			AND receipt->>'finished_reason' = 'error'
			AND receipt->>'failure_code' = 'permanent'
			AND receipt->'assistant_message_id' = 'null'::jsonb
			AND (receipt->>'terminal_sequence_index')::integer = 5
			AND jsonb_array_length(receipt->'preterminal_events') = 2
			AND receipt->'preterminal_events'->0->>'event_type' = 'error'
			AND receipt->'preterminal_events'->1->>'event_type' = 'timing'
		FROM provider_failure_receipt
	),
	'provider failure receipt did not expose error then timing before done'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'failed'
			AND finished_reason = 'error'
			AND failure_code = 'permanent'
			AND assistant_message_id IS NULL
			AND last_event_sequence = 5
		FROM public.chat_turn_runs
		WHERE id = 'fd000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT assistant_text = 'fixture answer'
			AND projection->'terminal'->>'assistantMessageId' IS NULL
		FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE metadata->>'turn_run_id' = 'fd000000-0000-4000-8000-000000000001'
			AND role = 'assistant'
	),
	'failed provider text leaked into trusted assistant history or was lost from reconnect state'
);

SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY sequence_index) =
			ARRAY['turn_phase', 'text_delta', 'error', 'timing', 'done']::text[]
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000001'
			AND execution_generation = 1
	)
	AND (
		SELECT payload->>'error' = 'An error occurred while streaming.'
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000001'
			AND event_type = 'error'
	)
	AND (
		SELECT payload->'timing'->'assistant_persisted_at' = 'null'::jsonb
			AND payload->'timing'->'done_emitted_at' = 'null'::jsonb
			AND payload->'timing'->>'finished_reason' = 'error'
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000001'
			AND event_type = 'timing'
	)
	AND (
		SELECT payload->'usage'->>'total_tokens' = '0'
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000001'
			AND event_type = 'done'
	),
	'provider failure event payloads lost public, timing, or zero-usage parity'
);

CREATE TEMP TABLE provider_failure_replay (receipt jsonb);
GRANT ALL ON provider_failure_replay TO service_role;
SET ROLE service_role;
INSERT INTO provider_failure_replay
SELECT public.finalize_agentic_chat_turn_with_failure_events(
	'fd000000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd000000-0000-4000-8000-000000000002',
	'fd000000-0000-4000-8000-000000000003',
	1, 'failed', 'error', 'permanent', NULL, 'fixture answer', '{}'::jsonb,
	NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb, 'Different replay text',
	'fd000000-0000-5000-8000-000000000006', '{}'::jsonb,
	'fd000000-0000-5000-8000-000000000007'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'already_terminal'
			AND receipt->>'status' = 'failed'
			AND receipt->'assistant_message_id' = 'null'::jsonb
			AND NOT receipt ? 'preterminal_events'
		FROM provider_failure_replay
	),
	'lost provider-failure response did not resolve from immutable terminal truth'
);

-- Reusing the error transition for timing forces the second semantic write to
-- fail. The first event, base finalization, and every side effect must roll back.
SELECT pg_temp.seed_timing_turn(
	'fd000000-0000-4000-8000-000000000011',
	'fd000000-0000-4000-8000-000000000012',
	'fd000000-0000-4000-8000-000000000013',
	'fd000000-0000-4000-8000-000000000014',
	'fd000000-0000-4000-8000-000000000015',
	'provider-failure-rollback', 2, true, false
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$call$SELECT public.finalize_agentic_chat_turn_with_failure_events(
				%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1,
				'failed', 'error', 'timeout_post_start', NULL,
				'fixture answer', '{}'::jsonb, NULL, NULL, NULL,
				'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
				'{"type":"done","status":"failed","finished_reason":"error","failure_code":"timeout_post_start","usage":{"total_tokens":0}}'::jsonb,
				'An error occurred while streaming.', %L::uuid, %L::jsonb, %L::uuid
			)$call$,
			'fd000000-0000-4000-8000-000000000011',
			'fa100000-0000-4000-8000-000000000001',
			'fd000000-0000-4000-8000-000000000012',
			'fd000000-0000-4000-8000-000000000013',
			'fd000000-0000-5000-8000-000000000016',
			jsonb_set(
				pg_temp.timing_draft('fd000000-0000-4000-8000-000000000011'),
				'{finished_reason}',
				'"error"'::jsonb
			)::text,
			'fd000000-0000-5000-8000-000000000016'
		),
		'agentic_chat_semantic_write_transition_conflict'
	),
	'provider failure terminal prefix did not fail closed on a transition collision'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running'
			AND assistant_message_id IS NULL
			AND last_event_sequence = 2
		FROM public.chat_turn_runs
		WHERE id = 'fd000000-0000-4000-8000-000000000011'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000011'
			AND sequence_index > 2
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE metadata->>'turn_run_id' = 'fd000000-0000-4000-8000-000000000011'
	),
	'failed provider terminal prefix leaked writes after rollback'
);

-- The base CAS used by stalled recovery follows the same failed-message rule
-- even when no trustworthy timing prefix can be reconstructed.
SELECT pg_temp.seed_timing_turn(
	'fd000000-0000-4000-8000-000000000021',
	'fd000000-0000-4000-8000-000000000022',
	'fd000000-0000-4000-8000-000000000023',
	'fd000000-0000-4000-8000-000000000024',
	'fd000000-0000-4000-8000-000000000025',
	'provider-failure-base', 2, true, false
);

CREATE TEMP TABLE provider_failure_base_receipt (receipt jsonb);
GRANT ALL ON provider_failure_base_receipt TO service_role;
SET ROLE service_role;
INSERT INTO provider_failure_base_receipt
SELECT public.finalize_agentic_chat_turn(
	'fd000000-0000-4000-8000-000000000021',
	'fa100000-0000-4000-8000-000000000001',
	'fd000000-0000-4000-8000-000000000022',
	'fd000000-0000-4000-8000-000000000023',
	1, 'failed', 'worker_interrupted', 'timeout_post_start', NULL,
	'fixture answer', '{"recovered_from_stall":true}'::jsonb,
	NULL, NULL, NULL,
	'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"failed","finished_reason":"worker_interrupted","failure_code":"timeout_post_start","usage":{"total_tokens":0}}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'finalized'
			AND receipt->>'status' = 'failed'
			AND receipt->'assistant_message_id' = 'null'::jsonb
		FROM provider_failure_base_receipt
	)
	AND (
		SELECT assistant_text = 'fixture answer'
		FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'fd000000-0000-4000-8000-000000000021'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE metadata->>'turn_run_id' = 'fd000000-0000-4000-8000-000000000021'
	),
	'base failed finalization did not keep stream text out of conversation history'
);

SELECT 'phase4_slice9_provider_failure_terminal_events_ok' AS result;
