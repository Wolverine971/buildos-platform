-- packages/shared-types/src/functions/get_migration_platform_lock_status.sql
-- get_migration_platform_lock_status()
-- Get migration lock status
-- Source: supabase/migrations/20251206_migration_dashboard_schema.sql

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
