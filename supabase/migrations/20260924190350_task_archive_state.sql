-- supabase/migrations/20260924190350_task_archive_state.sql
-- Tasker 103 (ARCHIVE): archiving a task keeps it; deleting it erases it.
--
-- Task states:
--   live      deleted_at NULL.
--   archived  deleted_at and archived_at set. Listed in the board's Archived
--             column; kept until the person restores or deletes it. The 30-day
--             purge (20260924190400) skips it.
--   deleted   deleted_at set, archived_at NULL. Erased 30 days after deleted_at.
-- Every read that filters deleted_at IS NULL keeps hiding archived tasks.
--
-- onto_tasks.archived_at already exists (20260502000005), but the task DELETE
-- endpoint set only deleted_at, so every task archived on the board since then
-- looks deleted. DJ (2026-09-24): every soft-deleted task becomes archived, so
-- nothing a person parked disappears.
--
-- Apply before 20260924190400 (and before the worker's first purge run).
-- Changes data: sets archived_at on soft-deleted tasks that lack it. Deletes
-- nothing. The embedding trigger queues nothing (text and deleted state are
-- unchanged); trg_onto_tasks_updated bumps updated_at on the backfilled rows.

BEGIN;

ALTER TABLE public.onto_tasks
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.onto_tasks.archived_at IS
	'Set together with deleted_at when a person archives a task: it is kept until they restore or delete it, and the 30-day purge skips it. deleted_at set with archived_at NULL means deleted: erased 30 days after deleted_at.';

UPDATE public.onto_tasks
SET archived_at = deleted_at
WHERE deleted_at IS NOT NULL
	AND archived_at IS NULL;

COMMIT;
