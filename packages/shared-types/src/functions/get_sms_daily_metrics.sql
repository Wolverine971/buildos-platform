-- packages/shared-types/src/functions/get_sms_daily_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_sms_daily_metrics(p_start_date date, p_end_date date)
 RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, cancelled_count integer, avg_delivery_time_ms numeric, avg_generation_time_ms numeric, llm_success_count integer, template_fallback_count integer, delivery_success_rate numeric, llm_success_rate numeric, llm_cost_usd numeric, sms_cost_usd numeric, opt_out_count integer, quiet_hours_skip_count integer, daily_limit_hit_count integer, delivery_rate_percent numeric, llm_success_rate_percent numeric, active_users integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    m.scheduled_count,
    m.sent_count,
    m.delivered_count,
    m.failed_count,
    m.cancelled_count,
    m.avg_delivery_time_ms,
    m.avg_generation_time_ms,
    m.llm_success_count,
    m.template_fallback_count,
    m.delivery_success_rate,
    m.llm_success_rate,
    m.llm_cost_usd,
    m.sms_cost_usd,
    m.opt_out_count,
    m.quiet_hours_skip_count,
    m.daily_limit_hit_count,
    m.delivery_rate_percent,
    m.llm_success_rate_percent,
    m.active_users
  FROM sms_metrics_daily m
  WHERE m.metric_date >= p_start_date
    AND m.metric_date <= p_end_date
  ORDER BY m.metric_date DESC;
END;
$function$
