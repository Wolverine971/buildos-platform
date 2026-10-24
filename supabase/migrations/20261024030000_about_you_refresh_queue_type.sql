-- supabase/migrations/20261024030000_about_you_refresh_queue_type.sql
--
-- About you (tasker/146): a worker job keeps a short "About you" note in each
-- person's Workspace, inferred from their own chat messages. It runs at most
-- about once a day per person (the cap and the cohort live in the worker), and
-- the note is an ordinary Workspace document (type_key document.context.about_you),
-- so it needs no table of its own. This migration only adds the queue type.
--
-- Rollback: none needed. An unused enum value is harmless, and Postgres can't
-- drop one without rebuilding the type.
--
-- Rehearse:
--   pnpm db:rehearse supabase/migrations/20261024030000_about_you_refresh_queue_type.sql

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'about_you_refresh';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
