-- supabase/migrations/20260830155952_agentic_chat_stale_legacy_turn_reaper.sql
-- Agentic Chat Wave 3 / D4b: bounded recovery for abandoned legacy SSE turns.
--
-- The web host heartbeats active legacy turns every 30 seconds. This function
-- only terminalizes legacy rows whose progress has been silent for at least two
-- minutes, locks candidates without blocking another reaper, and exposes no
-- end-user callable surface.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_chat_turn_runs_legacy_running_progress
	ON public.chat_turn_runs (
		(COALESCE(last_progress_at, started_at)),
		id
	)
	WHERE execution_mode = 'legacy_sse'
		AND status = 'running';

CREATE OR REPLACE FUNCTION public.reap_stale_legacy_agentic_chat_turns(
	p_progress_stale_after_seconds integer DEFAULT 150,
	p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_now timestamptz := clock_timestamp();
	v_progress_stale_after_seconds integer := GREATEST(
		COALESCE(p_progress_stale_after_seconds, 150),
		120
	);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 100), 1000), 1);
	v_reaped_count integer := 0;
BEGIN
	WITH candidates AS MATERIALIZED (
		SELECT turns.id
		FROM public.chat_turn_runs turns
		WHERE turns.execution_mode = 'legacy_sse'
			AND turns.status = 'running'
			AND COALESCE(turns.last_progress_at, turns.started_at)
				<= v_now - make_interval(secs => v_progress_stale_after_seconds)
		ORDER BY
			COALESCE(turns.last_progress_at, turns.started_at),
			turns.id
		FOR UPDATE SKIP LOCKED
		LIMIT v_batch_size
	), reaped AS (
		UPDATE public.chat_turn_runs turns
		SET status = 'cancelled',
			finished_reason = 'stale_running_turn_reaper',
			finished_at = v_now,
			updated_at = v_now
		FROM candidates
		WHERE turns.id = candidates.id
			AND turns.execution_mode = 'legacy_sse'
			AND turns.status = 'running'
		RETURNING turns.id
	)
	SELECT count(*)::integer
	INTO v_reaped_count
	FROM reaped;

	RETURN jsonb_build_object(
		'reaped_count', v_reaped_count,
		'has_more', v_reaped_count = v_batch_size,
		'progress_stale_after_seconds', v_progress_stale_after_seconds,
		'batch_size', v_batch_size
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.reap_stale_legacy_agentic_chat_turns(integer, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_legacy_agentic_chat_turns(integer, integer)
	TO service_role;

COMMENT ON FUNCTION public.reap_stale_legacy_agentic_chat_turns(integer, integer) IS
	'Bounded service-only SKIP LOCKED recovery for legacy SSE turns with no progress heartbeat for at least 120 seconds.';

COMMIT;
