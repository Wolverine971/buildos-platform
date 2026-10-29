-- supabase/migrations/20261028170100_auth_handoff_codes.sql
--
-- One-time codes that carry a signed-in native app session into the in-app browser, so web
-- pages opened from the iPhone app (settings, billing, integrations, account deletion) are
-- already signed in. POST /api/auth/handoff (bearer-authenticated) stores the sha256 of a
-- random code that lives 60 seconds; GET /auth/handoff?code=… consumes it in a single UPDATE
-- (single use), mints a cookie session for that user on the server and redirects. Access
-- tokens never appear in URLs.
--
-- Server-only table: RLS on with no policies, and no grants to anon or authenticated. Only the
-- service role reads or writes it.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.auth_handoff_codes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
	next_path text NULL CHECK (
		next_path IS NULL
		OR (char_length(next_path) <= 512 AND next_path ~ '^/' AND next_path !~ '^/[/\\]')
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	consumed_at timestamptz NULL,
	created_ip text NULL CHECK (created_ip IS NULL OR char_length(created_ip) <= 64),
	user_agent text NULL CHECK (user_agent IS NULL OR char_length(user_agent) <= 400)
);

CREATE INDEX IF NOT EXISTS auth_handoff_codes_expires_at_idx
	ON public.auth_handoff_codes (expires_at);
CREATE INDEX IF NOT EXISTS auth_handoff_codes_user_id_idx
	ON public.auth_handoff_codes (user_id);

ALTER TABLE public.auth_handoff_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_handoff_codes FROM anon, authenticated;

COMMENT ON TABLE public.auth_handoff_codes IS
	'One-time, 60-second codes that sign the in-app browser into the native app''s account. Service role only.';
