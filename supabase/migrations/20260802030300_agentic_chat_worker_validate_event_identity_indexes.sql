-- supabase/migrations/20260802030300_agentic_chat_worker_validate_event_identity_indexes.sql
-- Validate both concurrently-built replacement indexes before the legacy
-- turn-wide sequence constraint is removed.
DO $block$
DECLARE
	v_generation_index record;
	v_identity_index record;
BEGIN
	SELECT indexrelid, indisvalid, indisready, indisunique
	INTO v_generation_index
	FROM pg_index
	WHERE indexrelid = 'public.uq_chat_turn_events_generation_sequence'::regclass;

	IF NOT FOUND
		OR NOT v_generation_index.indisvalid
		OR NOT v_generation_index.indisready
		OR NOT v_generation_index.indisunique THEN
		RAISE EXCEPTION
			'agentic_chat_event_identity_preflight_failed: generation index is not ready, valid, and unique';
	END IF;

	SELECT indexrelid, indisvalid, indisready, indisunique
	INTO v_identity_index
	FROM pg_index
	WHERE indexrelid = 'public.uq_chat_turn_events_event_id'::regclass;

	IF NOT FOUND
		OR NOT v_identity_index.indisvalid
		OR NOT v_identity_index.indisready
		OR NOT v_identity_index.indisunique THEN
		RAISE EXCEPTION
			'agentic_chat_event_identity_preflight_failed: event-id index is not ready, valid, and unique';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_events events
		WHERE events.execution_generation IS NULL
			OR events.execution_generation < 0
			OR events.event_id IS NULL
			OR events.event_id IS DISTINCT FROM events.turn_run_id::text
				|| ':' || events.execution_generation::text
				|| ':' || events.sequence_index::text
	) THEN
		RAISE EXCEPTION
			'agentic_chat_event_identity_preflight_failed: invalid event identity row exists';
	END IF;
END;
$block$;

-- NOT VALID constraints already protect new writes. Validate the backfill with
-- the lower-impact validation lock, then promote both columns to NOT NULL.
ALTER TABLE public.chat_turn_events
	VALIDATE CONSTRAINT chk_chat_turn_events_execution_generation,
	VALIDATE CONSTRAINT chk_chat_turn_events_event_id_shape;

ALTER TABLE public.chat_turn_events
	ALTER COLUMN execution_generation SET NOT NULL,
	ALTER COLUMN event_id SET NOT NULL;
