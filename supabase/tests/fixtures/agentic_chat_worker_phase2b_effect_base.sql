-- supabase/tests/fixtures/agentic_chat_worker_phase2b_effect_base.sql
-- Minimal pre-Phase-2B effect foundation fixture.
\ir agentic_chat_worker_queue_lockdown_base.sql

-- The historical admission fixture intentionally models only the columns used
-- by that RPC. The hosted table already has this Phase 1 observability link.
ALTER TABLE public.chat_tool_executions
	ADD COLUMN turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE SET NULL;
