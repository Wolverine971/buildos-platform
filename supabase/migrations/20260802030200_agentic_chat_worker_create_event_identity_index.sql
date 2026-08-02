-- supabase/migrations/20260802030200_agentic_chat_worker_create_event_identity_index.sql
-- This migration must remain one top-level statement: Supabase applies
-- CREATE INDEX CONCURRENTLY outside a transaction.
CREATE UNIQUE INDEX CONCURRENTLY uq_chat_turn_events_event_id
	ON public.chat_turn_events (event_id);

