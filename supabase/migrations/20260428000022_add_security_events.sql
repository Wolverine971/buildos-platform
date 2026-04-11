-- supabase/migrations/20260428000022_add_security_events.sql
-- Canonical security event stream for auth, agent, access, detection, webhook,
-- and integration posture. Keep raw secrets and sensitive content out of this table.

CREATE TABLE IF NOT EXISTS public.security_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now(),
	event_type text NOT NULL,
	category text NOT NULL CHECK (
		category IN (
			'auth',
			'agent',
			'access',
			'admin',
			'detection',
			'webhook',
			'integration',
			'system'
		)
	),
	outcome text NOT NULL CHECK (
		outcome IN ('success', 'failure', 'blocked', 'allowed', 'denied', 'info')
	),
	severity text NOT NULL DEFAULT 'info' CHECK (
		severity IN ('info', 'low', 'medium', 'high', 'critical')
	),
	actor_type text NOT NULL DEFAULT 'system' CHECK (
		actor_type IN ('anonymous', 'user', 'admin', 'external_agent', 'system')
	),
	actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	external_agent_caller_id uuid REFERENCES public.external_agent_callers(id) ON DELETE SET NULL,
	target_type text,
	target_id text,
	request_id text,
	session_id text,
	ip_address inet,
	user_agent text,
	risk_score integer CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
	reason text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_events_select_admin ON public.security_events;
CREATE POLICY security_events_select_admin
	ON public.security_events
	FOR SELECT
	USING (is_admin());

DROP POLICY IF EXISTS security_events_insert_admin ON public.security_events;
CREATE POLICY security_events_insert_admin
	ON public.security_events
	FOR INSERT
	WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
	ON public.security_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_category_created_at
	ON public.security_events (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_created_at
	ON public.security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_outcome_created_at
	ON public.security_events (outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_actor_user_created_at
	ON public.security_events (actor_user_id, created_at DESC)
	WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_external_agent_created_at
	ON public.security_events (external_agent_caller_id, created_at DESC)
	WHERE external_agent_caller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_metadata_gin
	ON public.security_events USING gin (metadata);
