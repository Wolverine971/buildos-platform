-- Minimal disposable schema for atomic relationship-plan migration tests.
-- This is not a production schema source.

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY
);

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	name text NOT NULL,
	type_key text NOT NULL,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_goals (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	name text NOT NULL,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_milestones (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_plans (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	name text NOT NULL,
	type_key text NOT NULL,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_tasks (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	deleted_at timestamptz
);

CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL,
	type_key text NOT NULL,
	created_by uuid NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.onto_risks (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	deleted_at timestamptz
);

CREATE TABLE public.onto_requirements (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	deleted_at timestamptz
);

CREATE TABLE public.onto_metrics (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id)
);

CREATE TABLE public.onto_sources (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id)
);

CREATE TABLE public.onto_events (
	id uuid PRIMARY KEY,
	project_id uuid REFERENCES public.onto_projects(id),
	deleted_at timestamptz
);

CREATE TABLE public.onto_edges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	src_kind text NOT NULL,
	src_id uuid NOT NULL,
	rel text NOT NULL,
	dst_kind text NOT NULL,
	dst_id uuid NOT NULL,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
	SELECT false;
$$;
