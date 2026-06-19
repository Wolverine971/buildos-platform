-- supabase/migrations/20260618010000_chat_messages_realtime_publication.sql
-- Agent Work — Chat integration (Phase 3 / UI-P4).
--
-- Add `chat_messages` to the `supabase_realtime` publication so the agentic
-- chat can receive `postgres_changes` for assistant messages injected by the
-- worker when a chat-spawned Agent Run completes (the original SSE turn has
-- already ended). The chat also reloads the session on run completion as a
-- reliable fallback, so this is an enhancement (instant render), not required.
--
-- Guarded: only adds the table if the publication exists and the table is not
-- already a member.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
	   AND NOT EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
		  AND schemaname = 'public'
		  AND tablename = 'chat_messages'
	) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
	END IF;
END $$;
