-- supabase/migrations/20251023_analyze_tasks_tables.sql
-- Migration: Analyze tables after adding performance indexes
-- Created: 2025-10-23
-- Purpose: Update query planner statistics for optimal index usage

-- Analyze the tasks table to update statistics
ANALYZE tasks;

-- Analyze related tables that are part of the join queries
ANALYZE task_calendar_events;
ANALYZE phase_tasks;
ANALYZE phases;
ANALYZE projects;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Table statistics updated successfully for performance optimization';
END $$;
