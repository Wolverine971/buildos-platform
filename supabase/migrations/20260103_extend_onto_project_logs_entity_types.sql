-- supabase/migrations/20260103_extend_onto_project_logs_entity_types.sql
-- Migration: Extend onto_project_logs entity types and admin access
-- Date: 2026-01-03
-- Description: Allow document/decision entity types and enable admin SELECT access

-- ============================================================================
-- 1. EXPAND ENTITY TYPE CONSTRAINT
-- ============================================================================

ALTER TABLE onto_project_logs
  DROP CONSTRAINT IF EXISTS check_entity_type_values;

ALTER TABLE onto_project_logs
  ADD CONSTRAINT check_entity_type_values CHECK (entity_type IN (
    'project',
    'task',
    'output',
    'note',
    'document',
    'goal',
    'milestone',
    'risk',
    'plan',
    'requirement',
    'decision',
    'source',
    'edge'
  ));

-- ============================================================================
-- 2. ADMIN READ ACCESS (RLS)
-- ============================================================================

CREATE POLICY "project_logs_select_admin"
  ON onto_project_logs FOR SELECT
  USING (is_admin());
