-- supabase/migrations/20260802030100_agentic_chat_worker_create_event_generation_index.sql
-- This migration must remain one top-level statement: Supabase applies
-- CREATE INDEX CONCURRENTLY outside a transaction.
CREATE UNIQUE INDEX CONCURRENTLY uq_chat_turn_events_generation_sequence
	ON public.chat_turn_events (turn_run_id, execution_generation, sequence_index);

