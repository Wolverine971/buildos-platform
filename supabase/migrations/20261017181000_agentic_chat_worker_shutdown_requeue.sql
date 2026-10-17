-- supabase/migrations/20261017181000_agentic_chat_worker_shutdown_requeue.sql
--
-- Agentic Chat pipeline audit 2026-10-17, rows B2 and B15
-- (docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md).
--
-- B2: a deploy that lands mid-turn stranded the user ~2 minutes and then failed
-- the turn, because recovery never replays a turn that already started. The
-- worker now drains on SIGTERM and reports the turns it had to abort with the new
-- failure class `worker_shutdown`. This migration teaches recover_agentic_chat_turn
-- that class:
--
--   * Replay-safe turn: requeue it NOW (scheduled_for = now), even after the
--     provider started. Replay-safe means nothing the turn did is durable outside
--     its own generation: no chat_turn_effects row at all (covers every write,
--     research capture and delegation), no mutation reservation or irreversible
--     boundary, no finalized assistant text (no assistant message, terminal event
--     or terminalization), no workflow run/dispatch, no supervisor checkpoint, no
--     session context handoff, and no tool ledger row tied to an effect or a
--     message. It must also have attempts left and an unexpired input artifact.
--     The requeue clears the generation's provider-start mark (the claim fence
--     refuses a replay otherwise), its read-only tool ledger rows (their ids are
--     stable per turn + sequence, so the replay would collide with them) and its
--     prompt snapshot. Stream state and generation-N events stay untouched: the
--     next claim starts generation N+1 and resets the stream itself, and the
--     browser reconciles to it.
--   * Anything else keeps today's handling: the class becomes timeout_pre_start
--     or timeout_post_start (what the worker reported for a shutdown abort
--     before), and in-flight effects still end uncertain_external_commit.
--
-- B15: transient_infra retried after POWER(2, attempts) MINUTES + up to 60 s.
-- It now backs off like provider_throttle: 5 s * 2^attempts (cap 60 s) + up to
-- 5 s jitter, so the first retry lands 5-10 s later.
--
-- Signature, owner, search_path, SECURITY INVOKER and grants are unchanged
-- (service_role only; the body still checks the service-role claim).

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
SET search_path TO 'pg_catalog', 'public'
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
	v_shutdown_replay_safe boolean;
	v_replayed_after_start boolean;
	v_cleared_tool_executions integer;
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
			'unknown',
			'worker_shutdown'
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
	v_queue_residence_expired := EXISTS (
		SELECT 1
		FROM public.chat_turn_input_artifacts artifacts
		WHERE artifacts.id = v_turn.input_artifact_id
			AND artifacts.turn_run_id = v_turn.id
			AND artifacts.session_id = v_turn.session_id
			AND artifacts.user_id = v_turn.user_id
			AND artifacts.retain_until < v_now
	);

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

	-- 20260924000100 (turn leases): an unsettled effect no longer parks the
	-- turn. Effects never allow a replay (v_safe_pre_start needs zero rows);
	-- the terminal trigger closes reserved/started rows, and a started or
	-- uncertain one makes the terminal failure uncertain_external_commit.
	IF v_blocking_effect_count > 0 AND EXISTS (
		SELECT 1
		FROM public.chat_turn_effects effects
		WHERE effects.turn_run_id = v_turn.id
			AND effects.state IN ('started', 'uncertain')
	) THEN
		v_failure_class := 'uncertain_external_commit';
	END IF;

	v_attempts_remain := v_current_attempts + 1 < v_max_attempts;

	-- 20261017181000 (B2): a deploy drained this worker past its window. Replay
	-- the turn at once when nothing it did outlives its own generation. The turn
	-- row lock above serializes every writer of these subordinate rows (each
	-- worker primitive takes it first), so the checks and the cleanup below
	-- cannot race a write from this generation.
	IF v_failure_class = 'worker_shutdown' THEN
		v_shutdown_replay_safe := v_effect_count = 0
			AND v_turn.mutation_reserved_at IS NULL
			AND v_turn.irreversible_boundary_at IS NULL
			AND v_turn.terminalized_at IS NULL
			AND v_turn.terminal_event_id IS NULL
			AND v_turn.assistant_message_id IS NULL
			AND NOT v_queue_residence_expired
			AND v_attempts_remain
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_tool_executions executions
				WHERE executions.turn_run_id = v_turn.id
					AND (executions.effect_id IS NOT NULL OR executions.message_id IS NOT NULL)
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_turn_workflow_runs runs
				WHERE runs.turn_run_id = v_turn.id
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_turn_workflow_dispatches dispatches
				WHERE dispatches.turn_run_id = v_turn.id
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_turn_checkpoints checkpoints
				WHERE checkpoints.turn_run_id = v_turn.id
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_sessions sessions
				WHERE sessions.id = v_turn.session_id
					AND sessions.agent_metadata->'fastchat_last_context_shift'->>'turn_run_id'
						= v_turn.id::text
			);

		IF v_shutdown_replay_safe THEN
			v_replayed_after_start := v_turn.execution_started_at IS NOT NULL;

			-- Clear the generation's provider-start mark (claim refuses a replay
			-- otherwise) and the counters it accrued. last_event_sequence and the
			-- stream state stay at generation N: the browser's reconcile requires
			-- them to agree, and the next claim resets both for generation N+1.
			UPDATE public.chat_turn_runs turns
			SET status = 'queued',
				execution_started_at = NULL,
				prompt_snapshot_id = NULL,
				validation_failure_count = 0,
				llm_pass_count = 0,
				last_progress_at = v_now,
				updated_at = v_now
			WHERE turns.id = v_turn.id
				AND turns.status = 'running'
				AND turns.execution_generation = p_execution_generation
				AND turns.cancel_requested_at IS NULL
				AND turns.mutation_reserved_at IS NULL
				AND turns.irreversible_boundary_at IS NULL
				AND turns.terminalized_at IS NULL
				AND turns.assistant_message_id IS NULL;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'agentic_chat_recovery_turn_requeue_fence_lost';
			END IF;

			-- Read-only ledger rows of the discarded generation. Their ids are
			-- stable per (turn, sequence), so the replay's first read would hit
			-- them as a replay conflict; finalize would also attach them to the
			-- answer. None carries an effect or a message (checked above).
			DELETE FROM public.chat_tool_executions executions
			WHERE executions.turn_run_id = v_turn.id;
			GET DIAGNOSTICS v_cleared_tool_executions = ROW_COUNT;
			IF v_cleared_tool_executions > 0 THEN
				-- Undo the insert trigger's session tally for the discarded rows.
				UPDATE public.chat_sessions sessions
				SET tool_call_count = GREATEST(
					COALESCE(sessions.tool_call_count, 0) - v_cleared_tool_executions,
					0
				)
				WHERE sessions.id = v_turn.session_id;
			END IF;

			-- The prompt snapshot id is stable per turn; the replay records its own.
			DELETE FROM public.chat_prompt_snapshots snapshots
			WHERE snapshots.turn_run_id = v_turn.id;

			UPDATE public.queue_jobs jobs
			SET status = 'pending',
				processing_token = NULL,
				started_at = NULL,
				completed_at = NULL,
				attempts = v_current_attempts + 1,
				error_message = COALESCE(
					v_error_message,
					'Agentic chat recovery: worker_shutdown'
				),
				-- A live replica claims it on its next poll or wake.
				scheduled_for = v_now,
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
				'failure_code', 'worker_shutdown',
				'turn_run_id', v_turn.id,
				'queue_job_id', v_turn.queue_job_id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'correlation_id', v_turn.correlation_id,
				'execution_generation', v_turn.execution_generation,
				'status', 'queued',
				'queue_status', v_job.status,
				'queue_attempts', v_job.attempts,
				'scheduled_for', v_job.scheduled_for,
				'replayed_after_start', v_replayed_after_start,
				'cleared_tool_executions', v_cleared_tool_executions
			);
		END IF;

		-- Not replay-safe: the timeout class the worker reported for a shutdown
		-- abort before this migration, with its existing retry rules.
		v_failure_class := CASE
			WHEN v_turn.execution_started_at IS NULL THEN 'timeout_pre_start'
			ELSE 'timeout_post_start'
		END;
	END IF;

	v_retryable_class := v_failure_class IN (
		'transient_infra', 'provider_throttle', 'timeout_pre_start'
	);
	v_safe_pre_start := v_turn.execution_started_at IS NULL
		AND v_turn.mutation_reserved_at IS NULL
		AND v_turn.irreversible_boundary_at IS NULL
		AND v_effect_count = 0;
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
			-- 20261017181000 (B15): every retryable class backs off in seconds.
			-- transient_infra used to wait POWER(2, attempts) minutes.
			scheduled_for = v_now
				+ (LEAST(5 * POWER(2, v_current_attempts), 60) || ' seconds')::interval
				+ (random() * interval '5 seconds'),
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
		WHEN v_failure_class = 'uncertain_external_commit' THEN v_failure_class
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

-- Unchanged access: service_role only (matches production's ACL exactly).
REVOKE ALL ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text)
	TO service_role;

COMMENT ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) IS
	'Service-only recovery classifier. Safe pre-start retries are bounded by attempts and frozen artifact retention and back off in seconds (5 s * 2^attempts, cap 60 s, + up to 5 s). worker_shutdown (a deploy drained the worker) requeues immediately, even after the provider started, when the turn has no effect, reservation, boundary, finalized text, workflow, checkpoint or session handoff; otherwise it is handled as timeout_pre_start/timeout_post_start. Unsettled effects never retry and finalize failed as uncertain_external_commit (started/uncertain) instead of parking the turn.';
