-- supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 4B.
-- Prerequisite: apply 20260802030500 after the Slice 4A event proof.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_worker_turn(
	p_turn_id uuid,
	p_user_id uuid,
	p_session_id uuid,
	p_job_id uuid,
	p_correlation_id uuid,
	p_processing_token uuid,
	p_status text,
	p_generation integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.users (id) VALUES (p_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (p_session_id, p_user_id, 'global', 'active');
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key,
		status, queue_job_id, processing_token, started_at
	) VALUES (
		p_job_id,
		p_user_id,
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_id::text,
			'correlationId', p_correlation_id::text
		),
		now(),
		'agentic-chat-turn:' || p_turn_id::text,
		CASE WHEN p_status = 'running'
			THEN 'processing'::public.queue_status
			ELSE 'pending'::public.queue_status END,
		'agentic_chat_turn_' || p_turn_id::text,
		p_processing_token,
		CASE WHEN p_status = 'running' THEN now() ELSE NULL END
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, last_event_sequence
	) VALUES (
		p_turn_id, p_session_id, p_user_id,
		'terminal-stream-' || p_turn_id::text,
		'terminal-client-' || p_turn_id::text,
		'global', 'terminal fixture', p_status, 'worker_realtime', p_job_id,
		p_correlation_id, p_generation,
		CASE WHEN p_status = 'running' THEN now() ELSE NULL END,
		0
	);
	IF p_status = 'running' THEN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation
		) VALUES (p_turn_id, p_session_id, p_user_id, p_generation);
	END IF;
END;
$$;

SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e3000000-0000-4000-8000-000000000001',
	'e8000000-0000-4000-8000-000000000001', NULL, 'queued', 0
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000002',
	'e1000000-0000-4000-8000-000000000002',
	'e2000000-0000-4000-8000-000000000002',
	'e3000000-0000-4000-8000-000000000002',
	'e8000000-0000-4000-8000-000000000002',
	'e9000000-0000-4000-8000-000000000002', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000003',
	'e1000000-0000-4000-8000-000000000003',
	'e2000000-0000-4000-8000-000000000003',
	'e3000000-0000-4000-8000-000000000003',
	'e8000000-0000-4000-8000-000000000003',
	'e9000000-0000-4000-8000-000000000003', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000004',
	'e1000000-0000-4000-8000-000000000004',
	'e2000000-0000-4000-8000-000000000004',
	'e3000000-0000-4000-8000-000000000004',
	'e8000000-0000-4000-8000-000000000004',
	'e9000000-0000-4000-8000-000000000004', 'running', 2
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000005',
	'e1000000-0000-4000-8000-000000000005',
	'e2000000-0000-4000-8000-000000000005',
	'e3000000-0000-4000-8000-000000000005',
	'e8000000-0000-4000-8000-000000000005',
	'e9000000-0000-4000-8000-000000000005', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000006',
	'e1000000-0000-4000-8000-000000000006',
	'e2000000-0000-4000-8000-000000000006',
	'e3000000-0000-4000-8000-000000000006',
	'e8000000-0000-4000-8000-000000000006',
	'e9000000-0000-4000-8000-000000000006', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000007',
	'e1000000-0000-4000-8000-000000000007',
	'e2000000-0000-4000-8000-000000000007',
	'e3000000-0000-4000-8000-000000000007',
	'e8000000-0000-4000-8000-000000000007',
	'e9000000-0000-4000-8000-000000000007', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000008',
	'e1000000-0000-4000-8000-000000000008',
	'e2000000-0000-4000-8000-000000000008',
	'e3000000-0000-4000-8000-000000000008',
	'e8000000-0000-4000-8000-000000000008',
	'e9000000-0000-4000-8000-000000000008', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000009',
	'e1000000-0000-4000-8000-000000000009',
	'e2000000-0000-4000-8000-000000000009',
	'e3000000-0000-4000-8000-000000000009',
	'e8000000-0000-4000-8000-000000000009',
	'e9000000-0000-4000-8000-000000000009', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000010',
	'e1000000-0000-4000-8000-000000000010',
	'e2000000-0000-4000-8000-000000000010',
	'e3000000-0000-4000-8000-000000000010',
	'e8000000-0000-4000-8000-000000000010',
	'e9000000-0000-4000-8000-000000000010', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000011',
	'e1000000-0000-4000-8000-000000000011',
	'e2000000-0000-4000-8000-000000000011',
	'e3000000-0000-4000-8000-000000000011',
	'e8000000-0000-4000-8000-000000000011',
	'e9000000-0000-4000-8000-000000000011', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000012',
	'e1000000-0000-4000-8000-000000000012',
	'e2000000-0000-4000-8000-000000000012',
	'e3000000-0000-4000-8000-000000000012',
	'e8000000-0000-4000-8000-000000000012',
	'e9000000-0000-4000-8000-000000000012', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000013',
	'e1000000-0000-4000-8000-000000000013',
	'e2000000-0000-4000-8000-000000000013',
	'e3000000-0000-4000-8000-000000000013',
	'e8000000-0000-4000-8000-000000000013',
	'e9000000-0000-4000-8000-000000000013', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000014',
	'e1000000-0000-4000-8000-000000000014',
	'e2000000-0000-4000-8000-000000000014',
	'e3000000-0000-4000-8000-000000000014',
	'e8000000-0000-4000-8000-000000000014',
	'e9000000-0000-4000-8000-000000000014', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000015',
	'e1000000-0000-4000-8000-000000000015',
	'e2000000-0000-4000-8000-000000000015',
	'e3000000-0000-4000-8000-000000000015',
	'e8000000-0000-4000-8000-000000000015', NULL, 'queued', 0
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000016',
	'e1000000-0000-4000-8000-000000000016',
	'e2000000-0000-4000-8000-000000000016',
	'e3000000-0000-4000-8000-000000000016',
	'e8000000-0000-4000-8000-000000000016',
	'e9000000-0000-4000-8000-000000000016', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000017',
	'e1000000-0000-4000-8000-000000000017',
	'e2000000-0000-4000-8000-000000000017',
	'e3000000-0000-4000-8000-000000000017',
	'e8000000-0000-4000-8000-000000000017',
	'e9000000-0000-4000-8000-000000000017', 'running', 1
);
SELECT pg_temp.seed_worker_turn(
	'e4000000-0000-4000-8000-000000000018',
	'e1000000-0000-4000-8000-000000000018',
	'e2000000-0000-4000-8000-000000000018',
	'e3000000-0000-4000-8000-000000000018',
	'e8000000-0000-4000-8000-000000000018',
	'e9000000-0000-4000-8000-000000000018', 'running', 1
);

DO $$
DECLARE
	v_finalize regprocedure := to_regprocedure(
		'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'
	);
	v_cancel regprocedure := to_regprocedure(
		'public.request_agentic_chat_turn_cancel(uuid,uuid,text,text)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_finalize IS NOT NULL, 'terminal finalizer RPC is missing');
	PERFORM pg_temp.assert_true(v_cancel IS NOT NULL, 'cancellation RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_finalize, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_finalize, 'EXECUTE')
			AND has_function_privilege('service_role', v_finalize, 'EXECUTE'),
		'terminal finalizer grants are not service-only'
	);
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_cancel, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_cancel, 'EXECUTE')
			AND has_function_privilege('service_role', v_cancel, 'EXECUTE'),
		'cancellation grants are not service-only'
	);
END;
$$;

SET ROLE service_role;
CREATE TEMP TABLE terminal_results (name text PRIMARY KEY, result jsonb);

-- Queued cancellation owns the queue and terminal turn in one transaction,
-- even after the generic claimer has moved the row to processing. It emits
-- generation-zero terminal truth, clears that token, and creates no assistant.
UPDATE public.queue_jobs
SET status = 'processing',
	processing_token = 'e9000000-0000-4000-8000-000000000001',
	started_at = now()
WHERE id = 'e3000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.finalize_agentic_chat_turn(
				'e4000000-0000-4000-8000-000000000001',
				'e1000000-0000-4000-8000-000000000001',
				'e3000000-0000-4000-8000-000000000001',
				NULL, 0, 'cancelled', 'user_cancelled', NULL,
				NULL, '', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
			)
		$test$,
		'agentic_chat_finalize_cancel_not_requested'
	),
	'direct queued finalization bypassed the accepted cancellation command'
);
INSERT INTO terminal_results VALUES (
	'queued_cancel',
	public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'user_cancelled', 'browser'
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancelled'
		AND result->>'status' = 'cancelled'
		AND result->>'terminal_event_id'
			= 'e4000000-0000-4000-8000-000000000001:0:1'
	 FROM terminal_results WHERE name = 'queued_cancel')
		AND (
			SELECT turns.status = 'cancelled'
				AND turns.cancel_reason = 'user_cancelled'
				AND turns.assistant_message_id IS NULL
				AND turns.terminalized_at IS NOT NULL
				AND jobs.status::text = 'cancelled'
				AND jobs.processing_token IS NULL
			FROM public.chat_turn_runs turns
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000001'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_messages
			WHERE metadata->>'idempotency_key'
				= 'chat-turn:e4000000-0000-4000-8000-000000000001:assistant'
		)
		AND (
			SELECT streams.assistant_text = ''
				AND streams.snapshot_sequence = 1
				AND streams.durable_through_sequence = 1
				AND streams.projection_durable_sequence = 1
				AND streams.reconcile_required
			FROM public.chat_turn_stream_state streams
			WHERE streams.turn_run_id = 'e4000000-0000-4000-8000-000000000001'
		),
	'queued cancellation left split queue/turn/event/stream/message truth'
);

INSERT INTO terminal_results VALUES (
	'queued_cancel_duplicate',
	public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'superseded', 'operator'
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'already_terminal'
		AND result->>'status' = 'cancelled'
		AND result->>'terminal_event_id'
			= 'e4000000-0000-4000-8000-000000000001:0:1'
	 FROM terminal_results WHERE name = 'queued_cancel_duplicate')
		AND (SELECT count(*) FROM public.chat_turn_events
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000001') = 1,
	'duplicate queued cancellation rewrote terminal truth'
);

-- A normal completion persists exactly one message and the complete terminal
-- text/projection/event/status. A changed retry resolves the committed receipt.
INSERT INTO terminal_results VALUES (
	'completed',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000002',
		'e3000000-0000-4000-8000-000000000002',
		'e9000000-0000-4000-8000-000000000002',
		1, 'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000002',
		'Complete authoritative answer', '{"model":"fixture"}'::jsonb,
		10, 5, 15,
		'{"cards":[{"id":"final"}]}'::jsonb,
		'{"provider":"fixture"}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized'
		AND result->>'status' = 'completed'
		AND result->>'assistant_message_id'
			= 'e5000000-0000-4000-8000-000000000002'
	 FROM terminal_results WHERE name = 'completed')
		AND (
			SELECT turns.status = 'completed'
				AND turns.assistant_message_id = messages.id
				AND messages.role = 'assistant'
				AND messages.content = 'Complete authoritative answer'
				AND messages.total_tokens = 15
				AND messages.metadata->>'idempotency_key'
					= 'chat-turn:' || turns.id::text || ':assistant'
			FROM public.chat_turn_runs turns
			JOIN public.chat_messages messages ON messages.id = turns.assistant_message_id
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000002'
		)
		AND (
			SELECT streams.assistant_text = 'Complete authoritative answer'
				AND streams.projection->'terminal'->>'status' = 'completed'
				AND streams.reconcile_required
			FROM public.chat_turn_stream_state streams
			WHERE streams.turn_run_id = 'e4000000-0000-4000-8000-000000000002'
		)
		AND (
			SELECT events.event_type = 'done'
				AND events.phase = 'finalize'
				AND events.payload->>'status' = 'completed'
			FROM public.chat_turn_events events
			WHERE events.event_id = 'e4000000-0000-4000-8000-000000000002:1:1'
		),
	'completion did not atomically persist exact terminal truth'
);

INSERT INTO terminal_results VALUES (
	'completed_duplicate',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000002',
		'e3000000-0000-4000-8000-000000000002',
		'e9000000-0000-4000-8000-000000000099',
		0, 'failed', 'changed retry', 'changed',
		'e5000000-0000-4000-8000-000000000099',
		'changed retry text', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'already_terminal'
		AND result->>'status' = 'completed'
		AND result->>'assistant_message_id'
			= 'e5000000-0000-4000-8000-000000000002'
	 FROM terminal_results WHERE name = 'completed_duplicate')
		AND (SELECT count(*) FROM public.chat_messages
			WHERE metadata->>'idempotency_key'
				= 'chat-turn:e4000000-0000-4000-8000-000000000002:assistant') = 1
		AND (SELECT count(*) FROM public.chat_turn_events
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000002') = 1,
	'lost-response retry did not resolve the immutable terminal receipt'
);

-- Running cancellation records only the first request/signal. It blocks
-- completion, then permits one partial cancelled finalization.
INSERT INTO terminal_results VALUES (
	'running_cancel',
	public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'user_cancelled', 'browser'
	)
), (
	'running_cancel_duplicate',
	public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'superseded', 'operator'
	)
);
SELECT pg_temp.assert_true(
	(SELECT count(DISTINCT result->>'signal_id') = 1 FROM terminal_results
		WHERE name IN ('running_cancel', 'running_cancel_duplicate'))
		AND (SELECT bool_and(result->>'outcome' = 'cancel_requested') FROM terminal_results
			WHERE name IN ('running_cancel', 'running_cancel_duplicate'))
		AND (SELECT bool_and(result->>'cancel_reason' = 'user_cancelled') FROM terminal_results
			WHERE name IN ('running_cancel', 'running_cancel_duplicate'))
		AND (SELECT count(*) FROM public.chat_turn_signals
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000003') = 1,
	'duplicate running cancellation rewrote or duplicated the accepted signal'
);

INSERT INTO terminal_results VALUES (
	'cancel_blocks_complete',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'e3000000-0000-4000-8000-000000000003',
		'e9000000-0000-4000-8000-000000000003',
		1, 'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000003',
		'late completion', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancel_requested'
	 FROM terminal_results WHERE name = 'cancel_blocks_complete')
		AND (SELECT status = 'running' AND terminal_event_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000003')
		AND NOT EXISTS (SELECT 1 FROM public.chat_messages
			WHERE id = 'e5000000-0000-4000-8000-000000000003'),
	'accepted cancellation did not block competing completion'
);

INSERT INTO terminal_results VALUES (
	'cancelled_partial',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000003',
		'e3000000-0000-4000-8000-000000000003',
		'e9000000-0000-4000-8000-000000000003',
		1, 'cancelled', 'user_cancelled', NULL,
		'e5000000-0000-4000-8000-000000000003',
		'Partial answer', '{}'::jsonb, 4, 2, 6, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized' AND result->>'status' = 'cancelled'
	 FROM terminal_results WHERE name = 'cancelled_partial')
		AND (
			SELECT messages.metadata->>'interrupted' = 'true'
				AND messages.metadata->>'partial' = 'true'
				AND messages.content = 'Partial answer'
			FROM public.chat_messages messages
			WHERE messages.id = 'e5000000-0000-4000-8000-000000000003'
		),
	'cancelled partial message is missing exact interrupted metadata'
);

-- Stale generations are typed no-ops and forged processing tokens fail closed.
INSERT INTO terminal_results VALUES (
	'stale_generation',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000004',
		'e1000000-0000-4000-8000-000000000004',
		'e3000000-0000-4000-8000-000000000004',
		'e9000000-0000-4000-8000-000000000004',
		1, 'failed', 'stale', 'stale_generation', NULL, '', '{}'::jsonb,
		NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'stale_generation'
		AND (result->>'execution_generation')::integer = 2
	 FROM terminal_results WHERE name = 'stale_generation')
		AND (SELECT status = 'running' AND terminal_event_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000004'),
	'stale generation changed terminal state'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.finalize_agentic_chat_turn(
				'e4000000-0000-4000-8000-000000000005',
				'e1000000-0000-4000-8000-000000000005',
				'e3000000-0000-4000-8000-000000000005',
				'e9000000-0000-4000-8000-000000000099',
				1, 'failed', 'ownership', 'ownership_lost', NULL, '', '{}'::jsonb,
				NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
			)
		$test$,
		'agentic_chat_finalize_ownership_lost'
	),
	'forged queue processing token retained terminal authority'
);

-- Completed empty output still owns exactly one assistant message. Independently
-- optional provider usage is preserved, and domain finalization deliberately
-- leaves the running queue row/token for generic completion or chat recovery.
INSERT INTO terminal_results VALUES (
	'completed_empty_total_only',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000009',
		'e1000000-0000-4000-8000-000000000009',
		'e3000000-0000-4000-8000-000000000009',
		'e9000000-0000-4000-8000-000000000009',
		1, 'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000009', '', '{}'::jsonb,
		NULL, NULL, 12, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized'
		FROM terminal_results WHERE name = 'completed_empty_total_only')
		AND (
			SELECT messages.content = ''
				AND messages.prompt_tokens IS NULL
				AND messages.completion_tokens IS NULL
				AND messages.total_tokens = 12
				AND jobs.status::text = 'processing'
				AND jobs.processing_token = 'e9000000-0000-4000-8000-000000000009'
			FROM public.chat_turn_runs turns
			JOIN public.chat_messages messages ON messages.id = turns.assistant_message_id
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000009'
		),
	'empty completion, total-only usage, or running queue ownership was not preserved'
);

-- A failed turn with no partial text owns no assistant message.
INSERT INTO terminal_results VALUES (
	'failed_empty',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000010',
		'e1000000-0000-4000-8000-000000000010',
		'e3000000-0000-4000-8000-000000000010',
		'e9000000-0000-4000-8000-000000000010',
		1, 'failed', 'provider_error', 'provider_error',
		NULL, '', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'status' = 'failed'
		FROM terminal_results WHERE name = 'failed_empty')
		AND (SELECT assistant_message_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000010'),
	'failed empty output created a synthetic assistant message'
);

-- A single supplied usage component is also valid when a message exists.
INSERT INTO terminal_results VALUES (
	'completed_prompt_only',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000011',
		'e1000000-0000-4000-8000-000000000011',
		'e3000000-0000-4000-8000-000000000011',
		'e9000000-0000-4000-8000-000000000011',
		1, 'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000011', 'prompt-only usage', '{}'::jsonb,
		7, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT prompt_tokens = 7 AND completion_tokens IS NULL AND total_tokens IS NULL
		FROM public.chat_messages
		WHERE id = 'e5000000-0000-4000-8000-000000000011'),
	'partial provider token usage was not persisted exactly'
);

-- Null commands and invalid complete arithmetic fail with the typed boundary
-- errors and leave the active turn untouched.
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.finalize_agentic_chat_turn(
				'e4000000-0000-4000-8000-000000000012',
				'e1000000-0000-4000-8000-000000000012',
				'e3000000-0000-4000-8000-000000000012',
				'e9000000-0000-4000-8000-000000000012',
				1, NULL, 'stop', NULL,
				'e5000000-0000-4000-8000-000000000012', 'invalid', '{}'::jsonb,
				NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
			)
		$test$,
		'agentic_chat_finalize_invalid_terminal_status'
	)
		AND pg_temp.expect_error(
			$test$
				SELECT public.request_agentic_chat_turn_cancel(
					'e4000000-0000-4000-8000-000000000012',
					'e1000000-0000-4000-8000-000000000012',
					NULL, 'browser'
				)
			$test$,
			'agentic_chat_cancel_invalid_command'
		)
		AND pg_temp.expect_error(
			$test$
				SELECT public.request_agentic_chat_turn_cancel(
					'e4000000-0000-4000-8000-000000000012',
					'e1000000-0000-4000-8000-000000000012',
					'user_cancelled', NULL
				)
			$test$,
			'agentic_chat_cancel_invalid_command'
		)
		AND pg_temp.expect_error(
			$test$
				SELECT public.finalize_agentic_chat_turn(
					'e4000000-0000-4000-8000-000000000012',
					'e1000000-0000-4000-8000-000000000012',
					'e3000000-0000-4000-8000-000000000012',
					'e9000000-0000-4000-8000-000000000012',
					1, 'completed', 'stop', NULL,
					'e5000000-0000-4000-8000-000000000012', 'invalid math', '{}'::jsonb,
					10, 5, 99, '{}'::jsonb, '{}'::jsonb
				)
			$test$,
			'agentic_chat_finalize_invalid_token_usage'
		)
		AND pg_temp.expect_error(
			$test$
				SELECT public.finalize_agentic_chat_turn(
					'e4000000-0000-4000-8000-000000000012',
					'e1000000-0000-4000-8000-000000000012',
					'e3000000-0000-4000-8000-000000000012',
					'e9000000-0000-4000-8000-000000000012',
					1, 'failed', 'provider_error', 'provider_error',
					NULL, '', '{}'::jsonb,
					1, NULL, NULL, '{}'::jsonb, '{}'::jsonb
				)
			$test$,
			'agentic_chat_finalize_invalid_token_usage'
		)
		AND (SELECT status = 'running' AND terminal_event_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000012'),
	'invalid terminal/cancel command validation was nullable, untyped, or stateful'
);

-- A fully authoritative pre-existing service row is adopted by idempotency key
-- even when the caller's proposed UUID differs.
INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata,
	prompt_tokens, completion_tokens, total_tokens
) VALUES (
	'e5000000-0000-4000-8000-000000000093',
	'e2000000-0000-4000-8000-000000000013',
	'e1000000-0000-4000-8000-000000000013',
	'assistant',
	'adopt exact winner',
	jsonb_build_object(
		'idempotency_key', 'chat-turn:e4000000-0000-4000-8000-000000000013:assistant',
		'turn_run_id', 'e4000000-0000-4000-8000-000000000013',
		'execution_generation', 1,
		'finished_reason', 'stop',
		'terminal_status', 'completed',
		'interrupted', false,
		'partial', false
	),
	2, 1, 3
);
INSERT INTO terminal_results VALUES (
	'adopt_exact_message',
	public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000013',
		'e1000000-0000-4000-8000-000000000013',
		'e3000000-0000-4000-8000-000000000013',
		'e9000000-0000-4000-8000-000000000013',
		1, 'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000013', 'adopt exact winner', '{}'::jsonb,
		2, 1, 3, '{}'::jsonb, '{}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'assistant_message_id'
			= 'e5000000-0000-4000-8000-000000000093'
		FROM terminal_results WHERE name = 'adopt_exact_message'),
	'authoritative existing assistant message was not adopted'
);

-- Matching content/tokens are insufficient when authoritative worker metadata
-- is absent; the conflict must roll the terminal attempt back.
INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata
) VALUES (
	'e5000000-0000-4000-8000-000000000094',
	'e2000000-0000-4000-8000-000000000014',
	'e1000000-0000-4000-8000-000000000014',
	'assistant',
	'malformed winner',
	jsonb_build_object(
		'idempotency_key', 'chat-turn:e4000000-0000-4000-8000-000000000014:assistant'
	)
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.finalize_agentic_chat_turn(
				'e4000000-0000-4000-8000-000000000014',
				'e1000000-0000-4000-8000-000000000014',
				'e3000000-0000-4000-8000-000000000014',
				'e9000000-0000-4000-8000-000000000014',
				1, 'completed', 'stop', NULL,
				'e5000000-0000-4000-8000-000000000014', 'malformed winner', '{}'::jsonb,
				NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
			)
		$test$,
		'agentic_chat_finalize_assistant_message_conflict'
	)
		AND (SELECT status = 'running' AND assistant_message_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000014'),
	'malformed existing assistant metadata was adopted or partially finalized'
);
RESET ROLE;

-- Transaction rollback proves no message/event/projection/terminal fragment can
-- escape independently.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'e4000000-0000-4000-8000-000000000006',
	'e1000000-0000-4000-8000-000000000006',
	'e3000000-0000-4000-8000-000000000006',
	'e9000000-0000-4000-8000-000000000006',
	1, 'completed', 'stop', NULL,
	'e5000000-0000-4000-8000-000000000006', 'rolled back', '{}'::jsonb,
	1, 1, 2, '{}'::jsonb, '{}'::jsonb
);
ROLLBACK;
SELECT pg_temp.assert_true(
	(SELECT status = 'running' AND terminal_event_id IS NULL AND assistant_message_id IS NULL
	 FROM public.chat_turn_runs WHERE id = 'e4000000-0000-4000-8000-000000000006')
		AND NOT EXISTS (SELECT 1 FROM public.chat_messages
			WHERE id = 'e5000000-0000-4000-8000-000000000006')
		AND NOT EXISTS (SELECT 1 FROM public.chat_turn_events
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000006')
		AND (SELECT snapshot_sequence = 0 AND assistant_text = ''
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000006'),
	'finalization rollback left a partial durable outcome'
);

-- Completion-first race: finalizer holds the turn lock while cancel waits, so
-- the later cancel resolves the immutable completed receipt.
CREATE OR REPLACE FUNCTION public.test_pause_terminal_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id = 'e4000000-0000-4000-8000-000000000007'
		AND OLD.status = 'running' AND NEW.status = 'completed' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_terminal_completion
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_terminal_completion();

SELECT dblink_connect('terminal_complete_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('terminal_complete_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_send_query('terminal_complete_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000007',
		'e1000000-0000-4000-8000-000000000007',
		'e3000000-0000-4000-8000-000000000007',
		'e9000000-0000-4000-8000-000000000007', 1,
		'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000007', 'completion wins', '{}'::jsonb,
		NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('terminal_complete_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000007',
		'e1000000-0000-4000-8000-000000000007',
		'user_cancelled', 'browser'
	) FROM trusted
$query$);
CREATE TEMP TABLE completion_first_results (result jsonb);
INSERT INTO completion_first_results
SELECT result FROM dblink_get_result('terminal_complete_a', false) AS response(result jsonb);
INSERT INTO completion_first_results
SELECT result FROM dblink_get_result('terminal_complete_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM completion_first_results WHERE result->>'outcome' = 'finalized') = 1
		AND (SELECT count(*) FROM completion_first_results WHERE result->>'outcome' = 'already_terminal') = 1
		AND (SELECT status = 'completed' AND cancel_requested_at IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000007'),
	'completion-first race did not preserve one immutable winner'
);
SELECT dblink_disconnect('terminal_complete_a');
SELECT dblink_disconnect('terminal_complete_b');
DROP TRIGGER test_pause_terminal_completion ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_terminal_completion();

-- Cancel-first race: the accepted request holds the same turn lock, and the
-- competing completion returns cancel_requested without a terminal write.
CREATE OR REPLACE FUNCTION public.test_pause_terminal_cancel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id = 'e4000000-0000-4000-8000-000000000008'
		AND OLD.cancel_requested_at IS NULL AND NEW.cancel_requested_at IS NOT NULL THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_terminal_cancel
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_terminal_cancel();

SELECT dblink_connect('terminal_cancel_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('terminal_cancel_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_send_query('terminal_cancel_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000008',
		'e1000000-0000-4000-8000-000000000008',
		'user_cancelled', 'browser'
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('terminal_cancel_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000008',
		'e1000000-0000-4000-8000-000000000008',
		'e3000000-0000-4000-8000-000000000008',
		'e9000000-0000-4000-8000-000000000008', 1,
		'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000008', 'completion loses', '{}'::jsonb,
		NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	) FROM trusted
$query$);
CREATE TEMP TABLE cancel_first_results (result jsonb);
INSERT INTO cancel_first_results
SELECT result FROM dblink_get_result('terminal_cancel_a', false) AS response(result jsonb);
INSERT INTO cancel_first_results
SELECT result FROM dblink_get_result('terminal_cancel_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM cancel_first_results WHERE result->>'outcome' = 'cancel_requested') = 2
		AND (SELECT status = 'running' AND cancel_requested_at IS NOT NULL
				AND terminal_event_id IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'e4000000-0000-4000-8000-000000000008')
		AND NOT EXISTS (SELECT 1 FROM public.chat_messages
			WHERE id = 'e5000000-0000-4000-8000-000000000008'),
	'cancel-first race allowed competing completion truth'
);
SELECT dblink_disconnect('terminal_cancel_a');
SELECT dblink_disconnect('terminal_cancel_b');
DROP TRIGGER test_pause_terminal_cancel ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_terminal_cancel();

-- A chat-message insert that wins after the finalizer's first lookup is
-- reselected and adopted in the same terminal call when its full authoritative
-- content/metadata/usage match.
CREATE OR REPLACE FUNCTION public.test_pause_terminal_message_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id = 'e5000000-0000-4000-8000-000000000016' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_terminal_message_insert
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.test_pause_terminal_message_insert();

SELECT dblink_connect('message_race_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('message_race_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_send_query('message_race_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000016',
		'e1000000-0000-4000-8000-000000000016',
		'e3000000-0000-4000-8000-000000000016',
		'e9000000-0000-4000-8000-000000000016', 1,
		'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000016', 'concurrent winner', '{}'::jsonb,
		3, 2, 5, '{}'::jsonb, '{}'::jsonb
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('message_race_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata,
		prompt_tokens, completion_tokens, total_tokens
	)
	SELECT
		'e5000000-0000-4000-8000-000000000096',
		turns.session_id,
		turns.user_id,
		'assistant',
		'concurrent winner',
		jsonb_build_object(
			'idempotency_key', 'chat-turn:' || turns.id::text || ':assistant',
			'turn_run_id', turns.id,
			'execution_generation', turns.execution_generation,
			'finished_reason', 'stop',
			'terminal_status', 'completed',
			'interrupted', false,
			'partial', false
		),
		3, 2, 5
	FROM public.chat_turn_runs turns, trusted
	WHERE turns.id = 'e4000000-0000-4000-8000-000000000016'
	RETURNING id
$query$);
CREATE TEMP TABLE message_race_result (result jsonb);
INSERT INTO message_race_result
SELECT result FROM dblink_get_result('message_race_a', false) AS response(result jsonb);
SELECT id FROM dblink_get_result('message_race_b', false) AS response(id uuid);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized'
			AND result->>'assistant_message_id' = 'e5000000-0000-4000-8000-000000000096'
		FROM message_race_result)
		AND (SELECT count(*) FROM public.chat_messages
			WHERE metadata->>'idempotency_key'
				= 'chat-turn:e4000000-0000-4000-8000-000000000016:assistant') = 1,
	'finalizer did not adopt the exact concurrent idempotency winner'
);
SELECT dblink_disconnect('message_race_a');
SELECT dblink_disconnect('message_race_b');
DROP TRIGGER test_pause_terminal_message_insert ON public.chat_messages;
DROP FUNCTION public.test_pause_terminal_message_insert();

-- Genuine cancel-before-domain-claim race: the queued cancellation holds the
-- turn lock, terminalizes the already-processing queue row, and the late claim
-- loses queue ownership without creating a generation or starting model work.
UPDATE public.queue_jobs
SET status = 'processing',
	processing_token = 'e9000000-0000-4000-8000-000000000015',
	started_at = now()
WHERE id = 'e3000000-0000-4000-8000-000000000015';

CREATE OR REPLACE FUNCTION public.test_pause_queued_terminal_cancel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id = 'e4000000-0000-4000-8000-000000000015'
		AND OLD.cancel_requested_at IS NULL AND NEW.cancel_requested_at IS NOT NULL THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_queued_terminal_cancel
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_queued_terminal_cancel();

CREATE OR REPLACE FUNCTION public.test_claim_after_cancel_result()
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
	RETURN public.claim_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000015',
		'e3000000-0000-4000-8000-000000000015',
		'e9000000-0000-4000-8000-000000000015'
	);
EXCEPTION WHEN OTHERS THEN
	RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

SELECT dblink_connect('claim_cancel_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('claim_cancel_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_send_query('claim_cancel_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000015',
		'e1000000-0000-4000-8000-000000000015',
		'user_cancelled', 'browser'
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('claim_cancel_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.test_claim_after_cancel_result() FROM trusted
$query$);
CREATE TEMP TABLE claim_cancel_results (name text, result jsonb);
INSERT INTO claim_cancel_results
SELECT 'cancel', result
FROM dblink_get_result('claim_cancel_a', false) AS response(result jsonb);
INSERT INTO claim_cancel_results
SELECT 'claim', result
FROM dblink_get_result('claim_cancel_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancelled'
		FROM claim_cancel_results WHERE name = 'cancel')
		AND (SELECT result->>'error' LIKE '%agentic_chat_claim_ownership_lost%'
			FROM claim_cancel_results WHERE name = 'claim')
		AND (
			SELECT turns.status = 'cancelled'
				AND turns.execution_generation = 0
				AND jobs.status::text = 'cancelled'
				AND jobs.processing_token IS NULL
			FROM public.chat_turn_runs turns
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000015'
		),
	'cancel-before-claim race started execution or left queue/domain truth split'
);
SELECT dblink_disconnect('claim_cancel_a');
SELECT dblink_disconnect('claim_cancel_b');
DROP TRIGGER test_pause_queued_terminal_cancel ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_queued_terminal_cancel();
DROP FUNCTION public.test_claim_after_cancel_result();

-- A cancellation that waits behind an existing turn lock must timestamp the
-- accepted request after that lock is released, not when the RPC first began.
SELECT dblink_connect('cancel_clock_lock', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('cancel_clock_request', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_exec('cancel_clock_lock', 'BEGIN');
SELECT id
FROM dblink(
	'cancel_clock_lock',
	$lock$SELECT id FROM public.chat_turn_runs
		WHERE id = 'e4000000-0000-4000-8000-000000000017' FOR UPDATE$lock$
) AS locked(id uuid);
SELECT dblink_send_query('cancel_clock_request', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000017',
		'e1000000-0000-4000-8000-000000000017',
		'user_cancelled', 'browser'
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
CREATE TEMP TABLE cancel_clock_threshold AS
SELECT clock_timestamp() AS released_after;
SELECT dblink_exec('cancel_clock_lock', 'COMMIT');
CREATE TEMP TABLE cancel_clock_result (result jsonb);
INSERT INTO cancel_clock_result
SELECT result
FROM dblink_get_result('cancel_clock_request', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancel_requested' FROM cancel_clock_result)
		AND (
			SELECT turns.cancel_requested_at >= threshold.released_after
			FROM public.chat_turn_runs turns
			CROSS JOIN cancel_clock_threshold threshold
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000017'
		),
	'cancel timestamp was captured before its governing turn lock'
);
SELECT dblink_disconnect('cancel_clock_lock');
SELECT dblink_disconnect('cancel_clock_request');

-- Terminal timestamps likewise begin only after the finalizer acquires the
-- queue ownership lock, not while it is waiting behind another transaction.
SELECT dblink_connect('terminal_clock_lock', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('terminal_clock_request', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_exec('terminal_clock_lock', 'BEGIN');
SELECT id
FROM dblink(
	'terminal_clock_lock',
	$lock$SELECT id FROM public.queue_jobs
		WHERE id = 'e3000000-0000-4000-8000-000000000018' FOR UPDATE$lock$
) AS locked(id uuid);
SELECT dblink_send_query('terminal_clock_request', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000018',
		'e1000000-0000-4000-8000-000000000018',
		'e3000000-0000-4000-8000-000000000018',
		'e9000000-0000-4000-8000-000000000018', 1,
		'completed', 'stop', NULL,
		'e5000000-0000-4000-8000-000000000018', 'post-lock timestamp', '{}'::jsonb,
		NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
CREATE TEMP TABLE terminal_clock_threshold AS
SELECT clock_timestamp() AS released_after;
SELECT dblink_exec('terminal_clock_lock', 'COMMIT');
CREATE TEMP TABLE terminal_clock_result (result jsonb);
INSERT INTO terminal_clock_result
SELECT result
FROM dblink_get_result('terminal_clock_request', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized' FROM terminal_clock_result)
		AND (
			SELECT turns.terminalized_at >= threshold.released_after
			FROM public.chat_turn_runs turns
			CROSS JOIN terminal_clock_threshold threshold
			WHERE turns.id = 'e4000000-0000-4000-8000-000000000018'
		),
	'terminal timestamp was captured before queue ownership was locked'
);
SELECT dblink_disconnect('terminal_clock_lock');
SELECT dblink_disconnect('terminal_clock_request');

-- Signed request-role validation survives SECURITY DEFINER wrappers.
CREATE OR REPLACE FUNCTION public.test_terminal_cancel_wrapper()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000008',
		'e1000000-0000-4000-8000-000000000008', 'user_cancelled', 'browser'
	)
$$;
CREATE OR REPLACE FUNCTION public.test_terminal_finalize_wrapper()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
	SELECT public.finalize_agentic_chat_turn(
		'e4000000-0000-4000-8000-000000000008',
		'e1000000-0000-4000-8000-000000000008',
		'e3000000-0000-4000-8000-000000000008',
		'e9000000-0000-4000-8000-000000000008', 1,
		'cancelled', 'user_cancelled', NULL, NULL, '', '{}'::jsonb,
		NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
	)
$$;
GRANT EXECUTE ON FUNCTION public.test_terminal_cancel_wrapper() TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_terminal_finalize_wrapper() TO authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error('SELECT public.test_terminal_cancel_wrapper()', 'agentic_chat_cancel_service_role_required')
		AND pg_temp.expect_error('SELECT public.test_terminal_finalize_wrapper()', 'agentic_chat_finalize_service_role_required'),
	'definer wrapper bypassed a terminal control request-role check'
);
RESET ROLE;
RESET request.jwt.claims;
DROP FUNCTION public.test_terminal_cancel_wrapper();
DROP FUNCTION public.test_terminal_finalize_wrapper();

-- Package-only rollback removes Slice 4 while every earlier Phase 2B control
-- primitive and the historical event key remain independently restorable.
BEGIN;
DROP FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text);
DROP FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
);
DROP TRIGGER trg_chat_messages_agentic_chat_idempotency ON public.chat_messages;
DROP FUNCTION public.validate_agentic_chat_message_idempotency_key();
DROP TRIGGER trg_chat_turn_events_validate ON public.chat_turn_events;
DROP FUNCTION public.validate_agentic_chat_turn_event_write();
ALTER TABLE public.chat_turn_events
	ADD CONSTRAINT uq_chat_turn_events_sequence UNIQUE (turn_run_id, sequence_index);
DROP INDEX public.uq_chat_turn_events_generation_sequence;
DROP INDEX public.uq_chat_turn_events_event_id;
ALTER TABLE public.chat_turn_events
	DROP CONSTRAINT chk_chat_turn_events_execution_generation,
	DROP CONSTRAINT chk_chat_turn_events_event_id_shape,
	DROP COLUMN execution_generation,
	DROP COLUMN event_id;
SELECT pg_temp.assert_true(
	to_regprocedure('public.request_agentic_chat_turn_cancel(uuid,uuid,text,text)') IS NULL
		AND to_regprocedure('public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)') IS NULL
		AND to_regprocedure('public.validate_agentic_chat_message_idempotency_key()') IS NULL
		AND EXISTS (
			SELECT 1 FROM pg_constraint constraints
			WHERE constraints.conrelid = 'public.chat_turn_events'::regclass
				AND constraints.conname = 'uq_chat_turn_events_sequence'
		)
		AND to_regprocedure('public.claim_agentic_chat_turn(uuid,uuid,uuid)') IS NOT NULL
		AND to_regprocedure('public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)') IS NOT NULL,
	'Slice 4 rollback removed or depended on an earlier Phase 2B package'
);
ROLLBACK;

SELECT 'phase2b_terminal_control_ok' AS result;
