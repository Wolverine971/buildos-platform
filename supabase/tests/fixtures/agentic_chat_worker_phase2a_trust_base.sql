-- supabase/tests/fixtures/agentic_chat_worker_phase2a_trust_base.sql
\ir agentic_chat_legacy_atomic_admission_base.sql

ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TYPE public.queue_type AS ENUM (
	'other',
	'agent_run'
);

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	job_type public.queue_type NOT NULL DEFAULT 'other'
);

CREATE TABLE public.agentic_chat_prepared_prompts (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	context_type text NOT NULL,
	entity_id uuid,
	project_id uuid,
	context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	history_for_model jsonb NOT NULL DEFAULT '[]'::jsonb,
	prepared_surfaces jsonb NOT NULL DEFAULT '{}'::jsonb,
	default_surface_profile text NOT NULL DEFAULT 'lite',
	context_payload_sha256 text NOT NULL DEFAULT repeat('a', 64),
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
	consumed_at timestamptz
);

CREATE TABLE public.chat_prompt_snapshots (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.chat_turn_events (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.chat_turn_checkpoints (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	digest jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.agentic_chat_prepared_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_prompt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_turn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_turn_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY prepared_prompts_user_insert
	ON public.agentic_chat_prepared_prompts
	FOR INSERT TO authenticated
	WITH CHECK (true);
CREATE POLICY prepared_prompts_user_select
	ON public.agentic_chat_prepared_prompts
	FOR SELECT TO authenticated
	USING (true);
CREATE POLICY prepared_prompts_user_update
	ON public.agentic_chat_prepared_prompts
	FOR UPDATE TO authenticated
	USING (true) WITH CHECK (true);
CREATE POLICY prepared_prompts_admin_select
	ON public.agentic_chat_prepared_prompts
	FOR SELECT TO authenticated
	USING (true);

CREATE POLICY chat_prompt_snapshots_user_insert
	ON public.chat_prompt_snapshots
	FOR INSERT TO authenticated
	WITH CHECK (true);
CREATE POLICY chat_turn_events_user_insert
	ON public.chat_turn_events
	FOR INSERT TO authenticated
	WITH CHECK (true);
CREATE POLICY chat_turn_checkpoints_user_insert
	ON public.chat_turn_checkpoints
	FOR INSERT TO authenticated
	WITH CHECK (true);
CREATE POLICY chat_turn_checkpoints_user_update
	ON public.chat_turn_checkpoints
	FOR UPDATE TO authenticated
	USING (true) WITH CHECK (true);

CREATE POLICY chat_turn_runs_user_insert
	ON public.chat_turn_runs
	FOR INSERT TO authenticated
	WITH CHECK (true);
CREATE POLICY chat_turn_runs_user_update
	ON public.chat_turn_runs
	FOR UPDATE TO authenticated
	USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.agentic_chat_prepared_prompts,
		public.chat_prompt_snapshots,
		public.chat_turn_runs,
		public.chat_turn_events,
		public.chat_turn_checkpoints
	TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.agentic_chat_prepared_prompts,
		public.chat_prompt_snapshots,
		public.chat_turn_runs,
		public.chat_turn_events,
		public.chat_turn_checkpoints
	TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
	TO authenticated, service_role;
