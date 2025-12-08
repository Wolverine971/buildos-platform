-- supabase/migrations/20251206_migration_dashboard_schema.sql
-- Migration: Add migration dashboard schema changes
-- Description: Adds user_id, error tracking, platform lock, and stats views for migration dashboard
-- Author: Claude
-- Date: 2025-12-06

-- ============================================================================
-- 1. Add user_id to migration_log for efficient per-user queries
-- ============================================================================

ALTER TABLE migration_log
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add error tracking columns
ALTER TABLE migration_log
    ADD COLUMN IF NOT EXISTS error_category TEXT,
    ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Add check constraint for error_category
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'migration_log_error_category_check'
    ) THEN
        ALTER TABLE migration_log
            ADD CONSTRAINT migration_log_error_category_check
            CHECK (error_category IS NULL OR error_category IN ('recoverable', 'data', 'fatal'));
    END IF;
END $$;

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_migration_log_user
    ON migration_log (user_id)
    WHERE user_id IS NOT NULL;

-- Index for error filtering
CREATE INDEX IF NOT EXISTS idx_migration_log_errors
    ON migration_log (error_category, entity_type, status)
    WHERE status = 'failed';

-- Index for retry tracking
CREATE INDEX IF NOT EXISTS idx_migration_log_retry
    ON migration_log (retry_count, last_retry_at)
    WHERE status = 'failed' AND retry_count < 3;

-- ============================================================================
-- 2. Backfill user_id from legacy project/task data
-- ============================================================================

-- Backfill user_id for projects
UPDATE migration_log ml
SET user_id = p.user_id
FROM projects p
WHERE ml.legacy_id = p.id
    AND ml.entity_type = 'project'
    AND ml.user_id IS NULL;

-- Backfill user_id for tasks (via project)
UPDATE migration_log ml
SET user_id = p.user_id
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE ml.legacy_id = t.id
    AND ml.entity_type = 'task'
    AND ml.user_id IS NULL;

-- Backfill user_id for phases (via project)
UPDATE migration_log ml
SET user_id = p.user_id
FROM phases ph
JOIN projects p ON ph.project_id = p.id
WHERE ml.legacy_id = ph.id
    AND ml.entity_type = 'phase'
    AND ml.user_id IS NULL;

-- Backfill user_id for calendar events (via task -> project)
UPDATE migration_log ml
SET user_id = p.user_id
FROM task_calendar_events tce
JOIN tasks t ON tce.task_id = t.id
JOIN projects p ON t.project_id = p.id
WHERE ml.legacy_id = tce.id
    AND ml.entity_type = 'calendar'
    AND ml.user_id IS NULL;

-- ============================================================================
-- 3. Create platform run mutex table
-- ============================================================================

CREATE TABLE IF NOT EXISTS migration_platform_lock (
    id INTEGER PRIMARY KEY DEFAULT 1,
    run_id UUID,
    locked_by UUID REFERENCES auth.users(id),
    locked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    CONSTRAINT migration_platform_lock_single_row CHECK (id = 1)
);

-- Initialize the singleton row if it doesn't exist
INSERT INTO migration_platform_lock (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. Create user migration stats materialized view
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS user_migration_stats;

CREATE MATERIALIZED VIEW user_migration_stats AS
SELECT
    u.id AS user_id,
    u.email,
    u.raw_user_meta_data->>'name' AS name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(project_counts.total_projects, 0) AS total_projects,
    COALESCE(project_counts.migrated_projects, 0) AS migrated_projects,
    COALESCE(project_counts.total_projects, 0) - COALESCE(project_counts.migrated_projects, 0) AS pending_projects,
    COALESCE(error_counts.failed_projects, 0) AS failed_projects,
    COALESCE(task_counts.total_tasks, 0) AS total_tasks,
    COALESCE(task_counts.migrated_tasks, 0) AS migrated_tasks,
    project_counts.last_migration_at,
    CASE
        WHEN COALESCE(project_counts.total_projects, 0) = 0 THEN 'no_projects'
        WHEN COALESCE(project_counts.migrated_projects, 0) = 0 THEN 'not_started'
        WHEN COALESCE(error_counts.failed_projects, 0) > 0 THEN 'has_errors'
        WHEN project_counts.migrated_projects = project_counts.total_projects THEN 'complete'
        ELSE 'partial'
    END AS migration_status,
    CASE
        WHEN COALESCE(project_counts.total_projects, 0) = 0 THEN 0
        ELSE ROUND(
            (COALESCE(project_counts.migrated_projects, 0)::NUMERIC /
             project_counts.total_projects) * 100, 1
        )
    END AS percent_complete
FROM auth.users u
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN lem.onto_id IS NOT NULL THEN p.id END) AS migrated_projects,
        MAX(lem.migrated_at) AS last_migration_at
    FROM projects p
    LEFT JOIN legacy_entity_mappings lem
        ON lem.legacy_table = 'projects' AND lem.legacy_id = p.id
    WHERE p.user_id = u.id
) project_counts ON true
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT ml.legacy_id) AS failed_projects
    FROM migration_log ml
    WHERE ml.user_id = u.id
        AND ml.entity_type = 'project'
        AND ml.status = 'failed'
) error_counts ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN lem.onto_id IS NOT NULL THEN t.id END) AS migrated_tasks
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN legacy_entity_mappings lem
        ON lem.legacy_table = 'tasks' AND lem.legacy_id = t.id
    WHERE p.user_id = u.id
        AND t.deleted_at IS NULL
) task_counts ON true;

-- Unique index for efficient concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_migration_stats_user
    ON user_migration_stats (user_id);

-- Additional indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_user_migration_stats_status
    ON user_migration_stats (migration_status);

CREATE INDEX IF NOT EXISTS idx_user_migration_stats_percent
    ON user_migration_stats (percent_complete);

-- ============================================================================
-- 5. Create global migration progress view
-- ============================================================================

CREATE OR REPLACE VIEW global_migration_progress AS
SELECT
    (SELECT COUNT(*) FROM projects) AS total_projects,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM legacy_entity_mappings
     WHERE legacy_table = 'projects') AS migrated_projects,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM migration_log
     WHERE entity_type = 'project' AND status = 'failed') AS failed_projects,
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL) AS total_tasks,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM legacy_entity_mappings
     WHERE legacy_table = 'tasks') AS migrated_tasks,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM migration_log
     WHERE entity_type = 'task' AND status = 'failed') AS failed_tasks,
    (SELECT COUNT(*) FROM auth.users) AS total_users,
    (SELECT COUNT(DISTINCT u.id)
     FROM auth.users u
     JOIN projects p ON p.user_id = u.id) AS users_with_projects,
    -- Error counts by category
    (SELECT COUNT(*) FROM migration_log WHERE status = 'failed') AS total_errors,
    (SELECT COUNT(*) FROM migration_log WHERE status = 'failed' AND error_category = 'recoverable') AS recoverable_errors,
    (SELECT COUNT(*) FROM migration_log WHERE status = 'failed' AND error_category = 'data') AS data_errors,
    (SELECT COUNT(*) FROM migration_log WHERE status = 'failed' AND error_category = 'fatal') AS fatal_errors;

-- ============================================================================
-- 6. Create function to refresh materialized view
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_user_migration_stats()
RETURNS TABLE(refreshed boolean, duration_ms integer, row_count integer) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    rows_count INTEGER;
BEGIN
    start_time := clock_timestamp();

    REFRESH MATERIALIZED VIEW CONCURRENTLY user_migration_stats;

    end_time := clock_timestamp();

    SELECT COUNT(*) INTO rows_count FROM user_migration_stats;

    RETURN QUERY SELECT
        true AS refreshed,
        EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER AS duration_ms,
        rows_count AS row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. Create function to acquire platform lock
-- ============================================================================

CREATE OR REPLACE FUNCTION acquire_migration_platform_lock(
    p_run_id UUID,
    p_locked_by UUID,
    p_duration_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
    acquired BOOLEAN,
    existing_run_id UUID,
    existing_locked_by UUID,
    existing_locked_at TIMESTAMPTZ,
    existing_expires_at TIMESTAMPTZ
) AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_current_lock RECORD;
BEGIN
    v_expires_at := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

    -- Try to acquire the lock
    UPDATE migration_platform_lock
    SET
        run_id = p_run_id,
        locked_by = p_locked_by,
        locked_at = NOW(),
        expires_at = v_expires_at
    WHERE id = 1
        AND (run_id IS NULL OR expires_at < NOW())
    RETURNING * INTO v_current_lock;

    IF FOUND THEN
        -- Lock acquired
        RETURN QUERY SELECT
            true AS acquired,
            NULL::UUID AS existing_run_id,
            NULL::UUID AS existing_locked_by,
            NULL::TIMESTAMPTZ AS existing_locked_at,
            NULL::TIMESTAMPTZ AS existing_expires_at;
    ELSE
        -- Lock not acquired, return existing lock info
        SELECT * INTO v_current_lock FROM migration_platform_lock WHERE id = 1;

        RETURN QUERY SELECT
            false AS acquired,
            v_current_lock.run_id AS existing_run_id,
            v_current_lock.locked_by AS existing_locked_by,
            v_current_lock.locked_at AS existing_locked_at,
            v_current_lock.expires_at AS existing_expires_at;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. Create function to release platform lock
-- ============================================================================

CREATE OR REPLACE FUNCTION release_migration_platform_lock(p_run_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_released BOOLEAN;
BEGIN
    UPDATE migration_platform_lock
    SET
        run_id = NULL,
        locked_by = NULL,
        locked_at = NULL,
        expires_at = NULL
    WHERE id = 1 AND run_id = p_run_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. Create function to get platform lock status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_migration_platform_lock_status()
RETURNS TABLE(
    is_locked BOOLEAN,
    run_id UUID,
    locked_by UUID,
    locked_by_email TEXT,
    locked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (mpl.run_id IS NOT NULL AND mpl.expires_at > NOW()) AS is_locked,
        mpl.run_id,
        mpl.locked_by,
        u.email AS locked_by_email,
        mpl.locked_at,
        mpl.expires_at
    FROM migration_platform_lock mpl
    LEFT JOIN auth.users u ON u.id = mpl.locked_by
    WHERE mpl.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. Grant necessary permissions
-- ============================================================================

-- Grant access to the materialized view
GRANT SELECT ON user_migration_stats TO authenticated;
GRANT SELECT ON global_migration_progress TO authenticated;
GRANT SELECT ON migration_platform_lock TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION refresh_user_migration_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION acquire_migration_platform_lock(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION release_migration_platform_lock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_migration_platform_lock_status() TO authenticated;

-- ============================================================================
-- 11. Create helper function for incrementing retry count
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_migration_retry_count(row_id BIGINT)
RETURNS void AS $$
BEGIN
    UPDATE migration_log
    SET
        retry_count = COALESCE(retry_count, 0) + 1,
        last_retry_at = NOW()
    WHERE id = row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_migration_retry_count(BIGINT) TO authenticated;

-- ============================================================================
-- 12. Initial refresh of the materialized view
-- ============================================================================

-- Perform initial refresh (non-concurrent since view is new)
REFRESH MATERIALIZED VIEW user_migration_stats;
