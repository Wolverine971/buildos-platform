-- Migration to clear recurring data from tasks that are not recurring type
-- This ensures data consistency when tasks are changed from recurring to one_off

-- Update tasks that have task_type = 'one_off' but still have recurring data
UPDATE tasks
SET 
    recurrence_pattern = NULL,
    recurrence_ends = NULL,
    recurrence_end_source = NULL,
    updated_at = NOW()
WHERE 
    task_type = 'one_off' 
    AND (
        recurrence_pattern IS NOT NULL 
        OR recurrence_ends IS NOT NULL 
        OR recurrence_end_source IS NOT NULL
    );

-- Log how many tasks were affected
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count > 0 THEN
        RAISE NOTICE 'Cleared recurring data from % one_off tasks', affected_count;
    ELSE
        RAISE NOTICE 'No one_off tasks had recurring data to clear';
    END IF;
END $$;

-- Also clean up tasks with NULL or empty task_type that have recurring data
UPDATE tasks
SET 
    recurrence_pattern = NULL,
    recurrence_ends = NULL,
    recurrence_end_source = NULL,
    task_type = 'one_off', -- Set default type
    updated_at = NOW()
WHERE 
    (task_type IS NULL OR task_type = '')
    AND (
        recurrence_pattern IS NOT NULL 
        OR recurrence_ends IS NOT NULL 
        OR recurrence_end_source IS NOT NULL
    );

-- Create an index to improve performance of future queries on task_type
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);

-- Add a check constraint to ensure data consistency going forward (commented out as it might be too restrictive)
-- ALTER TABLE tasks ADD CONSTRAINT check_recurring_data_consistency
-- CHECK (
--     (task_type = 'recurring' OR recurrence_pattern IS NULL)
--     AND (task_type = 'recurring' OR recurrence_ends IS NULL)
--     AND (task_type = 'recurring' OR recurrence_end_source IS NULL)
-- );