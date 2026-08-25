-- supabase/tests/fixtures/ontology_actor_access_base.sql
-- Minimal disposable schema for ontology actor/access RPC verification.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
		CREATE ROLE supabase_admin NOLOGIN;
	END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
	SELECT COALESCE(
		NULLIF(current_setting('request.jwt.claim.sub', true), ''),
		NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
	)::uuid
$$;

CREATE TABLE public.users (
	id uuid PRIMARY KEY,
	name text,
	email text
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind text,
	name text,
	email text,
	user_id uuid,
	org_id uuid
);

CREATE UNIQUE INDEX idx_onto_actors_user_id_unique
	ON public.onto_actors(user_id)
	WHERE user_id IS NOT NULL;

CREATE INDEX idx_onto_actors_user_id
	ON public.onto_actors(user_id)
	WHERE user_id IS NOT NULL;

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	name text,
	type_key text,
	created_by uuid,
	deleted_at timestamptz
);

CREATE TABLE public.onto_project_members (
	project_id uuid NOT NULL,
	actor_id uuid NOT NULL,
	access text NOT NULL,
	removed_at timestamptz
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
	SELECT false
$$;

CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT a.id
	FROM public.onto_actors AS a
	WHERE a.user_id = auth.uid()
	LIMIT 1
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.onto_actors TO authenticated, service_role;
