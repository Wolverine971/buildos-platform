-- packages/shared-types/src/functions/get_user_llm_usage.sql
-- get_user_llm_usage(uuid, timestamptz, timestamptz)
-- Returns aggregated LLM usage statistics for a user within a date range
-- Source: apps/web/supabase/migrations/llm_usage_tracking.sql

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
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    SUM(total_cost_usd)::NUMERIC as total_cost,
    SUM(total_tokens)::BIGINT as total_tokens,
    AVG(response_time_ms)::NUMERIC as avg_response_time,

    -- Breakdown by operation
    jsonb_object_agg(
      operation_type::text,
      jsonb_build_object(
        'requests', op_stats.requests,
        'cost', op_stats.cost,
        'tokens', op_stats.tokens
      )
    ) FILTER (WHERE operation_type IS NOT NULL) as by_operation,

    -- Breakdown by model
    jsonb_object_agg(
      model_used,
      jsonb_build_object(
        'requests', model_stats.requests,
        'cost', model_stats.cost,
        'tokens', model_stats.tokens
      )
    ) FILTER (WHERE model_used IS NOT NULL) as by_model

  FROM llm_usage_logs l
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) as requests,
      SUM(total_cost_usd) as cost,
      SUM(total_tokens) as tokens
    FROM llm_usage_logs
    WHERE user_id = p_user_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND operation_type = l.operation_type
    GROUP BY operation_type
  ) op_stats ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) as requests,
      SUM(total_cost_usd) as cost,
      SUM(total_tokens) as tokens
    FROM llm_usage_logs
    WHERE user_id = p_user_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND model_used = l.model_used
    GROUP BY model_used
  ) model_stats ON true
  WHERE l.user_id = p_user_id
    AND l.created_at BETWEEN p_start_date AND p_end_date;
END;
$$;
