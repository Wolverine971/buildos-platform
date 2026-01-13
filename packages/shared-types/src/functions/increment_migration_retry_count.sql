-- packages/shared-types/src/functions/increment_migration_retry_count.sql
-- increment_migration_retry_count(bigint)
-- Increment migration retry count
-- Source: supabase/migrations/20251206_migration_dashboard_schema.sql

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
