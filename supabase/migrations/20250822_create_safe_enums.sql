-- Migration: Create Safe Enum Types
-- Date: 2025-08-22
-- Description: Convert high-confidence string fields to enum types

-- ============================================
-- STEP 1: CREATE ENUM TYPES
-- ============================================

-- Project status enum
CREATE TYPE project_status AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);

-- Task status enum
CREATE TYPE task_status AS ENUM (
    'backlog',
    'in_progress',
    'done',
    'blocked'
);

-- Priority level enum (shared by tasks and other entities)
CREATE TYPE priority_level AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

-- Task type enum
CREATE TYPE task_type AS ENUM (
    'one_off',
    'recurring'
);

-- Recurrence pattern enum
CREATE TYPE recurrence_pattern AS ENUM (
    'daily',
    'weekdays',
    'weekly',
    'biweekly',
    'monthly',
    'quarterly',
    'yearly'
);

-- Sync status enum
CREATE TYPE sync_status AS ENUM (
    'pending',
    'synced',
    'failed',
    'cancelled'
);

-- ============================================
-- STEP 2: ADD NEW COLUMNS WITH ENUM TYPES
-- ============================================

-- Projects table
ALTER TABLE projects 
    ADD COLUMN status_enum project_status;

-- Tasks table
ALTER TABLE tasks 
    ADD COLUMN status_enum task_status,
    ADD COLUMN priority_enum priority_level,
    ADD COLUMN task_type_enum task_type,
    ADD COLUMN recurrence_pattern_enum recurrence_pattern;

-- Task calendar events table
ALTER TABLE task_calendar_events 
    ADD COLUMN sync_status_enum sync_status;

-- ============================================
-- STEP 3: MIGRATE DATA TO NEW COLUMNS
-- ============================================

-- Migrate projects.status
UPDATE projects 
SET status_enum = status::project_status
WHERE status IS NOT NULL;

-- Migrate tasks.status
UPDATE tasks 
SET status_enum = status::task_status
WHERE status IS NOT NULL;

-- Migrate tasks.priority
UPDATE tasks 
SET priority_enum = priority::priority_level
WHERE priority IS NOT NULL;

-- Migrate tasks.task_type
UPDATE tasks 
SET task_type_enum = task_type::task_type
WHERE task_type IS NOT NULL;

-- Migrate tasks.recurrence_pattern (handle nulls for non-recurring tasks)
UPDATE tasks 
SET recurrence_pattern_enum = recurrence_pattern::recurrence_pattern
WHERE recurrence_pattern IS NOT NULL;

-- Migrate task_calendar_events.sync_status
UPDATE task_calendar_events 
SET sync_status_enum = sync_status::sync_status
WHERE sync_status IS NOT NULL;

-- ============================================
-- STEP 4: VERIFY DATA MIGRATION
-- ============================================

-- Verify projects migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM projects 
        WHERE status IS NOT NULL AND status_enum IS NULL
    ) THEN
        RAISE EXCEPTION 'Data migration failed for projects.status';
    END IF;
END $$;

-- Verify tasks.status migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM tasks 
        WHERE status IS NOT NULL AND status_enum IS NULL
    ) THEN
        RAISE EXCEPTION 'Data migration failed for tasks.status';
    END IF;
END $$;

-- Verify tasks.priority migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM tasks 
        WHERE priority IS NOT NULL AND priority_enum IS NULL
    ) THEN
        RAISE EXCEPTION 'Data migration failed for tasks.priority';
    END IF;
END $$;

-- Verify tasks.task_type migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM tasks 
        WHERE task_type IS NOT NULL AND task_type_enum IS NULL
    ) THEN
        RAISE EXCEPTION 'Data migration failed for tasks.task_type';
    END IF;
END $$;

-- Verify task_calendar_events.sync_status migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM task_calendar_events 
        WHERE sync_status IS NOT NULL AND sync_status_enum IS NULL
    ) THEN
        RAISE EXCEPTION 'Data migration failed for task_calendar_events.sync_status';
    END IF;
END $$;

-- ============================================
-- STEP 5: HANDLE DEPENDENT VIEWS
-- ============================================

-- Drop the dependent view (we'll recreate it later)
DROP VIEW IF EXISTS recurring_task_summary CASCADE;

-- ============================================
-- STEP 6: DROP OLD COLUMNS AND RENAME NEW ONES
-- ============================================

-- Projects table
ALTER TABLE projects 
    DROP COLUMN status,
    ALTER COLUMN status_enum SET NOT NULL,
    ALTER COLUMN status_enum SET DEFAULT 'active';

ALTER TABLE projects 
    RENAME COLUMN status_enum TO status;

-- Tasks table
ALTER TABLE tasks 
    DROP COLUMN status,
    DROP COLUMN priority,
    DROP COLUMN task_type,
    DROP COLUMN recurrence_pattern;

ALTER TABLE tasks 
    ALTER COLUMN status_enum SET NOT NULL,
    ALTER COLUMN status_enum SET DEFAULT 'backlog',
    ALTER COLUMN priority_enum SET NOT NULL,
    ALTER COLUMN priority_enum SET DEFAULT 'medium',
    ALTER COLUMN task_type_enum SET NOT NULL,
    ALTER COLUMN task_type_enum SET DEFAULT 'one_off';

ALTER TABLE tasks 
    RENAME COLUMN status_enum TO status;
ALTER TABLE tasks 
    RENAME COLUMN priority_enum TO priority;
ALTER TABLE tasks 
    RENAME COLUMN task_type_enum TO task_type;
ALTER TABLE tasks 
    RENAME COLUMN recurrence_pattern_enum TO recurrence_pattern;

-- Task calendar events table
ALTER TABLE task_calendar_events 
    DROP COLUMN sync_status;

ALTER TABLE task_calendar_events 
    ALTER COLUMN sync_status_enum SET NOT NULL,
    ALTER COLUMN sync_status_enum SET DEFAULT 'pending';

ALTER TABLE task_calendar_events 
    RENAME COLUMN sync_status_enum TO sync_status;

-- ============================================
-- STEP 7: RECREATE DEPENDENT VIEWS
-- ============================================

-- Recreate the recurring_task_summary view with new enum types
CREATE OR REPLACE VIEW recurring_task_summary AS
SELECT 
    t.id as task_id,
    t.title,
    t.recurrence_pattern,
    t.recurrence_ends,
    t.start_date,
    t.user_id,
    COUNT(rti.id) as total_instances,
    COUNT(CASE WHEN rti.status = 'completed' THEN 1 END) as completed_instances,
    COUNT(CASE WHEN rti.skipped = true THEN 1 END) as skipped_instances,
    COUNT(CASE WHEN rti.status = 'exception' THEN 1 END) as exception_count,
    MIN(CASE WHEN rti.status = 'pending' THEN rti.instance_date END) as next_occurrence,
    MAX(rti.completed_at) as last_completed_at
FROM tasks t
LEFT JOIN recurring_task_instances rti ON t.id = rti.task_id
WHERE t.task_type = 'recurring'
GROUP BY 
    t.id, t.title, t.recurrence_pattern, t.recurrence_ends,
    t.start_date, t.user_id;

-- View recreated successfully

-- ============================================
-- STEP 8: ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TYPE project_status IS 'Status of a project in its lifecycle';
COMMENT ON TYPE task_status IS 'Current status of a task';
COMMENT ON TYPE priority_level IS 'Priority level for tasks and other entities';
COMMENT ON TYPE task_type IS 'Whether a task is one-off or recurring';
COMMENT ON TYPE recurrence_pattern IS 'Pattern for recurring tasks';
COMMENT ON TYPE sync_status IS 'Synchronization status with external calendar';

-- ============================================
-- ROLLBACK SCRIPT (Save separately)
-- ============================================

/*
-- To rollback this migration, run:

-- Projects table
ALTER TABLE projects 
    ADD COLUMN status_old TEXT;

UPDATE projects 
    SET status_old = status::TEXT;

ALTER TABLE projects 
    DROP COLUMN status,
    ALTER COLUMN status_old SET NOT NULL,
    ALTER COLUMN status_old SET DEFAULT 'active';

ALTER TABLE projects 
    RENAME COLUMN status_old TO status;

-- Tasks table
ALTER TABLE tasks 
    ADD COLUMN status_old TEXT,
    ADD COLUMN priority_old TEXT,
    ADD COLUMN task_type_old TEXT,
    ADD COLUMN recurrence_pattern_old TEXT;

UPDATE tasks 
    SET status_old = status::TEXT,
        priority_old = priority::TEXT,
        task_type_old = task_type::TEXT,
        recurrence_pattern_old = recurrence_pattern::TEXT;

ALTER TABLE tasks 
    DROP COLUMN status,
    DROP COLUMN priority,
    DROP COLUMN task_type,
    DROP COLUMN recurrence_pattern;

ALTER TABLE tasks 
    ALTER COLUMN status_old SET NOT NULL,
    ALTER COLUMN status_old SET DEFAULT 'backlog',
    ALTER COLUMN priority_old SET NOT NULL,
    ALTER COLUMN priority_old SET DEFAULT 'medium',
    ALTER COLUMN task_type_old SET NOT NULL,
    ALTER COLUMN task_type_old SET DEFAULT 'one_off';

ALTER TABLE tasks 
    RENAME COLUMN status_old TO status,
    RENAME COLUMN priority_old TO priority,
    RENAME COLUMN task_type_old TO task_type,
    RENAME COLUMN recurrence_pattern_old TO recurrence_pattern;

-- Task calendar events table
ALTER TABLE task_calendar_events 
    ADD COLUMN sync_status_old TEXT;

UPDATE task_calendar_events 
    SET sync_status_old = sync_status::TEXT;

ALTER TABLE task_calendar_events 
    DROP COLUMN sync_status,
    ALTER COLUMN sync_status_old SET NOT NULL,
    ALTER COLUMN sync_status_old SET DEFAULT 'pending';

ALTER TABLE task_calendar_events 
    RENAME COLUMN sync_status_old TO sync_status;

-- Drop enum types
DROP TYPE IF EXISTS project_status CASCADE;
DROP TYPE IF EXISTS task_status CASCADE;
DROP TYPE IF EXISTS priority_level CASCADE;
DROP TYPE IF EXISTS task_type CASCADE;
DROP TYPE IF EXISTS recurrence_pattern CASCADE;
DROP TYPE IF EXISTS sync_status CASCADE;

*/