-- supabase/migrations/20260804033000_agentic_chat_partial_cancellation_terminal_events.sql
-- Agentic Chat Worker, Phase 4 Slice 8: extend the existing atomic
-- last_turn_context -> timing -> done wrapper to cancelled partial responses.

BEGIN;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid =
		'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)'::regprocedure;

	v_next := replace(
		v_body,
		$old$		OR v_turn.cancel_requested_at IS NOT NULL THEN$old$,
		$new$		OR (
			v_turn.cancel_requested_at IS NOT NULL
			AND p_status IS DISTINCT FROM 'cancelled'
		) THEN$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_control_gate';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	IF p_status IS DISTINCT FROM 'completed'
		OR p_failure_code IS NOT NULL
		OR p_last_turn_context_transition_id IS NULL
		OR p_timing_transition_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_invalid_completion';
	END IF;$old$,
		$new$	IF p_status IS NULL
		OR p_status NOT IN ('completed', 'cancelled')
		OR (p_status = 'completed' AND p_failure_code IS NOT NULL)
		OR (
			p_status = 'cancelled'
			AND (
				v_turn.cancel_requested_at IS NULL
				OR p_failure_code IS DISTINCT FROM 'cancelled'
				OR p_assistant_message_id IS NULL
				OR p_assistant_text IS NULL
				OR p_assistant_text = ''
			)
		)
		OR p_last_turn_context_transition_id IS NULL
		OR p_timing_transition_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_invalid_terminal';
	END IF;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_validation';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	v_context_receipt := public.persist_agentic_chat_semantic_event($old$,
		$new$	-- The ordinary semantic writer must continue rejecting every post-cancel
	-- write. The locked terminal transaction temporarily masks the cancellation
	-- columns only while it commits this checked two-event prefix, then restores
	-- the exact cancellation evidence before invoking the authoritative CAS.
	-- No concurrent transaction can observe the temporary state, and any error
	-- rolls back the mask and both semantic writes together.
	IF p_status = 'cancelled' THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = NULL,
			cancel_reason = NULL
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = v_turn.execution_generation
			AND turns.cancel_requested_at IS NOT DISTINCT FROM v_turn.cancel_requested_at
			AND turns.cancel_reason IS NOT DISTINCT FROM v_turn.cancel_reason;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_cancel_mask_lost';
		END IF;
	END IF;

	v_context_receipt := public.persist_agentic_chat_semantic_event($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_context_boundary';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	v_terminal_receipt := public.finalize_agentic_chat_turn($old$,
		$new$	IF p_status = 'cancelled' THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = v_turn.cancel_requested_at,
			cancel_reason = v_turn.cancel_reason
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = v_turn.execution_generation
			AND turns.cancel_requested_at IS NULL
			AND turns.cancel_reason IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_terminal_events_finalize_cancel_restore_lost';
		END IF;
	END IF;

	v_terminal_receipt := public.finalize_agentic_chat_turn($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_terminal_boundary';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$		OR v_terminal_receipt->>'status' IS DISTINCT FROM 'completed'$old$,
		$new$		OR v_terminal_receipt->>'status' IS DISTINCT FROM p_status$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_receipt_status';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$		AND turns.status = 'completed';$old$,
		$new$		AND turns.status = p_status;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_partial_cancel_migration_unexpected_timestamp_cas';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
		CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(
			p_turn_run_id uuid,
			p_user_id uuid,
			p_queue_job_id uuid,
			p_processing_token uuid,
			p_execution_generation integer,
			p_status text,
			p_finished_reason text,
			p_failure_code text,
			p_assistant_message_id uuid,
			p_assistant_text text,
			p_assistant_metadata jsonb,
			p_prompt_tokens integer,
			p_completion_tokens integer,
			p_total_tokens integer,
			p_projection jsonb,
			p_event_payload jsonb,
			p_last_turn_context jsonb,
			p_last_turn_context_transition_id uuid,
			p_timing_draft jsonb,
			p_timing_transition_id uuid
		)
		RETURNS jsonb
		LANGUAGE plpgsql
		SECURITY INVOKER
		SET search_path = pg_catalog, public
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid
) TO service_role;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid
) IS
	'Service-only terminal wrapper for completed responses and cancelled partial responses. Atomically persists last_turn_context, asynchronous timing, and done with database-owned terminal evidence.';

COMMIT;
