-- supabase/tests/20260804033000_agentic_chat_partial_cancellation_terminal_events.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 8.
-- Run after the Slice 6 timing test in the same disposable psql session.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

SELECT pg_temp.seed_timing_turn(
	'fc000000-0000-4000-8000-000000000001',
	'fc000000-0000-4000-8000-000000000002',
	'fc000000-0000-4000-8000-000000000003',
	'fc000000-0000-4000-8000-000000000004',
	'fc000000-0000-4000-8000-000000000005',
	'partial-cancel', 2, true, true
);

CREATE TEMP TABLE partial_cancel_receipt (receipt jsonb);
GRANT ALL ON partial_cancel_receipt TO service_role;
SET ROLE service_role;
INSERT INTO partial_cancel_receipt
SELECT public.finalize_agentic_chat_turn_with_terminal_events(
	'fc000000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc000000-0000-4000-8000-000000000002',
	'fc000000-0000-4000-8000-000000000003',
	1,
	'cancelled',
	'cancelled',
	'cancelled',
	'fc000000-0000-4000-8000-000000000006',
	'fixture answer',
	'{"interrupted":true,"interrupted_reason":"user_cancelled","finished_reason":"cancelled","partial_tokens":4}'::jsonb,
	NULL,
	NULL,
	NULL,
	'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"cancelled","finished_reason":"cancelled","failure_code":"cancelled","usage":null}'::jsonb,
	'{"summary":"fixture answer","entities":{},"context_type":"global","data_accessed":[]}'::jsonb,
	'fc000000-0000-5000-8000-000000000007',
	jsonb_set(
		pg_temp.timing_draft('fc000000-0000-4000-8000-000000000001'),
		'{finished_reason}',
		'"cancelled"'::jsonb
	),
	'fc000000-0000-5000-8000-000000000008'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'finalized'
			AND receipt->>'status' = 'cancelled'
			AND receipt->>'failure_code' = 'cancelled'
			AND receipt->>'assistant_message_id' = 'fc000000-0000-4000-8000-000000000006'
			AND (receipt->>'terminal_sequence_index')::integer = 5
			AND jsonb_array_length(receipt->'preterminal_events') = 2
			AND receipt->'preterminal_events'->0->>'event_type' = 'last_turn_context'
			AND receipt->'preterminal_events'->1->>'event_type' = 'timing'
		FROM partial_cancel_receipt
	),
	'cancelled partial receipt did not expose its ordered terminal prefix'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'cancelled'
			AND failure_code = 'cancelled'
			AND cancel_requested_at IS NOT NULL
			AND cancel_reason = 'user_cancelled'
			AND assistant_message_id = 'fc000000-0000-4000-8000-000000000006'
			AND last_event_sequence = 5
		FROM public.chat_turn_runs
		WHERE id = 'fc000000-0000-4000-8000-000000000001'
	),
	'cancelled terminal truth did not restore exact cancellation evidence'
);

SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY sequence_index) =
			ARRAY['turn_phase', 'text_delta', 'last_turn_context', 'timing', 'done']::text[]
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fc000000-0000-4000-8000-000000000001'
			AND execution_generation = 1
	),
	'cancelled partial terminal events are missing or out of order'
);

SELECT pg_temp.assert_true(
	(
		SELECT content = 'fixture answer'
			AND metadata @> '{"interrupted":true,"interrupted_reason":"user_cancelled","finished_reason":"cancelled","partial_tokens":4,"terminal_status":"cancelled","partial":true}'::jsonb
			AND prompt_tokens IS NULL
			AND completion_tokens IS NULL
			AND total_tokens IS NULL
		FROM public.chat_messages
		WHERE id = 'fc000000-0000-4000-8000-000000000006'
	),
	'cancelled partial assistant message lost interruption metadata or null usage'
);

CREATE TEMP TABLE partial_cancel_replay (receipt jsonb);
GRANT ALL ON partial_cancel_replay TO service_role;
SET ROLE service_role;
INSERT INTO partial_cancel_replay
SELECT public.finalize_agentic_chat_turn_with_terminal_events(
	'fc000000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc000000-0000-4000-8000-000000000002',
	'fc000000-0000-4000-8000-000000000003',
	1, 'cancelled', 'cancelled', 'cancelled',
	'fc000000-0000-4000-8000-000000000006', 'fixture answer', '{}'::jsonb,
	NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
	'fc000000-0000-5000-8000-000000000007', '{}'::jsonb,
	'fc000000-0000-5000-8000-000000000008'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'already_terminal'
			AND receipt->>'status' = 'cancelled'
			AND NOT receipt ? 'preterminal_events'
		FROM partial_cancel_replay
	),
	'lost cancelled response did not resolve from immutable terminal truth'
);

-- A failure between the two semantic writes must roll back the temporary
-- cancellation mask, the first semantic event, and every terminal side effect.
SELECT pg_temp.seed_timing_turn(
	'fc000000-0000-4000-8000-000000000011',
	'fc000000-0000-4000-8000-000000000012',
	'fc000000-0000-4000-8000-000000000013',
	'fc000000-0000-4000-8000-000000000014',
	'fc000000-0000-4000-8000-000000000015',
	'partial-cancel-rollback', 2, true, true
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$call$SELECT public.finalize_agentic_chat_turn_with_terminal_events(
				%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1,
				'cancelled', 'cancelled', 'cancelled', %L::uuid,
				'fixture answer', '{}'::jsonb, NULL, NULL, NULL,
				'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
				'{}'::jsonb,
				'{"summary":"fixture answer","entities":{},"context_type":"global","data_accessed":[]}'::jsonb,
				%L::uuid,
				%L::jsonb,
				%L::uuid
			)$call$,
			'fc000000-0000-4000-8000-000000000011',
			'fa100000-0000-4000-8000-000000000001',
			'fc000000-0000-4000-8000-000000000012',
			'fc000000-0000-4000-8000-000000000013',
			'fc000000-0000-4000-8000-000000000016',
			'fc000000-0000-5000-8000-000000000017',
			jsonb_set(
				pg_temp.timing_draft('fc000000-0000-4000-8000-000000000011'),
				'{finished_reason}',
				'"cancelled"'::jsonb
			)::text,
			-- Reusing the context transition for timing forces the second write
			-- to reject after the first one was tentatively persisted.
			'fc000000-0000-5000-8000-000000000017'
		),
		'agentic_chat_semantic_write_transition_conflict'
	),
	'cancelled terminal prefix did not fail closed on a transition collision'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running'
			AND cancel_requested_at IS NOT NULL
			AND cancel_reason = 'user_cancelled'
			AND last_event_sequence = 2
		FROM public.chat_turn_runs
		WHERE id = 'fc000000-0000-4000-8000-000000000011'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'fc000000-0000-4000-8000-000000000011'
			AND sequence_index > 2
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE id = 'fc000000-0000-4000-8000-000000000016'
	),
	'failed cancelled terminal prefix leaked writes or cleared cancellation truth'
);

-- The exception is scoped to the terminal transaction. The ordinary writer
-- remains fenced immediately after a cancellation request.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	(
		public.persist_agentic_chat_semantic_event(
			'fc000000-0000-4000-8000-000000000011',
			'fc000000-0000-4000-8000-000000000012',
			'fc000000-0000-4000-8000-000000000013',
			1,
			'fc000000-0000-5000-8000-000000000018',
			'fixture answer',
			'finalize',
			'last_turn_context',
			'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
			'{"type":"last_turn_context","context":{}}'::jsonb
		)->>'outcome' = 'cancel_requested'
	),
	'ordinary semantic writes bypassed the post-cancellation fence'
);
RESET ROLE;

SELECT 'phase4_slice8_partial_cancellation_terminal_events_ok' AS result;
