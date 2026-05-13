-- supabase/migrations/20260513000001_agent_oauth_remote_mcp.sql
-- OAuth-backed remote MCP connector support for BuildOS external agents.

CREATE TABLE IF NOT EXISTS public.agent_oauth_clients (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	client_id text NOT NULL UNIQUE,
	client_secret_hash text NULL,
	client_name text NOT NULL,
	client_uri text NULL,
	logo_uri text NULL,
	redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
	allowed_scopes jsonb NOT NULL DEFAULT '["buildos.read", "buildos.write", "offline_access"]'::jsonb,
	client_type text NOT NULL DEFAULT 'public'
		CHECK (client_type IN ('public', 'confidential')),
	registration_source text NOT NULL DEFAULT 'dynamic'
		CHECK (registration_source IN ('static', 'dynamic', 'cimd', 'anthropic_held', 'admin')),
	status text NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'revoked')),
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_oauth_grants (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	client_id text NOT NULL,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	client_profile_id text NOT NULL DEFAULT 'claude-browser',
	resource text NOT NULL,
	scope text NOT NULL DEFAULT 'buildos.read',
	scope_mode text NOT NULL DEFAULT 'read_only'
		CHECK (scope_mode IN ('read_only', 'read_write')),
	allowed_ops jsonb NOT NULL DEFAULT '[]'::jsonb,
	allowed_project_ids jsonb NULL,
	status text NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'revoked')),
	last_used_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_oauth_grants_client_fk
		FOREIGN KEY (client_id) REFERENCES public.agent_oauth_clients(client_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.agent_oauth_authorization_codes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	code_hash text NOT NULL UNIQUE,
	client_id text NOT NULL,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	redirect_uri text NOT NULL,
	resource text NOT NULL,
	scope text NOT NULL,
	code_challenge text NOT NULL,
	code_challenge_method text NOT NULL DEFAULT 'S256'
		CHECK (code_challenge_method = 'S256'),
	expires_at timestamptz NOT NULL,
	used_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_oauth_authorization_codes_client_fk
		FOREIGN KEY (client_id) REFERENCES public.agent_oauth_clients(client_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.agent_oauth_access_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	client_id text NOT NULL,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	token_prefix text NOT NULL,
	resource text NOT NULL,
	scope text NOT NULL,
	expires_at timestamptz NOT NULL,
	last_used_at timestamptz NULL,
	revoked_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_oauth_access_tokens_client_fk
		FOREIGN KEY (client_id) REFERENCES public.agent_oauth_clients(client_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.agent_oauth_refresh_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	client_id text NOT NULL,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	token_prefix text NOT NULL,
	family_id uuid NOT NULL DEFAULT gen_random_uuid(),
	rotated_from_id uuid NULL REFERENCES public.agent_oauth_refresh_tokens(id) ON DELETE SET NULL,
	resource text NOT NULL,
	scope text NOT NULL,
	expires_at timestamptz NOT NULL,
	used_at timestamptz NULL,
	revoked_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_oauth_refresh_tokens_client_fk
		FOREIGN KEY (client_id) REFERENCES public.agent_oauth_clients(client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_clients_status
	ON public.agent_oauth_clients(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_grants_user_status
	ON public.agent_oauth_grants(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_grants_caller
	ON public.agent_oauth_grants(external_agent_caller_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_oauth_grants_active_user_client_resource
	ON public.agent_oauth_grants(user_id, client_id, resource)
	WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_oauth_authorization_codes_client
	ON public.agent_oauth_authorization_codes(client_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_access_tokens_grant
	ON public.agent_oauth_access_tokens(grant_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_refresh_tokens_grant
	ON public.agent_oauth_refresh_tokens(grant_id, expires_at DESC);

DROP TRIGGER IF EXISTS trg_agent_oauth_clients_updated ON public.agent_oauth_clients;
CREATE TRIGGER trg_agent_oauth_clients_updated
	BEFORE UPDATE ON public.agent_oauth_clients
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_oauth_grants_updated ON public.agent_oauth_grants;
CREATE TRIGGER trg_agent_oauth_grants_updated
	BEFORE UPDATE ON public.agent_oauth_grants
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_oauth_authorization_codes_updated ON public.agent_oauth_authorization_codes;
CREATE TRIGGER trg_agent_oauth_authorization_codes_updated
	BEFORE UPDATE ON public.agent_oauth_authorization_codes
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_oauth_access_tokens_updated ON public.agent_oauth_access_tokens;
CREATE TRIGGER trg_agent_oauth_access_tokens_updated
	BEFORE UPDATE ON public.agent_oauth_access_tokens
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_oauth_refresh_tokens_updated ON public.agent_oauth_refresh_tokens;
CREATE TRIGGER trg_agent_oauth_refresh_tokens_updated
	BEFORE UPDATE ON public.agent_oauth_refresh_tokens
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agent_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own OAuth grants" ON public.agent_oauth_grants;
CREATE POLICY "Users can read own OAuth grants"
	ON public.agent_oauth_grants
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own OAuth access tokens" ON public.agent_oauth_access_tokens;
CREATE POLICY "Users can read own OAuth access tokens"
	ON public.agent_oauth_access_tokens
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own OAuth refresh tokens" ON public.agent_oauth_refresh_tokens;
CREATE POLICY "Users can read own OAuth refresh tokens"
	ON public.agent_oauth_refresh_tokens
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());
