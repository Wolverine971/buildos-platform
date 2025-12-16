-- supabase/migrations/20251212_fix_chat_tool_category_constraint.sql
-- Migration: Fix chat_tool_executions tool_category constraint
-- Issue: The CHECK constraint only allows ('list', 'detail', 'action', 'calendar')
-- but the application uses categories from tools.config.ts:
--   - ontology
--   - ontology_action
--   - utility
--   - web_research
--   - buildos_docs
--
-- This migration updates the constraint to allow all valid tool categories.

-- Drop the existing constraint
ALTER TABLE chat_tool_executions
DROP CONSTRAINT IF EXISTS chat_tool_executions_tool_category_check;

-- Add the updated constraint with all valid tool categories
-- Note: We include both old categories (for backwards compatibility) and new ones
ALTER TABLE chat_tool_executions
ADD CONSTRAINT chat_tool_executions_tool_category_check
CHECK (tool_category IN (
    -- Original categories (kept for backwards compatibility)
    'list',
    'detail',
    'action',
    'calendar',
    -- New ontology-based categories from tools.config.ts
    'ontology',
    'ontology_action',
    'utility',
    'web_research',
    'buildos_docs'
));

-- Add comment documenting the valid categories
COMMENT ON COLUMN chat_tool_executions.tool_category IS
'Tool category for analytics. Valid values: list, detail, action, calendar (legacy), ontology, ontology_action, utility, web_research, buildos_docs';
