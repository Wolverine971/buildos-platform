-- supabase/migrations/20260802033100_agentic_chat_worker_create_transition_index.sql
-- Agentic Chat Worker migration, Phase 2C Slice 1B.
--
-- PostgreSQL forbids CREATE INDEX CONCURRENTLY inside a transaction. Keep this
-- migration as this statement only; Supabase applies it without wrapping it in
-- a transaction. The partial key leaves legacy and terminal events untouched.

CREATE UNIQUE INDEX CONCURRENTLY uq_chat_turn_events_worker_transition
	ON public.chat_turn_events (
		turn_run_id,
		execution_generation,
		worker_transition_id
	)
	WHERE worker_transition_id IS NOT NULL;

