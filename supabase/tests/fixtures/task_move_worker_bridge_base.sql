-- Minimal disposable-PostgreSQL base for the task-move worker bridge proof.

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

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.users (
	id uuid PRIMARY KEY,
	email text NOT NULL UNIQUE
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY,
	kind text NOT NULL,
	name text NOT NULL,
	user_id uuid UNIQUE REFERENCES public.users(id)
);

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	name text NOT NULL,
	type_key text NOT NULL,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id)
);

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.onto_projects project
		WHERE project.id = p_project_id
			AND project.created_by = p_actor_id
			AND p_required_access = 'write'
	);
$$;

CREATE OR REPLACE FUNCTION public.onto_task_move_atomic(
	p_task_id uuid,
	p_expected_source_project_id uuid,
	p_destination_project_id uuid,
	p_confirmation_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'task_id', p_task_id,
		'source_project_id', p_expected_source_project_id,
		'destination_project_id', p_destination_project_id,
		'confirmation_token', p_confirmation_token
	);
$$;
