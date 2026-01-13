-- packages/shared-types/src/functions/get_user_sms_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_user_sms_metrics(p_user_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, llm_cost_usd numeric, delivery_rate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    COALESCE(SUM(CASE WHEN m.metric_type = 'scheduled_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as scheduled_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as sent_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as delivered_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'failed_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as failed_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'llm_cost_usd' THEN m.metric_value ELSE 0 END), 0)::NUMERIC(10, 6) as llm_cost_usd,
    CASE
      WHEN SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) > 0
      THEN (SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END)::NUMERIC /
            SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) * 100)
      ELSE 0
    END::NUMERIC(5, 2) as delivery_rate
  FROM sms_metrics m
  WHERE m.user_id = p_user_id
    AND m.metric_hour IS NULL  -- Only daily metrics
    AND m.metric_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY m.metric_date
  ORDER BY m.metric_date DESC;
END;
$function$
