-- supabase/migrations/20251120_project_workspace_context.sql
-- Migration: Rename project_update context to project workspace
-- Description: Consolidates the project_update agent context into the standard "project" context
--              and refreshes the chat_sessions context_type constraint.
-- Author: Codex (Agent)
-- Date: 2025-11-20

-- ============================================================================
-- PART 1: Update existing rows that still reference project_update
-- ============================================================================

UPDATE chat_sessions
SET context_type = 'project'
WHERE context_type = 'project_update';

UPDATE chat_sessions
SET chat_type = 'project'
WHERE chat_type = 'project_update';

UPDATE agent_chat_sessions
SET context_type = 'project'
WHERE context_type = 'project_update';

UPDATE chat_context_cache
SET context_type = 'project'
WHERE context_type = 'project_update';

-- ============================================================================
-- PART 2: Refresh constraint to remove project_update from allowed values
-- ============================================================================

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_context_type_check;

ALTER TABLE chat_sessions
ADD CONSTRAINT chat_sessions_context_type_check CHECK (
	context_type IN (
		'global',
		'project',
		'task',
		'calendar',
		'general',
		'project_create',
		'project_audit',
		'project_forecast',
		'task_update',
		'daily_brief_update'
	)
);

COMMENT ON COLUMN chat_sessions.context_type IS 'Context type that determines which system prompt to use in the agent orchestrator. Agent chat now uses the shared "project" workspace context instead of the former project_update label.';
