-- supabase/migrations/20260802031000_agentic_chat_worker_execution_recovery.sql
-- Agentic Chat Worker migration, Phase 2B Slice 5: provider-start fencing and
-- chat-specific recovery classification.
--
-- This package adds no caller, queue consumer, provider/model invocation,
-- stalled sweep loop, publisher, or worker routing. Only the single `started`
-- response from begin_agentic_chat_turn_execution authorizes a provider call.
-- Whole-turn requeue is database-enforced and is possible only before every
-- provider/mutation boundary for an explicitly retryable failure class.

CREATE OR REPLACE FUNCTION public.begin_agentic_chat_turn_execution(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer
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
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_now timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_invalid_identity';
	END IF;

	-- All worker primitives serialize on turn -> subordinate -> queue.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_invalid_status';
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
		RAISE EXCEPTION 'agentic_chat_execution_start_ownership_lost';
	END IF;

	-- The receipt clock is captured only after both governing locks.
	v_now := clock_timestamp();

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.execution_started_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'already_started',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'execution_started_at', v_turn.execution_started_at,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.mutation_reserved_at IS NOT NULL
		OR v_turn.irreversible_boundary_at IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_boundary_corrupt';
	END IF;

	SELECT artifacts.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_input_artifact_scope_mismatch';
	END IF;
	IF v_job.created_at < v_now - interval '300 seconds'
		OR v_artifact.retain_until < v_now THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_context',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	UPDATE public.chat_turn_runs turns
	SET execution_started_at = v_now,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation
		AND turns.execution_started_at IS NULL
		AND turns.cancel_requested_at IS NULL
	RETURNING * INTO v_turn;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_compare_and_set_lost';
	END IF;

	UPDATE public.queue_jobs jobs
	SET updated_at = v_now
	WHERE jobs.id = p_queue_job_id
		AND jobs.status = 'processing'
		AND jobs.processing_token = p_processing_token;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_queue_fence_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'started',
		'invoke_provider', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_turn.execution_generation,
		'execution_started_at', v_turn.execution_started_at,
		'status', v_turn.status
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recover_agentic_chat_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_failure_class text,
	p_error_message text DEFAULT NULL::text
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
	v_now timestamptz;
	v_failure_class text := NULLIF(btrim(p_failure_class), '');
	v_error_message text := NULLIF(btrim(p_error_message), '');
	v_current_attempts integer;
	v_max_attempts integer;
	v_effect_count integer;
	v_blocking_effect_count integer;
	v_retryable_class boolean;
	v_safe_pre_start boolean;
	v_attempts_remain boolean;
	v_timeout_retry_available boolean;
	v_queue_residence_expired boolean;
	v_retry_exhausted boolean;
	v_queue_status text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_recovery_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR v_failure_class IS NULL
		OR v_failure_class NOT IN (
			'transient_infra',
			'provider_throttle',
			'timeout_pre_start',
			'permanent',
			'stale_context',
			'publisher_overload',
			'timeout_post_start',
			'cancelled',
			'uncertain_external_commit',
			'unknown'
		)
		OR length(v_error_message) > 2000 THEN
		RAISE EXCEPTION 'agentic_chat_recovery_invalid_request';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_recovery_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_recovery_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		SELECT jobs.*
		INTO v_job
		FROM public.queue_jobs jobs
		WHERE jobs.id = p_queue_job_id
		FOR UPDATE;

		IF NOT FOUND
			OR v_job.user_id IS DISTINCT FROM v_turn.user_id
			OR v_job.job_type::text <> 'agentic_chat_turn'
			OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
			OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
			OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
			RAISE EXCEPTION 'agentic_chat_recovery_queue_relationship_mismatch';
		END IF;

		v_queue_status := v_turn.status;
		IF v_job.status::text = v_queue_status AND v_job.processing_token IS NULL THEN
			RETURN jsonb_build_object(
				'outcome', 'already_reconciled',
				'execution_may_retry', false,
				'failure_code', v_turn.failure_code,
				'turn_run_id', v_turn.id,
				'queue_job_id', v_turn.queue_job_id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'correlation_id', v_turn.correlation_id,
				'execution_generation', v_turn.execution_generation,
				'status', v_turn.status,
				'queue_status', v_job.status
			);
		END IF;
		IF v_job.status::text = 'processing'
			AND v_job.processing_token IS DISTINCT FROM p_processing_token THEN
			RAISE EXCEPTION 'agentic_chat_recovery_ownership_lost';
		END IF;
		IF v_job.status::text NOT IN ('pending', 'retrying', 'processing') THEN
			RAISE EXCEPTION 'agentic_chat_recovery_terminal_queue_conflict';
		END IF;

		v_now := clock_timestamp();
		UPDATE public.queue_jobs jobs
		SET status = v_queue_status::public.queue_status,
			processing_token = NULL,
			completed_at = COALESCE(jobs.completed_at, v_now),
			error_message = CASE
				WHEN v_turn.status = 'completed' THEN jobs.error_message
				ELSE COALESCE(jobs.error_message, 'Agentic chat turn ' || v_turn.status)
			END,
			updated_at = v_now
		WHERE jobs.id = p_queue_job_id;

		RETURN jsonb_build_object(
			'outcome', 'queue_reconciled',
			'execution_may_retry', false,
			'failure_code', v_turn.failure_code,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'queue_status', v_queue_status
		);
	END IF;

	IF v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	-- Lock all subordinate effect rows before the queue row, then classify from
	-- their committed states. Terminal effects are not blocking receipts, but
	-- their durable turn boundaries still forbid whole-turn replay.
	PERFORM effects.id
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id
	ORDER BY effects.id
	FOR UPDATE;

	SELECT
		count(*)::integer,
		count(*) FILTER (
			WHERE effects.state IN ('reserved', 'started', 'uncertain')
		)::integer
	INTO v_effect_count, v_blocking_effect_count
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_recovery_queue_relationship_mismatch';
	END IF;

	IF v_turn.status = 'queued'
		AND v_job.status::text = 'pending'
		AND v_job.processing_token IS NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'already_requeued',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'queue_status', v_job.status,
			'queue_attempts', COALESCE(v_job.attempts, 0)
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_recovery_invalid_status';
	END IF;
	IF v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
		RAISE EXCEPTION 'agentic_chat_recovery_ownership_lost';
	END IF;

	-- Recovery receipts/backoff are calculated only after all governing locks.
	v_now := clock_timestamp();
	v_current_attempts := COALESCE(v_job.attempts, 0);
	v_max_attempts := COALESCE(v_job.max_attempts, 3);
	v_queue_residence_expired := v_job.created_at < v_now - interval '300 seconds';

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'finalize_cancelled',
			'execution_may_retry', false,
			'failure_code', 'cancelled',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	IF v_blocking_effect_count > 0 THEN
		RETURN jsonb_build_object(
			'outcome', 'effect_reconciliation_required',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'blocking_effect_count', v_blocking_effect_count
		);
	END IF;

	v_retryable_class := v_failure_class IN (
		'transient_infra', 'provider_throttle', 'timeout_pre_start'
	);
	v_safe_pre_start := v_turn.execution_started_at IS NULL
		AND v_turn.mutation_reserved_at IS NULL
		AND v_turn.irreversible_boundary_at IS NULL
		AND v_effect_count = 0;
	v_attempts_remain := v_current_attempts + 1 < v_max_attempts;
	v_timeout_retry_available := v_failure_class <> 'timeout_pre_start'
		OR v_current_attempts = 0;

	IF v_retryable_class
		AND v_safe_pre_start
		AND NOT v_queue_residence_expired
		AND v_attempts_remain
		AND v_timeout_retry_available THEN
		UPDATE public.chat_turn_runs turns
		SET status = 'queued',
			last_progress_at = v_now,
			updated_at = v_now
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = p_execution_generation
			AND turns.cancel_requested_at IS NULL
			AND turns.execution_started_at IS NULL
			AND turns.mutation_reserved_at IS NULL
			AND turns.irreversible_boundary_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_recovery_turn_requeue_fence_lost';
		END IF;

		UPDATE public.queue_jobs jobs
		SET status = 'pending',
			processing_token = NULL,
			started_at = NULL,
			completed_at = NULL,
			attempts = v_current_attempts + 1,
			error_message = COALESCE(
				v_error_message,
				'Agentic chat recovery: ' || v_failure_class
			),
			scheduled_for = v_now
				+ (LEAST(POWER(2, v_current_attempts), 16) || ' minutes')::interval
				+ (random() * interval '60 seconds'),
			updated_at = v_now
		WHERE jobs.id = p_queue_job_id
			AND jobs.status = 'processing'
			AND jobs.processing_token = p_processing_token
		RETURNING * INTO v_job;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_recovery_queue_requeue_fence_lost';
		END IF;

		RETURN jsonb_build_object(
			'outcome', 'retry_scheduled',
			'execution_may_retry', true,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', 'queued',
			'queue_status', v_job.status,
			'queue_attempts', v_job.attempts,
			'scheduled_for', v_job.scheduled_for
		);
	END IF;

	v_retry_exhausted := v_retryable_class
		AND v_safe_pre_start
		AND (NOT v_attempts_remain OR NOT v_timeout_retry_available);
	v_failure_class := CASE
		WHEN v_queue_residence_expired THEN 'stale_context'
		ELSE v_failure_class
	END;

	RETURN jsonb_build_object(
		'outcome', 'finalize_failed',
		'execution_may_retry', false,
		'failure_code', v_failure_class,
		'retry_exhausted', v_retry_exhausted,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_turn.execution_generation,
		'status', v_turn.status
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer)
	TO service_role;

REVOKE ALL ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text)
	TO service_role;

COMMENT ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer) IS
	'Service-only immediate-before-provider CAS. Only the single started receipt grants invoke_provider=true; duplicates fail closed.';
COMMENT ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) IS
	'Service-only chat recovery classifier. Atomically requeues only typed safe pre-start failures and reconciles terminal queue rows; no generic replay.';

-- Rollback while worker routing remains disabled:
--   DROP FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text);
--   DROP FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer);
