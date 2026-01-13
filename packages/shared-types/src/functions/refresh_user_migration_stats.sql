-- packages/shared-types/src/functions/refresh_user_migration_stats.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.refresh_user_migration_stats()
 RETURNS TABLE(refreshed boolean, duration_ms integer, row_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
