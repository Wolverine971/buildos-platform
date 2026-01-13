-- packages/shared-types/src/functions/refresh_user_migration_stats.sql
-- refresh_user_migration_stats()
-- Refresh user migration stats
-- Source: supabase/migrations/20251206_migration_dashboard_schema.sql

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
