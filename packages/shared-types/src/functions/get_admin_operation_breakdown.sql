-- packages/shared-types/src/functions/get_admin_operation_breakdown.sql
-- get_admin_operation_breakdown(timestamptz, timestamptz)
-- Get operation breakdown for admin dashboard
-- Source: apps/web/supabase/migrations/llm_usage_tracking.sql

CREATE OR REPLACE FUNCTION get_admin_operation_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  operation VARCHAR,
  requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time INTEGER,
  success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.operation_type::VARCHAR as operation,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate
  FROM llm_usage_logs l
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.operation_type
  ORDER BY total_cost DESC;
END;
$$;
