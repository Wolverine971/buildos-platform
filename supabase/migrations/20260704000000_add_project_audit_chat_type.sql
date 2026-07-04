-- supabase/migrations/20260704000000_add_project_audit_chat_type.sql
-- Migration: Re-add 'project_audit' to the chat_sessions chat_type allowlist
-- Description: Complete Project Audit creates a dedicated chat session with
--   chat_type = 'project_audit'. That value was dropped from the CHECK constraint
--   by 20260429000000 (collapsed into 'project') and never re-added, so every
--   audit creation path aborts with a 23514 before any project_audits row is
--   written. This re-adds it. context_type stays 'project' (already valid), so
--   only the chat_type constraint changes.
--   See docs/technical/reviews/project-loops-flow-audit-2026-07-04.md §5 (P0).

BEGIN;

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
		'homework',
		'project_audit'
	));

COMMIT;
