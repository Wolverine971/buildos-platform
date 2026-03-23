-- supabase/migrations/20260428000012_add_agent_call_bootstrap_links.sql
-- Add short-lived bootstrap links so external agents like OpenClaw can fetch
-- setup instructions and credentials without requiring the user to paste
-- secrets directly into chat.

CREATE TABLE IF NOT EXISTS public.agent_call_bootstrap_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id UUID NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	setup_token_hash TEXT NOT NULL UNIQUE,
	payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	expires_at TIMESTAMPTZ NOT NULL,
	last_accessed_at TIMESTAMPTZ NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_call_bootstrap_links_caller_id
	ON public.agent_call_bootstrap_links(external_agent_caller_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_call_bootstrap_links_user_id
	ON public.agent_call_bootstrap_links(user_id, expires_at DESC);

DROP TRIGGER IF EXISTS trg_agent_call_bootstrap_links_updated ON public.agent_call_bootstrap_links;
CREATE TRIGGER trg_agent_call_bootstrap_links_updated
	BEFORE UPDATE ON public.agent_call_bootstrap_links
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agent_call_bootstrap_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own agent call bootstrap links" ON public.agent_call_bootstrap_links;
CREATE POLICY "Users can read own agent call bootstrap links"
	ON public.agent_call_bootstrap_links
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());
