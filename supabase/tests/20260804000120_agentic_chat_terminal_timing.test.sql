-- supabase/tests/20260804000120_agentic_chat_terminal_timing.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 6.
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

INSERT INTO public.users (id)
VALUES ('f1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

CREATE OR REPLACE FUNCTION pg_temp.seed_timing_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_user_message_id uuid,
	p_correlation_id uuid,
	p_suffix text,
	p_last_sequence integer,
	p_with_text boolean,
	p_cancel_requested boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_admitted_at timestamptz := clock_timestamp() - interval '10 seconds';
	v_accepted_at timestamptz := v_admitted_at + interval '100 milliseconds';
	v_worker_started_at timestamptz := v_admitted_at + interval '200 milliseconds';
	v_provider_authorized_at timestamptz := v_admitted_at + interval '300 milliseconds';
BEGIN
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		p_user_message_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'user',
		'timing fixture ' || p_suffix,
		jsonb_build_object('idempotency_key', 'terminal-timing-user-' || p_suffix)
	);

	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		p_queue_job_id,
		'f1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_run_id,
			'correlationId', p_correlation_id
		),
		v_admitted_at,
		'agentic-chat-turn:' || p_turn_run_id::text,
		'processing',
		'agentic_chat_terminal_timing_' || p_suffix,
		p_processing_token,
		v_worker_started_at,
		0,
		3
	);

	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, execution_started_at,
		history_cutoff_at, last_progress_at, last_event_sequence, user_message_id,
		created_at, started_at, cache_source, cache_age_seconds,
		request_prewarmed_context, history_strategy, history_compressed,
		raw_history_count, history_for_model_count, prepared_prompt_hit,
		prepared_prompt_miss_reason, prepared_surface_profile,
		cancel_requested_at, cancel_reason
	) VALUES (
		p_turn_run_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'terminal-timing-stream-' || p_suffix,
		'terminal-timing-client-' || p_suffix,
		'global',
		'timing fixture ' || p_suffix,
		'running',
		'worker_realtime',
		p_queue_job_id,
		p_correlation_id,
		1,
		v_worker_started_at,
		v_provider_authorized_at,
		v_accepted_at,
		v_provider_authorized_at,
		p_last_sequence,
		p_user_message_id,
		v_admitted_at,
		v_accepted_at,
		'not_requested',
		NULL,
		false,
		'raw_history',
		false,
		0,
		0,
		false,
		NULL,
		NULL,
		CASE WHEN p_cancel_requested THEN v_provider_authorized_at ELSE NULL END,
		CASE WHEN p_cancel_requested THEN 'user_cancelled' ELSE NULL END
	);

	INSERT INTO public.chat_turn_events (
		turn_run_id, session_id, user_id, stream_run_id, execution_generation,
		sequence_index, event_id, phase, event_type, payload, created_at
	) VALUES (
		p_turn_run_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'terminal-timing-stream-' || p_suffix,
		1,
		1,
		p_turn_run_id::text || ':1:1',
		'stream',
		'turn_phase',
		'{"type":"turn_phase","turn_phase":"acknowledged"}'::jsonb,
		v_admitted_at + interval '500 milliseconds'
	);

	IF p_with_text THEN
		INSERT INTO public.chat_turn_events (
			turn_run_id, session_id, user_id, stream_run_id, execution_generation,
			sequence_index, event_id, phase, event_type, payload, created_at
		) VALUES (
			p_turn_run_id,
			'f2000000-0000-4000-8000-000000000001',
			'f1000000-0000-4000-8000-000000000001',
			'terminal-timing-stream-' || p_suffix,
			1,
			2,
			p_turn_run_id::text || ':1:2',
			'llm',
			'text_delta',
			'{"type":"text_delta","content":"fixture answer"}'::jsonb,
			v_admitted_at + interval '750 milliseconds'
		);
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation,
		snapshot_sequence, durable_through_sequence, projection_durable_sequence,
		assistant_text, projection
	) VALUES (
		p_turn_run_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		1,
		p_last_sequence,
		p_last_sequence,
		p_last_sequence,
		'fixture answer',
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb
	);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.timing_draft(p_turn_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_first_event_at timestamptz;
	v_first_response_at timestamptz;
	v_phases jsonb;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = p_turn_run_id;

	SELECT
		min(created_at),
		min(created_at) FILTER (WHERE event_type = 'text_delta')
	INTO v_first_event_at, v_first_response_at
	FROM public.chat_turn_events
	WHERE turn_run_id = p_turn_run_id
		AND execution_generation = v_turn.execution_generation;

	v_phases := jsonb_build_object(
		'admission_to_acceptance_ms',
			EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000,
		'queue_wait_ms',
			EXTRACT(epoch FROM (v_turn.worker_started_at - v_turn.started_at)) * 1000,
		'worker_start_to_provider_authority_ms',
			EXTRACT(epoch FROM (v_turn.execution_started_at - v_turn.worker_started_at)) * 1000,
		'time_to_first_event_ms',
			EXTRACT(epoch FROM (v_first_event_at - v_turn.created_at)) * 1000,
		'provider_authority_to_first_event_persistence_ms',
			EXTRACT(epoch FROM (v_first_event_at - v_turn.execution_started_at)) * 1000,
		'provider_authority_to_finish_ms', 1000,
		'provider_finish_to_terminal_call_ms', 50
	);
	IF v_first_response_at IS NOT NULL THEN
		v_phases := v_phases || jsonb_build_object(
			'time_to_first_response_ms',
				EXTRACT(epoch FROM (v_first_response_at - v_turn.created_at)) * 1000,
			'provider_authority_to_first_response_persistence_ms',
				EXTRACT(epoch FROM (v_first_response_at - v_turn.execution_started_at)) * 1000,
			'response_generation_ms', 600
		);
	END IF;

	RETURN jsonb_build_object(
		'timing_contract_version', 'agentic_chat_async_v1',
		'request_started_at', v_turn.created_at,
		'admitted_at', v_turn.created_at,
		'accepted_at', v_turn.started_at,
		'worker_started_at', v_turn.worker_started_at,
		'provider_authorized_at', v_turn.execution_started_at,
		'first_event_at', v_first_event_at,
		'first_response_at', v_first_response_at,
		'cache_source', v_turn.cache_source,
		'cache_age_seconds', v_turn.cache_age_seconds,
		'request_prewarmed_context', v_turn.request_prewarmed_context,
		'history_strategy', v_turn.history_strategy,
		'history_compressed', v_turn.history_compressed,
		'raw_history_count', v_turn.raw_history_count,
		'history_for_model_count', v_turn.history_for_model_count,
		'prepared_prompt_hit', v_turn.prepared_prompt_hit,
		'prepared_prompt_miss_reason', v_turn.prepared_prompt_miss_reason,
		'prepared_surface_profile', v_turn.prepared_surface_profile,
		'finished_reason', 'stop',
		'phases', v_phases
	);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.finalize_timing_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_assistant_message_id uuid,
	p_context_transition_id uuid,
	p_timing_transition_id uuid,
	p_timing_draft jsonb,
	p_projection_event_count integer,
	p_execution_generation integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_projection_events jsonb;
BEGIN
	SELECT COALESCE(
		jsonb_agg(jsonb_build_object('type', 'fixture', 'ordinal', value) ORDER BY value),
		'[]'::jsonb
	)
	INTO v_projection_events
	FROM generate_series(1, p_projection_event_count) AS fixture(value);

	RETURN public.finalize_agentic_chat_turn_with_terminal_events(
		p_turn_run_id,
		'f1000000-0000-4000-8000-000000000001',
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		'completed',
		'stop',
		NULL,
		p_assistant_message_id,
		'fixture answer',
		'{"completion_status":"completed","answer_source":"model"}'::jsonb,
		1,
		2,
		3,
		jsonb_build_object(
			'version', 'agentic_chat_ui_projection_v1',
			'current_activity', 'Finalizing...',
			'semantic_events', v_projection_events
		),
		'{"type":"done"}'::jsonb,
		'{"summary":"fixture answer","entities":{},"context_type":"global","data_accessed":[]}'::jsonb,
		p_context_transition_id,
		p_timing_draft,
		p_timing_transition_id
	);
END;
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)',
		'EXECUTE'
	),
	'terminal timing wrapper grants are not service-only'
);

-- Successful context -> timing -> done transaction with a 130-event input
-- projection. Only the newest 126 prior events may survive.
SELECT pg_temp.seed_timing_turn(
	'f4000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f9000000-0000-4000-8000-000000000001',
	'f5000000-0000-4000-8000-000000000001',
	'f8000000-0000-4000-8000-000000000001',
	'success', 2, true, false
);

CREATE TEMP TABLE success_receipt (receipt jsonb);
GRANT ALL ON success_receipt TO service_role;
SET ROLE service_role;
INSERT INTO success_receipt
SELECT pg_temp.finalize_timing_turn(
	'f4000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f9000000-0000-4000-8000-000000000001',
	'f6000000-0000-4000-8000-000000000001',
	'f7000000-0000-5000-8000-000000000001',
	'f7000000-0000-5000-8000-000000000002',
	pg_temp.timing_draft('f4000000-0000-4000-8000-000000000001'),
	130,
	1
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'finalized'
			AND (receipt->>'terminal_sequence_index')::integer = 5
			AND jsonb_array_length(receipt->'preterminal_events') = 2
			AND receipt->'preterminal_events'->0->>'event_type' = 'last_turn_context'
			AND (receipt->'preterminal_events'->0->>'sequence_index')::integer = 3
			AND receipt->'preterminal_events'->1->>'event_type' = 'timing'
			AND (receipt->'preterminal_events'->1->>'sequence_index')::integer = 4
		FROM success_receipt
	),
	'terminal receipt did not preserve the ordered three-event sequence'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 5
			AND array_agg(event_type ORDER BY sequence_index) =
				ARRAY['turn_phase', 'text_delta', 'last_turn_context', 'timing', 'done']::text[]
		FROM public.chat_turn_events
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
			AND execution_generation = 1
	),
	'durable terminal events are missing or out of order'
);

SELECT pg_temp.assert_true(
	(
		SELECT jsonb_array_length(projection->'semantic_events') = 128
			AND projection->'semantic_events'->0->>'ordinal' = '5'
			AND projection->'semantic_events'->125->>'ordinal' = '130'
			AND projection->'semantic_events'->126->>'type' = 'last_turn_context'
			AND projection->'semantic_events'->127->>'type' = 'timing'
			AND projection->>'current_activity' = ''
		FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
	),
	'terminal projection did not retain exactly 126 prior events plus context and timing'
);

SELECT pg_temp.assert_true(
	(
		SELECT
			timing.payload->'timing'->>'timing_contract_version' = 'agentic_chat_async_v1'
			AND timing.payload->'timing'->'done_emitted_at' = 'null'::jsonb
			AND (timing.payload->'timing'->>'assistant_persisted_at')::timestamptz =
				(receipt.receipt->>'terminalized_at')::timestamptz
			AND (timing.payload->'timing'->>'terminal_committed_at')::timestamptz =
				(receipt.receipt->>'terminalized_at')::timestamptz
			AND (timing.payload->'timing'->'phases'->>'total_request_ms')::numeric =
				EXTRACT(epoch FROM (
					(receipt.receipt->>'terminalized_at')::timestamptz - turns.created_at
				)) * 1000
			AND message.created_at = (receipt.receipt->>'terminalized_at')::timestamptz
			AND done.created_at = (receipt.receipt->>'terminalized_at')::timestamptz
			AND turns.terminalized_at = (receipt.receipt->>'terminalized_at')::timestamptz
		FROM success_receipt receipt
		JOIN public.chat_turn_runs turns
			ON turns.id = 'f4000000-0000-4000-8000-000000000001'
		JOIN public.chat_messages message
			ON message.id = 'f6000000-0000-4000-8000-000000000001'
		JOIN public.chat_turn_events timing
			ON timing.turn_run_id = turns.id AND timing.event_type = 'timing'
		JOIN public.chat_turn_events done
			ON done.turn_run_id = turns.id AND done.event_type = 'done'
	),
	'database-owned timing or terminal timestamps are inconsistent'
);

-- A lost successful response resolves terminal truth without attempting a
-- second prefix, even if the replay's optional payload is no longer usable.
CREATE TEMP TABLE replay_receipt (receipt jsonb);
GRANT ALL ON replay_receipt TO service_role;
SET ROLE service_role;
INSERT INTO replay_receipt
SELECT pg_temp.finalize_timing_turn(
	'f4000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f9000000-0000-4000-8000-000000000001',
	'f6000000-0000-4000-8000-000000000099',
	'f7000000-0000-5000-8000-000000000001',
	'f7000000-0000-5000-8000-000000000002',
	'null'::jsonb,
	0,
	1
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'already_terminal'
			AND NOT receipt ? 'preterminal_events'
	FROM replay_receipt
	)
	AND (
		SELECT count(*) = 5
		FROM public.chat_turn_events
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
	),
	'lost-response replay did not resolve immutable terminal truth'
);

-- A database-source mismatch must roll back before context, timing, message,
-- or done can become visible.
SELECT pg_temp.seed_timing_turn(
	'f4000000-0000-4000-8000-000000000002',
	'f3000000-0000-4000-8000-000000000002',
	'f9000000-0000-4000-8000-000000000002',
	'f5000000-0000-4000-8000-000000000002',
	'f8000000-0000-4000-8000-000000000002',
	'mismatch', 2, true, false
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$call$SELECT pg_temp.finalize_timing_turn(
				%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
				%L::jsonb, 0, 1
			)$call$,
			'f4000000-0000-4000-8000-000000000002',
			'f3000000-0000-4000-8000-000000000002',
			'f9000000-0000-4000-8000-000000000002',
			'f6000000-0000-4000-8000-000000000002',
			'f7000000-0000-5000-8000-000000000003',
			'f7000000-0000-5000-8000-000000000004',
			jsonb_set(
				pg_temp.timing_draft('f4000000-0000-4000-8000-000000000002'),
				'{phases,queue_wait_ms}',
				'999'::jsonb
			)::text
		),
		'agentic_chat_terminal_events_finalize_timing_evidence_mismatch'
	),
	'timing source mismatch was not rejected'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND last_event_sequence = 2
		FROM public.chat_turn_runs
		WHERE id = 'f4000000-0000-4000-8000-000000000002'
	)
	AND (
		SELECT count(*) = 2
		FROM public.chat_turn_events
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000002'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_messages
		WHERE id = 'f6000000-0000-4000-8000-000000000002'
	),
	'timing rejection leaked partial terminal state'
);

-- Stale-generation and cancellation winners must resolve through the original
-- terminal CAS before timing validation or semantic writes.
SELECT pg_temp.seed_timing_turn(
	'f4000000-0000-4000-8000-000000000003',
	'f3000000-0000-4000-8000-000000000003',
	'f9000000-0000-4000-8000-000000000003',
	'f5000000-0000-4000-8000-000000000003',
	'f8000000-0000-4000-8000-000000000003',
	'stale', 2, true, false
);
SELECT pg_temp.seed_timing_turn(
	'f4000000-0000-4000-8000-000000000004',
	'f3000000-0000-4000-8000-000000000004',
	'f9000000-0000-4000-8000-000000000004',
	'f5000000-0000-4000-8000-000000000004',
	'f8000000-0000-4000-8000-000000000004',
	'cancel', 2, true, true
);

CREATE TEMP TABLE control_receipts (kind text, receipt jsonb);
GRANT ALL ON control_receipts TO service_role;
SET ROLE service_role;
INSERT INTO control_receipts VALUES (
	'stale',
	pg_temp.finalize_timing_turn(
		'f4000000-0000-4000-8000-000000000003',
		'f3000000-0000-4000-8000-000000000003',
		'f9000000-0000-4000-8000-000000000003',
		'f6000000-0000-4000-8000-000000000003',
		'f7000000-0000-5000-8000-000000000005',
		'f7000000-0000-5000-8000-000000000006',
		'null'::jsonb,
		0,
		2
	)
), (
	'cancel',
	pg_temp.finalize_timing_turn(
		'f4000000-0000-4000-8000-000000000004',
		'f3000000-0000-4000-8000-000000000004',
		'f9000000-0000-4000-8000-000000000004',
		'f6000000-0000-4000-8000-000000000004',
		'f7000000-0000-5000-8000-000000000007',
		'f7000000-0000-5000-8000-000000000008',
		'null'::jsonb,
		0,
		1
	)
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'stale_generation' FROM control_receipts WHERE kind = 'stale')
	AND (SELECT receipt->>'outcome' = 'cancel_requested' FROM control_receipts WHERE kind = 'cancel')
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_events
		WHERE turn_run_id IN (
			'f4000000-0000-4000-8000-000000000003',
			'f4000000-0000-4000-8000-000000000004'
		)
		AND sequence_index > 2
	),
	'stale or cancellation resolution attempted terminal semantic writes'
);

-- Three-event capacity is rejected before integer addition or any write.
SELECT pg_temp.seed_timing_turn(
	'f4000000-0000-4000-8000-000000000005',
	'f3000000-0000-4000-8000-000000000005',
	'f9000000-0000-4000-8000-000000000005',
	'f5000000-0000-4000-8000-000000000005',
	'f8000000-0000-4000-8000-000000000005',
	'capacity', 2147483645, false, false
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$call$SELECT pg_temp.finalize_timing_turn(
				%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid,
				%L::jsonb, 0, 1
			)$call$,
			'f4000000-0000-4000-8000-000000000005',
			'f3000000-0000-4000-8000-000000000005',
			'f9000000-0000-4000-8000-000000000005',
			'f6000000-0000-4000-8000-000000000005',
			'f7000000-0000-5000-8000-000000000009',
			'f7000000-0000-5000-8000-00000000000a',
			pg_temp.timing_draft('f4000000-0000-4000-8000-000000000005')::text
		),
		'agentic_chat_terminal_events_finalize_sequence_exhausted'
	),
	'three-event finalization did not reserve all sequence slots'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND last_event_sequence = 2147483645
		FROM public.chat_turn_runs
		WHERE id = 'f4000000-0000-4000-8000-000000000005'
	)
	AND (
		SELECT count(*) = 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000005'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_messages
		WHERE id = 'f6000000-0000-4000-8000-000000000005'
	),
	'sequence-capacity rejection wrote partial terminal state'
);

SELECT 'phase4_slice6_terminal_timing_ok' AS result;
