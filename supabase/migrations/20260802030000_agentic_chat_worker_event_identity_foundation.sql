-- supabase/migrations/20260802030000_agentic_chat_worker_event_identity_foundation.sql
-- Agentic Chat Worker migration, Phase 2B Slice 4A: generation-scoped event
-- identity foundation.
--
-- Claim resets last_event_sequence for every new execution generation. The
-- historical (turn_run_id, sequence_index) key therefore cannot represent a
-- retried worker turn. This staged package adds the generation and stable text
-- event identity, backfills every legacy event as generation zero, and guards
-- future writes. The old uniqueness constraint remains in place until the two
-- replacement indexes have been built concurrently and validated.

ALTER TABLE public.chat_turn_events
	ADD COLUMN execution_generation integer DEFAULT 0,
	-- The empty value is an insert-compatibility sentinel. It keeps event_id
	-- optional in generated insert types while the BEFORE INSERT trigger replaces
	-- it with the deterministic identity before any row or constraint can see it.
	ADD COLUMN event_id text DEFAULT '';

UPDATE public.chat_turn_events events
SET execution_generation = 0,
	event_id = events.turn_run_id::text || ':0:' || events.sequence_index::text
WHERE events.execution_generation IS NULL
	OR events.event_id IS NULL
	OR events.event_id = '';

ALTER TABLE public.chat_turn_events
	ADD CONSTRAINT chk_chat_turn_events_execution_generation
		CHECK (execution_generation IS NOT NULL AND execution_generation >= 0)
		NOT VALID,
	ADD CONSTRAINT chk_chat_turn_events_event_id_shape
		CHECK (
			event_id IS NOT NULL
			AND event_id = turn_run_id::text
				|| ':' || execution_generation::text
				|| ':' || sequence_index::text
		) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_turn_event_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_stream_run_id text;
	v_execution_generation integer;
	v_expected_event_id text;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_is_immutable';
	END IF;

	SELECT
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_stream_run_id,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id
		OR NEW.stream_run_id IS DISTINCT FROM v_stream_run_id THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_scope_mismatch';
	END IF;

	IF NEW.execution_generation IS DISTINCT FROM v_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_stale_generation';
	END IF;

	v_expected_event_id := NEW.turn_run_id::text
		|| ':' || NEW.execution_generation::text
		|| ':' || NEW.sequence_index::text;
	IF NEW.event_id IS NULL OR NEW.event_id = '' THEN
		NEW.event_id := v_expected_event_id;
	ELSIF NEW.event_id IS DISTINCT FROM v_expected_event_id THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_identity_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_turn_event_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_turn_event_write()
	FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_events_validate
BEFORE INSERT OR UPDATE ON public.chat_turn_events
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_turn_event_write();

COMMENT ON COLUMN public.chat_turn_events.execution_generation IS
	'Execution generation that owns this durable event; sequence_index restarts at one for each generation.';
COMMENT ON COLUMN public.chat_turn_events.event_id IS
	'Deterministic identity <turn_run_id>:<execution_generation>:<sequence_index>, shared by persistence, Broadcast, and reconciliation.';
