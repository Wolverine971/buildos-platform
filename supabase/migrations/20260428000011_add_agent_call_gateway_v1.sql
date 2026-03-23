-- supabase/migrations/20260428000011_add_agent_call_gateway_v1.sql
-- Add BuildOS user agent identities, external callers, and call sessions for the
-- external agent call gateway v1.

CREATE TABLE IF NOT EXISTS public.user_buildos_agents (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
	agent_handle TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'paused', 'revoked')),
	default_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.external_agent_callers (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	provider TEXT NOT NULL,
	caller_key TEXT NOT NULL,
	token_prefix TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'trusted'
		CHECK (status IN ('trusted', 'pending', 'revoked')),
	policy JSONB NOT NULL DEFAULT '{}'::jsonb,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	last_used_at TIMESTAMPTZ NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT external_agent_callers_user_provider_key_unique
		UNIQUE (user_id, provider, caller_key)
);

CREATE TABLE IF NOT EXISTS public.agent_call_sessions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	user_buildos_agent_id UUID NOT NULL REFERENCES public.user_buildos_agents(id) ON DELETE CASCADE,
	external_agent_caller_id UUID NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	direction TEXT NOT NULL DEFAULT 'inbound'
		CHECK (direction IN ('inbound', 'outbound')),
	status TEXT NOT NULL
		CHECK (status IN ('accepted', 'rejected', 'active', 'ended')),
	requested_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
	granted_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
	rejection_reason TEXT NULL,
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	ended_at TIMESTAMPTZ NULL,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_buildos_agents_user_id
	ON public.user_buildos_agents(user_id);

CREATE INDEX IF NOT EXISTS idx_external_agent_callers_user_status
	ON public.external_agent_callers(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_agent_callers_provider_key
	ON public.external_agent_callers(provider, caller_key);

CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_user_status
	ON public.agent_call_sessions(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_agent_status
	ON public.agent_call_sessions(user_buildos_agent_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_caller_status
	ON public.agent_call_sessions(external_agent_caller_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_user_buildos_agents_updated ON public.user_buildos_agents;
CREATE TRIGGER trg_user_buildos_agents_updated
	BEFORE UPDATE ON public.user_buildos_agents
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_external_agent_callers_updated ON public.external_agent_callers;
CREATE TRIGGER trg_external_agent_callers_updated
	BEFORE UPDATE ON public.external_agent_callers
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_call_sessions_updated ON public.agent_call_sessions;
CREATE TRIGGER trg_agent_call_sessions_updated
	BEFORE UPDATE ON public.agent_call_sessions
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_buildos_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_agent_callers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own buildos agents" ON public.user_buildos_agents;
CREATE POLICY "Users can read own buildos agents"
	ON public.user_buildos_agents
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own external callers" ON public.external_agent_callers;
CREATE POLICY "Users can read own external callers"
	ON public.external_agent_callers
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own agent call sessions" ON public.agent_call_sessions;
CREATE POLICY "Users can read own agent call sessions"
	ON public.agent_call_sessions
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());
