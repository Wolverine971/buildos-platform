-- packages/shared-types/src/functions/get_user_llm_usage.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_user_llm_usage(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(total_requests bigint, total_cost numeric, total_tokens bigint, avg_response_time numeric, by_operation jsonb, by_model jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
