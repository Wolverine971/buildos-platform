-- supabase/migrations/20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql
-- Agentic Chat Worker Phase 4 P4 S4: immutable checkpoint resume lifecycle.
--
-- The input-artifact insert is inside the existing admission transaction. Its
-- trigger locks the newest active checkpoint, verifies the exact web-frozen
-- snapshot, and claims it before the queued turn/job can commit. Terminal turn
-- truth resolves or restores that same checkpoint transactionally.

CREATE OR REPLACE FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_checkpoint public.chat_turn_checkpoints%ROWTYPE;
	v_snapshot jsonb := NEW.prepared->'resumeCheckpoint';
	v_now timestamptz := transaction_timestamp();
BEGIN
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_turn.session_id IS DISTINCT FROM NEW.session_id
		OR v_turn.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_turn_scope_mismatch';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime' THEN
		IF v_snapshot IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_artifact_worker_mode_required';
		END IF;
		RETURN NEW;
	END IF;
	IF v_turn.status <> 'queued' OR v_turn.execution_generation <> 0 THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_admission_state_invalid';
	END IF;

	UPDATE public.chat_turn_checkpoints checkpoints
	SET status = 'expired',
		updated_at = v_now
	WHERE checkpoints.session_id = NEW.session_id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.status = 'active'
		AND checkpoints.expires_at IS NOT NULL
		AND checkpoints.expires_at <= v_now;

	SELECT checkpoints.*
	INTO v_checkpoint
	FROM public.chat_turn_checkpoints checkpoints
	WHERE checkpoints.session_id = NEW.session_id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.status = 'active'
		AND (checkpoints.expires_at IS NULL OR checkpoints.expires_at > v_now)
	ORDER BY checkpoints.created_at DESC, checkpoints.id DESC
	LIMIT 1
	FOR UPDATE;

	IF NOT FOUND THEN
		IF v_snapshot IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_artifact_snapshot_without_active_checkpoint';
		END IF;
		RETURN NEW;
	END IF;

	IF v_snapshot IS NULL
		OR jsonb_typeof(v_snapshot) <> 'object'
		OR NOT v_snapshot ?& ARRAY[
			'checkpointId',
			'originalTurnRunId',
			'checkpointType',
			'reason',
			'question',
			'resumeContext',
			'resumeMessage',
			'sourceExecutionGeneration',
			'supervisorTransitionId',
			'supervisorSequence'
		]
		OR v_snapshot - ARRAY[
			'checkpointId',
			'originalTurnRunId',
			'checkpointType',
			'reason',
			'question',
			'resumeContext',
			'resumeMessage',
			'sourceExecutionGeneration',
			'supervisorTransitionId',
			'supervisorSequence'
		] <> '{}'::jsonb
		OR v_snapshot->>'checkpointId' IS DISTINCT FROM v_checkpoint.id::text
		OR v_snapshot->>'originalTurnRunId' IS DISTINCT FROM v_checkpoint.turn_run_id::text
		OR v_snapshot->>'checkpointType' IS DISTINCT FROM v_checkpoint.checkpoint_type
		OR v_snapshot->>'reason' IS DISTINCT FROM v_checkpoint.reason
		OR COALESCE(v_snapshot->'question', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.question), 'null'::jsonb)
		OR jsonb_typeof(v_snapshot->'resumeContext') <> 'object'
		OR v_snapshot->'resumeContext' IS DISTINCT FROM v_checkpoint.resume_context
		OR pg_column_size(v_snapshot->'resumeContext') > 262144
		OR jsonb_typeof(v_snapshot->'resumeMessage') <> 'string'
		OR btrim(v_snapshot->>'resumeMessage') = ''
		OR octet_length(v_snapshot->>'resumeMessage') > 524288
		OR COALESCE(v_snapshot->'sourceExecutionGeneration', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.execution_generation), 'null'::jsonb)
		OR COALESCE(v_snapshot->'supervisorTransitionId', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.supervisor_transition_id), 'null'::jsonb)
		OR COALESCE(v_snapshot->'supervisorSequence', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.supervisor_sequence), 'null'::jsonb) THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_snapshot_mismatch';
	END IF;

	UPDATE public.chat_turn_checkpoints checkpoints
	SET status = 'resuming',
		resume_turn_run_id = NEW.turn_run_id,
		resume_started_at = v_now,
		resumed_at = NULL,
		updated_at = v_now
	WHERE checkpoints.id = v_checkpoint.id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.session_id = NEW.session_id
		AND checkpoints.status = 'active';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_claim_lost';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_checkpoint_resume
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_checkpoint_resume
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact();

CREATE OR REPLACE FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_snapshot jsonb;
	v_checkpoint_id uuid;
	v_checkpoint public.chat_turn_checkpoints%ROWTYPE;
	v_now timestamptz := transaction_timestamp();
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
		OR OLD.status IS NOT DISTINCT FROM NEW.status
		OR NEW.input_artifact_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT artifacts.prepared->'resumeCheckpoint'
	INTO v_snapshot
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = NEW.input_artifact_id
		AND artifacts.turn_run_id = NEW.id
		AND artifacts.session_id = NEW.session_id
		AND artifacts.user_id = NEW.user_id;
	IF v_snapshot IS NULL THEN
		RETURN NEW;
	END IF;
	BEGIN
		v_checkpoint_id := (v_snapshot->>'checkpointId')::uuid;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION 'agentic_chat_resume_terminal_snapshot_invalid';
	END;

	SELECT checkpoints.*
	INTO v_checkpoint
	FROM public.chat_turn_checkpoints checkpoints
	WHERE checkpoints.id = v_checkpoint_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_checkpoint.user_id IS DISTINCT FROM NEW.user_id
		OR v_checkpoint.session_id IS DISTINCT FROM NEW.session_id
		OR v_checkpoint.resume_turn_run_id IS DISTINCT FROM NEW.id THEN
		RAISE EXCEPTION 'agentic_chat_resume_terminal_scope_mismatch';
	END IF;

	IF NEW.status = 'completed' THEN
		IF v_checkpoint.status = 'resuming' THEN
			UPDATE public.chat_turn_checkpoints checkpoints
			SET status = 'resumed',
				resumed_at = v_now,
				updated_at = v_now
			WHERE checkpoints.id = v_checkpoint.id
				AND checkpoints.status = 'resuming'
				AND checkpoints.resume_turn_run_id = NEW.id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'agentic_chat_resume_terminal_transition_lost';
			END IF;
		ELSIF v_checkpoint.status <> 'resumed' OR v_checkpoint.resumed_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_terminal_state_conflict';
		END IF;
	ELSE
		IF v_checkpoint.status = 'resuming' THEN
			UPDATE public.chat_turn_checkpoints checkpoints
			SET status = 'active',
				resume_turn_run_id = NULL,
				resume_started_at = NULL,
				resumed_at = NULL,
				updated_at = v_now
			WHERE checkpoints.id = v_checkpoint.id
				AND checkpoints.status = 'resuming'
				AND checkpoints.resume_turn_run_id = NEW.id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'agentic_chat_resume_terminal_restore_lost';
			END IF;
		ELSIF v_checkpoint.status <> 'active'
			OR v_checkpoint.resume_turn_run_id IS NOT NULL
			OR v_checkpoint.resume_started_at IS NOT NULL
			OR v_checkpoint.resumed_at IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_terminal_state_conflict';
		END IF;
	END IF;
	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_checkpoint_resume_terminal
	ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_checkpoint_resume_terminal
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal();

CREATE OR REPLACE FUNCTION public.recover_agentic_chat_resume_checkpoints(
	p_user_id uuid,
	p_stale_before timestamptz,
	p_recovered_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_expired_ids uuid[] := ARRAY[]::uuid[];
	v_resumed_ids uuid[] := ARRAY[]::uuid[];
	v_restored_ids uuid[] := ARRAY[]::uuid[];
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_resume_recovery_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_user_id IS NULL OR p_stale_before IS NULL OR p_recovered_at IS NULL
		OR p_stale_before > p_recovered_at THEN
		RAISE EXCEPTION 'agentic_chat_resume_recovery_invalid_input';
	END IF;

	WITH updated AS (
		UPDATE public.chat_turn_checkpoints checkpoints
		SET status = 'expired',
			updated_at = p_recovered_at
		WHERE checkpoints.user_id = p_user_id
			AND checkpoints.status = 'active'
			AND checkpoints.expires_at IS NOT NULL
			AND checkpoints.expires_at <= p_recovered_at
		RETURNING checkpoints.id
	)
	SELECT COALESCE(array_agg(updated.id ORDER BY updated.id), ARRAY[]::uuid[])
	INTO v_expired_ids
	FROM updated;

	WITH updated AS (
		UPDATE public.chat_turn_checkpoints checkpoints
		SET status = 'resumed',
			resumed_at = p_recovered_at,
			updated_at = p_recovered_at
		FROM public.chat_turn_runs turns
		WHERE checkpoints.user_id = p_user_id
			AND checkpoints.status = 'resuming'
			AND checkpoints.resume_started_at < p_stale_before
			AND checkpoints.resume_turn_run_id = turns.id
			AND turns.user_id = p_user_id
			AND turns.status = 'completed'
		RETURNING checkpoints.id
	)
	SELECT COALESCE(array_agg(updated.id ORDER BY updated.id), ARRAY[]::uuid[])
	INTO v_resumed_ids
	FROM updated;

	WITH updated AS (
		UPDATE public.chat_turn_checkpoints checkpoints
		SET status = 'active',
			resume_turn_run_id = NULL,
			resume_started_at = NULL,
			resumed_at = NULL,
			updated_at = p_recovered_at
		WHERE checkpoints.user_id = p_user_id
			AND checkpoints.status = 'resuming'
			AND checkpoints.resume_started_at < p_stale_before
			AND (
				checkpoints.resume_turn_run_id IS NULL
				OR EXISTS (
					SELECT 1
					FROM public.chat_turn_runs turns
					WHERE turns.id = checkpoints.resume_turn_run_id
						AND turns.user_id = p_user_id
						AND turns.status IN ('failed', 'cancelled')
				)
				OR NOT EXISTS (
					SELECT 1
					FROM public.chat_turn_runs turns
					WHERE turns.id = checkpoints.resume_turn_run_id
						AND turns.user_id = p_user_id
				)
			)
		RETURNING checkpoints.id
	)
	SELECT COALESCE(array_agg(updated.id ORDER BY updated.id), ARRAY[]::uuid[])
	INTO v_restored_ids
	FROM updated;

	RETURN jsonb_build_object(
		'outcome', 'recovered',
		'user_id', p_user_id,
		'expired_checkpoint_ids', to_jsonb(v_expired_ids),
		'marked_resumed_checkpoint_ids', to_jsonb(v_resumed_ids),
		'restored_active_checkpoint_ids', to_jsonb(v_restored_ids),
		'recovered_at', p_recovered_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.recover_agentic_chat_resume_checkpoints(
	uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_agentic_chat_resume_checkpoints(
	uuid, timestamptz, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact() IS
'Atomically verifies and claims the newest active checkpoint from the immutable worker admission artifact.';
COMMENT ON FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal() IS
'Resolves a claimed checkpoint on completed worker truth or restores it on failed/cancelled truth in the same transaction.';
COMMENT ON FUNCTION public.recover_agentic_chat_resume_checkpoints(uuid, timestamptz, timestamptz) IS
'Service-only idempotent expiry and stale-resuming recovery; queued/running resume turns remain claimed.';
