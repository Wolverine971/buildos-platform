-- supabase/tests/20260806020000_agentic_chat_timing_evidence_repair.test.sql
-- Disposable PostgreSQL verification for the terminal timing-evidence repair.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
--
-- Regression for production canary turn 1422ffc3-afa4-4478-b6d9-8d9439fbeb13
-- (2026-08-06): a streamed worker turn has NO text_delta rows in
-- chat_turn_events (text batches persist to chat_turn_stream_state), and its
-- timestamps carry microseconds, so the pre-repair validator rejected every
-- truthful JS-computed draft. Fixture offsets here are deliberately
-- sub-millisecond-unaligned so whole-millisecond cancellation cannot mask
-- arithmetic drift.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.repair_assert(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.repair_expect_error(p_sql text, p_expected text)
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

-- agentic_chat_epoch_ms must reproduce JavaScript Date.parse exactly:
-- Date.parse('2026-08-06T23:40:00.592125Z') === 1786059600592 (truncation).
SELECT pg_temp.repair_assert(
	public.agentic_chat_epoch_ms('2026-08-06T23:40:00.592125+00:00'::timestamptz) = 1786059600592
		AND public.agentic_chat_epoch_ms('2026-08-06T23:40:00.592999+00:00'::timestamptz) = 1786059600592
		AND public.agentic_chat_epoch_ms('2026-08-06T23:40:00.593000+00:00'::timestamptz) = 1786059600593,
	'agentic_chat_epoch_ms does not match JS Date.parse millisecond truncation'
);

INSERT INTO public.users (id)
VALUES ('ee100000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.seed_repair_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_user_message_id uuid,
	p_correlation_id uuid,
	p_suffix text,
	p_status text,
	p_execution_started boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	-- Sub-millisecond-unaligned offsets: every phase difference has a
	-- fractional millisecond, so microsecond arithmetic can never equal the
	-- per-timestamp-truncated JS values.
	v_admitted_at timestamptz := date_trunc('second', clock_timestamp()) - interval '10 seconds'
		+ interval '0.000123 seconds';
	v_accepted_at timestamptz := v_admitted_at + interval '100.437 milliseconds';
	v_worker_started_at timestamptz := v_admitted_at + interval '200.821 milliseconds';
	v_provider_authorized_at timestamptz := v_admitted_at + interval '300.293 milliseconds';
	v_artifact_id uuid := gen_random_uuid();
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (p_turn_run_id, 'ee100000-0000-4000-8000-000000000001', 'global', 'active');

	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		p_user_message_id,
		p_turn_run_id,
		'ee100000-0000-4000-8000-000000000001',
		'user',
		'timing repair fixture ' || p_suffix,
		jsonb_build_object('idempotency_key', 'timing-repair-user-' || p_suffix)
	);

	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		p_queue_job_id,
		'ee100000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object('turnRunId', p_turn_run_id, 'correlationId', p_correlation_id),
		v_admitted_at,
		'agentic-chat-turn:' || p_turn_run_id::text,
		'processing',
		'agentic_chat_timing_repair_' || p_suffix,
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
		prepared_prompt_miss_reason, prepared_surface_profile
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'ee100000-0000-4000-8000-000000000001',
		'timing-repair-stream-' || p_suffix,
		'timing-repair-client-' || p_suffix,
		'global',
		'timing repair fixture ' || p_suffix,
		p_status,
		'worker_realtime',
		p_queue_job_id,
		p_correlation_id,
		1,
		CASE WHEN p_status = 'running' THEN v_worker_started_at ELSE NULL END,
		CASE WHEN p_execution_started THEN v_provider_authorized_at ELSE NULL END,
		v_accepted_at,
		v_provider_authorized_at,
		CASE WHEN p_status = 'running' THEN 1 ELSE 0 END,
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
		NULL
	);

	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, artifact_version, history_source,
		history, prepared, content_hash, history_bytes, content_bytes, retain_until
	) VALUES (
		v_artifact_id, p_turn_run_id, p_turn_run_id,
		'ee100000-0000-4000-8000-000000000001',
		'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb,
		repeat('b', 64), 2, 4, now() + interval '7 days'
	);
	UPDATE public.chat_turn_runs SET input_artifact_id = v_artifact_id
	WHERE id = p_turn_run_id;

	IF p_status = 'running' THEN
		INSERT INTO public.chat_turn_events (
			turn_run_id, session_id, user_id, stream_run_id, execution_generation,
			sequence_index, event_id, phase, event_type, payload, created_at
		) VALUES (
			p_turn_run_id,
			p_turn_run_id,
			'ee100000-0000-4000-8000-000000000001',
			'timing-repair-stream-' || p_suffix,
			1,
			1,
			p_turn_run_id::text || ':1:1',
			'stream',
			'turn_phase',
			'{"type":"turn_phase","turn_phase":"acknowledged"}'::jsonb,
			v_admitted_at + interval '500.917 milliseconds'
		);
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation,
		snapshot_sequence, durable_through_sequence, projection_durable_sequence,
		assistant_text, projection, first_text_persisted_at
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'ee100000-0000-4000-8000-000000000001',
		1,
		CASE WHEN p_status = 'running' THEN 1 ELSE 0 END,
		CASE WHEN p_status = 'running' THEN 1 ELSE 0 END,
		CASE WHEN p_status = 'running' THEN 1 ELSE 0 END,
		'',
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
		-- A queued fixture simulates a prior generation whose first-text stamp
		-- the next claim must clear.
		CASE WHEN p_status = 'queued' THEN clock_timestamp() ELSE NULL END
	);
END;
$$;

-- Build the draft exactly as the worker does: per-timestamp millisecond
-- truncation, first-response evidence from stream state.
CREATE OR REPLACE FUNCTION pg_temp.js_timing_draft(p_turn_run_id uuid)
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

	SELECT min(created_at)
	INTO v_first_event_at
	FROM public.chat_turn_events
	WHERE turn_run_id = p_turn_run_id
		AND execution_generation = v_turn.execution_generation;

	SELECT streams.first_text_persisted_at
	INTO v_first_response_at
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = p_turn_run_id
		AND streams.execution_generation = v_turn.execution_generation;

	v_phases := jsonb_build_object(
		'admission_to_acceptance_ms',
			public.agentic_chat_epoch_ms(v_turn.started_at)
				- public.agentic_chat_epoch_ms(v_turn.created_at),
		'queue_wait_ms',
			public.agentic_chat_epoch_ms(v_turn.worker_started_at)
				- public.agentic_chat_epoch_ms(v_turn.started_at),
		'worker_start_to_provider_authority_ms',
			public.agentic_chat_epoch_ms(v_turn.execution_started_at)
				- public.agentic_chat_epoch_ms(v_turn.worker_started_at),
		'time_to_first_event_ms',
			public.agentic_chat_epoch_ms(v_first_event_at)
				- public.agentic_chat_epoch_ms(v_turn.created_at),
		'provider_authority_to_first_event_persistence_ms',
			public.agentic_chat_epoch_ms(v_first_event_at)
				- public.agentic_chat_epoch_ms(v_turn.execution_started_at),
		'provider_authority_to_finish_ms', 1000,
		'provider_finish_to_terminal_call_ms', 50
	);
	IF v_first_response_at IS NOT NULL THEN
		v_phases := v_phases || jsonb_build_object(
			'time_to_first_response_ms',
				public.agentic_chat_epoch_ms(v_first_response_at)
					- public.agentic_chat_epoch_ms(v_turn.created_at),
			'provider_authority_to_first_response_persistence_ms',
				public.agentic_chat_epoch_ms(v_first_response_at)
					- public.agentic_chat_epoch_ms(v_turn.execution_started_at),
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

-- The pre-repair draft: microsecond interval arithmetic (never integral here
-- because every fixture offset has a fractional millisecond).
CREATE OR REPLACE FUNCTION pg_temp.microsecond_timing_draft(p_turn_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_draft jsonb;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = p_turn_run_id;

	v_draft := pg_temp.js_timing_draft(p_turn_run_id);
	RETURN jsonb_set(
		v_draft,
		'{phases,admission_to_acceptance_ms}',
		to_jsonb(EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000)
	);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.finalize_repair_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_assistant_message_id uuid,
	p_context_transition_id uuid,
	p_timing_transition_id uuid,
	p_timing_draft jsonb,
	p_assistant_text text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
	RETURN public.finalize_agentic_chat_turn_with_terminal_events(
		p_turn_run_id,
		'ee100000-0000-4000-8000-000000000001',
		p_queue_job_id,
		p_processing_token,
		1,
		'completed',
		'stop',
		NULL,
		p_assistant_message_id,
		p_assistant_text,
		'{"completion_status":"completed","answer_source":"model"}'::jsonb,
		1,
		2,
		3,
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
		'{"type":"done"}'::jsonb,
		'{"summary":"timing repair","entities":{},"context_type":"global","data_accessed":[]}'::jsonb,
		p_context_transition_id,
		p_timing_draft,
		p_timing_transition_id
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Turn A: the canary-10 shape. Text flows only through the real text-batch
-- RPC; no text_delta event rows exist; the truthful JS draft must finalize.
-- ---------------------------------------------------------------------------
SELECT pg_temp.seed_repair_turn(
	'ee400000-0000-4000-8000-000000000001',
	'ee300000-0000-4000-8000-000000000001',
	'ee900000-0000-4000-8000-000000000001',
	'ee500000-0000-4000-8000-000000000001',
	'ee800000-0000-4000-8000-000000000001',
	'accept', 'running', true
);

CREATE TEMP TABLE repair_flush_receipts (ordinal integer, receipt jsonb);
GRANT ALL ON repair_flush_receipts TO service_role;

SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO repair_flush_receipts
SELECT 1, public.persist_agentic_chat_text_batch(
	'ee400000-0000-4000-8000-000000000001',
	'ee300000-0000-4000-8000-000000000001',
	'ee900000-0000-4000-8000-000000000001',
	1,
	'eeaa0000-0000-4000-8000-000000000001',
	'first ',
	'first '
);
INSERT INTO repair_flush_receipts
SELECT 2, public.persist_agentic_chat_text_batch(
	'ee400000-0000-4000-8000-000000000001',
	'ee300000-0000-4000-8000-000000000001',
	'ee900000-0000-4000-8000-000000000001',
	1,
	'eeaa0000-0000-4000-8000-000000000002',
	'answer',
	'first answer'
);
-- Idempotent replay of the latest batch must not move the stamp.
INSERT INTO repair_flush_receipts
SELECT 3, public.persist_agentic_chat_text_batch(
	'ee400000-0000-4000-8000-000000000001',
	'ee300000-0000-4000-8000-000000000001',
	'ee900000-0000-4000-8000-000000000001',
	1,
	'eeaa0000-0000-4000-8000-000000000002',
	'answer',
	'first answer'
);
RESET ROLE;
RESET request.jwt.claims;

SELECT pg_temp.repair_assert(
	(
		SELECT streams.first_text_persisted_at IS NOT NULL
			AND streams.first_text_persisted_at =
				(SELECT (receipt->>'persisted_at')::timestamptz
					FROM repair_flush_receipts WHERE ordinal = 1)
			AND streams.first_text_persisted_at <
				(SELECT (receipt->>'persisted_at')::timestamptz
					FROM repair_flush_receipts WHERE ordinal = 2)
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = 'ee400000-0000-4000-8000-000000000001'
	),
	'first_text_persisted_at is not the first flushed batch persisted_at'
);

SELECT pg_temp.repair_assert(
	(
		SELECT count(*) = 0
		FROM public.chat_turn_events
		WHERE turn_run_id = 'ee400000-0000-4000-8000-000000000001'
			AND event_type = 'text_delta'
	),
	'fixture leaked text_delta event rows; the regression no longer matches production'
);

CREATE TEMP TABLE repair_accept_receipt (receipt jsonb);
GRANT ALL ON repair_accept_receipt TO service_role;
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO repair_accept_receipt
SELECT pg_temp.finalize_repair_turn(
	'ee400000-0000-4000-8000-000000000001',
	'ee300000-0000-4000-8000-000000000001',
	'ee900000-0000-4000-8000-000000000001',
	'ee600000-0000-4000-8000-000000000001',
	'ee700000-0000-5000-8000-000000000001',
	'ee700000-0000-5000-8000-000000000002',
	pg_temp.js_timing_draft('ee400000-0000-4000-8000-000000000001'),
	'first answer'
);
RESET ROLE;
RESET request.jwt.claims;

SELECT pg_temp.repair_assert(
	(
		SELECT receipt->>'outcome' = 'finalized'
		FROM repair_accept_receipt
	),
	'truthful streamed-turn draft was rejected by the repaired validator'
);

SELECT pg_temp.repair_assert(
	(
		SELECT turns.status = 'completed' AND turns.terminalized_at IS NOT NULL
		FROM public.chat_turn_runs turns
		WHERE turns.id = 'ee400000-0000-4000-8000-000000000001'
	),
	'accepted turn did not reach completed terminal state'
);

SELECT pg_temp.repair_assert(
	(
		SELECT (timing.payload->'timing'->'phases'->>'time_to_first_response_ms') IS NOT NULL
		FROM public.chat_turn_events timing
		WHERE timing.turn_run_id = 'ee400000-0000-4000-8000-000000000001'
			AND timing.event_type = 'timing'
	),
	'persisted timing event lost the first-response phases'
);

-- ---------------------------------------------------------------------------
-- Turn B: the pre-repair microsecond draft must be rejected (arithmetic
-- guard), proving the validator enforces JS-parity truncation.
-- ---------------------------------------------------------------------------
SELECT pg_temp.seed_repair_turn(
	'ee400000-0000-4000-8000-000000000002',
	'ee300000-0000-4000-8000-000000000002',
	'ee900000-0000-4000-8000-000000000002',
	'ee500000-0000-4000-8000-000000000002',
	'ee800000-0000-4000-8000-000000000002',
	'reject', 'running', true
);

SELECT pg_temp.repair_assert(
	pg_temp.repair_expect_error(
		format(
			$sql$
			SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
			SET LOCAL ROLE service_role;
			SELECT pg_temp.finalize_repair_turn(
				'ee400000-0000-4000-8000-000000000002',
				'ee300000-0000-4000-8000-000000000002',
				'ee900000-0000-4000-8000-000000000002',
				'ee600000-0000-4000-8000-000000000002',
				'ee700000-0000-5000-8000-000000000003',
				'ee700000-0000-5000-8000-000000000004',
				%L::jsonb,
				''
			)
			$sql$,
			pg_temp.microsecond_timing_draft('ee400000-0000-4000-8000-000000000002')::text
		),
		'agentic_chat_terminal_events_finalize_timing_evidence_mismatch'
	),
	'microsecond-precision draft was not rejected'
);

-- ---------------------------------------------------------------------------
-- Turn C: no streamed text. Evidence NULL requires a null first_response and
-- no response phases; the truthful draft finalizes.
-- ---------------------------------------------------------------------------
SELECT pg_temp.seed_repair_turn(
	'ee400000-0000-4000-8000-000000000003',
	'ee300000-0000-4000-8000-000000000003',
	'ee900000-0000-4000-8000-000000000003',
	'ee500000-0000-4000-8000-000000000003',
	'ee800000-0000-4000-8000-000000000003',
	'notext', 'running', true
);

CREATE TEMP TABLE repair_notext_receipt (receipt jsonb);
GRANT ALL ON repair_notext_receipt TO service_role;
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO repair_notext_receipt
SELECT pg_temp.finalize_repair_turn(
	'ee400000-0000-4000-8000-000000000003',
	'ee300000-0000-4000-8000-000000000003',
	'ee900000-0000-4000-8000-000000000003',
	'ee600000-0000-4000-8000-000000000003',
	'ee700000-0000-5000-8000-000000000005',
	'ee700000-0000-5000-8000-000000000006',
	pg_temp.js_timing_draft('ee400000-0000-4000-8000-000000000003'),
	'no-stream answer'
);
RESET ROLE;
RESET request.jwt.claims;

SELECT pg_temp.repair_assert(
	(SELECT receipt->>'outcome' = 'finalized' FROM repair_notext_receipt),
	'null-evidence draft without response phases was rejected'
);

-- ---------------------------------------------------------------------------
-- Turn D: a fresh claim clears the prior generation's first-text stamp.
-- ---------------------------------------------------------------------------
SELECT pg_temp.seed_repair_turn(
	'ee400000-0000-4000-8000-000000000004',
	'ee300000-0000-4000-8000-000000000004',
	'ee900000-0000-4000-8000-000000000004',
	'ee500000-0000-4000-8000-000000000004',
	'ee800000-0000-4000-8000-000000000004',
	'claimreset', 'queued', false
);

SELECT pg_temp.repair_assert(
	(
		SELECT streams.first_text_persisted_at IS NOT NULL
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = 'ee400000-0000-4000-8000-000000000004'
	),
	'claim-reset fixture must start with a stamped prior generation'
);

CREATE TEMP TABLE repair_claim_receipt (receipt jsonb);
GRANT ALL ON repair_claim_receipt TO service_role;
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO repair_claim_receipt
SELECT public.claim_agentic_chat_turn(
	'ee400000-0000-4000-8000-000000000004',
	'ee300000-0000-4000-8000-000000000004',
	'ee900000-0000-4000-8000-000000000004'
);
RESET ROLE;
RESET request.jwt.claims;

SELECT pg_temp.repair_assert(
	(SELECT receipt->>'outcome' = 'claimed' FROM repair_claim_receipt),
	'claim-reset fixture turn could not be claimed'
);

SELECT pg_temp.repair_assert(
	(
		SELECT streams.execution_generation = 2
			AND streams.first_text_persisted_at IS NULL
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = 'ee400000-0000-4000-8000-000000000004'
	),
	'claim did not clear first_text_persisted_at for the new generation'
);

SELECT 'timing_evidence_repair_ok' AS timing_evidence_repair;
