-- supabase/migrations/20260616000000_agent_work_phase05.sql
-- Agent Work — Phase 0.5 (Contract hardening)
-- Design: apps/web/docs/technical/architecture/agent-work/01-EXECUTION-SUBSTRATE.md §"Phase 0.5"
--
-- Three corrections settled before the worker runner is built:
--   1. agent_runs scope: free-form `allowed_capabilities` → typed `scope_mode` + `allowed_ops`,
--      reusing the existing Agent Call op vocabulary (read_only|read_write + dotted ops).
--   2. Run-native telemetry: a dedicated `agent_tool_executions` table so manual/scheduled runs
--      never need a synthetic chat_sessions row. (Chosen over making chat_tool_executions.session_id
--      nullable, which would weaken a NOT NULL invariant and touch all chat analytics.)
--   3. Drop the now-unused chat_tool_executions.agent_run_id added in Phase 0.

-- ============================================
-- 1. agent_runs scope: scope_mode + allowed_ops
-- ============================================

ALTER TABLE agent_runs
	ADD COLUMN IF NOT EXISTS scope_mode TEXT NOT NULL DEFAULT 'read_write';

ALTER TABLE agent_runs
	ADD COLUMN IF NOT EXISTS allowed_ops TEXT[] NULL;

DO $$ BEGIN
	ALTER TABLE agent_runs
		ADD CONSTRAINT agent_runs_scope_mode CHECK (scope_mode IN ('read_only', 'read_write'));
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- Free-form capability list is superseded by scope_mode + allowed_ops (no run data yet).
ALTER TABLE agent_runs
	DROP COLUMN IF EXISTS allowed_capabilities;

-- ============================================
-- 2. Run-native tool telemetry
-- ============================================

-- Receipts for every tool call an Agent Run makes — keyed by agent_run_id, no chat-session
-- dependency. entities_touched (01 §5) is reconstructed from the write-op rows here.
CREATE TABLE IF NOT EXISTS agent_tool_executions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

	tool_name TEXT NOT NULL,
	gateway_op TEXT NULL,            -- registry op, e.g. 'onto.task.update'
	tool_category TEXT NULL,         -- 'read' | 'write' (from the tool registry)

	arguments JSONB NULL,
	result JSONB NULL,
	success BOOLEAN NOT NULL DEFAULT FALSE,
	error_message TEXT NULL,

	-- ground-truth entity capture (write ops return created/updated ids)
	entity_kind TEXT NULL,
	entity_id TEXT NULL,

	-- staging linkage (02): set when the run is in stage mode and this op was staged
	mutation_mode TEXT NULL,         -- 'commit' | 'stage'
	proposed_change_id TEXT NULL,

	execution_time_ms INTEGER NULL,
	tokens_consumed INTEGER NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	CONSTRAINT agent_tool_executions_mutation_mode
		CHECK (mutation_mode IS NULL OR mutation_mode IN ('commit', 'stage'))
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_executions_run_created
	ON agent_tool_executions(agent_run_id, created_at DESC);

-- Fast path for entities_touched reconstruction (successful write ops for a run).
CREATE INDEX IF NOT EXISTS idx_agent_tool_executions_run_success
	ON agent_tool_executions(agent_run_id)
	WHERE success IS TRUE;

ALTER TABLE agent_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_tool_executions_user_select
	ON agent_tool_executions FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM agent_runs r
			WHERE r.id = agent_tool_executions.agent_run_id
			AND r.user_id = auth.uid()
		)
	);

CREATE POLICY agent_tool_executions_service_role
	ON agent_tool_executions FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

CREATE POLICY agent_tool_executions_admin_select
	ON agent_tool_executions FOR SELECT
	USING (
		EXISTS (
			SELECT 1 FROM admin_users
			WHERE admin_users.user_id = auth.uid()
		)
	);

-- ============================================
-- 3. Drop the superseded Phase 0 telemetry tag
-- ============================================

DROP INDEX IF EXISTS idx_chat_tool_executions_agent_run;

ALTER TABLE chat_tool_executions
	DROP COLUMN IF EXISTS agent_run_id;
