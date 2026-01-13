-- packages/shared-types/src/functions/acquire_migration_platform_lock.sql
-- acquire_migration_platform_lock(uuid, uuid, integer)
-- Acquire migration platform lock
-- Source: supabase/migrations/20251206_migration_dashboard_schema.sql

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
