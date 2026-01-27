-- supabase/migrations/20260127_100000_tree_agent_context_columns.sql
-- Description: Add scope and project_ids columns to tree_agent_runs for durable context storage
-- This migration adds dedicated columns for context management, parallel to metrics.context for observability

-- ============================================
-- Add Scope Enum if not exists
-- ============================================

DO $$ BEGIN
	CREATE TYPE tree_agent_scope AS ENUM (
		'global',
		'project',
		'multi_project'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Add Context Columns
-- ============================================

ALTER TABLE tree_agent_runs
ADD COLUMN IF NOT EXISTS scope tree_agent_scope NOT NULL DEFAULT 'global'::tree_agent_scope,
ADD COLUMN IF NOT EXISTS project_ids TEXT[] DEFAULT NULL;

-- ============================================
-- Create Index for Efficient Querying
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tree_agent_runs_scope_project_ids
	ON tree_agent_runs(scope, project_ids);

-- ============================================
-- Backfill Existing Runs from metrics.context
-- ============================================

UPDATE tree_agent_runs
SET
	scope = CASE
		WHEN metrics->'context'->>'type' = 'project' THEN 'project'::tree_agent_scope
		ELSE 'global'::tree_agent_scope
	END,
	project_ids = CASE
		WHEN metrics->'context'->>'type' = 'project' AND
		     metrics->'context'->>'project_id' IS NOT NULL
		THEN ARRAY[metrics->'context'->>'project_id']
		ELSE NULL
	END
WHERE metrics IS NOT NULL AND (scope = 'global' OR scope IS NULL);

-- ============================================
-- Add Comments for Documentation
-- ============================================

COMMENT ON COLUMN tree_agent_runs.scope IS 'Execution scope: global (all projects), project (single project), or multi_project (multiple projects)';
COMMENT ON COLUMN tree_agent_runs.project_ids IS 'Array of project IDs for scoped execution; null for global scope';
COMMENT ON INDEX idx_tree_agent_runs_scope_project_ids IS 'Index for efficient querying by scope and project context';
