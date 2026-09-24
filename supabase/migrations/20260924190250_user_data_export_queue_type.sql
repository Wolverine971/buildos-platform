-- supabase/migrations/20260924190250_user_data_export_queue_type.sql
-- Tasker 103 (PANEL), part 1 of 2: queue type only.
--
-- Isolated because PostgreSQL enum additions are irreversible without rebuilding
-- the enum, and the value must commit before request_user_data_export()
-- (20260924190300_user_data_panel_and_exports.sql) can enqueue a job.
-- Precedent: 20260922230000_chat_capture_checkpoint_queue_type.sql.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'user_data_export';
