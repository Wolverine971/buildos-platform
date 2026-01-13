-- packages/shared-types/src/functions/get_visitor_overview.sql
-- get_visitor_overview()
-- Get visitor overview metrics
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_visitor_overview()
RETURNS TABLE (
  total_visitors integer,
  unique_visitors_today integer,
  visitors_7d integer,
  visitors_30d integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM visitors) as total_visitors,
    (SELECT COUNT(DISTINCT id)::INTEGER FROM visitors WHERE DATE(created_at) = CURRENT_DATE) as unique_visitors_today,
    (SELECT COUNT(DISTINCT id)::INTEGER FROM visitors WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as visitors_7d,
    (SELECT COUNT(DISTINCT id)::INTEGER FROM visitors WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as visitors_30d;
END;
$$;
