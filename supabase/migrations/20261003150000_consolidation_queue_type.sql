-- supabase/migrations/20261003150000_consolidation_queue_type.sql
-- Document consolidation runs, part 1 of 2: queue type only.
--
-- Isolated because an enum value must commit before anything can enqueue it.
-- Precedent: 20260918200100_freshness_radar_queue_type.sql.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'consolidation_run';
