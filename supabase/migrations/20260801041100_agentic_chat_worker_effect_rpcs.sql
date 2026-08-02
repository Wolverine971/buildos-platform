-- supabase/migrations/20260801041100_agentic_chat_worker_effect_rpcs.sql
-- Agentic Chat Worker migration, Phase 2B Slice 2: fenced effect RPCs.
--
-- This package adds only the service-owned mutation-effect lifecycle:
--   * duplicate-first reservation under the current queue/domain owner;
--   * single-winner reserved -> started with the turn's irreversible boundary;
--   * fenced outcome recording plus explicit uncertain-effect reconciliation.
--
-- It deliberately adds no worker admission, claim, terminal finalization,
-- stalled recovery, queue consumer, or model/tool execution path.

CREATE OR REPLACE FUNCTION public.reserve_agentic_chat_effect(
	p_effect_id uuid,
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_tool_name text,
	p_operation_name text,
	p_canonical_argument_hash text,
	p_downstream_idempotency_supported boolean,
	p_provider_tool_call_id text DEFAULT NULL::text
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
	v_effect public.chat_turn_effects%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_tool_name text := btrim(p_tool_name);
	v_operation_name text := btrim(p_operation_name);
	v_provider_tool_call_id text := NULLIF(btrim(p_provider_tool_call_id), '');
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_effect_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_effect_id IS NULL
		OR p_turn_run_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR v_tool_name IS NULL
		OR v_tool_name = ''
		OR length(v_tool_name) > 256
		OR v_operation_name IS NULL
		OR v_operation_name = ''
		OR length(v_operation_name) > 256
		OR p_canonical_argument_hash IS NULL
		OR p_canonical_argument_hash !~ '^[0-9a-f]{64}$'
		OR p_downstream_idempotency_supported IS NULL
		OR length(v_provider_tool_call_id) > 512 THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reservation';
	END IF;

	-- Duplicate-first resolution is intentionally independent of current queue
	-- ownership. A worker that lost the reservation response must be able to
	-- discover the durable state without manufacturing another effect.
	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id;

	IF FOUND THEN
		IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
			OR v_effect.tool_name IS DISTINCT FROM v_tool_name
			OR v_effect.operation_name IS DISTINCT FROM v_operation_name
			OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash
			OR v_effect.downstream_idempotency_supported
				IS DISTINCT FROM p_downstream_idempotency_supported THEN
			RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
				USING ERRCODE = '23505';
		END IF;

		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	-- Serialize every new effect operation on the owning domain row. The effect
	-- and queue locks below always follow this turn -> effect -> queue order.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_turn_not_found';
	END IF;

	-- A concurrent reservation may have committed while this caller waited for
	-- the turn lock. Resolve it with the same immutable-identity rules.
	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id
	FOR UPDATE;

	IF FOUND THEN
		IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
			OR v_effect.tool_name IS DISTINCT FROM v_tool_name
			OR v_effect.operation_name IS DISTINCT FROM v_operation_name
			OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash
			OR v_effect.downstream_idempotency_supported
				IS DISTINCT FROM p_downstream_idempotency_supported THEN
			RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
				USING ERRCODE = '23505';
		END IF;

		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	IF p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.status <> 'running'
		OR v_turn.execution_generation <> p_execution_generation
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_started_at IS NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_cancel_already_accepted';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
	END IF;

	INSERT INTO public.chat_turn_effects (
		id,
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		tool_name,
		operation_name,
		canonical_argument_hash,
		provider_tool_call_id,
		downstream_idempotency_supported,
		reserved_at,
		created_at,
		updated_at
	) VALUES (
		p_effect_id,
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		p_execution_generation,
		v_tool_name,
		v_operation_name,
		p_canonical_argument_hash,
		v_provider_tool_call_id,
		p_downstream_idempotency_supported,
		v_now,
		v_now,
		v_now
	)
	RETURNING * INTO v_effect;

	UPDATE public.chat_turn_runs turns
	SET mutation_reserved_at = COALESCE(turns.mutation_reserved_at, v_now)
	WHERE turns.id = v_turn.id;

	RETURN jsonb_build_object(
		'effectId', v_effect.id,
		'turnRunId', v_effect.turn_run_id,
		'executionGeneration', v_effect.execution_generation,
		'sessionId', v_effect.session_id,
		'userId', v_effect.user_id,
		'state', v_effect.state,
		'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
		'downstreamReceipt', v_effect.downstream_receipt,
		'startedAt', v_effect.started_at,
		'finishedAt', v_effect.finished_at,
		'outcome', 'reserved',
		'invokeAdapter', false
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.begin_agentic_chat_effect(
	p_effect_id uuid,
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_canonical_argument_hash text,
	p_provider_tool_call_id text DEFAULT NULL::text
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
	v_effect public.chat_turn_effects%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_provider_tool_call_id text := NULLIF(btrim(p_provider_tool_call_id), '');
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_effect_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_effect_id IS NULL
		OR p_turn_run_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_canonical_argument_hash IS NULL
		OR p_canonical_argument_hash !~ '^[0-9a-f]{64}$'
		OR length(v_provider_tool_call_id) > 512 THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_begin';
	END IF;

	-- A completed duplicate is safe to resolve without current ownership, but
	-- it can never grant adapter invocation again.
	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_not_reserved';
	END IF;

	IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
		OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
		RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
			USING ERRCODE = '23505';
	END IF;

	IF v_effect.state <> 'reserved' THEN
		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_turn_not_found';
	END IF;

	-- Re-read under the serialized turn lock before checking current ownership.
	-- A lost-response retry must return a concurrently committed started/terminal
	-- receipt even if the original queue owner has since been replaced.
	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_not_reserved';
	END IF;

	IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
		OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
		RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
			USING ERRCODE = '23505';
	END IF;

	IF v_effect.state <> 'reserved' THEN
		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	IF p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.status <> 'running'
		OR v_turn.execution_generation <> p_execution_generation
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_started_at IS NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_cancel_already_accepted';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
	END IF;

	UPDATE public.chat_turn_effects effects
	SET
		state = 'started',
		started_at = v_now,
		provider_tool_call_id = COALESCE(
			v_provider_tool_call_id,
			effects.provider_tool_call_id
		)
	WHERE effects.id = p_effect_id
		AND effects.state = 'reserved'
	RETURNING * INTO v_effect;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_begin_lost_race';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET irreversible_boundary_at = COALESCE(turns.irreversible_boundary_at, v_now)
	WHERE turns.id = p_turn_run_id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation
		AND turns.cancel_requested_at IS NULL;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_begin_fence_lost';
	END IF;

	RETURN jsonb_build_object(
		'effectId', v_effect.id,
		'turnRunId', v_effect.turn_run_id,
		'executionGeneration', v_effect.execution_generation,
		'sessionId', v_effect.session_id,
		'userId', v_effect.user_id,
		'state', v_effect.state,
		'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
		'downstreamReceipt', v_effect.downstream_receipt,
		'startedAt', v_effect.started_at,
		'finishedAt', v_effect.finished_at,
		'outcome', 'started',
		'invokeAdapter', true
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_agentic_chat_effect(
	p_effect_id uuid,
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_canonical_argument_hash text,
	p_target_state text,
	p_downstream_receipt jsonb DEFAULT NULL::jsonb,
	p_failure_code text DEFAULT NULL::text
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
	v_effect public.chat_turn_effects%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_failure_code text := NULLIF(btrim(p_failure_code), '');
	v_requires_owner boolean := true;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_effect_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_effect_id IS NULL
		OR p_turn_run_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_canonical_argument_hash IS NULL
		OR p_canonical_argument_hash !~ '^[0-9a-f]{64}$'
		OR p_target_state IS NULL
		OR p_target_state NOT IN ('succeeded', 'failed', 'cancelled', 'uncertain')
		OR (p_downstream_receipt IS NOT NULL AND jsonb_typeof(p_downstream_receipt) <> 'object')
		OR length(v_failure_code) > 128
		OR (p_target_state = 'succeeded' AND v_failure_code IS NOT NULL)
		OR (p_target_state IN ('failed', 'uncertain') AND v_failure_code IS NULL)
		OR (p_target_state = 'cancelled' AND p_downstream_receipt IS NOT NULL) THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation';
	END IF;

	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_not_found';
	END IF;

	IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
		OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
		RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
			USING ERRCODE = '23505';
	END IF;

	-- Lost-response retries of immutable terminal states (and a repeated
	-- uncertain classification) resolve without current queue ownership.
	IF v_effect.state IN ('succeeded', 'failed', 'cancelled')
		OR (v_effect.state = 'uncertain' AND p_target_state = 'uncertain') THEN
		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	IF v_effect.state = 'reserved' AND p_target_state <> 'cancelled' THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	ELSIF v_effect.state = 'started'
		AND p_target_state NOT IN ('succeeded', 'failed', 'uncertain') THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	ELSIF v_effect.state = 'uncertain'
		AND p_target_state NOT IN ('succeeded', 'failed') THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_turn_not_found';
	END IF;

	-- Refresh and lock the effect after acquiring the owning turn. This preserves
	-- duplicate-first receipt resolution across a concurrent transition or queue
	-- ownership change while keeping all state decisions serialized per turn.
	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_effect_not_found';
	END IF;

	IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
		OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
		RAISE EXCEPTION 'agentic_chat_effect_idempotency_conflict'
			USING ERRCODE = '23505';
	END IF;

	IF v_effect.state IN ('succeeded', 'failed', 'cancelled')
		OR (v_effect.state = 'uncertain' AND p_target_state = 'uncertain') THEN
		RETURN jsonb_build_object(
			'effectId', v_effect.id,
			'turnRunId', v_effect.turn_run_id,
			'executionGeneration', v_effect.execution_generation,
			'sessionId', v_effect.session_id,
			'userId', v_effect.user_id,
			'state', v_effect.state,
			'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
			'downstreamReceipt', v_effect.downstream_receipt,
			'startedAt', v_effect.started_at,
			'finishedAt', v_effect.finished_at,
			'outcome', 'existing',
			'invokeAdapter', false
		);
	END IF;

	IF v_effect.state = 'reserved' AND p_target_state <> 'cancelled' THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	ELSIF v_effect.state = 'started'
		AND p_target_state NOT IN ('succeeded', 'failed', 'uncertain') THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	ELSIF v_effect.state = 'uncertain'
		AND p_target_state NOT IN ('succeeded', 'failed') THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_reconciliation_transition';
	END IF;

	-- Explicit uncertain -> succeeded/failed reconciliation is an operator/
	-- recovery action by effect id. It never permits invocation and therefore
	-- intentionally does not require a live queue owner. Every transition from
	-- reserved/started still requires the current token and generation, except
	-- that an already accepted turn cancellation may close an unstarted reserve.
	v_requires_owner := v_effect.state <> 'uncertain'
		AND NOT (
			v_effect.state = 'reserved'
			AND p_target_state = 'cancelled'
			AND (v_turn.cancel_requested_at IS NOT NULL OR v_turn.status = 'cancelled')
		);

	IF v_requires_owner THEN
		IF p_queue_job_id IS NULL
			OR p_processing_token IS NULL
			OR v_turn.execution_mode <> 'worker_realtime'
			OR v_turn.status <> 'running'
			OR v_turn.execution_generation <> p_execution_generation
			OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
			OR v_turn.execution_started_at IS NULL
			OR v_turn.terminalized_at IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
		END IF;

		SELECT jobs.*
		INTO v_job
		FROM public.queue_jobs jobs
		WHERE jobs.id = p_queue_job_id
		FOR UPDATE;

		IF NOT FOUND
			OR v_job.job_type::text <> 'agentic_chat_turn'
			OR v_job.status::text <> 'processing'
			OR v_job.processing_token IS DISTINCT FROM p_processing_token
			OR v_job.user_id IS DISTINCT FROM v_turn.user_id
			OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
			OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
			RAISE EXCEPTION 'agentic_chat_effect_ownership_lost';
		END IF;
	END IF;

	UPDATE public.chat_turn_effects effects
	SET
		state = p_target_state,
		finished_at = CASE
			WHEN effects.state = 'uncertain' THEN effects.finished_at
			ELSE v_now
		END,
		downstream_receipt = p_downstream_receipt,
		failure_code = v_failure_code
	WHERE effects.id = p_effect_id
	RETURNING * INTO v_effect;

	RETURN jsonb_build_object(
		'effectId', v_effect.id,
		'turnRunId', v_effect.turn_run_id,
		'executionGeneration', v_effect.execution_generation,
		'sessionId', v_effect.session_id,
		'userId', v_effect.user_id,
		'state', v_effect.state,
		'downstreamIdempotencySupported', v_effect.downstream_idempotency_supported,
		'downstreamReceipt', v_effect.downstream_receipt,
		'startedAt', v_effect.started_at,
		'finishedAt', v_effect.finished_at,
		'outcome', 'reconciled',
		'invokeAdapter', false
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text
) TO service_role;

REVOKE ALL ON FUNCTION public.begin_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.reserve_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text
) IS
	'Service-only duplicate-first stable-effect reservation. A new reservation requires the current queue token/generation and atomically sets only mutation_reserved_at.';
COMMENT ON FUNCTION public.begin_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text
) IS
	'Service-only single-winner reserved -> started fence. Exactly the response with invokeAdapter=true atomically sets irreversible_boundary_at and may invoke the adapter.';
COMMENT ON FUNCTION public.reconcile_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
) IS
	'Service-only effect outcome recorder. Reserved/started transitions are current-owner fenced; uncertain effects may be explicitly reconciled by stable effect id without permitting invocation.';

-- Rollback while worker routing remains disabled:
--   DROP FUNCTION public.reconcile_agentic_chat_effect(
--     uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
--   );
--   DROP FUNCTION public.begin_agentic_chat_effect(
--     uuid, uuid, uuid, uuid, integer, text, text
--   );
--   DROP FUNCTION public.reserve_agentic_chat_effect(
--     uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text
--   );
-- The Phase 2B Slice 1 effect table and telemetry link remain in place.
