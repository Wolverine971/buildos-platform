-- supabase/migrations/20260801030200_agentic_chat_worker_create_active_index.sql
-- Agentic Chat Worker migration, Phase 2A Slice 3C: build the replacement
-- queued/running guard without blocking writes.
--
-- Keep this as a single pipeline-incompatible statement. Supabase CLI >=2.109
-- executes CREATE INDEX CONCURRENTLY outside a transaction/pipeline.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_chat_turn_runs_one_active_per_session
	ON public.chat_turn_runs (session_id)
	WHERE status IN ('queued', 'running');
