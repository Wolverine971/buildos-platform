-- supabase/tests/fixtures/relationship_plan_base.sql
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

CREATE TYPE public.goal_state AS ENUM ('draft', 'active', 'achieved', 'abandoned');
CREATE TYPE public.plan_state AS ENUM ('draft', 'active', 'completed');
CREATE TYPE public.task_state AS ENUM ('todo', 'in_progress', 'blocked', 'done');

CREATE TABLE public.onto_goals (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	name text NOT NULL,
	type_key text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	goal text,
	description text,
	target_date timestamptz,
	state_key public.goal_state NOT NULL DEFAULT 'draft',
	completed_at timestamptz,
	archived_at timestamptz,
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
	state_key public.plan_state NOT NULL DEFAULT 'draft',
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	plan text,
	description text,
	archived_at timestamptz,
	deleted_at timestamptz
);

CREATE TABLE public.onto_tasks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL,
	type_key text NOT NULL DEFAULT 'task.default',
	state_key public.task_state NOT NULL DEFAULT 'todo',
	priority integer,
	start_at timestamptz,
	due_at timestamptz,
	completed_at timestamptz,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	idempotency_key text,
	archived_at timestamptz,
	deleted_at timestamptz
);

CREATE TABLE public.onto_task_assignees (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	task_id uuid NOT NULL REFERENCES public.onto_tasks(id) ON DELETE CASCADE,
	assignee_actor_id uuid NOT NULL REFERENCES public.onto_actors(id),
	assigned_by_actor_id uuid NOT NULL REFERENCES public.onto_actors(id),
	source text NOT NULL DEFAULT 'manual',
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT onto_task_assignees_unique_task_actor UNIQUE (task_id, assignee_actor_id)
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

CREATE OR REPLACE FUNCTION public.current_actor_has_project_access(
	p_project_id uuid,
	p_required_access text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
	SELECT coalesce(auth.role(), '') = 'service_role';
$$;
