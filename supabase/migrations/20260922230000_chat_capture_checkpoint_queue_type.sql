-- supabase/migrations/20260922230000_chat_capture_checkpoint_queue_type.sql
-- Tasker 95 (chat checkpoint capture), part 1 of 2: queue type only.
--
-- Isolated because PostgreSQL enum additions are irreversible without rebuilding
-- the enum, and the value must commit before any capture_chat_checkpoint job is
-- enqueued. Precedent: 20260918200100_freshness_radar_queue_type.sql.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'capture_chat_checkpoint';
