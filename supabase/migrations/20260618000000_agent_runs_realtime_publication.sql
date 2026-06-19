-- supabase/migrations/20260618000000_agent_runs_realtime_publication.sql
-- Agent Work — Run Stack UI (03 Monitoring UI, Phase 2).
--
-- Add `agent_runs` to the `supabase_realtime` publication so the web client can
-- receive `postgres_changes` for live run-status updates in the notification
-- stack. The publication is otherwise dashboard-managed; the Run Stack also has
-- a polling fallback, so this migration is an enhancement (instant updates), not
-- a hard dependency.
--
-- Guarded: only adds the table if the publication exists and the table is not
-- already a member, so this is safe to run regardless of dashboard state.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
	   AND NOT EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
		  AND schemaname = 'public'
		  AND tablename = 'agent_runs'
	) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
	END IF;
END $$;

-- REPLICA IDENTITY FULL so UPDATE/DELETE change payloads carry the full row
-- (notably `user_id`), which the client channel filters on (`user_id=eq.<id>`).
-- agent_runs is low-volume, so the write overhead is negligible.
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;
