-- packages/shared-types/src/functions/get_admin_model_breakdown.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_admin_model_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(model character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, success_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    l.model_used as model,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate
  FROM llm_usage_logs l
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.model_used
  ORDER BY total_cost DESC;
END;
$function$
