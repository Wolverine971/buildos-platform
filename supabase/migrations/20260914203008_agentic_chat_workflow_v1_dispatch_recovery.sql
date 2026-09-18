-- supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql
-- Agentic Chat workflow v1 (Tasker 85), part 2 of 2: physical dispatch
-- reservation and settlement, durable answer cursor, synthesis acceptance,
-- read-only workflow recovery, terminal synchronization, and receipt cleanup.
--
-- Requires 20260914203007_agentic_chat_workflow_v1_storage.sql. Ordinary
-- recover_agentic_chat_turn(...) is unchanged: post-start mutating turns remain
-- ineligible for retry. Nothing here is called until the workflow runner exists.
--
-- ROLLBACK: disable workflow dispatch and admission. Keep settlement,
-- reconciliation, recovery, and terminal sync deployed until every v4 turn is
-- terminal and every dispatch is settled or released.

BEGIN;

-- ---------------------------------------------------------------------------
-- Pricing and per-step output ceilings
-- ---------------------------------------------------------------------------

-- Changing an admitted model or its maximum rates requires a new policy version.
CREATE OR REPLACE FUNCTION public.agentic_chat_workflow_pricing_valid_v1(
	p_model_requested text,
	p_pricing jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_keys constant text[] := ARRAY[
		'version', 'model', 'canonicalModel', 'promptUsdPerMillion', 'completionUsdPerMillion',
		'cacheReadUsdPerMillion', 'requestUsd', 'source', 'observedAt'
	];
	v_decimal constant text := '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,9})?$';
BEGIN
	RETURN jsonb_typeof(COALESCE(p_pricing, 'null'::jsonb)) = 'object'
		AND p_pricing ?& v_keys
		AND (p_pricing - v_keys) = '{}'::jsonb
		AND p_pricing->'version' = '"agentic_chat_workflow_pricing_v1"'::jsonb
		AND p_pricing->'model' = to_jsonb(p_model_requested)
		AND p_model_requested IN ('deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4-flash')
		AND jsonb_typeof(p_pricing->'canonicalModel') = 'string'
		AND char_length(p_pricing->>'canonicalModel') BETWEEN 1 AND 128
		AND jsonb_typeof(p_pricing->'promptUsdPerMillion') = 'string'
		AND p_pricing->>'promptUsdPerMillion' ~ v_decimal
		AND (p_pricing->>'promptUsdPerMillion')::numeric <= 0.30
		AND jsonb_typeof(p_pricing->'completionUsdPerMillion') = 'string'
		AND p_pricing->>'completionUsdPerMillion' ~ v_decimal
		AND (p_pricing->>'completionUsdPerMillion')::numeric <= 1.20
		AND jsonb_typeof(p_pricing->'cacheReadUsdPerMillion') = 'string'
		AND p_pricing->>'cacheReadUsdPerMillion' ~ v_decimal
		AND (p_pricing->>'cacheReadUsdPerMillion')::numeric <= 0.006
		AND p_pricing->'requestUsd' = '"0"'::jsonb
		AND p_pricing->'source' = '"openrouter_models_api"'::jsonb
		AND jsonb_typeof(p_pricing->'observedAt') = 'string'
		AND p_pricing->>'observedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$';
END;
$$;

CREATE OR REPLACE FUNCTION public.agentic_chat_workflow_max_output_tokens_v1(p_step_key text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
	SELECT CASE p_step_key
		WHEN 'planner' THEN 1200
		WHEN 'project_analyst' THEN 4000
		WHEN 'risk_reviewer' THEN 4000
		WHEN 'editor' THEN 3200
	END
$$;

-- ---------------------------------------------------------------------------
-- Physical dispatch: reserve, begin, settle, reconcile
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_agentic_chat_workflow_dispatch_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_dispatch_id uuid,
	p_step_key text,
	p_step_attempt_id uuid,
	p_physical_attempt integer,
	p_dispatch_kind text,
	p_model_requested text,
	p_pricing_snapshot jsonb,
	p_serialized_request_bytes integer,
	p_max_output_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_step public.chat_turn_workflow_steps%ROWTYPE;
	v_existing public.chat_turn_workflow_dispatches%ROWTYPE;
	v_now timestamptz;
	v_reservation bigint;
	v_exposure bigint;
	v_dispatch_count integer;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('dispatch_reserve');
	IF p_dispatch_id IS NULL OR p_step_attempt_id IS NULL
		OR p_step_key IS NULL
		OR p_step_key NOT IN ('planner', 'project_analyst', 'risk_reviewer', 'editor')
		OR p_physical_attempt IS NULL OR p_physical_attempt NOT BETWEEN 1 AND 2
		OR p_dispatch_kind IS NULL
		OR p_dispatch_kind NOT IN ('planner', 'specialist', 'editor', 'corrective', 'provider_fallback', 'paid_tool')
		OR p_model_requested IS NULL OR char_length(p_model_requested) NOT BETWEEN 1 AND 128
		OR p_serialized_request_bytes IS NULL OR p_serialized_request_bytes NOT BETWEEN 1 AND 131072
		OR p_max_output_tokens IS NULL
		OR p_max_output_tokens NOT BETWEEN 1 AND public.agentic_chat_workflow_max_output_tokens_v1(p_step_key)
		OR (p_dispatch_kind = 'planner' AND p_step_key <> 'planner')
		OR (p_dispatch_kind = 'specialist' AND p_step_key NOT IN ('project_analyst', 'risk_reviewer'))
		OR (p_dispatch_kind = 'editor' AND p_step_key <> 'editor') THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_reserve_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'dispatch_reserve', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation);
	END IF;

	-- The parent row serializes every reservation for this turn.
	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_reserve_run_missing';
	END IF;

	SELECT dispatches.* INTO v_existing FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id FOR UPDATE;
	IF FOUND THEN
		RETURN jsonb_build_object(
			'outcome', CASE
				WHEN v_existing.turn_run_id = p_turn_run_id
					AND v_existing.step_key = p_step_key
					AND v_existing.step_attempt_id = p_step_attempt_id
					AND v_existing.physical_attempt = p_physical_attempt
					AND v_existing.dispatch_kind = p_dispatch_kind
					AND v_existing.model_requested = p_model_requested
					AND v_existing.pricing = p_pricing_snapshot
					AND v_existing.serialized_request_bytes = p_serialized_request_bytes
					AND v_existing.max_output_tokens = p_max_output_tokens
				THEN 'already_reserved' ELSE 'reservation_conflict' END,
			'turn_run_id', p_turn_run_id,
			'dispatch_id', v_existing.dispatch_id,
			'state', v_existing.state,
			'reserved_micro_usd', v_existing.reserved_micro_usd,
			'settlement_token', CASE WHEN v_existing.turn_run_id = p_turn_run_id
				THEN v_existing.settlement_token END
		);
	END IF;

	IF p_dispatch_kind = 'paid_tool' THEN
		RETURN jsonb_build_object('outcome', 'pricing_unavailable', 'turn_run_id', p_turn_run_id,
			'reason', 'paid_tools_disabled');
	END IF;
	IF NOT public.agentic_chat_workflow_pricing_valid_v1(p_model_requested, p_pricing_snapshot) THEN
		RETURN jsonb_build_object('outcome', 'pricing_unavailable', 'turn_run_id', p_turn_run_id,
			'model_requested', p_model_requested);
	END IF;

	SELECT steps.* INTO v_step FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = 'agentic_chat_project_review_plan_v1'
		AND steps.step_key = p_step_key
	FOR UPDATE;
	IF NOT FOUND
		OR v_step.status <> 'claimed'
		OR v_step.current_attempt_id IS DISTINCT FROM p_step_attempt_id
		OR v_step.current_attempt_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'stale_claim', 'turn_run_id', p_turn_run_id,
			'step_key', p_step_key);
	END IF;

	IF EXISTS (
		SELECT 1 FROM public.chat_turn_workflow_dispatches dispatches
		WHERE dispatches.turn_run_id = p_turn_run_id
			AND dispatches.step_key = p_step_key
			AND dispatches.step_attempt_id = p_step_attempt_id
			AND dispatches.physical_attempt = p_physical_attempt
	) THEN
		RETURN jsonb_build_object('outcome', 'reservation_conflict', 'turn_run_id', p_turn_run_id,
			'step_key', p_step_key, 'physical_attempt', p_physical_attempt);
	END IF;

	v_now := clock_timestamp();
	IF v_run.deadline_at IS NULL OR v_run.deadline_at <= v_now THEN
		RETURN jsonb_build_object('outcome', 'deadline_expired', 'turn_run_id', p_turn_run_id,
			'deadline_at', v_run.deadline_at);
	END IF;

	SELECT count(*)::integer INTO v_dispatch_count
	FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.turn_run_id = p_turn_run_id;
	IF v_dispatch_count >= v_run.max_physical_dispatches THEN
		RETURN jsonb_build_object('outcome', 'dispatch_limit', 'turn_run_id', p_turn_run_id,
			'dispatch_count', v_dispatch_count);
	END IF;

	v_reservation := ((p_serialized_request_bytes::bigint + 1024) * 3
		+ p_max_output_tokens::bigint * 12 + 9) / 10;
	v_exposure := public.agentic_chat_workflow_exposure_micro_usd_v1(p_turn_run_id);
	IF v_exposure + v_reservation > v_run.max_spend_micro_usd THEN
		RETURN jsonb_build_object('outcome', 'budget_exhausted', 'turn_run_id', p_turn_run_id,
			'exposure_micro_usd', v_exposure, 'reservation_micro_usd', v_reservation);
	END IF;
	IF p_step_key <> 'editor'
		AND v_run.max_spend_micro_usd - (v_exposure + v_reservation) < v_run.synthesis_headroom_micro_usd THEN
		RETURN jsonb_build_object('outcome', 'synthesis_headroom_required', 'turn_run_id', p_turn_run_id,
			'exposure_micro_usd', v_exposure, 'reservation_micro_usd', v_reservation);
	END IF;

	INSERT INTO public.chat_turn_workflow_dispatches (
		dispatch_id, turn_run_id, session_id, user_id, step_key, step_attempt_id, physical_attempt,
		dispatch_kind, state, model_requested, pricing, serialized_request_bytes,
		estimated_input_tokens, max_output_tokens, reserved_micro_usd, reserved_generation,
		reserved_at, created_at, updated_at
	) VALUES (
		p_dispatch_id, p_turn_run_id, v_run.session_id, v_run.user_id, p_step_key, p_step_attempt_id,
		p_physical_attempt, p_dispatch_kind, 'reserved', p_model_requested, p_pricing_snapshot,
		p_serialized_request_bytes, p_serialized_request_bytes + 1024, p_max_output_tokens,
		v_reservation, p_execution_generation, v_now, v_now, v_now
	)
	RETURNING * INTO v_existing;

	RETURN jsonb_build_object(
		'outcome', 'reserved',
		'turn_run_id', p_turn_run_id,
		'dispatch_id', p_dispatch_id,
		'state', 'reserved',
		'reserved_micro_usd', v_reservation,
		'exposure_micro_usd', v_exposure + v_reservation,
		'remaining_micro_usd', v_run.max_spend_micro_usd - (v_exposure + v_reservation),
		'dispatch_count', v_dispatch_count + 1,
		'deadline_at', v_run.deadline_at,
		'settlement_token', v_existing.settlement_token
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_agentic_chat_workflow_dispatch_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_dispatch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_step public.chat_turn_workflow_steps%ROWTYPE;
	v_dispatch public.chat_turn_workflow_dispatches%ROWTYPE;
	v_now timestamptz;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('dispatch_begin');
	IF p_dispatch_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_begin_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'dispatch_begin', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation)
			|| jsonb_build_object('dispatch_permitted', false);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	SELECT dispatches.* INTO v_dispatch FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id AND dispatches.turn_run_id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND OR v_dispatch.state = 'released'
		OR v_dispatch.reserved_generation <> p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'reservation_required', 'dispatch_permitted', false,
			'turn_run_id', p_turn_run_id, 'dispatch_id', p_dispatch_id);
	END IF;
	-- A lost begin response never grants a second permit.
	IF v_dispatch.state <> 'reserved' THEN
		RETURN jsonb_build_object('outcome', 'already_started', 'dispatch_permitted', false,
			'turn_run_id', p_turn_run_id, 'dispatch_id', p_dispatch_id, 'state', v_dispatch.state,
			'dispatched_at', v_dispatch.dispatched_at);
	END IF;

	SELECT steps.* INTO v_step FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = 'agentic_chat_project_review_plan_v1'
		AND steps.step_key = v_dispatch.step_key
	FOR UPDATE;
	IF NOT FOUND
		OR v_step.status <> 'claimed'
		OR v_step.current_attempt_id IS DISTINCT FROM v_dispatch.step_attempt_id
		OR v_step.current_attempt_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'stale_claim', 'dispatch_permitted', false,
			'turn_run_id', p_turn_run_id, 'dispatch_id', p_dispatch_id);
	END IF;

	v_now := clock_timestamp();
	IF v_run.deadline_at <= v_now THEN
		RETURN jsonb_build_object('outcome', 'deadline_expired', 'dispatch_permitted', false,
			'turn_run_id', p_turn_run_id, 'deadline_at', v_run.deadline_at);
	END IF;

	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = 'dispatching',
		dispatched_at = v_now
	WHERE dispatches.dispatch_id = p_dispatch_id
		AND dispatches.state = 'reserved';

	RETURN jsonb_build_object(
		'outcome', 'dispatching',
		'dispatch_permitted', true,
		'turn_run_id', p_turn_run_id,
		'dispatch_id', p_dispatch_id,
		'dispatched_at', v_now,
		'deadline_at', v_run.deadline_at,
		'max_output_tokens', v_dispatch.max_output_tokens
	);
END;
$$;

-- Records already-incurred cost. It is authorized by the per-dispatch settlement
-- token, not by current ownership, and never grants further execution.
CREATE OR REPLACE FUNCTION public.settle_agentic_chat_workflow_dispatch_v1(
	p_dispatch_id uuid,
	p_settlement_token uuid,
	p_provider_request_id text,
	p_provider_usage jsonb,
	p_actual_micro_usd bigint,
	p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_dispatch public.chat_turn_workflow_dispatches%ROWTYPE;
	v_now timestamptz;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('dispatch_settle');
	IF p_dispatch_id IS NULL OR p_settlement_token IS NULL
		OR p_outcome IS NULL OR p_outcome NOT IN ('settled', 'uncertain', 'released')
		OR (p_outcome = 'settled' AND (p_actual_micro_usd IS NULL OR p_actual_micro_usd < 0))
		OR (p_outcome <> 'settled' AND p_actual_micro_usd IS NOT NULL)
		OR (p_provider_request_id IS NOT NULL AND char_length(p_provider_request_id) NOT BETWEEN 1 AND 512)
		OR (p_provider_usage IS NOT NULL AND (jsonb_typeof(p_provider_usage) <> 'object'
			OR octet_length(p_provider_usage::text) > 16384)) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_settle_invalid';
	END IF;

	SELECT dispatches.* INTO v_dispatch FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('outcome', 'unknown_dispatch', 'dispatch_id', p_dispatch_id);
	END IF;
	IF v_dispatch.settlement_token IS DISTINCT FROM p_settlement_token THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_settlement_token_invalid'
			USING ERRCODE = '42501';
	END IF;

	PERFORM 1 FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = v_dispatch.turn_run_id FOR UPDATE;
	SELECT dispatches.* INTO v_dispatch FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id FOR UPDATE;

	IF v_dispatch.state = p_outcome THEN
		RETURN jsonb_build_object(
			'outcome', CASE
				WHEN p_outcome = 'uncertain'
					OR (v_dispatch.actual_micro_usd IS NOT DISTINCT FROM p_actual_micro_usd
						AND v_dispatch.provider_request_id IS NOT DISTINCT FROM p_provider_request_id)
				THEN 'already_settled' ELSE 'settlement_conflict' END,
			'dispatch_id', p_dispatch_id,
			'state', v_dispatch.state,
			'actual_micro_usd', v_dispatch.actual_micro_usd
		);
	END IF;
	IF NOT (
		(v_dispatch.state = 'dispatching' AND p_outcome IN ('settled', 'uncertain'))
		OR (v_dispatch.state = 'reserved' AND p_outcome = 'released')
	) THEN
		RETURN jsonb_build_object('outcome', 'settlement_conflict', 'dispatch_id', p_dispatch_id,
			'state', v_dispatch.state);
	END IF;

	v_now := clock_timestamp();
	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = p_outcome,
		actual_micro_usd = p_actual_micro_usd,
		provider_request_id = p_provider_request_id,
		provider_usage = p_provider_usage,
		settled_at = CASE WHEN p_outcome IN ('settled', 'released') THEN v_now END,
		uncertain_at = CASE WHEN p_outcome = 'uncertain' THEN v_now ELSE dispatches.uncertain_at END
	WHERE dispatches.dispatch_id = p_dispatch_id;

	RETURN jsonb_build_object(
		'outcome', CASE p_outcome WHEN 'uncertain' THEN 'uncertain' ELSE 'settled' END,
		'dispatch_id', p_dispatch_id,
		'state', p_outcome,
		'actual_micro_usd', p_actual_micro_usd,
		'overrun_micro_usd', GREATEST(COALESCE(p_actual_micro_usd, 0) - v_dispatch.reserved_micro_usd, 0),
		'exposure_micro_usd', public.agentic_chat_workflow_exposure_micro_usd_v1(v_dispatch.turn_run_id)
	);
END;
$$;

-- Only provider-backed evidence may resolve uncertain exposure.
CREATE OR REPLACE FUNCTION public.reconcile_agentic_chat_workflow_dispatch_v1(
	p_dispatch_id uuid,
	p_reconciliation_id uuid,
	p_target_state text,
	p_provider_receipt jsonb DEFAULT NULL,
	p_actual_micro_usd bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_dispatch public.chat_turn_workflow_dispatches%ROWTYPE;
	v_now timestamptz;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('dispatch_reconcile');
	IF p_dispatch_id IS NULL OR p_reconciliation_id IS NULL
		OR p_target_state IS NULL OR p_target_state NOT IN ('settled', 'released', 'uncertain')
		OR (p_target_state = 'settled' AND (p_actual_micro_usd IS NULL OR p_actual_micro_usd < 0))
		OR (p_target_state <> 'settled' AND p_actual_micro_usd IS NOT NULL)
		OR (p_target_state IN ('settled', 'released') AND (
			jsonb_typeof(COALESCE(p_provider_receipt, 'null'::jsonb)) <> 'object'
			OR octet_length(p_provider_receipt::text) > 16384
		)) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_reconcile_invalid';
	END IF;

	SELECT dispatches.* INTO v_dispatch FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('outcome', 'unknown_dispatch', 'dispatch_id', p_dispatch_id);
	END IF;
	PERFORM 1 FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = v_dispatch.turn_run_id FOR UPDATE;
	SELECT dispatches.* INTO v_dispatch FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id = p_dispatch_id FOR UPDATE;

	IF v_dispatch.reconciliation_id IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_dispatch.reconciliation_id = p_reconciliation_id
					AND v_dispatch.state = p_target_state
					AND v_dispatch.actual_micro_usd IS NOT DISTINCT FROM p_actual_micro_usd
				THEN 'already_reconciled' ELSE 'reconciliation_conflict' END,
			'dispatch_id', p_dispatch_id,
			'state', v_dispatch.state
		);
	END IF;
	IF v_dispatch.state <> 'uncertain' THEN
		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_dispatch.state = 'dispatching'
				THEN 'still_uncertain' ELSE 'reconciliation_conflict' END,
			'dispatch_id', p_dispatch_id,
			'state', v_dispatch.state
		);
	END IF;
	IF p_target_state = 'uncertain' THEN
		RETURN jsonb_build_object('outcome', 'still_uncertain', 'dispatch_id', p_dispatch_id,
			'state', v_dispatch.state);
	END IF;

	v_now := clock_timestamp();
	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = p_target_state,
		actual_micro_usd = p_actual_micro_usd,
		settled_at = v_now,
		reconciled_at = v_now,
		reconciliation_id = p_reconciliation_id,
		reconciliation_receipt = p_provider_receipt
	WHERE dispatches.dispatch_id = p_dispatch_id;

	RETURN jsonb_build_object(
		'outcome', 'reconciled',
		'dispatch_id', p_dispatch_id,
		'state', p_target_state,
		'actual_micro_usd', p_actual_micro_usd,
		'exposure_micro_usd', public.agentic_chat_workflow_exposure_micro_usd_v1(v_dispatch.turn_run_id)
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Durable answer cursor and synthesis
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_workflow_text_batch_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_answer_id uuid,
	p_editor_step_attempt_id uuid,
	p_batch_id uuid,
	p_start_byte integer,
	p_text_delta text,
	p_assistant_text text,
	p_delta_sha256 text,
	p_complete_text_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_step public.chat_turn_workflow_steps%ROWTYPE;
	v_stream_text text;
	v_receipt jsonb;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('text_batch');
	IF p_answer_id IS NULL OR p_editor_step_attempt_id IS NULL OR p_batch_id IS NULL
		OR p_start_byte IS NULL OR p_start_byte < 0
		OR p_text_delta IS NULL OR p_text_delta = '' OR octet_length(p_text_delta) > 131072
		OR p_assistant_text IS NULL OR octet_length(p_assistant_text) > 131072
		OR p_delta_sha256 IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(p_text_delta)
		OR p_complete_text_sha256 IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(p_assistant_text) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_text_batch_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'text_batch', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation)
			|| jsonb_build_object('publish_allowed', false);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_text_batch_run_missing';
	END IF;

	-- A lost response replays through the ordinary text writer's batch receipt.
	IF v_run.answer_last_batch_id = p_batch_id THEN
		IF v_run.answer_id IS DISTINCT FROM p_answer_id
			OR v_run.answer_text IS DISTINCT FROM p_assistant_text THEN
			RETURN jsonb_build_object('outcome', 'answer_conflict', 'publish_allowed', false,
				'turn_run_id', p_turn_run_id, 'durable_bytes', octet_length(v_run.answer_text));
		END IF;
		v_receipt := public.persist_agentic_chat_text_batch(
			p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
			p_batch_id, p_text_delta, p_assistant_text
		);
		RETURN v_receipt || jsonb_build_object(
			'answer_id', v_run.answer_id,
			'durable_bytes', octet_length(v_run.answer_text),
			'text_sha256', v_run.answer_text_sha256
		);
	END IF;

	SELECT steps.* INTO v_step FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = 'agentic_chat_project_review_plan_v1'
		AND steps.step_key = 'editor'
	FOR UPDATE;
	IF NOT FOUND
		OR v_step.status <> 'claimed'
		OR v_step.current_attempt_id IS DISTINCT FROM p_editor_step_attempt_id
		OR v_step.current_attempt_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'stale_claim', 'publish_allowed', false,
			'turn_run_id', p_turn_run_id);
	END IF;

	-- Once any answer byte is durable, only that answer and editor attempt may extend it.
	IF v_run.synthesis_status = 'accepted'
		OR (v_run.answer_id IS NOT NULL AND (
			v_run.answer_id IS DISTINCT FROM p_answer_id
			OR v_run.answer_editor_step_attempt_id IS DISTINCT FROM p_editor_step_attempt_id
		)) THEN
		RETURN jsonb_build_object('outcome', 'answer_conflict', 'publish_allowed', false,
			'turn_run_id', p_turn_run_id, 'answer_id', v_run.answer_id,
			'durable_bytes', octet_length(v_run.answer_text));
	END IF;
	IF p_start_byte <> octet_length(v_run.answer_text) THEN
		RETURN jsonb_build_object('outcome', 'offset_conflict', 'publish_allowed', false,
			'turn_run_id', p_turn_run_id, 'durable_bytes', octet_length(v_run.answer_text));
	END IF;
	IF p_assistant_text IS DISTINCT FROM v_run.answer_text || p_text_delta THEN
		RETURN jsonb_build_object('outcome', 'answer_conflict', 'publish_allowed', false,
			'turn_run_id', p_turn_run_id, 'durable_bytes', octet_length(v_run.answer_text));
	END IF;

	SELECT streams.assistant_text INTO v_stream_text
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = p_turn_run_id;
	IF v_stream_text IS DISTINCT FROM v_run.answer_text THEN
		RETURN jsonb_build_object('outcome', 'stream_reseed_required', 'publish_allowed', false,
			'turn_run_id', p_turn_run_id, 'durable_bytes', octet_length(v_run.answer_text));
	END IF;

	v_receipt := public.persist_agentic_chat_text_batch(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_batch_id, p_text_delta, p_assistant_text
	);
	IF v_receipt->>'outcome' IS DISTINCT FROM 'persisted' THEN
		RETURN v_receipt;
	END IF;

	UPDATE public.chat_turn_workflow_runs runs
	SET answer_id = p_answer_id,
		answer_editor_step_attempt_id = p_editor_step_attempt_id,
		answer_text = p_assistant_text,
		answer_text_sha256 = p_complete_text_sha256,
		answer_last_batch_id = p_batch_id,
		synthesis_status = 'streaming'
	WHERE runs.turn_run_id = p_turn_run_id;

	RETURN v_receipt || jsonb_build_object(
		'answer_id', p_answer_id,
		'start_byte', p_start_byte,
		'durable_bytes', octet_length(p_assistant_text),
		'text_sha256', p_complete_text_sha256
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_agentic_chat_workflow_synthesis_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_answer_id uuid,
	p_editor_step_attempt_id uuid,
	p_text_bytes integer,
	p_text_sha256 text,
	p_quality text,
	p_transition_id uuid,
	p_projection jsonb,
	p_event_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_step public.chat_turn_workflow_steps%ROWTYPE;
	v_accepted_specialists integer;
	v_result jsonb;
	v_result_text text;
	v_now timestamptz;
	v_event jsonb;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('synthesis');
	IF p_answer_id IS NULL OR p_editor_step_attempt_id IS NULL OR p_transition_id IS NULL
		OR p_text_bytes IS NULL OR p_text_bytes NOT BETWEEN 1 AND 131072
		OR p_text_sha256 IS NULL OR p_text_sha256 !~ '^[0-9a-f]{64}$'
		OR p_quality IS NULL OR p_quality NOT IN ('complete', 'partial') THEN
		RAISE EXCEPTION 'agentic_chat_workflow_synthesis_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'synthesis', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_synthesis_run_missing';
	END IF;
	IF v_run.synthesis_status = 'accepted' THEN
		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_run.answer_id = p_answer_id
					AND v_run.answer_text_sha256 = p_text_sha256
					AND v_run.synthesis_quality = p_quality
				THEN 'already_accepted' ELSE 'answer_conflict' END,
			'turn_run_id', p_turn_run_id,
			'answer_id', v_run.answer_id,
			'quality', v_run.synthesis_quality,
			'event', public.agentic_chat_workflow_event_receipt_v1(
				p_turn_run_id, p_execution_generation, p_transition_id
			)
		);
	END IF;

	SELECT steps.* INTO v_step FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = 'agentic_chat_project_review_plan_v1'
		AND steps.step_key = 'editor'
	FOR UPDATE;
	IF NOT FOUND
		OR v_step.status <> 'claimed'
		OR v_step.current_attempt_id IS DISTINCT FROM p_editor_step_attempt_id
		OR v_step.current_attempt_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'stale_claim', 'turn_run_id', p_turn_run_id);
	END IF;
	IF v_run.answer_id IS DISTINCT FROM p_answer_id
		OR v_run.answer_editor_step_attempt_id IS DISTINCT FROM p_editor_step_attempt_id
		OR octet_length(v_run.answer_text) <> p_text_bytes
		OR v_run.answer_text_sha256 IS DISTINCT FROM p_text_sha256 THEN
		RETURN jsonb_build_object('outcome', 'answer_conflict', 'turn_run_id', p_turn_run_id,
			'durable_bytes', octet_length(v_run.answer_text));
	END IF;

	SELECT count(*)::integer INTO v_accepted_specialists
	FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = v_step.plan_version
		AND steps.step_key IN ('project_analyst', 'risk_reviewer')
		AND steps.status = 'accepted';
	IF v_accepted_specialists = 0
		OR (p_quality = 'complete' AND (
			v_accepted_specialists < 2
			OR EXISTS (
				SELECT 1 FROM public.chat_turn_workflow_steps steps
				WHERE steps.turn_run_id = p_turn_run_id
					AND steps.plan_version = v_step.plan_version
					AND steps.step_key IN ('project_analyst', 'risk_reviewer')
					AND steps.quality = 'partial'
			)
		)) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_synthesis_quality_overstated';
	END IF;

	v_now := clock_timestamp();
	v_result := jsonb_build_object(
		'version', 'agentic_chat_workflow_synthesis_result_v1',
		'answerId', p_answer_id,
		'textBytes', p_text_bytes,
		'textSha256', p_text_sha256,
		'quality', p_quality
	);
	v_result_text := public.agentic_chat_canonical_json_v1(v_result);

	UPDATE public.chat_turn_workflow_runs runs
	SET synthesis_status = 'accepted',
		synthesis_quality = p_quality,
		synthesis_accepted_at = v_now
	WHERE runs.turn_run_id = p_turn_run_id;

	UPDATE public.chat_turn_workflow_steps steps
	SET status = 'accepted',
		quality = p_quality,
		result = v_result,
		result_hash = public.agentic_chat_sha256_hex_v1(v_result_text),
		result_bytes = octet_length(v_result_text),
		accepted_attempt_id = p_editor_step_attempt_id,
		accepted_at = v_now,
		finished_at = v_now,
		failure_code = NULL
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = v_step.plan_version
		AND steps.step_key = 'editor';

	v_event := public.agentic_chat_workflow_publish_v1(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_transition_id, 'synthesizing', p_projection, p_event_payload
	);

	RETURN jsonb_build_object(
		'outcome', 'accepted',
		'turn_run_id', p_turn_run_id,
		'answer_id', p_answer_id,
		'quality', p_quality,
		'text_bytes', p_text_bytes,
		'accepted_at', v_now,
		'event', v_event
	);
END;
$$;

-- First fenced write of a generation: republish durable workflow truth and carry
-- the accepted answer prefix into this generation's stream.
CREATE OR REPLACE FUNCTION public.resume_agentic_chat_workflow_projection_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_transition_id uuid,
	p_projection jsonb,
	p_event_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_stream_text text;
	v_event jsonb;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('resume');
	IF p_transition_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_workflow_resume_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'resume', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_resume_run_missing';
	END IF;
	IF v_run.phase = 'finished' THEN
		RETURN jsonb_build_object('outcome', 'already_terminal', 'turn_run_id', p_turn_run_id);
	END IF;

	SELECT streams.assistant_text INTO v_stream_text
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = p_turn_run_id;
	IF left(v_run.answer_text, char_length(COALESCE(v_stream_text, ''))) IS DISTINCT FROM COALESCE(v_stream_text, '') THEN
		RAISE EXCEPTION 'agentic_chat_workflow_resume_stream_diverged';
	END IF;

	v_event := public.agentic_chat_workflow_publish_v1(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_transition_id, v_run.phase, p_projection, p_event_payload, v_run.answer_text
	);

	RETURN jsonb_build_object(
		'outcome', 'resumed',
		'turn_run_id', p_turn_run_id,
		'phase', v_run.phase,
		'context_id', v_run.context_id,
		'plan_hash', v_run.plan_hash,
		'deadline_at', v_run.deadline_at,
		'recovery_count', v_run.recovery_count,
		'answer_id', v_run.answer_id,
		'durable_answer_bytes', octet_length(v_run.answer_text),
		'synthesis_status', v_run.synthesis_status,
		'exposure_micro_usd', public.agentic_chat_workflow_exposure_micro_usd_v1(p_turn_run_id),
		'steps', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'step_key', steps.step_key,
				'status', steps.status,
				'attempts_used', steps.attempts_used,
				'result_hash', steps.result_hash,
				'quality', steps.quality
			) ORDER BY array_position(
				ARRAY['planner', 'project_analyst', 'risk_reviewer', 'editor'], steps.step_key
			))
			FROM public.chat_turn_workflow_steps steps
			WHERE steps.turn_run_id = p_turn_run_id
		), '[]'::jsonb),
		'event', v_event
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Workflow-only recovery
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recover_agentic_chat_workflow_turn_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_failure_class text,
	p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_failure_class text := NULLIF(btrim(p_failure_class), '');
	v_error_message text := NULLIF(btrim(p_error_message), '');
	v_now timestamptz;
	v_deadline timestamptz;
	v_attempts integer;
	v_released integer := 0;
	v_uncertain integer := 0;
	v_dispatch_count integer;
	v_exposure bigint;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('recovery');
	IF p_turn_run_id IS NULL OR p_queue_job_id IS NULL OR p_processing_token IS NULL
		OR p_execution_generation IS NULL OR p_execution_generation < 1
		OR v_failure_class IS NULL
		OR v_failure_class NOT IN (
			'transient_infra', 'provider_throttle', 'timeout_pre_start', 'permanent',
			'stale_context', 'publisher_overload', 'timeout_post_start', 'cancelled',
			'uncertain_external_commit', 'unknown'
		)
		OR length(v_error_message) > 2000 THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_invalid_request';
	END IF;

	SELECT turns.* INTO v_turn FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_relationship_mismatch';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM public.chat_turn_workflow_runs runs WHERE runs.turn_run_id = v_turn.id
	) THEN
		RETURN jsonb_build_object('outcome', 'policy_denied', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'reason', 'not_a_workflow_turn');
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		SELECT jobs.* INTO v_job FROM public.queue_jobs jobs WHERE jobs.id = p_queue_job_id FOR UPDATE;
		IF FOUND AND v_job.status::text IN ('pending', 'retrying', 'processing')
			AND (v_job.status::text <> 'processing' OR v_job.processing_token = p_processing_token) THEN
			v_now := clock_timestamp();
			UPDATE public.queue_jobs jobs
			SET status = v_turn.status::public.queue_status,
				processing_token = NULL,
				completed_at = COALESCE(jobs.completed_at, v_now),
				updated_at = v_now
			WHERE jobs.id = p_queue_job_id;
		END IF;
		RETURN jsonb_build_object('outcome', 'terminal_reconciled', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'status', v_turn.status);
	END IF;
	IF v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object('outcome', 'stale_generation', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation);
	END IF;

	-- Read-only workflow policy: any effect row or mutation boundary denies retry.
	PERFORM effects.id FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id ORDER BY effects.id FOR UPDATE;
	IF FOUND OR v_turn.mutation_reserved_at IS NOT NULL OR v_turn.irreversible_boundary_at IS NOT NULL THEN
		RETURN jsonb_build_object('outcome', 'policy_denied', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'reason', 'domain_effect_boundary');
	END IF;

	SELECT jobs.* INTO v_job FROM public.queue_jobs jobs WHERE jobs.id = p_queue_job_id FOR UPDATE;
	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_queue_relationship_mismatch';
	END IF;
	IF v_turn.status = 'queued' AND v_job.status::text = 'pending' AND v_job.processing_token IS NULL THEN
		RETURN jsonb_build_object('outcome', 'already_requeued', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'queue_attempts', COALESCE(v_job.attempts, 0));
	END IF;
	IF v_turn.status <> 'running'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
		RETURN jsonb_build_object('outcome', 'ownership_lost', 'execution_may_retry', false,
			'turn_run_id', v_turn.id);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = v_turn.id FOR UPDATE;
	IF v_run.policy->>'domainAccess' IS DISTINCT FROM 'read_only'
		OR v_run.policy->>'modelTools' IS DISTINCT FROM 'none'
		OR v_run.policy->>'domainWrites' IS DISTINCT FROM 'forbidden'
		OR v_run.policy->>'recoveryPolicy' IS DISTINCT FROM 'durable_read_only_v1' THEN
		RETURN jsonb_build_object('outcome', 'policy_denied', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'reason', 'policy_not_recoverable');
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object('outcome', 'cancel_requested', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'failure_code', 'cancelled');
	END IF;

	v_now := clock_timestamp();
	v_deadline := COALESCE(
		v_run.deadline_at,
		v_turn.worker_started_at + make_interval(secs => v_run.whole_run_lifetime_ms / 1000.0)
	);
	IF v_run.deadline_at IS NULL THEN
		UPDATE public.chat_turn_workflow_runs runs SET deadline_at = v_deadline
		WHERE runs.turn_run_id = v_turn.id;
	END IF;
	IF v_deadline <= v_now OR EXISTS (
		SELECT 1 FROM public.chat_turn_input_artifacts artifacts
		WHERE artifacts.id = v_turn.input_artifact_id
			AND artifacts.turn_run_id = v_turn.id
			AND artifacts.retain_until < v_now
	) THEN
		RETURN jsonb_build_object('outcome', 'deadline_expired', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'deadline_at', v_deadline);
	END IF;
	IF v_failure_class NOT IN (
		'transient_infra', 'provider_throttle', 'timeout_pre_start', 'timeout_post_start', 'publisher_overload'
	) THEN
		RETURN jsonb_build_object('outcome', 'finalize_failed', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'failure_code', v_failure_class);
	END IF;
	IF NOT public.agentic_chat_workflow_project_access_v1(v_run.user_id, v_run.project_id) THEN
		RETURN jsonb_build_object('outcome', 'access_revoked', 'execution_may_retry', false,
			'turn_run_id', v_turn.id);
	END IF;

	v_attempts := COALESCE(v_job.attempts, 0);
	IF v_attempts + 1 >= COALESCE(v_job.max_attempts, 3) THEN
		RETURN jsonb_build_object('outcome', 'attempts_exhausted', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'queue_attempts', v_attempts);
	END IF;
	v_exposure := public.agentic_chat_workflow_exposure_micro_usd_v1(v_turn.id);
	SELECT count(*)::integer INTO v_dispatch_count
	FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.turn_run_id = v_turn.id;
	IF v_exposure >= v_run.max_spend_micro_usd OR v_dispatch_count >= v_run.max_physical_dispatches THEN
		RETURN jsonb_build_object('outcome', 'budget_exhausted', 'execution_may_retry', false,
			'turn_run_id', v_turn.id, 'exposure_micro_usd', v_exposure,
			'dispatch_count', v_dispatch_count);
	END IF;

	-- Unused permits are released; a request that may have crossed the provider
	-- boundary stays held as uncertain exposure across the requeue.
	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = 'released', settled_at = v_now
	WHERE dispatches.turn_run_id = v_turn.id AND dispatches.state = 'reserved';
	GET DIAGNOSTICS v_released = ROW_COUNT;
	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = 'uncertain', uncertain_at = v_now
	WHERE dispatches.turn_run_id = v_turn.id AND dispatches.state = 'dispatching';
	GET DIAGNOSTICS v_uncertain = ROW_COUNT;

	UPDATE public.chat_turn_workflow_runs runs
	SET recovery_count = runs.recovery_count + 1,
		first_execution_started_at = COALESCE(runs.first_execution_started_at, v_turn.execution_started_at)
	WHERE runs.turn_run_id = v_turn.id;

	-- The next claim increments the execution generation. Clearing the queue lease
	-- fences the old owner immediately; claim requires a null start boundary.
	UPDATE public.chat_turn_runs turns
	SET status = 'queued',
		execution_started_at = NULL,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation
		AND turns.cancel_requested_at IS NULL
		AND turns.mutation_reserved_at IS NULL
		AND turns.irreversible_boundary_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_turn_requeue_fence_lost';
	END IF;

	UPDATE public.queue_jobs jobs
	SET status = 'pending',
		processing_token = NULL,
		started_at = NULL,
		completed_at = NULL,
		attempts = v_attempts + 1,
		error_message = COALESCE(v_error_message, 'Agentic chat workflow recovery: ' || v_failure_class),
		scheduled_for = v_now
			+ (LEAST(5 * POWER(2, v_attempts), 30) || ' seconds')::interval
			+ (random() * interval '2 seconds'),
		updated_at = v_now
	WHERE jobs.id = p_queue_job_id
		AND jobs.status = 'processing'
		AND jobs.processing_token = p_processing_token
	RETURNING * INTO v_job;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_recovery_queue_requeue_fence_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'retry_scheduled',
		'execution_may_retry', true,
		'turn_run_id', v_turn.id,
		'failure_code', v_failure_class,
		'queue_attempts', v_job.attempts,
		'scheduled_for', v_job.scheduled_for,
		'deadline_at', v_deadline,
		'released_dispatch_count', v_released,
		'uncertain_dispatch_count', v_uncertain,
		'uncertain_cost_held', EXISTS (
			SELECT 1 FROM public.chat_turn_workflow_dispatches dispatches
			WHERE dispatches.turn_run_id = v_turn.id AND dispatches.state = 'uncertain'
		),
		'exposure_micro_usd', public.agentic_chat_workflow_exposure_micro_usd_v1(v_turn.id)
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Terminal synchronization from the single existing terminal writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_agentic_chat_workflow_terminal_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_now timestamptz := clock_timestamp();
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
		OR NOT EXISTS (
			SELECT 1 FROM public.chat_turn_workflow_runs runs WHERE runs.turn_run_id = NEW.id
		) THEN
		RETURN NEW;
	END IF;

	UPDATE public.chat_turn_workflow_runs runs
	SET phase = 'finished',
		terminal_outcome = CASE NEW.status
			WHEN 'cancelled' THEN 'cancelled'
			WHEN 'failed' THEN 'failed'
			ELSE CASE
				WHEN runs.synthesis_status = 'accepted' AND runs.synthesis_quality = 'complete'
					THEN 'complete'
				ELSE 'partial'
			END
		END,
		finished_at = GREATEST(COALESCE(NEW.terminalized_at, v_now), runs.created_at + interval '1 microsecond')
	WHERE runs.turn_run_id = NEW.id
		AND runs.phase <> 'finished';

	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = 'released', settled_at = v_now
	WHERE dispatches.turn_run_id = NEW.id AND dispatches.state = 'reserved';
	UPDATE public.chat_turn_workflow_dispatches dispatches
	SET state = 'uncertain', uncertain_at = v_now
	WHERE dispatches.turn_run_id = NEW.id AND dispatches.state = 'dispatching';

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_workflow_terminal ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_workflow_terminal
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_agentic_chat_workflow_terminal_v1();

-- ---------------------------------------------------------------------------
-- Receipt retention
-- ---------------------------------------------------------------------------

-- Workflow runs and steps leave with their input artifact through the existing
-- worker artifact cleanup. Dispatch receipts outlive them.
CREATE OR REPLACE FUNCTION public.cleanup_agentic_chat_workflow_dispatches_v1(
	p_dispatch_retention_days integer DEFAULT 30,
	p_reconciled_retention_days integer DEFAULT 90,
	p_batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_dispatch_days integer := GREATEST(COALESCE(p_dispatch_retention_days, 30), 30);
	v_reconciled_days integer := GREATEST(COALESCE(p_reconciled_retention_days, 90), 90, v_dispatch_days);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 1000), 10000), 1);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT dispatches.dispatch_id
		FROM public.chat_turn_workflow_dispatches dispatches
		JOIN public.chat_turn_runs turns ON turns.id = dispatches.turn_run_id
		WHERE turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at IS NOT NULL
			AND dispatches.state IN ('settled', 'released')
			AND (
				(dispatches.reconciled_at IS NULL
					AND GREATEST(turns.terminalized_at, dispatches.settled_at)
						<= clock_timestamp() - make_interval(days => v_dispatch_days))
				OR (dispatches.reconciled_at IS NOT NULL
					AND GREATEST(turns.terminalized_at, dispatches.reconciled_at)
						<= clock_timestamp() - make_interval(days => v_reconciled_days))
			)
		ORDER BY dispatches.settled_at, dispatches.dispatch_id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_workflow_dispatches dispatches
	WHERE dispatches.dispatch_id IN (SELECT dispatch_id FROM candidates);
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'dispatches_deleted', v_deleted,
		'dispatch_retention_days', v_dispatch_days,
		'reconciled_retention_days', v_reconciled_days,
		'batch_size', v_batch_size
	);
END;
$$;

DO $grants$
DECLARE
	v_signature text;
BEGIN
	FOREACH v_signature IN ARRAY ARRAY[
		'public.agentic_chat_workflow_pricing_valid_v1(text,jsonb)',
		'public.agentic_chat_workflow_max_output_tokens_v1(text)',
		'public.reserve_agentic_chat_workflow_dispatch_v1(uuid,uuid,uuid,integer,uuid,text,uuid,integer,text,text,jsonb,integer,integer)',
		'public.begin_agentic_chat_workflow_dispatch_v1(uuid,uuid,uuid,integer,uuid)',
		'public.settle_agentic_chat_workflow_dispatch_v1(uuid,uuid,text,jsonb,bigint,text)',
		'public.reconcile_agentic_chat_workflow_dispatch_v1(uuid,uuid,text,jsonb,bigint)',
		'public.persist_agentic_chat_workflow_text_batch_v1(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer,text,text,text,text)',
		'public.accept_agentic_chat_workflow_synthesis_v1(uuid,uuid,uuid,integer,uuid,uuid,integer,text,text,uuid,jsonb,jsonb)',
		'public.resume_agentic_chat_workflow_projection_v1(uuid,uuid,uuid,integer,uuid,jsonb,jsonb)',
		'public.recover_agentic_chat_workflow_turn_v1(uuid,uuid,uuid,integer,text,text)',
		'public.cleanup_agentic_chat_workflow_dispatches_v1(integer,integer,integer)'
	]
	LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
	END LOOP;
	EXECUTE 'REVOKE ALL ON FUNCTION public.sync_agentic_chat_workflow_terminal_v1() FROM PUBLIC, anon, authenticated';
END;
$grants$;

COMMENT ON FUNCTION public.recover_agentic_chat_workflow_turn_v1(uuid, uuid, uuid, integer, text, text) IS
	'Service-only recovery for enforced read-only v4 workflows. Requeues after provider start only with no effect rows, unexpired deadline and retention, current access, remaining attempts and budget. Ordinary recover_agentic_chat_turn is unchanged.';

COMMIT;
