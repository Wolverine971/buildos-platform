-- packages/shared-types/src/functions/record_sms_metric.sql
-- record_sms_metric(date, integer, uuid, text, numeric, jsonb)
-- Record an SMS metric
-- Source: apps/web/supabase/migrations/20251008_sms_metrics_monitoring.sql

CREATE OR REPLACE FUNCTION record_sms_metric(
  p_metric_date DATE,
  p_metric_hour INTEGER,
  p_user_id UUID,
  p_metric_type TEXT,
  p_metric_value NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atomic upsert: insert or increment existing value
  INSERT INTO sms_metrics (
    metric_date,
    metric_hour,
    user_id,
    metric_type,
    metric_value,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    p_metric_date,
    p_metric_hour,
    p_user_id,
    p_metric_type,
    p_metric_value,
    p_metadata,
    NOW(),
    NOW()
  )
  ON CONFLICT (metric_date, metric_hour, user_id, metric_type)
  DO UPDATE SET
    metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,
    metadata = sms_metrics.metadata || EXCLUDED.metadata,
    updated_at = NOW();

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error recording SMS metric: % (type: %, user: %)', SQLERRM, p_metric_type, p_user_id;
END;
$$;
