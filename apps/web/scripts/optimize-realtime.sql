-- apps/web/scripts/optimize-realtime.sql
-- Optimize real-time performance
-- Run in Supabase SQL Editor

-- Create indexes for faster real-time queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);

-- Create composite indexes for common filters
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_outdated ON tasks(project_id, outdated);

-- Analyze tables for query planner
ANALYZE tasks;
ANALYZE phases;
ANALYZE notes;
ANALYZE projects;
