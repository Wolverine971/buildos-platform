-- supabase/migrations/20260806020000_agentic_chat_timing_evidence_repair.sql
-- Agentic Chat Worker: repair the terminal timing-evidence validators that
-- rejected production canary turn 1422ffc3-afa4-4478-b6d9-8d9439fbeb13
-- (2026-08-06, HTTP 400 agentic_chat_terminal_events_finalize_timing_evidence_mismatch).
--
-- Two independent contract defects are corrected:
--   1. First-response evidence: worker text batches persist to
--      chat_turn_stream_state and never write text_delta rows into
--      chat_turn_events, so the validators' min(created_at) FILTER
--      (event_type = 'text_delta') source is NULL for every streamed worker
--      turn while the runtime draft truthfully carries response timings. A
--      durable, generation-scoped first_text_persisted_at column now records
--      the first flushed batch's persisted_at (the exact value the runtime
--      tracker echoes back), and both validators read it.
--   2. Phase arithmetic: the worker draft computes phase values from
--      JS Date.parse, which truncates each timestamp to whole milliseconds.
--      The validators recomputed with microsecond-precision interval
--      arithmetic, so any production timestamp with nonzero microseconds
--      failed exact equality. agentic_chat_epoch_ms() reproduces the JS
--      truncation per timestamp and the validators now compare against
--      per-timestamp-truncated differences.

BEGIN;

ALTER TABLE public.chat_turn_stream_state
	ADD COLUMN IF NOT EXISTS first_text_persisted_at timestamptz NULL;

COMMENT ON COLUMN public.chat_turn_stream_state.first_text_persisted_at IS
	'Persisted_at of the current generation''s first flushed text batch; database-owned first-response timing evidence. NULL until text flushes; reset by claim on a new generation.';

CREATE OR REPLACE FUNCTION public.agentic_chat_epoch_ms(ts timestamptz)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $helper$
	SELECT floor(EXTRACT(epoch FROM ts) * 1000)::bigint
$helper$;

COMMENT ON FUNCTION public.agentic_chat_epoch_ms(timestamptz) IS
	'Whole-millisecond epoch value matching JavaScript Date.parse truncation; used by terminal timing validators so draft phase arithmetic compares exactly.';

REVOKE ALL ON FUNCTION public.agentic_chat_epoch_ms(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agentic_chat_epoch_ms(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.agentic_chat_epoch_ms(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_epoch_ms(timestamptz) TO service_role;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid = 'public.persist_agentic_chat_text_batch(uuid,uuid,uuid,integer,uuid,text,text)'::regprocedure;

	v_next := replace(
		v_body,
		$old$		reconcile_required = true,
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id$old$,
		$new$		reconcile_required = true,
		first_text_persisted_at = COALESCE(streams.first_text_persisted_at, v_now),
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_timing_repair_unexpected_text_batch_body';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.persist_agentic_chat_text_batch(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_batch_id uuid, p_text_delta text, p_assistant_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid = 'public.claim_agentic_chat_turn(uuid,uuid,uuid)'::regprocedure;

	v_next := replace(
		v_body,
		$old$		reconcile_required = false,
		updated_at = EXCLUDED.updated_at;$old$,
		$new$		reconcile_required = false,
		first_text_persisted_at = NULL,
		updated_at = EXCLUDED.updated_at;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_timing_repair_unexpected_claim_body';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.claim_agentic_chat_turn(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid = 'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)'::regprocedure;

	v_next := replace(
		v_body,
		$old$	SELECT
		min(events.created_at),
		min(events.created_at) FILTER (WHERE events.event_type = 'text_delta')
	INTO v_first_event_at, v_first_response_at
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation;

	v_timing_phases := v_timing_draft->'phases';
	IF v_first_event_at IS NULL
		OR (v_timing_draft->>'first_event_at')::timestamptz IS DISTINCT FROM v_first_event_at
		OR (CASE
			WHEN v_first_response_at IS NULL THEN v_timing_draft->'first_response_at' IS DISTINCT FROM 'null'::jsonb
			ELSE (v_timing_draft->>'first_response_at')::timestamptz IS DISTINCT FROM v_first_response_at
		END)
		OR (v_timing_phases->>'admission_to_acceptance_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'queue_wait_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.worker_started_at - v_turn.started_at)) * 1000
		OR (v_timing_phases->>'worker_start_to_provider_authority_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.execution_started_at - v_turn.worker_started_at)) * 1000
		OR (v_timing_phases->>'time_to_first_event_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'provider_authority_to_first_event_persistence_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.execution_started_at)) * 1000
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_phases ? 'time_to_first_response_ms'
				OR v_timing_phases ? 'provider_authority_to_first_response_persistence_ms'
				OR v_timing_phases ? 'response_generation_ms'
			ELSE
				jsonb_typeof(v_timing_phases->'response_generation_ms') IS DISTINCT FROM 'number'
				OR (v_timing_phases->>'time_to_first_response_ms')::numeric IS DISTINCT FROM
					EXTRACT(epoch FROM (v_first_response_at - v_turn.created_at)) * 1000
				OR (v_timing_phases->>'provider_authority_to_first_response_persistence_ms')::numeric IS DISTINCT FROM
					EXTRACT(epoch FROM (v_first_response_at - v_turn.execution_started_at)) * 1000
		END)
		OR jsonb_typeof(v_timing_phases->'provider_authority_to_finish_ms') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_timing_phases->'provider_finish_to_terminal_call_ms') IS DISTINCT FROM 'number' THEN
		RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_timing_evidence_mismatch';
	END IF;$old$,
		$new$	SELECT min(events.created_at)
	INTO v_first_event_at
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation;

	-- Worker text batches persist to chat_turn_stream_state and never
	-- create text_delta event rows; first-response evidence lives there.
	SELECT streams.first_text_persisted_at
	INTO v_first_response_at
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;

	v_timing_phases := v_timing_draft->'phases';
	IF v_first_event_at IS NULL
		OR (v_timing_draft->>'first_event_at')::timestamptz IS DISTINCT FROM v_first_event_at
		OR (CASE
			WHEN v_first_response_at IS NULL THEN v_timing_draft->'first_response_at' IS DISTINCT FROM 'null'::jsonb
			ELSE (v_timing_draft->>'first_response_at')::timestamptz IS DISTINCT FROM v_first_response_at
		END)
		OR (v_timing_phases->>'admission_to_acceptance_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.started_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
		OR (v_timing_phases->>'queue_wait_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.worker_started_at) - public.agentic_chat_epoch_ms(v_turn.started_at))::numeric
		OR (v_timing_phases->>'worker_start_to_provider_authority_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.execution_started_at) - public.agentic_chat_epoch_ms(v_turn.worker_started_at))::numeric
		OR (v_timing_phases->>'time_to_first_event_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_first_event_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
		OR (v_timing_phases->>'provider_authority_to_first_event_persistence_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_first_event_at) - public.agentic_chat_epoch_ms(v_turn.execution_started_at))::numeric
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_phases ? 'time_to_first_response_ms'
				OR v_timing_phases ? 'provider_authority_to_first_response_persistence_ms'
				OR v_timing_phases ? 'response_generation_ms'
			ELSE
				jsonb_typeof(v_timing_phases->'response_generation_ms') IS DISTINCT FROM 'number'
				OR (v_timing_phases->>'time_to_first_response_ms')::numeric IS DISTINCT FROM
					(public.agentic_chat_epoch_ms(v_first_response_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
				OR (v_timing_phases->>'provider_authority_to_first_response_persistence_ms')::numeric IS DISTINCT FROM
					(public.agentic_chat_epoch_ms(v_first_response_at) - public.agentic_chat_epoch_ms(v_turn.execution_started_at))::numeric
		END)
		OR jsonb_typeof(v_timing_phases->'provider_authority_to_finish_ms') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_timing_phases->'provider_finish_to_terminal_call_ms') IS DISTINCT FROM 'number' THEN
		RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_timing_evidence_mismatch';
	END IF;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_timing_repair_unexpected_terminal_events_validator';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_status text, p_finished_reason text, p_failure_code text, p_assistant_message_id uuid, p_assistant_text text, p_assistant_metadata jsonb, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer, p_projection jsonb, p_event_payload jsonb, p_last_turn_context jsonb, p_last_turn_context_transition_id uuid, p_timing_draft jsonb, p_timing_transition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid = 'public.finalize_agentic_chat_turn_with_failure_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,text,uuid,jsonb,uuid)'::regprocedure;

	v_next := replace(
		v_body,
		$old$	SELECT
		min(events.created_at),
		min(events.created_at) FILTER (WHERE events.event_type = 'text_delta')
	INTO v_first_event_at, v_first_response_at
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation;

	v_timing_phases := v_timing_draft->'phases';
	IF v_first_event_at IS NULL
		OR (v_timing_draft->>'first_event_at')::timestamptz IS DISTINCT FROM v_first_event_at
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_draft->'first_response_at' IS DISTINCT FROM 'null'::jsonb
			ELSE (v_timing_draft->>'first_response_at')::timestamptz IS DISTINCT FROM v_first_response_at
		END)
		OR (v_timing_phases->>'admission_to_acceptance_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'queue_wait_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.worker_started_at - v_turn.started_at)) * 1000
		OR (v_timing_phases->>'worker_start_to_provider_authority_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.execution_started_at - v_turn.worker_started_at)) * 1000
		OR (v_timing_phases->>'time_to_first_event_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'provider_authority_to_first_event_persistence_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.execution_started_at)) * 1000
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_phases ? 'time_to_first_response_ms'
					OR v_timing_phases ? 'provider_authority_to_first_response_persistence_ms'
					OR v_timing_phases ? 'response_generation_ms'
			ELSE
				jsonb_typeof(v_timing_phases->'response_generation_ms') IS DISTINCT FROM 'number'
					OR (v_timing_phases->>'time_to_first_response_ms')::numeric IS DISTINCT FROM
						EXTRACT(epoch FROM (v_first_response_at - v_turn.created_at)) * 1000
					OR (v_timing_phases->>'provider_authority_to_first_response_persistence_ms')::numeric IS DISTINCT FROM
						EXTRACT(epoch FROM (v_first_response_at - v_turn.execution_started_at)) * 1000
		END)
		OR jsonb_typeof(v_timing_phases->'provider_authority_to_finish_ms') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_timing_phases->'provider_finish_to_terminal_call_ms') IS DISTINCT FROM 'number' THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_timing_evidence_mismatch';
	END IF;$old$,
		$new$	SELECT min(events.created_at)
	INTO v_first_event_at
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation;

	-- Worker text batches persist to chat_turn_stream_state and never
	-- create text_delta event rows; first-response evidence lives there.
	SELECT streams.first_text_persisted_at
	INTO v_first_response_at
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;

	v_timing_phases := v_timing_draft->'phases';
	IF v_first_event_at IS NULL
		OR (v_timing_draft->>'first_event_at')::timestamptz IS DISTINCT FROM v_first_event_at
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_draft->'first_response_at' IS DISTINCT FROM 'null'::jsonb
			ELSE (v_timing_draft->>'first_response_at')::timestamptz IS DISTINCT FROM v_first_response_at
		END)
		OR (v_timing_phases->>'admission_to_acceptance_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.started_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
		OR (v_timing_phases->>'queue_wait_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.worker_started_at) - public.agentic_chat_epoch_ms(v_turn.started_at))::numeric
		OR (v_timing_phases->>'worker_start_to_provider_authority_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_turn.execution_started_at) - public.agentic_chat_epoch_ms(v_turn.worker_started_at))::numeric
		OR (v_timing_phases->>'time_to_first_event_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_first_event_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
		OR (v_timing_phases->>'provider_authority_to_first_event_persistence_ms')::numeric IS DISTINCT FROM
			(public.agentic_chat_epoch_ms(v_first_event_at) - public.agentic_chat_epoch_ms(v_turn.execution_started_at))::numeric
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_phases ? 'time_to_first_response_ms'
					OR v_timing_phases ? 'provider_authority_to_first_response_persistence_ms'
					OR v_timing_phases ? 'response_generation_ms'
			ELSE
				jsonb_typeof(v_timing_phases->'response_generation_ms') IS DISTINCT FROM 'number'
					OR (v_timing_phases->>'time_to_first_response_ms')::numeric IS DISTINCT FROM
						(public.agentic_chat_epoch_ms(v_first_response_at) - public.agentic_chat_epoch_ms(v_turn.created_at))::numeric
					OR (v_timing_phases->>'provider_authority_to_first_response_persistence_ms')::numeric IS DISTINCT FROM
						(public.agentic_chat_epoch_ms(v_first_response_at) - public.agentic_chat_epoch_ms(v_turn.execution_started_at))::numeric
		END)
		OR jsonb_typeof(v_timing_phases->'provider_authority_to_finish_ms') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_timing_phases->'provider_finish_to_terminal_call_ms') IS DISTINCT FROM 'number' THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_timing_evidence_mismatch';
	END IF;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_timing_repair_unexpected_failure_events_validator';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_failure_events(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_status text, p_finished_reason text, p_failure_code text, p_assistant_message_id uuid, p_assistant_text text, p_assistant_metadata jsonb, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer, p_projection jsonb, p_event_payload jsonb, p_public_error text, p_error_transition_id uuid, p_timing_draft jsonb, p_timing_transition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

COMMIT;
