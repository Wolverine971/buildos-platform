-- packages/shared-types/src/functions/update_llm_usage_summary.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.update_llm_usage_summary(p_user_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_models_breakdown JSONB;
  v_operations_breakdown JSONB;
BEGIN
  -- Build models breakdown
  SELECT jsonb_object_agg(
    model_used,
    jsonb_build_object(
      'requests', COUNT(*),
      'cost', SUM(total_cost_usd),
      'tokens', SUM(total_tokens)
    )
  )
  INTO v_models_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  GROUP BY model_used;

  -- Build operations breakdown
  SELECT jsonb_object_agg(
    operation_type::text,
    jsonb_build_object(
      'requests', COUNT(*),
      'cost', SUM(total_cost_usd),
      'tokens', SUM(total_tokens)
    )
  )
  INTO v_operations_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  GROUP BY operation_type;

  -- Upsert summary
  INSERT INTO llm_usage_summary (
    user_id,
    summary_date,
    summary_type,
    total_requests,
    successful_requests,
    failed_requests,
    total_tokens,
    total_prompt_tokens,
    total_completion_tokens,
    total_cost_usd,
    avg_response_time_ms,
    min_response_time_ms,
    max_response_time_ms,
    models_used,
    operations_breakdown
  )
  SELECT
    p_user_id,
    p_date,
    'daily',
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status != 'success'),
    SUM(total_tokens),
    SUM(prompt_tokens),
    SUM(completion_tokens),
    SUM(total_cost_usd),
    AVG(response_time_ms)::INTEGER,
    MIN(response_time_ms),
    MAX(response_time_ms),
    v_models_breakdown,
    v_operations_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  ON CONFLICT (user_id, summary_date, summary_type)
  DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    total_tokens = EXCLUDED.total_tokens,
    total_prompt_tokens = EXCLUDED.total_prompt_tokens,
    total_completion_tokens = EXCLUDED.total_completion_tokens,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    min_response_time_ms = EXCLUDED.min_response_time_ms,
    max_response_time_ms = EXCLUDED.max_response_time_ms,
    models_used = EXCLUDED.models_used,
    operations_breakdown = EXCLUDED.operations_breakdown,
    updated_at = NOW();
END;
$function$
