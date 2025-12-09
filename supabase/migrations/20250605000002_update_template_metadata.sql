-- supabase/migrations/20250605000002_update_template_metadata.sql
-- ============================================
-- Update Template Metadata
-- Add category and measurement_type fields
-- ============================================
--
-- Purpose: Enhance template metadata for better UI categorization
--          and display in TaskCreateModal and GoalCreateModal.
--
-- Changes:
--   - Add 'category' field to all task and goal templates
--   - Add 'measurement_type' field to goal templates
--
-- Date: 2025-11-04
-- Migration: 20250605000002
-- ============================================

-- Update task templates with categories
UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Quick Actions"')
WHERE scope = 'task' AND type_key = 'task.quick';

UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Deep Work"')
WHERE scope = 'task' AND type_key = 'task.deep_work';

UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Recurring Tasks"')
WHERE scope = 'task' AND type_key = 'task.recurring';

UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Milestones"')
WHERE scope = 'task' AND type_key = 'task.milestone';

UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Coordination"')
WHERE scope = 'task' AND type_key = 'task.meeting_prep';

UPDATE onto_templates
SET metadata = jsonb_set(metadata, '{category}', '"Research & Analysis"')
WHERE scope = 'task' AND type_key IN ('task.research', 'task.review');

-- Update goal templates with categories and measurement types
UPDATE onto_templates
SET metadata = jsonb_set(
  jsonb_set(metadata, '{category}', '"Outcomes"'),
  '{measurement_type}', '"Binary completion"'
)
WHERE scope = 'goal' AND type_key = 'goal.outcome';

UPDATE onto_templates
SET metadata = jsonb_set(
  jsonb_set(metadata, '{category}', '"Personal Development"'),
  '{measurement_type}', '"Skill level progression"'
)
WHERE scope = 'goal' AND type_key = 'goal.learning';

UPDATE onto_templates
SET metadata = jsonb_set(
  jsonb_set(metadata, '{category}', '"Personal Development"'),
  '{measurement_type}', '"Frequency & consistency"'
)
WHERE scope = 'goal' AND type_key = 'goal.behavior';

UPDATE onto_templates
SET metadata = jsonb_set(
  jsonb_set(metadata, '{category}', '"Metrics & KPIs"'),
  '{measurement_type}', '"Numeric target"'
)
WHERE scope = 'goal' AND type_key = 'goal.metric';

-- Display summary
DO $$
DECLARE
  v_task_updated int;
  v_goal_updated int;
BEGIN
  SELECT COUNT(*) INTO v_task_updated
  FROM onto_templates
  WHERE scope = 'task' AND metadata ? 'category';

  SELECT COUNT(*) INTO v_goal_updated
  FROM onto_templates
  WHERE scope = 'goal' AND metadata ? 'category';

  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Template Metadata Updated';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated templates:';
  RAISE NOTICE '  - Task templates with categories: %', v_task_updated;
  RAISE NOTICE '  - Goal templates with categories: %', v_goal_updated;
  RAISE NOTICE '';
  RAISE NOTICE 'Task Categories:';
  RAISE NOTICE '  • Quick Actions';
  RAISE NOTICE '  • Deep Work';
  RAISE NOTICE '  • Recurring Tasks';
  RAISE NOTICE '  • Milestones';
  RAISE NOTICE '  • Coordination';
  RAISE NOTICE '  • Research & Analysis';
  RAISE NOTICE '';
  RAISE NOTICE 'Goal Categories:';
  RAISE NOTICE '  • Outcomes';
  RAISE NOTICE '  • Personal Development';
  RAISE NOTICE '  • Metrics & KPIs';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;
