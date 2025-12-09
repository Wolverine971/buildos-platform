-- apps/web/supabase/migrations/llm_usage_tracking_fix.sql
-- ============================================
-- Fix for nested aggregate function error in get_user_llm_usage
-- ============================================

-- Drop and recreate the function with proper structure
DROP FUNCTION IF EXISTS get_user_llm_usage(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_user_llm_usage(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time NUMERIC,
  by_operation JSONB,
  by_model JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_requests BIGINT;
  v_total_cost NUMERIC;
  v_total_tokens BIGINT;
  v_avg_response_time NUMERIC;
  v_by_operation JSONB;
  v_by_model JSONB;
BEGIN
  -- Get overall stats
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(l.total_cost_usd), 0)::NUMERIC,
    COALESCE(SUM(l.total_tokens), 0)::BIGINT,
    COALESCE(AVG(l.response_time_ms), 0)::NUMERIC
  INTO v_total_requests, v_total_cost, v_total_tokens, v_avg_response_time
  FROM llm_usage_logs l
  WHERE l.user_id = p_user_id
    AND l.created_at BETWEEN p_start_date AND p_end_date;

  -- Get breakdown by operation
  SELECT COALESCE(
    jsonb_object_agg(
      operation_type::text,
      jsonb_build_object(
        'requests', requests,
        'cost', cost,
        'tokens', tokens
      )
    ),
    '{}'::jsonb
  )
  INTO v_by_operation
  FROM (
    SELECT
      l.operation_type,
      COUNT(*) as requests,
      SUM(l.total_cost_usd) as cost,
      SUM(l.total_tokens) as tokens
    FROM llm_usage_logs l
    WHERE l.user_id = p_user_id
      AND l.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY l.operation_type
  ) op_stats;

  -- Get breakdown by model
  SELECT COALESCE(
    jsonb_object_agg(
      model_used,
      jsonb_build_object(
        'requests', requests,
        'cost', cost,
        'tokens', tokens
      )
    ),
    '{}'::jsonb
  )
  INTO v_by_model
  FROM (
    SELECT
      l.model_used,
      COUNT(*) as requests,
      SUM(l.total_cost_usd) as cost,
      SUM(l.total_tokens) as tokens
    FROM llm_usage_logs l
    WHERE l.user_id = p_user_id
      AND l.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY l.model_used
  ) model_stats;

  -- Return single row with all computed values
  RETURN QUERY
  SELECT
    v_total_requests,
    v_total_cost,
    v_total_tokens,
    v_avg_response_time,
    v_by_operation,
    v_by_model;
END;
$$;

COMMENT ON FUNCTION get_user_llm_usage IS
  'Returns aggregated LLM usage statistics for a user within a date range. Fixed version without nested aggregates.';