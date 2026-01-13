-- packages/shared-types/src/functions/refresh_sms_metrics_daily.sql
-- refresh_sms_metrics_daily()
-- Refresh SMS metrics daily
-- Source: apps/web/supabase/migrations/20251008_sms_metrics_monitoring.sql

CREATE OR REPLACE FUNCTION refresh_sms_metrics_daily()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CONCURRENTLY allows queries during refresh (requires unique index)
  REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error refreshing sms_metrics_daily materialized view: %', SQLERRM;
END;
$$;
