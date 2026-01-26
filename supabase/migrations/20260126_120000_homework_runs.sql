-- supabase/migrations/20260126_120000_homework_runs.sql
-- Description: Adds Homework runs (long-running tasks) tables + queue type

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'buildos_homework';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Enums
-- ============================================

DO $$ BEGIN
	CREATE TYPE homework_run_status AS ENUM (
		'queued',
		'running',
		'waiting_on_user',
		'completed',
		'stopped',
		'canceled',
		'failed'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE homework_iteration_status AS ENUM (
		'success',
		'failed',
		'waiting_on_user'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS homework_runs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
	objective TEXT NOT NULL,
	scope TEXT NOT NULL DEFAULT 'global',
	project_ids UUID[] NULL,
	status homework_run_status NOT NULL DEFAULT 'queued',
	iteration INTEGER NOT NULL DEFAULT 0,
	max_iterations INTEGER NULL,
	started_at TIMESTAMPTZ NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_at TIMESTAMPTZ NULL,
	duration_ms INTEGER NULL,
	budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
	metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
	stop_reason JSONB NULL,
	completion_criteria JSONB NULL,
	last_error_fingerprint TEXT NULL,
	report JSONB NULL,
	workspace_document_id UUID NULL REFERENCES onto_documents(id) ON DELETE SET NULL,
	workspace_project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_run_iterations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES homework_runs(id) ON DELETE CASCADE,
	iteration INTEGER NOT NULL,
	branch_id TEXT NULL,
	started_at TIMESTAMPTZ NULL,
	ended_at TIMESTAMPTZ NULL,
	summary TEXT NULL,
	status homework_iteration_status NOT NULL DEFAULT 'success',
	progress_delta JSONB NULL,
	error TEXT NULL,
	error_fingerprint TEXT NULL,
	metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
	artifacts JSONB NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_run_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES homework_runs(id) ON DELETE CASCADE,
	iteration INTEGER NOT NULL,
	seq INTEGER NOT NULL,
	event JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Constraints & Indexes
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_runs_chat_session
	ON homework_runs(chat_session_id)
	WHERE chat_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_homework_runs_user_status
	ON homework_runs(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_homework_runs_created_at
	ON homework_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_homework_runs_scope
	ON homework_runs(scope);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_run_iterations_unique
	ON homework_run_iterations(run_id, iteration, COALESCE(branch_id, 'main'));

CREATE INDEX IF NOT EXISTS idx_homework_run_iterations_run
	ON homework_run_iterations(run_id, iteration);

CREATE INDEX IF NOT EXISTS idx_homework_run_iterations_status
	ON homework_run_iterations(run_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_run_events_seq
	ON homework_run_events(run_id, seq);

CREATE INDEX IF NOT EXISTS idx_homework_run_events_run
	ON homework_run_events(run_id, created_at DESC);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE homework_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_run_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_run_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own runs
CREATE POLICY homework_runs_user_select
	ON homework_runs FOR SELECT
	USING (auth.uid() = user_id);

-- Users can read their iterations/events via run ownership
CREATE POLICY homework_iterations_user_select
	ON homework_run_iterations FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM homework_runs r
			WHERE r.id = homework_run_iterations.run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY homework_events_user_select
	ON homework_run_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM homework_runs r
			WHERE r.id = homework_run_events.run_id
			AND r.user_id = auth.uid()
		)
	);

-- Service role can manage all homework data
CREATE POLICY homework_runs_service_role
	ON homework_runs FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY homework_iterations_service_role
	ON homework_run_iterations FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY homework_events_service_role
	ON homework_run_events FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

-- Admins can read all homework data
CREATE POLICY homework_runs_admin_select
	ON homework_runs FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM admin_users
			WHERE admin_users.user_id = auth.uid()
		)
	);

CREATE POLICY homework_iterations_admin_select
	ON homework_run_iterations FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM homework_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = homework_run_iterations.run_id
		)
	);

CREATE POLICY homework_events_admin_select
	ON homework_run_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM homework_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = homework_run_events.run_id
		)
	);
