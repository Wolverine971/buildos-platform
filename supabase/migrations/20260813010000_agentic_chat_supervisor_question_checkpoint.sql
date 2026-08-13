-- supabase/migrations/20260813010000_agentic_chat_supervisor_question_checkpoint.sql
-- Agentic Chat Worker Phase 4 P4 S3: fenced supervisor-question checkpoints.
--
-- Legacy web checkpoints keep their nullable worker identity. Worker writes use
-- one service-only RPC that locks the turn/job fence, validates the exact
-- deterministic decision payload, and compares every persisted field on replay.

ALTER TABLE public.chat_turn_checkpoints
	ADD COLUMN IF NOT EXISTS execution_generation integer,
	ADD COLUMN IF NOT EXISTS supervisor_transition_id uuid,
	ADD COLUMN IF NOT EXISTS supervisor_sequence integer;

ALTER TABLE public.chat_turn_checkpoints
	DROP CONSTRAINT IF EXISTS chk_chat_turn_checkpoints_worker_identity;

ALTER TABLE public.chat_turn_checkpoints
	ADD CONSTRAINT chk_chat_turn_checkpoints_worker_identity CHECK (
		(
			execution_generation IS NULL
			AND supervisor_transition_id IS NULL
			AND supervisor_sequence IS NULL
		)
		OR (
			execution_generation >= 1
			AND supervisor_transition_id IS NOT NULL
			AND supervisor_sequence >= 1
		)
	);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_turn_checkpoints_worker_transition
	ON public.chat_turn_checkpoints(turn_run_id, execution_generation, supervisor_transition_id)
	WHERE supervisor_transition_id IS NOT NULL;

COMMENT ON COLUMN public.chat_turn_checkpoints.execution_generation IS
	'Worker execution generation that durably created this checkpoint; null for legacy web checkpoints.';
COMMENT ON COLUMN public.chat_turn_checkpoints.supervisor_transition_id IS
	'Stable deterministic worker supervisor decision identity; null for legacy web checkpoints.';
COMMENT ON COLUMN public.chat_turn_checkpoints.supervisor_sequence IS
	'Ordered worker supervisor decision sequence; null for legacy web checkpoints.';

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_supervisor_question_checkpoint(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_checkpoint_id uuid,
	p_supervisor_transition_id uuid,
	p_sequence integer,
	p_reason text,
	p_question text,
	p_digest jsonb,
	p_resume_context jsonb,
	p_supervisor_decision jsonb
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
	v_existing public.chat_turn_checkpoints%ROWTYPE;
	v_created_at timestamptz;
	v_expires_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_turn_run_id IS NULL
		OR p_user_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_checkpoint_id IS NULL
		OR substring(p_checkpoint_id::text FROM 15 FOR 1) <> '5'
		OR p_supervisor_transition_id IS NULL
		OR substring(p_supervisor_transition_id::text FROM 15 FOR 1) <> '5'
		OR p_sequence IS NULL
		OR p_sequence < 1
		OR p_sequence > 1024 THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_invalid_identity';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_scope_mismatch';
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'supervisor_transition_id', p_supervisor_transition_id,
			'supervisor_sequence', p_sequence
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'supervisor_transition_id', p_supervisor_transition_id,
			'supervisor_sequence', p_sequence,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'supervisor_transition_id', p_supervisor_transition_id,
			'supervisor_sequence', p_sequence,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
	END IF;
	IF v_turn.status <> 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_not_started';
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
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_ownership_lost';
	END IF;

	IF p_reason IS NULL
		OR p_reason = ''
		OR p_reason IS DISTINCT FROM btrim(p_reason)
		OR char_length(p_reason) > 256
		OR p_question IS NULL
		OR p_question = ''
		OR p_question IS DISTINCT FROM btrim(p_question)
		OR char_length(p_question) > 4000
		OR p_digest IS NULL
		OR jsonb_typeof(p_digest) <> 'object'
		OR pg_column_size(p_digest) > 262144
		OR p_resume_context IS NULL
		OR jsonb_typeof(p_resume_context) <> 'object'
		OR pg_column_size(p_resume_context) > 262144
		OR p_supervisor_decision IS NULL
		OR jsonb_typeof(p_supervisor_decision) <> 'object'
		OR pg_column_size(p_supervisor_decision) > 262144
		OR p_supervisor_decision->>'action' IS DISTINCT FROM 'ask_user'
		OR p_supervisor_decision->>'reason' IS DISTINCT FROM p_reason
		OR p_supervisor_decision->>'question' IS DISTINCT FROM p_question
		OR jsonb_typeof(p_supervisor_decision->'checkpoint') <> 'object'
		OR p_supervisor_decision->'checkpoint'->'digest' IS DISTINCT FROM p_digest
		OR p_supervisor_decision->'checkpoint'->'resumeContext' IS DISTINCT FROM p_resume_context THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_invalid_payload';
	END IF;

	SELECT checkpoints.*
	INTO v_existing
	FROM public.chat_turn_checkpoints checkpoints
	WHERE checkpoints.id = p_checkpoint_id
		OR (
			checkpoints.turn_run_id = v_turn.id
			AND checkpoints.execution_generation = p_execution_generation
			AND checkpoints.supervisor_transition_id = p_supervisor_transition_id
		)
	ORDER BY (checkpoints.id = p_checkpoint_id) DESC
	LIMIT 1
	FOR UPDATE;
	IF FOUND THEN
		IF v_existing.id IS DISTINCT FROM p_checkpoint_id
			OR v_existing.turn_run_id IS DISTINCT FROM v_turn.id
			OR v_existing.session_id IS DISTINCT FROM v_turn.session_id
			OR v_existing.user_id IS DISTINCT FROM v_turn.user_id
			OR v_existing.execution_generation IS DISTINCT FROM p_execution_generation
			OR v_existing.supervisor_transition_id IS DISTINCT FROM p_supervisor_transition_id
			OR v_existing.supervisor_sequence IS DISTINCT FROM p_sequence
			OR v_existing.checkpoint_type <> 'supervisor_question'
			OR v_existing.status <> 'active'
			OR v_existing.reason IS DISTINCT FROM p_reason
			OR v_existing.question IS DISTINCT FROM p_question
			OR v_existing.digest IS DISTINCT FROM p_digest
			OR v_existing.resume_context IS DISTINCT FROM p_resume_context
			OR v_existing.supervisor_decision IS DISTINCT FROM p_supervisor_decision
			OR v_existing.resume_turn_run_id IS NOT NULL
			OR v_existing.resume_started_at IS NOT NULL
			OR v_existing.resumed_at IS NOT NULL
			OR v_existing.expires_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_replay_conflict';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_existing.execution_generation,
			'checkpoint_id', v_existing.id,
			'supervisor_transition_id', v_existing.supervisor_transition_id,
			'sequence', v_existing.supervisor_sequence,
			'checkpoint_type', v_existing.checkpoint_type,
			'status', v_existing.status,
			'reason', v_existing.reason,
			'question', v_existing.question,
			'created_at', v_existing.created_at,
			'expires_at', v_existing.expires_at
		);
	END IF;

	v_created_at := transaction_timestamp();
	v_expires_at := v_created_at + interval '24 hours';
	INSERT INTO public.chat_turn_checkpoints (
		id,
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		supervisor_transition_id,
		supervisor_sequence,
		checkpoint_type,
		status,
		reason,
		digest,
		resume_context,
		supervisor_decision,
		question,
		expires_at,
		created_at,
		updated_at
	) VALUES (
		p_checkpoint_id,
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		p_execution_generation,
		p_supervisor_transition_id,
		p_sequence,
		'supervisor_question',
		'active',
		p_reason,
		p_digest,
		p_resume_context,
		p_supervisor_decision,
		p_question,
		v_expires_at,
		v_created_at,
		v_created_at
	);

	UPDATE public.chat_turn_runs turns
	SET last_progress_at = v_created_at,
		updated_at = v_created_at
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation
		AND turns.cancel_requested_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_supervisor_checkpoint_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', p_execution_generation,
		'checkpoint_id', p_checkpoint_id,
		'supervisor_transition_id', p_supervisor_transition_id,
		'sequence', p_sequence,
		'checkpoint_type', 'supervisor_question',
		'status', 'active',
		'reason', p_reason,
		'question', p_question,
		'created_at', v_created_at,
		'expires_at', v_expires_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_supervisor_question_checkpoint(
	uuid, uuid, uuid, uuid, integer, uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_supervisor_question_checkpoint(
	uuid, uuid, uuid, uuid, integer, uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_supervisor_question_checkpoint(
	uuid, uuid, uuid, uuid, integer, uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
) IS
'Fenced, service-only, idempotent worker persistence for an exact deterministic supervisor clarification checkpoint.';
