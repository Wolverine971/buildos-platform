-- supabase/migrations/20260924120000_email_scan_checks.sql
-- Scan ledger for Agentic Chat `scan_email_inbox`: which inbox messages an
-- earlier scan already scored for one relevance scope, so the next scan skips
-- them instead of re-reading and re-scoring them.
--
-- Privacy invariants (the Gmail tool keeps no durable copy of message content):
--   - no subjects, senders, snippets, or bodies — only a relevance score;
--   - message ids are stored as an HMAC keyed by a server-side secret, never raw;
--   - scope keys are fixed labels or hashes, never the model's `looking_for` text;
--   - rows expire after 30 days and cascade with the user and the Gmail connection;
--   - service-role only: browsers never read or write this table.

CREATE TABLE IF NOT EXISTS public.email_scan_checks (
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid NOT NULL REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	scope_key text NOT NULL CHECK (scope_key ~ '^[a-z]+:[0-9a-f-]{1,64}:v[0-9]+$'),
	message_key text NOT NULL CHECK (message_key ~ '^[0-9a-f]{32}$'),
	relevance real NOT NULL CHECK (relevance >= 0 AND relevance <= 1),
	relevant boolean NOT NULL,
	checked_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
	PRIMARY KEY (user_id, connection_id, scope_key, message_key)
);

CREATE INDEX IF NOT EXISTS email_scan_checks_user_expiry_idx
	ON public.email_scan_checks (user_id, expires_at);

ALTER TABLE public.email_scan_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_scan_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_scan_checks TO service_role;

COMMENT ON TABLE public.email_scan_checks IS
	'scan_email_inbox ledger: HMAC message keys + relevance per scope, no email content, 30-day expiry, service-role only.';
