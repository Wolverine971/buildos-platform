-- supabase/migrations/20260801030100_agentic_chat_worker_active_index_preflight.sql
-- Agentic Chat Worker migration, Phase 2A Slice 3B: active-index preflight.
--
-- The Phase 0 hosted preflight found no duplicate active sessions. Recheck at
-- deployment and fail with the deterministic first conflicting session rather
-- than letting concurrent unique-index construction choose or hide a winner.

DO $$
DECLARE
	v_duplicate_session_id uuid;
	v_duplicate_turn_ids uuid[];
BEGIN
	SELECT
		duplicates.session_id,
		duplicates.turn_ids
	INTO
		v_duplicate_session_id,
		v_duplicate_turn_ids
	FROM (
		SELECT
			session_id,
			array_agg(
				id ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
			) AS turn_ids
		FROM public.chat_turn_runs
		WHERE status IN ('queued', 'running')
		GROUP BY session_id
		HAVING count(*) > 1
		ORDER BY session_id
		LIMIT 1
	) AS duplicates;

	IF v_duplicate_session_id IS NOT NULL THEN
		RAISE EXCEPTION
			'agentic_chat_active_index_preflight_failed: duplicate queued/running rows for session %, ordered turn ids %',
			v_duplicate_session_id,
			v_duplicate_turn_ids;
	END IF;
END;
$$;
