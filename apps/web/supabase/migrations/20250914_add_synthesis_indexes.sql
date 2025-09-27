-- Add indexes for project_synthesis table to improve query performance

-- Index for GET endpoint: finding synthesis by project, user, and status
CREATE INDEX IF NOT EXISTS idx_project_synthesis_lookup 
ON project_synthesis(project_id, user_id, status, created_at DESC)
WHERE status IN ('completed', 'success', 'draft', 'applied');

-- Index for finding most recent synthesis
CREATE INDEX IF NOT EXISTS idx_project_synthesis_recent
ON project_synthesis(project_id, user_id, created_at DESC);

-- Index for tasks used in synthesis data fetching
CREATE INDEX IF NOT EXISTS idx_tasks_synthesis 
ON tasks(project_id, user_id, status) 
WHERE deleted_at IS NULL;

-- Index for tasks with dates (used in synthesis operations)
CREATE INDEX IF NOT EXISTS idx_tasks_project_dates
ON tasks(project_id, start_date, status)
WHERE deleted_at IS NULL;

-- Index for phases used in synthesis
CREATE INDEX IF NOT EXISTS idx_phases_project
ON phases(project_id, order);

-- Analyze tables to update statistics for query planner
ANALYZE project_synthesis;
ANALYZE tasks;
ANALYZE phases;