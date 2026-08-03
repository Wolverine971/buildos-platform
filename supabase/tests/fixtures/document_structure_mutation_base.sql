-- supabase/tests/fixtures/document_structure_mutation_base.sql
-- Minimal disposable-database fixture for the atomic document-structure RPC.

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

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE TYPE public.document_state AS ENUM (
	'draft',
	'review',
	'published',
	'in_review',
	'ready',
	'archived'
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY
);

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	deleted_at timestamptz,
	doc_structure jsonb
);

CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL DEFAULT 'Untitled',
	type_key text NOT NULL DEFAULT 'document.default',
	state_key public.document_state NOT NULL DEFAULT 'draft',
	children jsonb,
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz
);

CREATE TABLE public.onto_project_structure_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	doc_structure jsonb NOT NULL,
	version integer NOT NULL,
	changed_by uuid REFERENCES public.onto_actors(id),
	changed_at timestamptz DEFAULT now(),
	change_type text NOT NULL
);

CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('test.actor_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
	SELECT
		p_project_id IS NOT NULL
		AND p_required_access IN ('read', 'write', 'admin')
		AND coalesce(nullif(current_setting('test.allow_project_write', true), ''), 'false')::boolean;
$$;
