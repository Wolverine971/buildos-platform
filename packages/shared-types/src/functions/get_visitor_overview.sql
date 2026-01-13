-- packages/shared-types/src/functions/get_visitor_overview.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_visitor_overview()
 RETURNS TABLE(total_visitors bigint, visitors_7d bigint, visitors_30d bigint, unique_visitors_today bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE) as unique_visitors_today;
END;
$function$
