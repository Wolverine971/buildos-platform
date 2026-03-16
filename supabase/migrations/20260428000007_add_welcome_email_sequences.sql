-- supabase/migrations/20260428000007_add_welcome_email_sequences.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.welcome_email_sequences (
	user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
	sequence_version TEXT NOT NULL DEFAULT '2026-03-16',
	trigger_source TEXT NOT NULL DEFAULT 'account_created',
	signup_method TEXT NOT NULL DEFAULT 'unknown',
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
	email_1_sent_at TIMESTAMPTZ,
	email_1_skipped_at TIMESTAMPTZ,
	email_2_sent_at TIMESTAMPTZ,
	email_2_skipped_at TIMESTAMPTZ,
	email_3_sent_at TIMESTAMPTZ,
	email_3_skipped_at TIMESTAMPTZ,
	email_4_sent_at TIMESTAMPTZ,
	email_4_skipped_at TIMESTAMPTZ,
	email_5_sent_at TIMESTAMPTZ,
	email_5_skipped_at TIMESTAMPTZ,
	last_evaluated_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_welcome_email_sequences_status_started
	ON public.welcome_email_sequences(status, started_at);

CREATE INDEX IF NOT EXISTS idx_welcome_email_sequences_last_evaluated
	ON public.welcome_email_sequences(last_evaluated_at);

DROP TRIGGER IF EXISTS trg_welcome_email_sequences_updated_at
	ON public.welcome_email_sequences;

CREATE TRIGGER trg_welcome_email_sequences_updated_at
	BEFORE UPDATE ON public.welcome_email_sequences
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.welcome_email_sequences IS
	'Tracks BuildOS welcome-sequence progress so signup activation emails can be sent once and branched off product state.';

COMMENT ON COLUMN public.welcome_email_sequences.sequence_version IS
	'Source-of-truth welcome sequence version from docs/marketing/strategy/buildos-welcome-sequence.md.';

COMMENT ON COLUMN public.welcome_email_sequences.trigger_source IS
	'Canonical event that started the sequence, e.g. account_created.';

COMMENT ON COLUMN public.welcome_email_sequences.signup_method IS
	'Auth path that created the account, e.g. email or google_oauth.';

COMMIT;
