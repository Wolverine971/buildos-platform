-- supabase/migrations/20260213000000_add_behavioral_profile_layers.sql
-- Layered behavioral profile storage for fast, deterministic agent context injection.

CREATE TABLE IF NOT EXISTS public.user_behavioral_profiles (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	user_context JSONB NOT NULL DEFAULT '{}'::jsonb,
	project_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
	dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
	patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
	agent_instructions TEXT NOT NULL DEFAULT '',
	session_count INTEGER NOT NULL DEFAULT 0,
	analysis_version INTEGER NOT NULL DEFAULT 0,
	confidence REAL NOT NULL DEFAULT 0.0,
	next_analysis_trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
	computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_behavioral_profiles_user_updated
	ON public.user_behavioral_profiles(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_project_behavioral_profiles (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id UUID NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
	patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
	agent_instructions TEXT NOT NULL DEFAULT '',
	confidence REAL NOT NULL DEFAULT 0.0,
	session_count INTEGER NOT NULL DEFAULT 0,
	computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_behavioral_profiles_user
	ON public.user_project_behavioral_profiles(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_project_behavioral_profiles_project
	ON public.user_project_behavioral_profiles(project_id, updated_at DESC);

ALTER TABLE public.user_behavioral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_project_behavioral_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own behavioral profile" ON public.user_behavioral_profiles;
CREATE POLICY "Users read own behavioral profile"
	ON public.user_behavioral_profiles
	FOR SELECT
	USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own project behavioral profile" ON public.user_project_behavioral_profiles;
CREATE POLICY "Users read own project behavioral profile"
	ON public.user_project_behavioral_profiles
	FOR SELECT
	USING (auth.uid() = user_id);
