-- TEST FIXTURE ONLY: bootstrap a new disposable PostgreSQL database for the
-- Cycles foundation migration. Existing application tables intentionally make
-- this fixture fail; never apply it to local, staging, or hosted Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;

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

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TYPE public.queue_type AS ENUM ('generate_daily_brief');
CREATE TYPE public.queue_status AS ENUM (
	'pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying'
);

CREATE TABLE public.users (
	id uuid PRIMARY KEY,
	name text,
	email text
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid UNIQUE REFERENCES public.users(id),
	kind text NOT NULL DEFAULT 'human',
	name text,
	email text
);

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_project_members (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	actor_id uuid NOT NULL REFERENCES public.onto_actors(id),
	access text NOT NULL,
	removed_at timestamptz,
	UNIQUE (project_id, actor_id)
);

CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_actor_id uuid;
BEGIN
	SELECT id INTO v_actor_id
	FROM public.onto_actors
	WHERE user_id = p_user_id;

	IF v_actor_id IS NULL THEN
		INSERT INTO public.onto_actors (user_id)
		VALUES (p_user_id)
		RETURNING id INTO v_actor_id;
	END IF;

	RETURN v_actor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.onto_projects project
		WHERE project.id = p_project_id
			AND project.deleted_at IS NULL
			AND (
				project.created_by = p_actor_id
				OR EXISTS (
					SELECT 1
					FROM public.onto_project_members member
					WHERE member.project_id = project.id
						AND member.actor_id = p_actor_id
						AND member.removed_at IS NULL
						AND (
							(p_required_access = 'read' AND member.access IN ('read', 'write', 'admin'))
							OR (p_required_access = 'write' AND member.access IN ('write', 'admin'))
							OR (p_required_access = 'admin' AND member.access = 'admin')
						)
				)
			)
	);
$$;

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	queue_job_id text NOT NULL UNIQUE,
	user_id uuid NOT NULL REFERENCES public.users(id),
	job_type public.queue_type NOT NULL,
	status public.queue_status NOT NULL DEFAULT 'pending',
	metadata jsonb,
	priority integer DEFAULT 10,
	scheduled_for timestamptz NOT NULL DEFAULT now(),
	dedup_key text,
	attempts integer DEFAULT 0,
	max_attempts integer DEFAULT 3,
	processing_token uuid,
	result jsonb,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz,
	started_at timestamptz,
	processed_at timestamptz,
	completed_at timestamptz
);

CREATE UNIQUE INDEX queue_jobs_active_dedup_idx
	ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing');

CREATE TABLE public.notification_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	event_source text NOT NULL,
	target_user_id uuid REFERENCES public.users(id),
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.add_queue_job(
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
	INSERT INTO public.queue_jobs (
		queue_job_id, user_id, job_type, status, metadata, priority, scheduled_for, dedup_key
	) VALUES (
		p_job_type || '_' || gen_random_uuid()::text,
		p_user_id,
		p_job_type::public.queue_type,
		'pending',
		p_metadata,
		p_priority,
		p_scheduled_for,
		p_dedup_key
	)
	ON CONFLICT (dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
	DO NOTHING
	RETURNING id INTO v_id;

	IF v_id IS NULL THEN
		SELECT id INTO v_id
		FROM public.queue_jobs
		WHERE dedup_key = p_dedup_key AND status IN ('pending', 'processing')
		ORDER BY created_at
		LIMIT 1;
	END IF;

	RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	TO service_role;
