-- supabase/tests/fixtures/agent_call_bootstrap_hardening_base.sql
-- Minimal disposable schema for the agent-call bootstrap retention contract.

-- Roles are cluster-scoped, while the external SQL-contract runner creates one
-- database per contract in a shared PostgreSQL 15 cluster.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN BYPASSRLS;
	END IF;
END;
$$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.external_agent_callers (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	provider text NOT NULL,
	caller_key text NOT NULL,
	token_prefix text NOT NULL,
	token_hash text NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'trusted',
	policy jsonb NOT NULL DEFAULT '{}'::jsonb,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	last_used_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (user_id, provider, caller_key)
);

CREATE TABLE public.agent_call_bootstrap_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL
		REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	setup_token_hash text NOT NULL UNIQUE,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	expires_at timestamptz NOT NULL,
	last_accessed_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.agent_call_bootstrap_links TO service_role;
