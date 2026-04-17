-- supabase/migrations/20260430000003_remove_brain_dump_chat_context.sql
-- Migration: Collapse legacy brain_dump chat context into global context
-- Description: Brain Dump is deprecated as a dedicated agent context. Freeform capture uses global chat.

BEGIN;

UPDATE chat_sessions
SET context_type = 'global'
WHERE context_type = 'brain_dump';

UPDATE chat_sessions
SET chat_type = 'global'
WHERE chat_type = 'brain_dump';

UPDATE agent_chat_sessions
SET context_type = 'global'
WHERE context_type = 'brain_dump';

DELETE FROM chat_context_cache
WHERE context_type = 'brain_dump';

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
		'ontology',
		'homework'
	));

COMMIT;
