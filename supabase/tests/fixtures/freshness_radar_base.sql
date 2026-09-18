-- supabase/tests/fixtures/freshness_radar_base.sql
-- TEST FIXTURE ONLY. Bootstraps a brand-new disposable PostgreSQL database for
-- the Jev freshness radar (Tasker 88) contract. Never apply this file to a local,
-- staging, or hosted Supabase database.
--
-- Layers:
--   1. agentic_chat_workflow_v1_base.sql: exact hosted chat_turn_runs, queue_jobs,
--      add_queue_job and terminal triggers (QA catalog extract, 2026-09-14).
--   2. Column-exact stubs for the tables the radar migrations touch but the
--      workflow fixture does not define: feature_flags, project_loop_runs,
--      project_suggestions and inbox_items, with their production CHECK
--      constraints (latest migration for each constraint).
--   3. The production project-access helpers used by the radar RLS policies.
-- The test file applies the 20260914 workflow migrations (chat_turn_workflow_runs)
-- and then the four radar migrations under test.

\ir agentic_chat_workflow_v1_base.sql

SET check_function_bodies = off;
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
	SELECT COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	)::text
$$;

-- Pre-migration baseline table (no creating migration in the repository).
CREATE TABLE public.feature_flags (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	feature_name text NOT NULL,
	enabled boolean NOT NULL DEFAULT false,
	enabled_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (user_id, feature_name)
);

-- 20260613000000_project_loops.sql (column-shaped).
CREATE TABLE public.project_loop_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL,
	trigger_reason text NOT NULL DEFAULT 'manual',
	status text NOT NULL DEFAULT 'queued',
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- 20260613000000 + 20260613010000 + 20260703010000 + 20260715010000 (+ later columns).
CREATE TABLE public.project_suggestions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.project_loop_runs(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	chat_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
	agent_run_id uuid,
	kind text NOT NULL,
	risk_tier int NOT NULL DEFAULT 1 CHECK (risk_tier BETWEEN 1 AND 3),
	title text NOT NULL,
	rationale text,
	why_now text,
	confidence numeric,
	evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
	preview jsonb,
	operations jsonb NOT NULL DEFAULT '[]'::jsonb,
	status text NOT NULL DEFAULT 'pending',
	freshness_state text NOT NULL DEFAULT 'unknown'
		CHECK (freshness_state IN ('fresh', 'changed', 'stale', 'unknown')),
	reversible boolean,
	undo_operations jsonb,
	source_fingerprint text,
	user_feedback jsonb,
	sort_order int NOT NULL DEFAULT 0,
	depends_on uuid REFERENCES public.project_suggestions(id) ON DELETE SET NULL,
	result jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz,
	applied_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT project_suggestions_kind_check
		CHECK (kind IN ('doc_org', 'doc_outdated', 'drift', 'task_conflict', 'audit_recommendation')),
	CONSTRAINT project_suggestions_status_check
		CHECK (status IN (
			'pending', 'approved', 'delegated', 'applied', 'addressed', 'rejected', 'superseded', 'failed'
		))
);

-- 20260624010000 + 20260718010000 + 20260814020000 (column-shaped, production checks).
CREATE TABLE public.inbox_items (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	source_type text NOT NULL,
	source_ref_id text NOT NULL,
	source_status text,
	user_id uuid,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	audience text NOT NULL DEFAULT 'user' CHECK (audience IN ('user', 'project_members')),
	status text NOT NULL DEFAULT 'pending',
	title text NOT NULL,
	summary text,
	risk_tier int CHECK (risk_tier BETWEEN 1 AND 3),
	action_kinds text[] NOT NULL DEFAULT '{}',
	blocked_reason text,
	snoozed_until timestamptz,
	expires_at timestamptz,
	decided_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT inbox_items_source_unique UNIQUE (source_type, source_ref_id),
	CONSTRAINT inbox_items_status_check
		CHECK (status IN ('pending', 'deciding', 'decided', 'blocked', 'expired', 'snoozed', 'deferred'))
);

-- Baseline helper (pre-migration). Resolves the signed-in user's actor.
CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT a.id FROM public.onto_actors a WHERE a.user_id = auth.uid() ORDER BY a.created_at LIMIT 1
$$;

-- Exact body from 20260320000002_project_sharing_access_fixes.sql.
CREATE OR REPLACE FUNCTION public.current_actor_has_project_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
	v_actor_id uuid;
BEGIN
	IF p_project_id IS NULL THEN
		RETURN false;
	END IF;

	IF auth.role() = 'service_role' THEN
		RETURN true;
	END IF;

	IF p_required_access = 'read' THEN
		IF EXISTS (
			SELECT 1 FROM onto_projects p
			WHERE p.id = p_project_id
				AND p.deleted_at IS NULL
				AND p.is_public = true
		) THEN
			RETURN true;
		END IF;
	END IF;

	IF is_admin() THEN
		RETURN true;
	END IF;

	v_actor_id := current_actor_id();
	IF v_actor_id IS NULL THEN
		RETURN false;
	END IF;

	IF EXISTS (
		SELECT 1 FROM onto_projects p
		WHERE p.id = p_project_id AND p.created_by = v_actor_id
	) THEN
		RETURN true;
	END IF;

	RETURN EXISTS (
		SELECT 1 FROM onto_project_members m
		WHERE m.project_id = p_project_id
			AND m.actor_id = v_actor_id
			AND m.removed_at IS NULL
			AND (
				(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin')) OR
				(p_required_access = 'write' AND m.access IN ('write', 'admin')) OR
				(p_required_access = 'admin' AND m.access = 'admin')
			)
	);
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_actor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_access(uuid, text) TO authenticated;

SET check_function_bodies = on;
