-- supabase/migrations/20251028_fix_context_type_constraint.sql
-- Migration: Fix context_type constraint to support all agent chat types
-- Description: Updates the check constraint on chat_sessions.context_type to accept all agent chat type values
-- Author: BuildOS Team
-- Date: 2025-10-28
-- Reason: The original constraint only allowed 'global', 'project', 'task', 'calendar', but agent chat types
--         like 'project_create', 'general', etc. need to be valid context_type values to properly route to
--         different system prompts in the agent orchestrator.

-- ============================================================================
-- PART 1: Drop the old constraint
-- ============================================================================

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_context_type_check;

-- ============================================================================
-- PART 2: Add the new constraint with all valid context types
-- ============================================================================

-- The context_type should support all agent chat types that have corresponding system prompts
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_context_type_check
  CHECK (context_type IN (
    -- Original generic context types (deprecated but kept for backward compatibility)
    'global',
    'project',
    'task',
    'calendar',
    -- Agent-specific context types (primary going forward)
    'general',
    'project_create',
    'project_update',
    'project_audit',
    'project_forecast',
    'task_update',
    'daily_brief_update'
  ));

-- ============================================================================
-- PART 3: Add index on context_type for efficient filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chat_sessions_context_type ON chat_sessions(context_type, user_id);

-- ============================================================================
-- PART 4: Add comment explaining the design
-- ============================================================================

COMMENT ON COLUMN chat_sessions.context_type IS 'Context type that determines which system prompt to use in the agent orchestrator. Values map 1:1 with AgentChatType and route to corresponding handlers with specialized prompts. Legacy values (global, project, task, calendar) maintained for backward compatibility with existing chat system.';

COMMENT ON COLUMN chat_sessions.chat_type IS 'Duplicate of context_type, added by agent migration. Both columns serve the same purpose. In future, consider consolidating into single column.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
