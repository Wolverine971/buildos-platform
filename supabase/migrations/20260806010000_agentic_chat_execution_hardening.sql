-- supabase/migrations/20260806010000_agentic_chat_execution_hardening.sql
-- Agentic Chat Worker, Phase 4 Slice 16: private provider/tool execution
-- boundaries and worker-only admission capacity. Observation rows are fenced
-- to the active queue lease and never consume public stream sequence numbers.

BEGIN;

CREATE TABLE public.agentic_chat_execution_observations (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL,
	execution_generation integer NOT NULL CHECK (execution_generation > 0),
	observation_key text NOT NULL CHECK (observation_key ~ '^[0-9a-f]{64}$'),
	phase text NOT NULL CHECK (phase IN ('provider', 'tool')),
	event_type text NOT NULL CHECK (
		event_type IN (
			'provider_attempt_started',
			'provider_attempt_ended',
			'tool_execution_started',
			'tool_execution_ended'
		)
		AND (
			(phase = 'provider' AND event_type LIKE 'provider_attempt_%')
			OR (phase = 'tool' AND event_type LIKE 'tool_execution_%')
		)
	),
	payload jsonb NOT NULL CHECK (
		jsonb_typeof(payload) = 'object'
		AND pg_column_size(payload) <= 16384
	),
	observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	UNIQUE (turn_run_id, execution_generation, observation_key)
);

CREATE INDEX idx_agentic_chat_execution_observations_turn_generation
	ON public.agentic_chat_execution_observations (
		turn_run_id,
		execution_generation,
		observed_at,
		id
	);

ALTER TABLE public.agentic_chat_execution_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agentic_chat_execution_observations
	FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.agentic_chat_execution_observations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.agentic_chat_execution_observations_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_observation_key text,
	p_phase text,
	p_event_type text,
	p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_existing public.agentic_chat_execution_observations%ROWTYPE;
	v_observed_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_observation_key IS NULL
		OR p_observation_key !~ '^[0-9a-f]{64}$'
		OR p_phase NOT IN ('provider', 'tool')
		OR p_event_type NOT IN (
			'provider_attempt_started',
			'provider_attempt_ended',
			'tool_execution_started',
			'tool_execution_ended'
		)
		OR (p_phase = 'provider' AND p_event_type NOT LIKE 'provider_attempt_%')
		OR (p_phase = 'tool' AND p_event_type NOT LIKE 'tool_execution_%') THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_identity';
	END IF;
	IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
		OR pg_column_size(p_payload) > 16384 THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_payload';
	END IF;

	-- A strict metadata allowlist prevents prompt, argument, result, or message
	-- content from entering this private lifecycle ledger.
	IF p_phase = 'provider' AND p_payload - ARRAY[
		'round', 'route_id', 'model_requested', 'model_used', 'provider',
		'status', 'duration_ms', 'finish_reason', 'error_class', 'usage'
	] <> '{}'::jsonb THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_payload_not_redacted';
	END IF;
	IF p_phase = 'tool' AND p_payload - ARRAY[
		'tool_name', 'provider_tool_call_id', 'sequence_index', 'status',
		'duration_ms', 'error_code'
	] <> '{}'::jsonb THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_payload_not_redacted';
	END IF;
	IF p_payload ? 'duration_ms' AND (
		jsonb_typeof(p_payload->'duration_ms') <> 'number'
		OR (p_payload->>'duration_ms')::numeric < 0
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_duration';
	END IF;
	IF p_payload ? 'usage' AND p_payload->'usage' IS DISTINCT FROM 'null'::jsonb
		AND (
			jsonb_typeof(p_payload->'usage') <> 'object'
			OR (p_payload->'usage') - ARRAY[
				'prompt_tokens', 'completion_tokens', 'total_tokens'
			] <> '{}'::jsonb
		) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_usage';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_scope_mismatch';
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'observation_key', p_observation_key,
			'event_type', p_event_type
		);
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'observation_key', p_observation_key,
			'event_type', p_event_type
		);
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'observation_key', p_observation_key,
			'event_type', p_event_type
		);
	END IF;
	IF v_turn.status <> 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_turn_not_started';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;
	IF NOT FOUND OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_ownership_lost';
	END IF;

	v_observed_at := clock_timestamp();
	INSERT INTO public.agentic_chat_execution_observations (
		turn_run_id, session_id, user_id, execution_generation,
		observation_key, phase, event_type, payload, observed_at
	) VALUES (
		v_turn.id, v_turn.session_id, v_turn.user_id, p_execution_generation,
		p_observation_key, p_phase, p_event_type, p_payload, v_observed_at
	)
	ON CONFLICT (turn_run_id, execution_generation, observation_key) DO NOTHING;
	IF FOUND THEN
		RETURN jsonb_build_object(
			'outcome', 'persisted',
			'turn_run_id', v_turn.id,
			'execution_generation', p_execution_generation,
			'observation_key', p_observation_key,
			'event_type', p_event_type,
			'observed_at', v_observed_at
		);
	END IF;

	SELECT observations.*
	INTO STRICT v_existing
	FROM public.agentic_chat_execution_observations observations
	WHERE observations.turn_run_id = v_turn.id
		AND observations.execution_generation = p_execution_generation
		AND observations.observation_key = p_observation_key;
	IF v_existing.session_id IS DISTINCT FROM v_turn.session_id
		OR v_existing.user_id IS DISTINCT FROM v_turn.user_id
		OR v_existing.phase IS DISTINCT FROM p_phase
		OR v_existing.event_type IS DISTINCT FROM p_event_type
		OR v_existing.payload IS DISTINCT FROM p_payload THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_replay_conflict';
	END IF;
	RETURN jsonb_build_object(
		'outcome', 'already_persisted',
		'turn_run_id', v_existing.turn_run_id,
		'execution_generation', v_existing.execution_generation,
		'observation_key', v_existing.observation_key,
		'event_type', v_existing.event_type
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_execution_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_execution_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_execution_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) IS
	'Service-only redacted provider/tool boundary observation fenced to the active worker generation and queue lease.';

ALTER VIEW public.agentic_chat_worker_lifecycle_observations
	RENAME TO agentic_chat_worker_lifecycle_observations_slice12;

CREATE VIEW public.agentic_chat_worker_lifecycle_observations
WITH (security_invoker = true)
AS
WITH observation_sources AS (
	SELECT
		base.turn_run_id,
		base.session_id,
		base.user_id,
		base.stream_run_id,
		base.execution_generation,
		(base.observation_sequence_index * 10)::integer AS lifecycle_ordinal,
		0::bigint AS source_sequence,
		base.observation_key,
		base.phase,
		base.event_type,
		base.payload,
		base.source_kind,
		base.source_id,
		base.observed_at
	FROM public.agentic_chat_worker_lifecycle_observations_slice12 base

	UNION ALL

	SELECT
		observations.turn_run_id,
		observations.session_id,
		observations.user_id,
		turns.stream_run_id,
		observations.execution_generation,
		CASE
			WHEN observations.event_type = 'provider_attempt_started'
				AND observations.payload->>'round' = 'initial' THEN 25
			WHEN observations.event_type = 'provider_attempt_ended'
				AND observations.payload->>'round' = 'initial' THEN 26
			WHEN observations.event_type = 'tool_execution_started' THEN 42
			WHEN observations.event_type = 'tool_execution_ended' THEN 48
			WHEN observations.event_type = 'provider_attempt_started'
				AND observations.payload->>'round' = 'synthesis' THEN 55
			WHEN observations.event_type = 'provider_attempt_ended'
				AND observations.payload->>'round' = 'synthesis' THEN 56
			ELSE 58
		END,
		observations.id,
		observations.observation_key,
		observations.phase,
		observations.event_type,
		observations.payload,
		'execution_observation'::text,
		observations.id::text,
		observations.observed_at
	FROM public.agentic_chat_execution_observations observations
	JOIN public.chat_turn_runs turns ON turns.id = observations.turn_run_id
),
ranked AS (
	SELECT
		sources.*,
		row_number() OVER (
			PARTITION BY sources.turn_run_id, sources.execution_generation
			ORDER BY
				sources.lifecycle_ordinal,
				sources.source_sequence,
				sources.observation_key
		)::integer AS observation_sequence_index
	FROM observation_sources sources
)
SELECT
	turn_run_id,
	session_id,
	user_id,
	stream_run_id,
	execution_generation,
	observation_sequence_index,
	observation_key,
	phase,
	event_type,
	payload,
	source_kind,
	source_id,
	observed_at
FROM ranked;

REVOKE ALL ON TABLE public.agentic_chat_worker_lifecycle_observations_slice12
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agentic_chat_worker_lifecycle_observations
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agentic_chat_worker_lifecycle_observations_slice12 TO service_role;
GRANT SELECT ON TABLE public.agentic_chat_worker_lifecycle_observations TO service_role;

COMMENT ON VIEW public.agentic_chat_worker_lifecycle_observations IS
	'Private service-only lifecycle projection including redacted fenced provider-attempt and tool-execution boundaries. It is not a public reconnect stream.';

-- Explicit Slice 16 decision: per-user max_running/max_queued protects only
-- worker_realtime work. Legacy stale rows remain visible operationally but can
-- no longer silently consume the worker lane capacity budget. The same-session
-- active-turn conflict remains cross-mode and is intentionally unchanged.
DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'FROM public.chat_turn_runs turns\n\tWHERE turns.user_id = p_user_id\n\t\tAND turns.status IN (''queued'', ''running'');';
	v_replacement text := E'FROM public.chat_turn_runs turns\n\tWHERE turns.user_id = p_user_id\n\t\tAND turns.execution_mode = ''worker_realtime''\n\t\tAND turns.status IN (''queued'', ''running'');';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'create_agentic_chat_turn_with_job'
		AND procedures.pronargs = 34;

	IF position(v_needle IN v_definition) = 0
		OR position(v_replacement IN v_definition) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_worker_capacity_scope_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition
		OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_worker_capacity_scope_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) IS
	'Service-only duplicate-first worker admission. Per-user queued/running capacity counts worker_realtime turns only; same-session active conflicts remain cross-mode.';

COMMIT;
