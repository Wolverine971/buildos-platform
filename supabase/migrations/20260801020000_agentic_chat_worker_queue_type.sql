-- supabase/migrations/20260801020000_agentic_chat_worker_queue_type.sql
-- Agentic Chat Worker migration, Phase 2A Slice 2: queue type only.
--
-- This migration is deliberately isolated because PostgreSQL enum additions
-- are irreversible without rebuilding the enum. The new value must commit
-- before any later migration inserts an agentic-chat queue job.
--
-- This slice creates no job, queued turn status, active-turn index, RPC,
-- worker consumer, transport surface, or executable asynchronous path.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'agentic_chat_turn';
