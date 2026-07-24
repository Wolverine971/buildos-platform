-- Minimal disposable-only platform schema for the Gmail relevance SQL harnesses.
-- This is not a production migration. Never apply it to a linked Supabase project.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN BYPASSRLS;
	END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	created_by uuid NOT NULL,
	name text NOT NULL DEFAULT 'Synthetic project',
	deleted_at timestamptz
);

CREATE TABLE public.onto_project_members (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	actor_id uuid NOT NULL REFERENCES public.onto_actors(id) ON DELETE CASCADE,
	role_key text NOT NULL,
	removed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- The Gmail relevance migrations depend only on this narrowed connection shape. The full Gmail
-- connection migration is tested separately and is intentionally not replayed in this harness.
CREATE TABLE public.user_email_connections (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	provider text NOT NULL,
	status text NOT NULL,
	read_enabled boolean NOT NULL DEFAULT true,
	deleted_at timestamptz
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;
