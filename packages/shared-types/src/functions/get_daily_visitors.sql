-- packages/shared-types/src/functions/get_daily_visitors.sql
-- get_daily_visitors(date, date)
-- Get daily visitor counts
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_daily_visitors(start_date date, end_date date)
RETURNS TABLE (
  date date,
  visitor_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(v.created_at) as date,
    COUNT(DISTINCT v.id)::INTEGER as visitor_count
  FROM visitors v
  WHERE DATE(v.created_at) BETWEEN start_date AND end_date
  GROUP BY DATE(v.created_at)
  ORDER BY date;
END;
$$;
