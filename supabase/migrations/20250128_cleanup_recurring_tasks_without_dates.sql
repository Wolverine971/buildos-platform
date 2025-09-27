-- Migration: 20250128_cleanup_recurring_tasks_without_dates.sql
-- Purpose: Clean up recurring tasks that don't have start dates by converting them to one-off tasks

BEGIN;

-- Step 1: Log the tasks we're about to update for audit trail
INSERT INTO recurring_task_migration_log (
    task_id,
    user_id,
    project_id,
    migration_type,
    old_recurrence_ends,
    status,
    error_message,
    created_at
)
SELECT 
    t.id,
    t.user_id,
    t.project_id,
    'cleanup_no_start_date',
    t.recurrence_ends,
    'completed',
    CONCAT('Converted to one-off: no start_date, pattern was ', COALESCE(t.recurrence_pattern::text, 'null')),
    NOW()
FROM tasks t
WHERE t.task_type = 'recurring'
    AND t.start_date IS NULL
    AND t.deleted_at IS NULL;

-- Step 2: Update tasks without start dates to be one-off
UPDATE tasks
SET 
    task_type = 'one_off',
    recurrence_pattern = NULL,
    recurrence_ends = NULL,
    recurrence_end_source = NULL,
    updated_at = NOW()
WHERE task_type = 'recurring'
    AND start_date IS NULL
    AND deleted_at IS NULL;

-- Step 3: Log summary of changes
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Get count of updated tasks
    SELECT COUNT(*) INTO updated_count
    FROM recurring_task_migration_log
    WHERE migration_type = 'cleanup_no_start_date'
        AND created_at >= NOW() - INTERVAL '1 minute';
    
    IF updated_count > 0 THEN
        RAISE NOTICE 'Cleaned up % recurring tasks without start dates', updated_count;
    ELSE
        RAISE NOTICE 'No recurring tasks without start dates found';
    END IF;
END $$;

-- Step 4: Verify no recurring tasks remain without start dates
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM tasks
    WHERE task_type = 'recurring'
        AND start_date IS NULL
        AND deleted_at IS NULL;
    
    IF remaining_count > 0 THEN
        RAISE WARNING 'Still have % recurring tasks without start dates!', remaining_count;
    END IF;
END $$;

COMMIT;

-- Verification query (run separately to check results)
-- SELECT 
--     id,
--     title,
--     task_type,
--     start_date,
--     recurrence_pattern,
--     recurrence_ends,
--     recurrence_end_source,
--     updated_at
-- FROM tasks
-- WHERE id IN (
--     SELECT task_id 
--     FROM recurring_task_migration_log 
--     WHERE migration_type = 'cleanup_no_start_date'
-- )
-- ORDER BY updated_at DESC;