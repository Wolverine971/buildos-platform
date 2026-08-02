-- supabase/migrations/20260802030400_agentic_chat_worker_drop_legacy_event_sequence.sql
-- Both replacement keys were built concurrently and validated in the previous
-- steps. The historical constraint would reject sequence one in generation two.
ALTER TABLE public.chat_turn_events
	DROP CONSTRAINT uq_chat_turn_events_sequence;

