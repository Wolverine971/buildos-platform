-- packages/shared-types/src/functions/get_daily_visitors.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_daily_visitors(start_date date, end_date date)
 RETURNS TABLE(date date, visitor_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(start_date::DATE, end_date::DATE, '1 day'::INTERVAL)::DATE AS date
    ),
    daily_counts AS (
        SELECT 
            DATE(created_at AT TIME ZONE 'UTC') as visit_date,
            COUNT(DISTINCT visitor_id) as visitor_count
        FROM visitors 
        WHERE DATE(created_at AT TIME ZONE 'UTC') BETWEEN start_date AND end_date
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    )
    SELECT 
        ds.date,
        COALESCE(dc.visitor_count, 0) as visitor_count
    FROM date_series ds
    LEFT JOIN daily_counts dc ON ds.date = dc.visit_date
    ORDER BY ds.date ASC;
END;
$function$
