-- scripts/optimize-project-realtime.sql
-- Optimized indexes for RealtimeProjectService subscriptions
-- Run this in Supabase SQL Editor to improve realtime query performance

-- ============================================
-- INDEXES FOR REALTIMEPROJECTSERVICE FILTERS
-- ============================================

-- Tasks table indexes (most active table)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
-- Composite index for project filtering with updated_at for realtime polling
CREATE INDEX IF NOT EXISTS idx_tasks_project_updated ON tasks(project_id, updated_at DESC);

-- Phases table indexes
CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_user_id ON phases(user_id);
CREATE INDEX IF NOT EXISTS idx_phases_updated_at ON phases(updated_at DESC);
-- Composite index for project filtering
CREATE INDEX IF NOT EXISTS idx_phases_project_updated ON phases(project_id, updated_at DESC);

-- Phase_tasks junction table indexes (for task-phase assignments)
CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase_id ON phase_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_tasks_task_id ON phase_tasks(task_id);
-- Composite index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase_task ON phase_tasks(phase_id, task_id);

-- Notes table indexes
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
-- Composite index for project filtering
CREATE INDEX IF NOT EXISTS idx_notes_project_updated ON notes(project_id, updated_at DESC);

-- Projects table indexes (single record updates)
CREATE INDEX IF NOT EXISTS idx_projects_id ON projects(id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- ============================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================

-- Indexes for common query patterns in the app
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_outdated ON tasks(project_id, deleted_at);

-- Recurring task instances (if using recurring tasks)
CREATE INDEX IF NOT EXISTS idx_recurring_task_instances_task_id 
    ON recurring_task_instances(task_id);

-- ============================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ============================================

-- Update table statistics for better query planning
ANALYZE tasks;
ANALYZE phases;
ANALYZE phase_tasks;
ANALYZE notes;
ANALYZE projects;
ANALYZE recurring_task_instances;

-- ============================================
-- VERIFY INDEXES WERE CREATED
-- ============================================

-- Check all indexes on realtime-enabled tables
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN ('tasks', 'phases', 'phase_tasks', 'notes', 'projects')
ORDER BY tablename, indexname;