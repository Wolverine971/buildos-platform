-- packages/shared-types/src/functions/release_migration_platform_lock.sql
-- release_migration_platform_lock(uuid)
-- Release migration platform lock
-- Source: supabase/migrations/20251206_migration_dashboard_schema.sql

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
