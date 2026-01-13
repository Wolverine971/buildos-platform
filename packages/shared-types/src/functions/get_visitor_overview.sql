-- packages/shared-types/src/functions/get_visitor_overview.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_visitor_overview()
 RETURNS TABLE(total_visitors bigint, visitors_7d bigint, visitors_30d bigint, unique_visitors_today bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_today_start_utc timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    v_today_end_utc timestamptz := v_today_start_utc + INTERVAL '1 day';
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= v_today_start_utc AND created_at < v_today_end_utc) as unique_visitors_today;
END;
$function$
