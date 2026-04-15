-- supabase/migrations/20260429000000_remove_project_audit_forecast_context_types.sql
-- Migration: Collapse project_audit and project_forecast context types into project context
-- Description: Audit and forecast are project-scoped skills, not chat context types.

BEGIN;

UPDATE chat_sessions
SET context_type = 'project'
WHERE context_type IN ('project_audit', 'project_forecast');

UPDATE chat_sessions
SET chat_type = 'project'
WHERE chat_type IN ('project_audit', 'project_forecast');

UPDATE agent_chat_sessions
SET context_type = 'project'
WHERE context_type IN ('project_audit', 'project_forecast');

DELETE FROM chat_context_cache
WHERE context_type IN ('project_audit', 'project_forecast');

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_context_type_check;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_context_type_check
  CHECK (context_type IN (
    'global',
    'project',
    'calendar',
    'general',
    'project_create',
    'daily_brief',
    'daily_brief_update',
    'brain_dump',
    'ontology'
  ));

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_chat_type_check;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_chat_type_check
  CHECK (chat_type IN (
    'global',
    'project',
    'calendar',
    'general',
    'project_create',
    'daily_brief',
    'daily_brief_update',
    'brain_dump',
    'ontology',
    'homework'
  ));

COMMIT;
