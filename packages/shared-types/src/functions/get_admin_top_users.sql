-- packages/shared-types/src/functions/get_admin_top_users.sql
-- get_admin_top_users(timestamptz, timestamptz, integer)
-- Get top users by cost for admin dashboard
-- Source: apps/web/supabase/migrations/llm_usage_tracking.sql

CREATE OR REPLACE FUNCTION get_admin_top_users(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  email VARCHAR,
  name VARCHAR,
  requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time INTEGER,
  last_usage TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.user_id,
    u.email::VARCHAR,
    u.name::VARCHAR,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    MAX(l.created_at) as last_usage
  FROM llm_usage_logs l
  JOIN users u ON u.id = l.user_id
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.user_id, u.email, u.name
  ORDER BY total_cost DESC
  LIMIT p_limit;
END;
$$;
