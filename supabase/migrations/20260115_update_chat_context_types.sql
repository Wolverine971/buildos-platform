-- supabase/migrations/20260115_update_chat_context_types.sql
-- Migration: Remove task/task_update context types and align to project focus
-- Description: Normalizes legacy task contexts and refreshes chat_sessions constraints
-- Author: Codex (Agent)
-- Date: 2026-01-15

BEGIN;

-- Normalize task/task_update sessions to project context with focus metadata when possible
UPDATE chat_sessions s
SET
  context_type = 'project',
  entity_id = t.project_id,
  agent_metadata = CASE
    WHEN COALESCE(s.agent_metadata, '{}'::jsonb) ? 'focus' THEN s.agent_metadata
    ELSE jsonb_set(
      COALESCE(s.agent_metadata, '{}'::jsonb),
      '{focus}',
      jsonb_build_object(
        'focusType', 'task',
        'focusEntityId', t.id,
        'focusEntityName', t.title,
        'projectId', t.project_id,
        'projectName', p.name
      )
    )
  END
FROM tasks t
JOIN projects p ON p.id = t.project_id
WHERE s.context_type IN ('task', 'task_update')
  AND s.entity_id = t.id;

-- Any remaining task contexts become project context without a bound entity
UPDATE chat_sessions
SET
  context_type = 'project',
  entity_id = NULL
WHERE context_type IN ('task', 'task_update');

-- Normalize deprecated agent chat types
UPDATE chat_sessions
SET chat_type = 'project'
WHERE chat_type = 'task_update';

-- Normalize agent chat session context types
UPDATE agent_chat_sessions s
SET
  context_type = 'project',
  entity_id = t.project_id
FROM tasks t
WHERE s.context_type IN ('task', 'task_update')
  AND s.entity_id = t.id;

UPDATE agent_chat_sessions
SET context_type = 'project'
WHERE context_type IN ('task', 'task_update');

-- Drop cached task contexts (cache will be rebuilt on demand)
DELETE FROM chat_context_cache
WHERE context_type IN ('task', 'task_update');

-- Refresh chat_sessions context_type constraint
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_context_type_check;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_context_type_check
  CHECK (context_type IN (
    'global',
    'project',
    'calendar',
    'general',
    'project_create',
    'project_audit',
    'project_forecast',
    'daily_brief_update',
    'brain_dump',
    'ontology'
  ));

-- Refresh chat_sessions chat_type constraint
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_chat_type_check;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_chat_type_check
  CHECK (chat_type IN (
    'global',
    'project',
    'calendar',
    'general',
    'project_create',
    'project_audit',
    'project_forecast',
    'daily_brief_update',
    'brain_dump',
    'ontology'
  ));

COMMIT;
