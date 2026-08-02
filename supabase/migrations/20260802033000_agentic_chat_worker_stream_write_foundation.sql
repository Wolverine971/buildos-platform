-- supabase/migrations/20260802033000_agentic_chat_worker_stream_write_foundation.sql
-- Agentic Chat Worker migration, Phase 2C Slice 1A: durable stream-write
-- receipt foundation.
--
-- This additive package gives the later text writer one replay-safe receipt on
-- the current stream row and gives semantic worker transitions a stable UUID.
-- It adds no writer RPC, publisher, Realtime policy, queue consumer, provider
-- execution, or worker routing.

ALTER TABLE public.chat_turn_stream_state
	ADD COLUMN last_text_batch_id uuid,
	ADD COLUMN last_text_sequence integer,
	ADD COLUMN last_text_end_bytes integer;

ALTER TABLE public.chat_turn_stream_state
	ADD CONSTRAINT chk_chat_turn_stream_state_last_text_receipt
		CHECK (
			(
				last_text_batch_id IS NULL
				AND last_text_sequence IS NULL
				AND last_text_end_bytes IS NULL
			)
			OR (
				last_text_batch_id IS NOT NULL
				AND last_text_sequence IS NOT NULL
				AND last_text_sequence >= 1
				AND last_text_sequence <= snapshot_sequence
				AND last_text_end_bytes IS NOT NULL
				AND last_text_end_bytes >= 1
				AND last_text_end_bytes <= octet_length(assistant_text)
			)
		) NOT VALID;

ALTER TABLE public.chat_turn_stream_state
	VALIDATE CONSTRAINT chk_chat_turn_stream_state_last_text_receipt;

COMMENT ON COLUMN public.chat_turn_stream_state.last_text_batch_id IS
	'Latest coalesced text-batch identity accepted for the current execution generation; used only to reject lost-response replay publication.';
COMMENT ON COLUMN public.chat_turn_stream_state.last_text_sequence IS
	'Sequence allocated to last_text_batch_id. Cleared atomically whenever claim advances the execution generation.';
COMMENT ON COLUMN public.chat_turn_stream_state.last_text_end_bytes IS
	'UTF-8 byte length of the complete assistant prefix committed by last_text_batch_id.';

ALTER TABLE public.chat_turn_events
	ADD COLUMN worker_transition_id uuid;

COMMENT ON COLUMN public.chat_turn_events.worker_transition_id IS
	'Caller-generated idempotency identity for one worker semantic transition, scoped by turn and execution generation. Terminal and legacy events remain null.';

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_stream_state_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_execution_generation integer;
BEGIN
	SELECT
		turns.session_id,
		turns.user_id,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_scope_mismatch';
	END IF;

	IF NEW.execution_generation IS DISTINCT FROM v_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_generation_mismatch';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
			OR NEW.session_id IS DISTINCT FROM OLD.session_id
			OR NEW.user_id IS DISTINCT FROM OLD.user_id
			OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
			RAISE EXCEPTION 'agentic_chat_stream_state_identity_is_immutable';
		END IF;

		IF NEW.execution_generation = OLD.execution_generation THEN
			IF NEW.snapshot_sequence < OLD.snapshot_sequence
				OR NEW.durable_through_sequence < OLD.durable_through_sequence
				OR NEW.projection_durable_sequence < OLD.projection_durable_sequence THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_sequence_regression';
			END IF;

			IF left(NEW.assistant_text, char_length(OLD.assistant_text))
				IS DISTINCT FROM OLD.assistant_text THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_prefix_regression';
			END IF;

			IF NEW.last_text_sequence IS NOT NULL
				AND OLD.last_text_sequence IS NOT NULL
				AND NEW.last_text_sequence < OLD.last_text_sequence THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_text_receipt_regression';
			END IF;

			IF NEW.last_text_batch_id IS DISTINCT FROM OLD.last_text_batch_id
				AND OLD.last_text_sequence IS NOT NULL
				AND (
					NEW.last_text_sequence IS NULL
					OR NEW.last_text_sequence <= OLD.last_text_sequence
				) THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_text_receipt_transition_invalid';
			END IF;
		ELSIF NEW.execution_generation = OLD.execution_generation + 1 THEN
			IF NEW.snapshot_sequence <> 0
				OR NEW.durable_through_sequence <> 0
				OR NEW.projection_durable_sequence <> 0
				OR NEW.assistant_text <> ''
				OR NEW.reconcile_required THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_generation_reset_required';
			END IF;

			-- Existing claim/fencing code intentionally names only the original
			-- reset columns. Clear replay receipts here so the additive migration
			-- remains compatible with that already-hosted claim RPC.
			NEW.last_text_batch_id := NULL;
			NEW.last_text_sequence := NULL;
			NEW.last_text_end_bytes := NULL;
		ELSE
			RAISE EXCEPTION 'agentic_chat_stream_state_generation_transition_invalid';
		END IF;
	END IF;

	NEW.updated_at := GREATEST(clock_timestamp(), NEW.created_at);
	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_stream_state_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_stream_state_write()
	FROM anon, authenticated;

