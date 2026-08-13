-- supabase/tests/fixtures/agentic_chat_research_capture_base.sql
-- Disposable-only fixture for P4 S5 deterministic research capture.
CREATE SCHEMA IF NOT EXISTS public;
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
	ELSE
		ALTER ROLE service_role BYPASSRLS;
	END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.users (id uuid PRIMARY KEY);
CREATE TABLE public.chat_sessions (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id)
);
CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id),
	job_type text NOT NULL,
	status text NOT NULL,
	processing_token uuid,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY,
	queue_job_id uuid REFERENCES public.queue_jobs(id),
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id),
	user_id uuid NOT NULL REFERENCES public.users(id),
	correlation_id uuid NOT NULL,
	execution_mode text NOT NULL,
	execution_generation integer NOT NULL,
	status text NOT NULL,
	stream_run_id text NOT NULL,
	project_id uuid,
	execution_started_at timestamptz,
	terminalized_at timestamptz,
	cancel_requested_at timestamptz,
	mutation_reserved_at timestamptz,
	irreversible_boundary_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	UNIQUE (id, session_id, user_id)
);
CREATE TABLE public.chat_tool_executions (
	id uuid PRIMARY KEY,
	turn_run_id uuid REFERENCES public.chat_turn_runs(id),
	sequence_index integer,
	tool_name text NOT NULL,
	arguments jsonb,
	result jsonb,
	success boolean NOT NULL,
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY,
	user_id uuid UNIQUE REFERENCES public.users(id)
);
CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id),
	deleted_at timestamptz
);
CREATE TABLE public.onto_project_members (
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	actor_id uuid NOT NULL REFERENCES public.onto_actors(id),
	access text NOT NULL,
	removed_at timestamptz
);
CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL,
	type_key text NOT NULL,
	state_key text NOT NULL DEFAULT 'draft',
	content text,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id),
	deleted_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
	SELECT EXISTS (
		SELECT 1 FROM public.onto_projects projects
		WHERE projects.id = p_project_id
			AND projects.deleted_at IS NULL
			AND projects.created_by = p_actor_id
	) OR EXISTS (
		SELECT 1 FROM public.onto_project_members members
		WHERE members.project_id = p_project_id
			AND members.actor_id = p_actor_id
			AND members.removed_at IS NULL
			AND (
				(p_required_access = 'read' AND members.access IN ('read', 'write', 'admin'))
				OR (p_required_access = 'write' AND members.access IN ('write', 'admin'))
				OR (p_required_access = 'admin' AND members.access = 'admin')
			)
	);
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text)
	TO service_role;

-- Install the already-hosted effect table and immutable lifecycle trigger.
\ir ../../../supabase/migrations/20260801041000_agentic_chat_worker_effect_foundation.sql

INSERT INTO public.users(id) VALUES
	('aa100000-0000-4000-8000-000000000001'),
	('aa100000-0000-4000-8000-000000000002');
INSERT INTO public.chat_sessions(id, user_id) VALUES
	('aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001'),
	('aa200000-0000-4000-8000-000000000002', 'aa100000-0000-4000-8000-000000000002');
INSERT INTO public.onto_actors(id, user_id) VALUES
	('aa300000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001'),
	('aa300000-0000-4000-8000-000000000002', 'aa100000-0000-4000-8000-000000000002');
INSERT INTO public.onto_projects(id, created_by) VALUES
	('aa400000-0000-4000-8000-000000000001', 'aa300000-0000-4000-8000-000000000001'),
	('aa400000-0000-4000-8000-000000000002', 'aa300000-0000-4000-8000-000000000002');

INSERT INTO public.queue_jobs(
	id, user_id, job_type, status, processing_token, metadata
) VALUES (
	'aa500000-0000-4000-8000-000000000001',
	'aa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn', 'processing', 'aa600000-0000-4000-8000-000000000001',
	'{"turnRunId":"aa700000-0000-4000-8000-000000000001","correlationId":"aa800000-0000-4000-8000-000000000001"}'::jsonb
);
INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, stream_run_id, project_id, execution_started_at
) VALUES (
	'aa700000-0000-4000-8000-000000000001',
	'aa500000-0000-4000-8000-000000000001',
	'aa200000-0000-4000-8000-000000000001',
	'aa100000-0000-4000-8000-000000000001',
	'aa800000-0000-4000-8000-000000000001',
	'worker_realtime', 1, 'running', 'stream-research-1',
	'aa400000-0000-4000-8000-000000000001', transaction_timestamp()
);
INSERT INTO public.chat_tool_executions(
	id, turn_run_id, sequence_index, tool_name, arguments, result, success, created_at
) VALUES
	(
		'aa900000-0000-4000-8000-000000000001',
		'aa700000-0000-4000-8000-000000000001', 1, 'web_search',
		'{"query":"durable research"}',
		'{"answer":"Durable evidence wins.","results":[{"url":"https://example.com/a"}]}',
		true, '2026-08-13T14:00:00Z'
	),
	(
		'aa900000-0000-4000-8000-000000000002',
		'aa700000-0000-4000-8000-000000000001', 2, 'util.web.visit',
		'{"url":"https://example.com/b"}', '{"error":"upstream timeout"}',
		false, '2026-08-13T14:01:00Z'
	),
	(
		'aa900000-0000-4000-8000-000000000003',
		'aa700000-0000-4000-8000-000000000001', 3, 'onto_project_read',
		'{}', '{"url":"https://ignored.example"}', true, '2026-08-13T14:02:00Z'
	);
