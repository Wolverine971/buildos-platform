-- supabase/migrations/20260929150100_canonical_connector_task_archive.sql
-- Tasker 113: tasks archived through the connector before 2026-09-29 got archived_at but
-- kept deleted_at NULL, so every reader that hides deleted rows showed them as live work.
-- The board's canonical archive (20260924190350) sets both. Give those tasks the same
-- shape: they move to the board's Archived column, stay restorable, and the 30-day purge
-- skips them because archived_at is set.
--
-- Prod on 2026-09-29: 34 tasks, all in one project (f85b6c5f, archived 2026-07-02).
-- Their calendar events are left alone on purpose: deleting them would push deletes to
-- Google Calendar, and 20260929150000 already keeps them out of chat.
-- Changes data. Deletes nothing. Triggers fire as on a board archive (updated_at bump,
-- embedding removal, chat-context invalidation).

BEGIN;

UPDATE public.onto_tasks
SET deleted_at = archived_at
WHERE archived_at IS NOT NULL
	AND deleted_at IS NULL;

COMMIT;
