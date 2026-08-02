-- supabase/tests/fixtures/question_tree_minimal_base.sql
-- Minimal disposable PostgreSQL base for the Question Tree migration contract.
-- This is not a production migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
	id uuid PRIMARY KEY,
	instance_id uuid,
	aud text,
	role text,
	email text,
	encrypted_password text,
	email_confirmed_at timestamptz,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.admin_users (
	user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TYPE public.queue_type AS ENUM ('other');
CREATE TYPE public.queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying');

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	queue_job_id text NOT NULL UNIQUE,
	user_id uuid NOT NULL REFERENCES auth.users(id),
	job_type public.queue_type NOT NULL,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	status public.queue_status NOT NULL DEFAULT 'pending',
	priority integer NOT NULL DEFAULT 10,
	scheduled_for timestamptz NOT NULL DEFAULT now(),
	dedup_key text,
	error_message text,
	completed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX queue_jobs_active_dedup_idx
	ON public.queue_jobs(dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

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
AS $$
DECLARE
	v_job_id uuid;
BEGIN
	INSERT INTO public.queue_jobs (
		queue_job_id, user_id, job_type, metadata, priority, scheduled_for, dedup_key
	) VALUES (
		p_job_type || '_' || gen_random_uuid()::text,
		p_user_id,
		p_job_type::public.queue_type,
		coalesce(p_metadata, '{}'::jsonb),
		p_priority,
		p_scheduled_for,
		p_dedup_key
	)
	ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
	DO UPDATE SET dedup_key = EXCLUDED.dedup_key
	RETURNING id INTO v_job_id;
	RETURN v_job_id;
END;
$$;
