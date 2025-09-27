-- Migration: 20250127_recurring_task_project_end_sync.sql
-- Purpose: Add support for tracking recurrence end date source and syncing with project end dates

BEGIN;

-- Step 1: Add new column for tracking end date source
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS recurrence_end_source TEXT;

-- Step 2: Create migration tracking table for audit trail
CREATE TABLE IF NOT EXISTS recurring_task_migration_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    migration_type TEXT NOT NULL,
    old_recurrence_ends TIMESTAMPTZ,
    new_recurrence_ends TIMESTAMPTZ,
    old_calendar_event_id TEXT,
    new_calendar_event_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_migration_log_status ON recurring_task_migration_log(status);
CREATE INDEX IF NOT EXISTS idx_migration_log_task_id ON recurring_task_migration_log(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_end_source ON tasks(recurrence_end_source) WHERE task_type = 'recurring';

-- Step 4: Populate recurrence_end_source for existing tasks
UPDATE tasks 
SET 
    recurrence_end_source = CASE
        WHEN task_type = 'recurring' AND recurrence_ends IS NOT NULL THEN 'user_specified'
        WHEN task_type = 'recurring' AND recurrence_ends IS NULL THEN 'indefinite'
        ELSE NULL
    END,
    updated_at = NOW()
WHERE task_type = 'recurring' AND recurrence_end_source IS NULL;

-- Step 5: Log tasks that will be migrated (for audit trail)
INSERT INTO recurring_task_migration_log (
    task_id,
    user_id,
    project_id,
    migration_type,
    old_recurrence_ends,
    new_recurrence_ends,
    status
)
SELECT 
    t.id,
    t.user_id,
    t.project_id,
    'project_end_sync',
    t.recurrence_ends,
    p.end_date,
    'pending'
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE t.task_type = 'recurring' 
    AND t.recurrence_ends IS NULL
    AND p.end_date IS NOT NULL
    AND t.deleted_at IS NULL;

-- Step 6: Update tasks with project end dates
UPDATE tasks t
SET 
    recurrence_ends = p.end_date,
    recurrence_end_source = 'project_inherited',
    updated_at = NOW()
FROM projects p
WHERE t.project_id = p.id
    AND t.task_type = 'recurring'
    AND t.recurrence_ends IS NULL
    AND p.end_date IS NOT NULL
    AND t.deleted_at IS NULL;

-- Step 7: Mark migration as completed for successfully updated tasks
UPDATE recurring_task_migration_log
SET 
    status = 'completed',
    updated_at = NOW()
WHERE migration_type = 'project_end_sync'
    AND task_id IN (
        SELECT t.id 
        FROM tasks t
        WHERE t.recurrence_end_source = 'project_inherited'
    );

-- Step 8: Add constraint after data is populated
ALTER TABLE tasks 
ADD CONSTRAINT check_recurrence_end_source 
CHECK (
    recurrence_end_source IS NULL 
    OR recurrence_end_source IN ('user_specified', 'project_inherited', 'indefinite')
);

-- Step 9: Create function to handle project end date updates
CREATE OR REPLACE FUNCTION update_recurring_tasks_on_project_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only proceed if project end_date changed
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
        -- Update tasks with project-inherited end dates
        UPDATE tasks
        SET 
            recurrence_ends = NEW.end_date,
            updated_at = NOW()
        WHERE project_id = NEW.id
            AND task_type = 'recurring'
            AND recurrence_end_source = 'project_inherited'
            AND deleted_at IS NULL;
            
        -- Log the update for audit trail
        INSERT INTO recurring_task_migration_log (
            task_id,
            user_id,
            project_id,
            migration_type,
            old_recurrence_ends,
            new_recurrence_ends,
            status
        )
        SELECT 
            id,
            user_id,
            project_id,
            'project_update_cascade',
            OLD.end_date,
            NEW.end_date,
            'completed'
        FROM tasks
        WHERE project_id = NEW.id
            AND task_type = 'recurring'
            AND recurrence_end_source = 'project_inherited'
            AND deleted_at IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger for project updates
CREATE TRIGGER trigger_update_recurring_tasks
    AFTER UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_recurring_tasks_on_project_change();

-- Step 11: Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON recurring_task_migration_log TO authenticated;
GRANT SELECT, UPDATE ON tasks TO authenticated;

-- Step 12: Add RLS policies for migration log
ALTER TABLE recurring_task_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own migration logs" ON recurring_task_migration_log
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all migration logs" ON recurring_task_migration_log
    FOR ALL
    USING (auth.role() = 'service_role');

COMMIT;

-- Rollback script (save separately)
-- BEGIN;
-- DROP TRIGGER IF EXISTS trigger_update_recurring_tasks ON projects;
-- DROP FUNCTION IF EXISTS update_recurring_tasks_on_project_change();
-- ALTER TABLE tasks DROP CONSTRAINT IF EXISTS check_recurrence_end_source;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS recurrence_end_source;
-- DROP TABLE IF EXISTS recurring_task_migration_log;
-- COMMIT;