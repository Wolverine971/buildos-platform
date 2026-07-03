-- supabase/migrations/20260703010000_project_audit_recommendation_suggestion_kind.sql
-- Allow complete project audits to create reviewable follow-up suggestions.

ALTER TABLE IF EXISTS public.project_suggestions
  DROP CONSTRAINT IF EXISTS project_suggestions_kind_check;

ALTER TABLE IF EXISTS public.project_suggestions
  ADD CONSTRAINT project_suggestions_kind_check
  CHECK (kind IN ('doc_org', 'doc_outdated', 'drift', 'task_conflict', 'audit_recommendation'));
