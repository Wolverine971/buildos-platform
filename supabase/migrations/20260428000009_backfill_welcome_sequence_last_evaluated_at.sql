-- supabase/migrations/20260428000009_backfill_welcome_sequence_last_evaluated_at.sql
BEGIN;

ALTER TABLE IF EXISTS public.welcome_email_sequences
	ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_welcome_email_sequences_last_evaluated
	ON public.welcome_email_sequences(last_evaluated_at);

COMMIT;
