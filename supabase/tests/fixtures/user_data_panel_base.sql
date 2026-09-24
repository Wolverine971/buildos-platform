-- supabase/tests/fixtures/user_data_panel_base.sql
-- Minimal, column-shaped stand-ins for the tables and Supabase pieces that
-- 20260924190250_user_data_export_queue_type.sql and
-- 20260924190300_user_data_panel_and_exports.sql touch. Used only by the
-- disposable-Postgres test apps/worker/tests/userDataPanel.postgres.test.ts.

DO $roles$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE storage.buckets (
	id text PRIMARY KEY,
	name text NOT NULL,
	public boolean DEFAULT false,
	file_size_limit bigint,
	allowed_mime_types text[]
);

CREATE TABLE storage.objects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	bucket_id text NOT NULL,
	name text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.queue_type AS ENUM ('other');

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	job_type public.queue_type NOT NULL,
	metadata jsonb,
	priority integer,
	dedup_key text,
	status text NOT NULL DEFAULT 'pending'
);
GRANT ALL ON public.queue_jobs TO service_role;

-- Service-role only, like production (20260801030600).
CREATE FUNCTION public.add_queue_job(
	p_user_id uuid,
	p_job_type text,
	p_metadata jsonb,
	p_priority integer DEFAULT 10,
	p_scheduled_for timestamptz DEFAULT now(),
	p_dedup_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_id uuid;
BEGIN
	INSERT INTO public.queue_jobs (user_id, job_type, metadata, priority, dedup_key)
	VALUES (p_user_id, p_job_type::public.queue_type, p_metadata, p_priority, p_dedup_key)
	RETURNING id INTO v_id;
	RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	TO service_role;

CREATE TABLE public.users (
	id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	deletion_status text CHECK (deletion_status IS NULL OR deletion_status IN ('pending', 'processing'))
);

CREATE TABLE public.onto_actors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.onto_projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.onto_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.onto_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.onto_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.chat_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, session_id uuid, role text NOT NULL);
CREATE TABLE public.chat_tool_executions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL);
CREATE TABLE public.chat_prompt_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE public.llm_usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE public.voice_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.ontology_daily_briefs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE public.user_email_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	status text NOT NULL DEFAULT 'active',
	read_enabled boolean NOT NULL DEFAULT true,
	deleted_at timestamptz
);
CREATE TABLE public.email_access_audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	operation text NOT NULL,
	outcome text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_calendar_tokens (
	user_id uuid PRIMARY KEY,
	access_token text NOT NULL,
	refresh_token text,
	updated_at timestamptz
);
CREATE TABLE public.user_calendar_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	status text NOT NULL DEFAULT 'active',
	deleted_at timestamptz,
	last_used_at timestamptz,
	last_verified_at timestamptz
);
CREATE TABLE public.external_agent_callers (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	provider text NOT NULL,
	status text NOT NULL DEFAULT 'trusted',
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	token_hash text NOT NULL DEFAULT 'hash',
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
