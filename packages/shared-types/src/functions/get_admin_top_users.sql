-- packages/shared-types/src/functions/get_admin_top_users.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_admin_top_users(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, email character varying, name character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, last_usage timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
