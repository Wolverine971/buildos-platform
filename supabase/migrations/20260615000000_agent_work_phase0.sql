-- supabase/migrations/20260615000000_agent_work_phase0.sql
-- Agent Work — Phase 0 (Contracts & Schema)
-- Design: apps/web/docs/technical/architecture/agent-work/
--   00-OVERVIEW · 01-EXECUTION-SUBSTRATE · 02-STAGED-MUTATIONS · 03-MONITORING-UI
--
-- Creates the durable execution substrate tables for Agent Runs, mirroring the
-- buildos_tree_agent two-table (runs + events) pattern, plus a control-signal
-- table for steering/interruption. No behavior yet — the worker runner is Phase 1.

-- ============================================
-- Queue type
-- ============================================

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'agent_run';
EXCEPTION
	WHEN duplicate_object THEN NULL;
	WHEN undefined_object THEN NULL;
END $$;

-- ============================================
-- Enums
-- ============================================

DO $$ BEGIN
	CREATE TYPE agent_run_status AS ENUM (
		'queued',
		'running',
		'paused',
		'needs_input',
		'proposal_ready',
		'completed',
		'partial',
		'failed',
		'cancelled'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE agent_run_trigger AS ENUM (
		'chat',
		'manual',
		'scheduled',
		'event'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE agent_run_signal_kind AS ENUM (
		'steer',
		'pause',
		'resume',
		'cancel'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS agent_runs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

	-- provenance / supervision
	trigger agent_run_trigger NOT NULL,
	parent_run_id UUID NULL REFERENCES agent_runs(id) ON DELETE SET NULL,
	parent_session_id UUID NULL,
	parent_message_id UUID NULL,
	depth INTEGER NOT NULL DEFAULT 0,
	operative_id UUID NULL,

	-- the brief
	label TEXT NOT NULL,
	goal TEXT NOT NULL,
	instructions TEXT NULL,
	expected_output TEXT NULL,
	context_type TEXT NOT NULL,
	project_id UUID NULL REFERENCES onto_projects(id) ON DELETE SET NULL,
	allowed_capabilities TEXT[] NULL,
	review_required BOOLEAN NOT NULL DEFAULT FALSE,

	-- lifecycle
	status agent_run_status NOT NULL DEFAULT 'queued',
	result JSONB NULL,
	change_set JSONB NULL,
	budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
	metrics JSONB NULL,
	error TEXT NULL,

	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	started_at TIMESTAMPTZ NULL,
	completed_at TIMESTAMPTZ NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- depth cap by construction: 0 = top-level, 1 = subagent (max)
	CONSTRAINT agent_runs_depth_range CHECK (depth >= 0 AND depth <= 1),
	CONSTRAINT agent_runs_context_type CHECK (context_type IN ('project', 'global'))
);

-- Immutable event log for the UI trace + observability (mirrors tree_agent_events).
CREATE TABLE IF NOT EXISTS agent_run_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
	seq BIGINT NULL,
	event_type TEXT NOT NULL,
	payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Control signals drained by the worker runner between loop iterations (01 §9).
CREATE TABLE IF NOT EXISTS agent_run_signals (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
	kind agent_run_signal_kind NOT NULL,
	payload JSONB NULL,
	source TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	consumed_at TIMESTAMPTZ NULL,
	CONSTRAINT agent_run_signals_source CHECK (source IN ('user', 'orchestrator'))
);

-- Telemetry link: tag a run's tool executions so entities_touched is reconstructed
-- from ground truth (01 §5). Worker runner writes via ChatToolExecutor.
ALTER TABLE chat_tool_executions
	ADD COLUMN IF NOT EXISTS agent_run_id UUID NULL REFERENCES agent_runs(id) ON DELETE SET NULL;

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_status
	ON agent_runs(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_session
	ON agent_runs(parent_session_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_run
	ON agent_runs(parent_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_project
	ON agent_runs(project_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
	ON agent_runs(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_events_run_seq
	ON agent_run_events(run_id, seq);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_created
	ON agent_run_events(run_id, created_at DESC);

-- Fast lookup for the worker draining unconsumed signals for an active run.
CREATE INDEX IF NOT EXISTS idx_agent_run_signals_pending
	ON agent_run_signals(run_id)
	WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_tool_executions_agent_run
	ON chat_tool_executions(agent_run_id)
	WHERE agent_run_id IS NOT NULL;

-- ============================================
-- Triggers
-- ============================================

DROP TRIGGER IF EXISTS trg_agent_runs_updated ON agent_runs;
CREATE TRIGGER trg_agent_runs_updated
	BEFORE UPDATE ON agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

-- Assign a per-run monotonic seq if none provided (mirrors tree_agent).
CREATE OR REPLACE FUNCTION public.agent_run_assign_event_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.seq IS NOT NULL THEN
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.run_id::text, 0));

	SELECT COALESCE(MAX(seq), 0) + 1
	INTO NEW.seq
	FROM public.agent_run_events
	WHERE run_id = NEW.run_id;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_events_assign_seq ON agent_run_events;
CREATE TRIGGER trg_agent_run_events_assign_seq
	BEFORE INSERT ON agent_run_events
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_assign_event_seq();

-- Broadcast new events over Supabase Realtime Broadcast (topic: agent-run:<run_id>).
CREATE OR REPLACE FUNCTION public.agent_run_broadcast_event()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
	v_topic TEXT;
BEGIN
	v_topic := 'agent-run:' || NEW.run_id::text;

	PERFORM realtime.broadcast_changes(
		v_topic,
		'agent-run-event',
		TG_OP,
		TG_TABLE_NAME,
		TG_TABLE_SCHEMA,
		NEW,
		NULL
	);

	RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_events_broadcast ON agent_run_events;
CREATE TRIGGER trg_agent_run_events_broadcast
	AFTER INSERT ON agent_run_events
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_broadcast_event();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_signals ENABLE ROW LEVEL SECURITY;

-- Users can read their own runs.
CREATE POLICY agent_runs_user_select
	ON agent_runs FOR SELECT
	USING (auth.uid() = user_id);

-- Users can read run-scoped tables via ownership.
CREATE POLICY agent_run_events_user_select
	ON agent_run_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM agent_runs r
			WHERE r.id = agent_run_events.run_id
			AND r.user_id = auth.uid()
		)
	);

-- Users can read their own signals and insert steering/control signals for their runs.
CREATE POLICY agent_run_signals_user_select
	ON agent_run_signals FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM agent_runs r
			WHERE r.id = agent_run_signals.run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY agent_run_signals_user_insert
	ON agent_run_signals FOR INSERT
	WITH CHECK (
		source = 'user'
		AND EXISTS (
			SELECT 1 FROM agent_runs r
			WHERE r.id = agent_run_signals.run_id
			AND r.user_id = auth.uid()
		)
	);

-- Service role can manage all Agent Work data.
CREATE POLICY agent_runs_service_role
	ON agent_runs FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY agent_run_events_service_role
	ON agent_run_events FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY agent_run_signals_service_role
	ON agent_run_signals FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

-- Admins can read all Agent Work data.
CREATE POLICY agent_runs_admin_select
	ON agent_runs FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM admin_users
			WHERE admin_users.user_id = auth.uid()
		)
	);

CREATE POLICY agent_run_events_admin_select
	ON agent_run_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM agent_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = agent_run_events.run_id
		)
	);

-- Realtime Broadcast authorization: users receive event messages only for runs
-- they own. Topic shape: 'agent-run:<run_id>'.
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
		AND tablename = 'messages'
		AND policyname = 'agent_run_realtime_messages_select'
	) THEN
		CREATE POLICY agent_run_realtime_messages_select
			ON realtime.messages
			FOR SELECT
			TO authenticated
			USING (
				auth.role() = 'service_role'
				OR (
					topic LIKE 'agent-run:%'
					AND split_part(topic, ':', 2) ~* '^[0-9a-f-]{36}$'
					AND EXISTS (
						SELECT 1
						FROM public.agent_runs r
						WHERE r.id = split_part(topic, ':', 2)::uuid
						AND r.user_id = auth.uid()
					)
				)
			);
	END IF;
END $$;
