-- supabase/migrations/20260126_150000_add_homework_chat_type.sql
-- Migration: Add 'homework' to chat_type constraint
-- Description: Allows chat_sessions to be created with chat_type='homework' for homework runs
-- Author: Claude Code
-- Date: 2026-01-26

BEGIN;

-- Drop and recreate the chat_type constraint to include 'homework'
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
    'ontology',
    'homework'
  ));

COMMIT;
