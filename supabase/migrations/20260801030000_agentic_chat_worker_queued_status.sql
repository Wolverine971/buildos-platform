-- supabase/migrations/20260801030000_agentic_chat_worker_queued_status.sql
-- Agentic Chat Worker migration, Phase 2A Slice 3A: queued status compatibility.
--
-- Reversible while worker admission remains disabled and no queued rows exist.
-- The replacement constraint is added and validated before the legacy check is
-- removed, so live legacy inserts never observe an unconstrained status column.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE status NOT IN ('queued', 'running', 'completed', 'failed', 'cancelled')
	) THEN
		RAISE EXCEPTION
			'agentic_chat_queued_status_preflight_failed: unsupported status exists';
	END IF;
END;
$$;

ALTER TABLE public.chat_turn_runs
	DROP CONSTRAINT IF EXISTS chk_chat_turn_runs_status_phase2;

ALTER TABLE public.chat_turn_runs
	ADD CONSTRAINT chk_chat_turn_runs_status_phase2
	CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
	NOT VALID;

ALTER TABLE public.chat_turn_runs
	VALIDATE CONSTRAINT chk_chat_turn_runs_status_phase2;

ALTER TABLE public.chat_turn_runs
	DROP CONSTRAINT IF EXISTS chk_chat_turn_runs_status;

ALTER TABLE public.chat_turn_runs
	RENAME CONSTRAINT chk_chat_turn_runs_status_phase2 TO chk_chat_turn_runs_status;

-- Rollback before worker admission:
--   1. Assert no status='queued' rows exist.
--   2. Add/validate the four-value legacy check under a temporary name.
--   3. Drop this expanded check and rename the legacy check back to
--      chk_chat_turn_runs_status.
