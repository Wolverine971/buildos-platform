-- supabase/migrations/20260918200100_freshness_radar_queue_type.sql
-- Jev freshness radar (Tasker 88), part 2 of 4: queue type only.
--
-- Isolated because PostgreSQL enum additions are irreversible without rebuilding
-- the enum, and the new value must commit before the turn-signal trigger
-- (20260918200300) can enqueue a freshness_radar_scan job.
-- Precedent: 20260801020000_agentic_chat_worker_queue_type.sql.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'freshness_radar_scan';
