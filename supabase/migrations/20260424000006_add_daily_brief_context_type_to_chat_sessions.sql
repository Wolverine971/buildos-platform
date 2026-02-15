-- supabase/migrations/20260424000006_add_daily_brief_context_type_to_chat_sessions.sql
-- Migration: Allow daily_brief context/chat types in chat_sessions constraints
-- Description: Fixes chat session inserts for Brief Chat (context_type='daily_brief')
-- Author: Codex (Agent)
-- Date: 2026-04-24

BEGIN;

-- Refresh context_type constraint to include daily_brief
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
    'daily_brief',
    'daily_brief_update',
    'brain_dump',
    'ontology'
  ));

-- Refresh chat_type constraint to include daily_brief (+ homework retained)
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
    'daily_brief',
    'daily_brief_update',
    'brain_dump',
    'ontology',
    'homework'
  ));

COMMIT;

