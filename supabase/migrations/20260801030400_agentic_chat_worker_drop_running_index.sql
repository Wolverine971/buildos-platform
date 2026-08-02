-- supabase/migrations/20260801030400_agentic_chat_worker_drop_running_index.sql
-- Agentic Chat Worker migration, Phase 2A Slice 3E: remove the superseded
-- running-only guard after the replacement index has been validated.
--
-- Keep this as a single pipeline-incompatible statement. Supabase CLI >=2.109
-- executes DROP INDEX CONCURRENTLY outside a transaction/pipeline.

DROP INDEX CONCURRENTLY IF EXISTS public.uq_chat_turn_runs_one_running_per_session;
