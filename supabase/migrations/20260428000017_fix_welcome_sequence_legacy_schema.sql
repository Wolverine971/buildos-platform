-- supabase/migrations/20260428000017_fix_welcome_sequence_legacy_schema.sql
BEGIN;

ALTER TABLE IF EXISTS public.welcome_email_sequences
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.welcome_email_sequences
SET updated_at = COALESCE(
	updated_at,
	last_evaluated_at,
	completed_at,
	email_5_sent_at,
	email_5_skipped_at,
	email_4_sent_at,
	email_4_skipped_at,
	email_3_sent_at,
	email_3_skipped_at,
	email_2_sent_at,
	email_2_skipped_at,
	email_1_sent_at,
	email_1_skipped_at,
	started_at,
	created_at,
	NOW()
)
WHERE updated_at IS NULL;

ALTER TABLE IF EXISTS public.welcome_email_sequences
	ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS public.welcome_email_sequences
	ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS trg_welcome_email_sequences_updated_at
	ON public.welcome_email_sequences;

CREATE TRIGGER trg_welcome_email_sequences_updated_at
	BEFORE UPDATE ON public.welcome_email_sequences
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

COMMIT;
