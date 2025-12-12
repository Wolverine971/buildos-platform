-- apps/web/scripts/rollback-ontology-migration.sql
-- Purpose: Rollback ontology migration data created within a specific time window
-- Created: 2025-12-09
--
-- USAGE:
--   1. Run Step 1 (Preview) to see what will be deleted
--   2. Adjust cutoff_time if needed
--   3. Run Step 2 (Delete) in a transaction
--   4. Run Step 3 (Verify) to confirm cleanup
--
-- IMPORTANT: This does NOT delete legacy data (projects, phases, tasks tables)
--            It only removes the migrated onto_* records and mappings

-- ============================================================================
-- CONFIGURATION
-- ============================================================================
-- Adjust this timestamp to match your migration window
-- Current setting: 7am EST on Dec 9, 2025 = 12:00 UTC (10 hours before 5pm EST)

-- ============================================================================
-- STEP 1: PREVIEW - See what will be deleted
-- ============================================================================

SELECT '=== PREVIEW: Records that will be deleted ===' as info;

WITH cutoff AS (
  SELECT '2025-12-09 12:00:00+00'::timestamptz AS ts
)
SELECT
  'onto_projects' as table_name,
  COUNT(*) as will_delete
FROM onto_projects, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_plans', COUNT(*)
FROM onto_plans, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_tasks', COUNT(*)
FROM onto_tasks, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_edges', COUNT(*)
FROM onto_edges, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_goals', COUNT(*)
FROM onto_goals, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_outputs', COUNT(*)
FROM onto_outputs, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_documents', COUNT(*)
FROM onto_documents, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_milestones', COUNT(*)
FROM onto_milestones, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_requirements', COUNT(*)
FROM onto_requirements, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_risks', COUNT(*)
FROM onto_risks, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_metrics', COUNT(*)
FROM onto_metrics, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_decisions', COUNT(*)
FROM onto_decisions, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_sources', COUNT(*)
FROM onto_sources, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_signals', COUNT(*)
FROM onto_signals, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_insights', COUNT(*)
FROM onto_insights, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'onto_events', COUNT(*)
FROM onto_events, cutoff
WHERE created_at >= cutoff.ts

UNION ALL
SELECT 'legacy_entity_mappings', COUNT(*)
FROM legacy_entity_mappings, cutoff
WHERE migrated_at >= cutoff.ts

ORDER BY table_name;

-- ============================================================================
-- STEP 2: DELETE - Run this in a transaction
-- ============================================================================
-- UNCOMMENT the lines below to execute the deletion

/*
BEGIN;

DO $$
DECLARE
  cutoff_time TIMESTAMPTZ := '2025-12-09 12:00:00+00'::timestamptz;
  deleted_count INT;
BEGIN
  RAISE NOTICE '=== Starting ontology migration rollback ===';
  RAISE NOTICE 'Cutoff time: %', cutoff_time;

  -- 1. Delete legacy mappings first (tracking table)
  DELETE FROM legacy_entity_mappings WHERE migrated_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % legacy_entity_mappings', deleted_count;

  -- 2. Delete edges (no FK constraints, must delete explicitly)
  DELETE FROM onto_edges WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_edges', deleted_count;

  -- 3. Delete event sync records (FK to onto_events)
  DELETE FROM onto_event_sync WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_event_sync', deleted_count;

  -- 4. Delete events
  DELETE FROM onto_events WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_events', deleted_count;

  -- 5. Delete metric points (FK to onto_metrics)
  DELETE FROM onto_metric_points WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_metric_points', deleted_count;

  -- 6. Delete insights (FK to onto_signals)
  DELETE FROM onto_insights WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_insights', deleted_count;

  -- 7. Delete signals
  DELETE FROM onto_signals WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_signals', deleted_count;

  -- 8. Delete all project children (explicit deletion for safety)
  DELETE FROM onto_tasks WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_tasks', deleted_count;

  DELETE FROM onto_plans WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_plans', deleted_count;

  DELETE FROM onto_outputs WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_outputs', deleted_count;

  DELETE FROM onto_documents WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_documents', deleted_count;

  DELETE FROM onto_goals WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_goals', deleted_count;

  DELETE FROM onto_requirements WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_requirements', deleted_count;

  DELETE FROM onto_milestones WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_milestones', deleted_count;

  DELETE FROM onto_metrics WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_metrics', deleted_count;

  DELETE FROM onto_risks WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_risks', deleted_count;

  DELETE FROM onto_decisions WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_decisions', deleted_count;

  DELETE FROM onto_sources WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_sources', deleted_count;

  -- 9. Finally delete projects
  DELETE FROM onto_projects WHERE created_at >= cutoff_time;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % onto_projects', deleted_count;

  RAISE NOTICE '=== Rollback complete ===';
END $$;

-- Review the deletion results above, then either:
COMMIT;  -- If everything looks good
-- ROLLBACK;  -- If something went wrong
*/

-- ============================================================================
-- STEP 3: VERIFY - Confirm cleanup was successful
-- ============================================================================
-- Run this after the deletion to verify nothing remains

/*
SELECT '=== VERIFICATION: Should all be 0 ===' as info;

SELECT
  'onto_projects' as table_name,
  COUNT(*) as remaining
FROM onto_projects
WHERE created_at >= '2025-12-09 12:00:00+00'::timestamptz

UNION ALL
SELECT 'onto_plans', COUNT(*)
FROM onto_plans
WHERE created_at >= '2025-12-09 12:00:00+00'::timestamptz

UNION ALL
SELECT 'onto_tasks', COUNT(*)
FROM onto_tasks
WHERE created_at >= '2025-12-09 12:00:00+00'::timestamptz

UNION ALL
SELECT 'onto_edges', COUNT(*)
FROM onto_edges
WHERE created_at >= '2025-12-09 12:00:00+00'::timestamptz

UNION ALL
SELECT 'legacy_entity_mappings', COUNT(*)
FROM legacy_entity_mappings
WHERE migrated_at >= '2025-12-09 12:00:00+00'::timestamptz

ORDER BY table_name;
*/
