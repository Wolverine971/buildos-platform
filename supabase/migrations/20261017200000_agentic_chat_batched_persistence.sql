-- supabase/migrations/20261017200000_agentic_chat_batched_persistence.sql
--
-- Agentic Chat pipeline audit 2026-10-17, rows S7, B4 and M3
-- (docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md).
--
-- S7: the worker persisted UI events one RPC at a time and resent the whole UI
-- projection with each one (turn dac81d9d wrote ~7 MB of JSON). The new
-- persist_agentic_chat_semantic_event_batch writes consecutive semantic events
-- of one turn in ONE transaction, in input order, and writes the projection
-- once (the projection as of the batch's last event). Per event it does exactly
-- what persist_agentic_chat_semantic_event does and returns the same receipt:
--   * same service-role claim check, ownership fence (turn -> job -> stream
--     locks, same order), stale-generation / cancel / terminal answers (for the
--     whole batch), cursor-corruption and assistant-text prefix checks;
--   * same per-event payload bound (256 KiB) and projection bound (512 KiB);
--   * consecutive sequences last_event_sequence + 1 .. + n, event_id
--     "<turn>:<generation>:<sequence>", durable before the worker broadcasts.
-- Idempotent replay: a batch whose events were already committed (lost
-- response) returns their stored receipts as `already_persisted` and writes
-- nothing. A committed prefix followed by new events is accepted only when the
-- prefix is contiguous and ends at the current cursor; anything else raises
-- agentic_chat_semantic_batch_replay_out_of_order. A projection that names an
-- event above the batch's last sequence is refused (browsers discard such a
-- projection whole).
--
-- M3: chat_turn_runs.first_visible_text_at / first_visible_text_source record
-- when answer text first became visible (a live preview frame the channel
-- accepted, or durable text), durably. chat_turn_stream_state, where the only
-- first-text evidence lived, is deletable 7 days after the turn ends. The batch
-- RPC keeps the EARLIEST time it is given (order-insensitive, idempotent) and
-- ignores a time outside [created_at - 5 min, now + 5 min] instead of failing
-- the write: measurement never fails a turn.
--
-- Compatibility: no existing function changes. persist_agentic_chat_semantic_event,
-- flush_agentic_chat_text_batches, acknowledge_agentic_chat_stream_delivery,
-- reconcile and finalize keep their signatures and bodies, so a worker deployed
-- before this migration keeps working, and a new worker that finds the batch
-- function missing (PGRST202) falls back to the per-event RPC. Deploy order is
-- free in both directions.
--
-- Security: SECURITY INVOKER, only search_path is SET (no extension or other
-- GUCs: a function-level SET of an extension parameter failed in production
-- with 42501 on 2026-10-17), service_role only, like the per-event RPC.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS first_visible_text_at timestamptz,
	ADD COLUMN IF NOT EXISTS first_visible_text_source text
		CONSTRAINT chat_turn_runs_first_visible_text_source_check
		CHECK (
			first_visible_text_source IS NULL
			OR first_visible_text_source IN ('preview', 'durable_text')
		);

COMMENT ON COLUMN public.chat_turn_runs.first_visible_text_at IS
	'Earliest moment answer text was visible to the user: a live preview frame Realtime accepted, or durable text. Worker-reported, kept at the minimum. Audit M3.';
COMMENT ON COLUMN public.chat_turn_runs.first_visible_text_source IS
	'What made text visible first: preview or durable_text.';

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_semantic_event_batch(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_assistant_text text,
	p_events jsonb,
	p_projection jsonb,
	p_first_visible_text_at timestamptz DEFAULT NULL,
	p_first_visible_text_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_existing public.chat_turn_events%ROWTYPE;
	v_projection jsonb;
	v_count integer;
	v_index integer;
	v_item jsonb;
	v_transition_id uuid;
	v_phase text;
	v_event_type text;
	v_payload jsonb;
	v_transition_ids uuid[] := ARRAY[]::uuid[];
	v_replayed integer := 0;
	v_first_replayed_sequence integer;
	v_new_count integer;
	v_results jsonb := '[]'::jsonb;
	v_max_projection_sequence integer;
	v_now timestamptz;
	v_sequence integer;
	v_last_sequence integer;
	v_event_id text;
	v_visible_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_identity';
	END IF;
	IF p_assistant_text IS NULL OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_text';
	END IF;
	IF p_events IS NULL
		OR jsonb_typeof(p_events) <> 'array'
		OR jsonb_array_length(p_events) < 1
		OR jsonb_array_length(p_events) > 64
		OR pg_column_size(p_events) > 16777216 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_events';
	END IF;
	v_projection := COALESCE(p_projection, '{}'::jsonb);
	IF jsonb_typeof(v_projection) <> 'object'
		OR pg_column_size(v_projection) > 524288
		OR (
			v_projection ? 'semantic_events'
			AND jsonb_typeof(v_projection->'semantic_events') IS DISTINCT FROM 'array'
		) THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_projection';
	END IF;
	IF (p_first_visible_text_at IS NULL) <> (p_first_visible_text_source IS NULL)
		OR (
			p_first_visible_text_source IS NOT NULL
			AND p_first_visible_text_source NOT IN ('preview', 'durable_text')
		) THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_first_visible_text';
	END IF;

	-- Every event is validated before any lock is taken.
	v_count := jsonb_array_length(p_events);
	FOR v_index IN 0 .. v_count - 1 LOOP
		v_item := p_events->v_index;
		IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_item->'transition_id') IS DISTINCT FROM 'string'
			OR (v_item->>'transition_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_event';
		END IF;
		v_transition_id := (v_item->>'transition_id')::uuid;
		v_phase := v_item->>'phase';
		v_event_type := v_item->>'event_type';
		v_payload := COALESCE(v_item->'event_payload', '{}'::jsonb);
		IF v_phase IS NULL
			OR v_phase NOT IN ('prompt', 'llm', 'tool', 'stream', 'finalize')
			OR v_event_type IS NULL
			OR v_event_type !~ '^[a-z][a-z0-9_]{0,127}$'
			OR v_event_type IN ('done', 'text', 'text_delta') THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_event';
		END IF;
		IF jsonb_typeof(v_payload) <> 'object'
			OR pg_column_size(v_payload) > 262144
			OR v_payload->>'type' IS DISTINCT FROM v_event_type THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_json_payload';
		END IF;
		IF v_transition_id = ANY (v_transition_ids) THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_duplicate_transition';
		END IF;
		v_transition_ids := v_transition_ids || v_transition_id;
	END LOOP;

	-- Same lock order as every claim/write/finalize primitive: turn, job, stream.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'terminal_event_id', v_turn.terminal_event_id
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_invalid_status';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_semantic_batch_current_generation_corrupt';
	END IF;

	-- Replay: already-committed events must be a contiguous prefix of the batch.
	FOR v_index IN 0 .. v_count - 1 LOOP
		v_item := p_events->v_index;
		v_transition_id := (v_item->>'transition_id')::uuid;
		v_phase := v_item->>'phase';
		v_event_type := v_item->>'event_type';
		v_payload := COALESCE(v_item->'event_payload', '{}'::jsonb);

		SELECT events.*
		INTO v_existing
		FROM public.chat_turn_events events
		WHERE events.turn_run_id = v_turn.id
			AND events.execution_generation = v_turn.execution_generation
			AND events.worker_transition_id = v_transition_id;

		IF NOT FOUND THEN
			CONTINUE;
		END IF;
		IF v_existing.phase IS DISTINCT FROM v_phase
			OR v_existing.event_type IS DISTINCT FROM v_event_type
			OR v_existing.payload IS DISTINCT FROM v_payload THEN
			RAISE EXCEPTION 'agentic_chat_semantic_write_transition_conflict';
		END IF;
		IF v_index <> v_replayed
			OR (
				v_replayed > 0
				AND v_existing.sequence_index <> v_first_replayed_sequence + v_replayed
			) THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_replay_out_of_order';
		END IF;
		IF v_replayed = 0 THEN
			v_first_replayed_sequence := v_existing.sequence_index;
		END IF;
		v_replayed := v_replayed + 1;
		v_results := v_results || jsonb_build_array(jsonb_build_object(
			'outcome', 'already_persisted',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'stream_run_id', v_turn.stream_run_id,
			'client_turn_id', v_turn.client_turn_id,
			'execution_generation', v_turn.execution_generation,
			'sequence_index', v_existing.sequence_index,
			'event_id', v_existing.event_id,
			'phase', v_existing.phase,
			'event_type', v_existing.event_type,
			'durable', true,
			'transition_id', v_transition_id,
			'event_payload', v_existing.payload
		));
	END LOOP;

	v_new_count := v_count - v_replayed;
	IF v_new_count > 0 THEN
		IF v_replayed > 0
			AND v_first_replayed_sequence + v_replayed - 1 <> v_turn.last_event_sequence THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_replay_out_of_order';
		END IF;
		IF v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
			OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_sequence_cursor_corrupt';
		END IF;
		IF left(p_assistant_text, char_length(v_stream.assistant_text))
			IS DISTINCT FROM v_stream.assistant_text THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_prefix_conflict';
		END IF;
		IF v_turn.last_event_sequence > 2147483647 - v_new_count THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_sequence_exhausted';
		END IF;

		v_last_sequence := v_turn.last_event_sequence + v_new_count;
		SELECT max((entries.value->>'sequence_index')::integer)
		INTO v_max_projection_sequence
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof(v_projection->'semantic_events') = 'array'
					THEN v_projection->'semantic_events'
				ELSE '[]'::jsonb
			END
		) AS entries(value)
		WHERE jsonb_typeof(entries.value->'sequence_index') = 'number';
		IF v_max_projection_sequence > v_last_sequence THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_projection_ahead';
		END IF;

		v_now := clock_timestamp();
		FOR v_index IN v_replayed .. v_count - 1 LOOP
			v_item := p_events->v_index;
			v_transition_id := (v_item->>'transition_id')::uuid;
			v_phase := v_item->>'phase';
			v_event_type := v_item->>'event_type';
			v_payload := COALESCE(v_item->'event_payload', '{}'::jsonb);
			v_sequence := v_turn.last_event_sequence + (v_index - v_replayed) + 1;
			v_event_id := v_turn.id::text
				|| ':' || v_turn.execution_generation::text
				|| ':' || v_sequence::text;

			INSERT INTO public.chat_turn_events (
				turn_run_id,
				session_id,
				user_id,
				stream_run_id,
				execution_generation,
				sequence_index,
				event_id,
				worker_transition_id,
				phase,
				event_type,
				payload,
				created_at
			) VALUES (
				v_turn.id,
				v_turn.session_id,
				v_turn.user_id,
				v_turn.stream_run_id,
				v_turn.execution_generation,
				v_sequence,
				v_event_id,
				v_transition_id,
				v_phase,
				v_event_type,
				v_payload,
				v_now
			);

			v_results := v_results || jsonb_build_array(jsonb_build_object(
				'outcome', 'persisted',
				'publish_allowed', true,
				'turn_run_id', v_turn.id,
				'queue_job_id', v_turn.queue_job_id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'stream_run_id', v_turn.stream_run_id,
				'client_turn_id', v_turn.client_turn_id,
				'execution_generation', v_turn.execution_generation,
				'sequence_index', v_sequence,
				'event_id', v_event_id,
				'phase', v_phase,
				'event_type', v_event_type,
				'durable', true,
				'transition_id', v_transition_id,
				'event_payload', v_payload,
				'reconcile_required', true,
				'persisted_at', v_now
			));
		END LOOP;

		UPDATE public.chat_turn_stream_state streams
		SET snapshot_sequence = v_last_sequence,
			durable_through_sequence = v_last_sequence,
			projection_durable_sequence = v_last_sequence,
			assistant_text = p_assistant_text,
			projection = v_projection,
			reconcile_required = true,
			updated_at = v_now
		WHERE streams.turn_run_id = v_turn.id
			AND streams.execution_generation = v_turn.execution_generation;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_stream_compare_and_set_lost';
		END IF;

		v_visible_at := CASE
			WHEN p_first_visible_text_at >= v_turn.created_at - interval '5 minutes'
				AND p_first_visible_text_at <= v_now + interval '5 minutes'
				THEN p_first_visible_text_at
		END;

		UPDATE public.chat_turn_runs turns
		SET last_event_sequence = v_last_sequence,
			last_progress_at = v_now,
			updated_at = v_now,
			first_visible_text_source = CASE
				WHEN v_visible_at IS NOT NULL
					AND (turns.first_visible_text_at IS NULL OR v_visible_at < turns.first_visible_text_at)
					THEN p_first_visible_text_source
				ELSE turns.first_visible_text_source
			END,
			first_visible_text_at = CASE
				WHEN v_visible_at IS NOT NULL
					AND (turns.first_visible_text_at IS NULL OR v_visible_at < turns.first_visible_text_at)
					THEN v_visible_at
				ELSE turns.first_visible_text_at
			END
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = v_turn.execution_generation
			AND turns.queue_job_id = v_turn.queue_job_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_semantic_batch_turn_compare_and_set_lost';
		END IF;
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'batch_persisted',
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'persisted_count', v_new_count,
		'replayed_count', v_replayed,
		'results', v_results
	);
END;
$function$;

COMMENT ON FUNCTION public.persist_agentic_chat_semantic_event_batch(
	uuid, uuid, uuid, integer, text, jsonb, jsonb, timestamptz, text
) IS
	'Worker-only: persists consecutive semantic UI events of one turn in order in one transaction, writes the projection once, and records first-visible-text time. Per-event semantics match persist_agentic_chat_semantic_event. Audit S7/B4/M3.';

REVOKE ALL ON FUNCTION public.persist_agentic_chat_semantic_event_batch(
	uuid, uuid, uuid, integer, text, jsonb, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_semantic_event_batch(
	uuid, uuid, uuid, integer, text, jsonb, jsonb, timestamptz, text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
