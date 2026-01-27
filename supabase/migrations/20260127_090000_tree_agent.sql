-- supabase/migrations/20260127_090000_tree_agent.sql
-- Description: Tree Agent tables, enums, RLS, and realtime broadcast trigger

-- Queue type for Tree Agent orchestration jobs (if queue_type exists)
DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'buildos_tree_agent';
EXCEPTION
	WHEN duplicate_object THEN NULL;
	WHEN undefined_object THEN NULL;
END $$;

-- ============================================
-- Enums
-- ============================================

DO $$ BEGIN
	CREATE TYPE tree_agent_run_status AS ENUM (
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
	CREATE TYPE tree_agent_node_status AS ENUM (
		'planning',
		'delegating',
		'executing',
		'waiting',
		'aggregating',
		'completed',
		'failed',
		'blocked'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE tree_agent_role_state AS ENUM (
		'planner',
		'executor'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE tree_agent_artifact_type AS ENUM (
		'document',
		'json',
		'summary',
		'other'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS tree_agent_runs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	objective TEXT NOT NULL,
	status tree_agent_run_status NOT NULL DEFAULT 'queued',
	root_node_id UUID NULL,
	workspace_project_id UUID NULL REFERENCES onto_projects(id) ON DELETE SET NULL,
	budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
	metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
	started_at TIMESTAMPTZ NULL,
	completed_at TIMESTAMPTZ NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table already existed from an earlier draft migration, ensure the column exists.
ALTER TABLE tree_agent_runs
	ADD COLUMN IF NOT EXISTS workspace_project_id UUID NULL REFERENCES onto_projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tree_agent_nodes (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES tree_agent_runs(id) ON DELETE CASCADE,
	parent_node_id UUID NULL REFERENCES tree_agent_nodes(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	reason TEXT NOT NULL DEFAULT '',
	success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
	band_index INTEGER NOT NULL DEFAULT 0,
	step_index INTEGER NOT NULL DEFAULT 0,
	depth INTEGER NOT NULL DEFAULT 0,
	status tree_agent_node_status NOT NULL DEFAULT 'planning',
	role_state tree_agent_role_state NOT NULL DEFAULT 'planner',
	scratchpad_doc_id UUID NULL REFERENCES onto_documents(id) ON DELETE SET NULL,
	context JSONB NOT NULL DEFAULT '{}'::jsonb,
	result JSONB NULL,
	started_at TIMESTAMPTZ NULL,
	ended_at TIMESTAMPTZ NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tree_agent_plans (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES tree_agent_runs(id) ON DELETE CASCADE,
	node_id UUID NOT NULL REFERENCES tree_agent_nodes(id) ON DELETE CASCADE,
	version INTEGER NOT NULL DEFAULT 1,
	plan_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(run_id, node_id, version)
);

CREATE TABLE IF NOT EXISTS tree_agent_artifacts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES tree_agent_runs(id) ON DELETE CASCADE,
	node_id UUID NOT NULL REFERENCES tree_agent_nodes(id) ON DELETE CASCADE,
	artifact_type tree_agent_artifact_type NOT NULL,
	label TEXT NOT NULL DEFAULT '',
	document_id UUID NULL REFERENCES onto_documents(id) ON DELETE SET NULL,
	json_payload JSONB NULL,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CHECK (
		(artifact_type = 'document' AND document_id IS NOT NULL)
		OR (artifact_type <> 'document')
	)
);

CREATE TABLE IF NOT EXISTS tree_agent_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id UUID NOT NULL REFERENCES tree_agent_runs(id) ON DELETE CASCADE,
	node_id UUID NOT NULL REFERENCES tree_agent_nodes(id) ON DELETE CASCADE,
	seq BIGINT NULL,
	event_type TEXT NOT NULL,
	payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure root_node_id references an existing node (created after nodes table)
DO $$ BEGIN
	ALTER TABLE tree_agent_runs
		ADD CONSTRAINT tree_agent_runs_root_node_fkey
		FOREIGN KEY (root_node_id)
		REFERENCES tree_agent_nodes(id)
		ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tree_agent_runs_user_status
	ON tree_agent_runs(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tree_agent_runs_created_at
	ON tree_agent_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tree_agent_runs_workspace_project
	ON tree_agent_runs(workspace_project_id);

CREATE INDEX IF NOT EXISTS idx_tree_agent_nodes_run_parent
	ON tree_agent_nodes(run_id, parent_node_id);

CREATE INDEX IF NOT EXISTS idx_tree_agent_nodes_run_status
	ON tree_agent_nodes(run_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tree_agent_plans_run_node
	ON tree_agent_plans(run_id, node_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_tree_agent_artifacts_run_node
	ON tree_agent_artifacts(run_id, node_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_agent_events_run_seq
	ON tree_agent_events(run_id, seq);

CREATE INDEX IF NOT EXISTS idx_tree_agent_events_run_created
	ON tree_agent_events(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tree_agent_events_node_created
	ON tree_agent_events(node_id, created_at DESC);

-- ============================================
-- Triggers
-- ============================================

-- Keep updated_at fresh on updates
DROP TRIGGER IF EXISTS trg_tree_agent_runs_updated ON tree_agent_runs;
CREATE TRIGGER trg_tree_agent_runs_updated
	BEFORE UPDATE ON tree_agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tree_agent_nodes_updated ON tree_agent_nodes;
CREATE TRIGGER trg_tree_agent_nodes_updated
	BEFORE UPDATE ON tree_agent_nodes
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

-- Assign a per-run monotonic seq if none provided
CREATE OR REPLACE FUNCTION public.tree_agent_assign_event_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.seq IS NOT NULL THEN
		RETURN NEW;
	END IF;

	-- Serialize seq assignment per run to avoid collisions
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.run_id::text, 0));

	SELECT COALESCE(MAX(seq), 0) + 1
	INTO NEW.seq
	FROM public.tree_agent_events
	WHERE run_id = NEW.run_id;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tree_agent_events_assign_seq ON tree_agent_events;
CREATE TRIGGER trg_tree_agent_events_assign_seq
	BEFORE INSERT ON tree_agent_events
	FOR EACH ROW
	EXECUTE FUNCTION public.tree_agent_assign_event_seq();

-- Broadcast new events over Supabase Realtime Broadcast channels
CREATE OR REPLACE FUNCTION public.tree_agent_broadcast_event()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
	v_topic TEXT;
BEGIN
	v_topic := 'tree-agent:run:' || NEW.run_id::text;

	PERFORM realtime.broadcast_changes(
		v_topic,
		'tree-event',
		TG_OP,
		TG_TABLE_NAME,
		TG_TABLE_SCHEMA,
		NEW,
		NULL
	);

	RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tree_agent_events_broadcast ON tree_agent_events;
CREATE TRIGGER trg_tree_agent_events_broadcast
	AFTER INSERT ON tree_agent_events
	FOR EACH ROW
	EXECUTE FUNCTION public.tree_agent_broadcast_event();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE tree_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_agent_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_agent_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_agent_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_agent_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own runs
CREATE POLICY tree_agent_runs_user_select
	ON tree_agent_runs FOR SELECT
	USING (auth.uid() = user_id);

-- Users can read run-scoped tables via ownership
CREATE POLICY tree_agent_nodes_user_select
	ON tree_agent_nodes FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			WHERE r.id = tree_agent_nodes.run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY tree_agent_plans_user_select
	ON tree_agent_plans FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			WHERE r.id = tree_agent_plans.run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY tree_agent_artifacts_user_select
	ON tree_agent_artifacts FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			WHERE r.id = tree_agent_artifacts.run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY tree_agent_events_user_select
	ON tree_agent_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			WHERE r.id = tree_agent_events.run_id
			AND r.user_id = auth.uid()
		)
	);

-- Service role can manage all Tree Agent data
CREATE POLICY tree_agent_runs_service_role
	ON tree_agent_runs FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tree_agent_nodes_service_role
	ON tree_agent_nodes FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tree_agent_plans_service_role
	ON tree_agent_plans FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tree_agent_artifacts_service_role
	ON tree_agent_artifacts FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tree_agent_events_service_role
	ON tree_agent_events FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

-- Admins can read all Tree Agent data
CREATE POLICY tree_agent_runs_admin_select
	ON tree_agent_runs FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM admin_users
			WHERE admin_users.user_id = auth.uid()
		)
	);

CREATE POLICY tree_agent_nodes_admin_select
	ON tree_agent_nodes FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = tree_agent_nodes.run_id
		)
	);

CREATE POLICY tree_agent_plans_admin_select
	ON tree_agent_plans FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = tree_agent_plans.run_id
		)
	);

CREATE POLICY tree_agent_artifacts_admin_select
	ON tree_agent_artifacts FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = tree_agent_artifacts.run_id
		)
	);

CREATE POLICY tree_agent_events_admin_select
	ON tree_agent_events FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM tree_agent_runs r
			JOIN admin_users au ON au.user_id = auth.uid()
			WHERE r.id = tree_agent_events.run_id
		)
	);

-- Realtime Broadcast authorization: allow users to receive messages only
-- for runs they own. Broadcast relies on policies over realtime.messages.
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
		AND tablename = 'messages'
		AND policyname = 'tree_agent_realtime_messages_select'
	) THEN
		CREATE POLICY tree_agent_realtime_messages_select
			ON realtime.messages
			FOR SELECT
			TO authenticated
			USING (
				auth.role() = 'service_role'
				OR (
					topic LIKE 'tree-agent:run:%'
					AND split_part(topic, ':', 3) ~* '^[0-9a-f-]{36}$'
					AND EXISTS (
						SELECT 1
						FROM public.tree_agent_runs r
						WHERE r.id = split_part(topic, ':', 3)::uuid
						AND r.user_id = auth.uid()
					)
				)
			);
	END IF;
END $$;
