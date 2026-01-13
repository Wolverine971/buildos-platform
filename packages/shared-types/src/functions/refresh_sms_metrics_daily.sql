-- packages/shared-types/src/functions/refresh_sms_metrics_daily.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.refresh_sms_metrics_daily()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CONCURRENTLY allows queries during refresh (requires unique index)
  REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail (monitoring infrastructure should be resilient)
    RAISE WARNING 'Error refreshing sms_metrics_daily materialized view: %', SQLERRM;
END;
$function$
