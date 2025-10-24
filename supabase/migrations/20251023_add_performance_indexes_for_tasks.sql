-- Migration: Add performance indexes for tasks queries
-- Created: 2025-10-23
-- Purpose: Improve performance of tasks loading by adding proper indexes

-- Create index on tasks.project_id for faster project task lookups
CREATE INDEX IF NOT EXISTS idx_tasks_project_id
ON tasks(project_id)
WHERE deleted_at IS NULL;

-- Create index on task_calendar_events.task_id for faster joins
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_task_id
ON task_calendar_events(task_id);

-- Create index on phase_tasks.task_id for faster joins
CREATE INDEX IF NOT EXISTS idx_phase_tasks_task_id
ON phase_tasks(task_id);

-- Create index on phase_tasks.phase_id for faster joins
CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase_id
ON phase_tasks(phase_id);

-- Create composite index for common query patterns (project_id + created_at for sorting)
CREATE INDEX IF NOT EXISTS idx_tasks_project_created
ON tasks(project_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Create index for task status queries (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
ON tasks(project_id, status)
WHERE deleted_at IS NULL;

-- Add comment explaining the indexes
COMMENT ON INDEX idx_tasks_project_id IS 'Speeds up task queries filtered by project_id';
COMMENT ON INDEX idx_task_calendar_events_task_id IS 'Speeds up joins with task_calendar_events table';
COMMENT ON INDEX idx_phase_tasks_task_id IS 'Speeds up joins with phase_tasks table';
COMMENT ON INDEX idx_phase_tasks_phase_id IS 'Speeds up joins when fetching phase tasks';
COMMENT ON INDEX idx_tasks_project_created IS 'Speeds up project tasks ordered by creation date';
COMMENT ON INDEX idx_tasks_project_status IS 'Speeds up filtered queries by project and status';
