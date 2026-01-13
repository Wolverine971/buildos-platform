-- packages/shared-types/src/functions/record_sms_metric.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.record_sms_metric(p_metric_date date, p_metric_hour integer, p_user_id uuid, p_metric_type text, p_metric_value numeric, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Increment metric value (works for both counters and sum-based averages)
    metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,
    -- Merge metadata (new keys added, existing preserved)
    metadata = sms_metrics.metadata || EXCLUDED.metadata,
    -- Update timestamp
    updated_at = NOW();

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail (metrics should never block core functionality)
    RAISE WARNING 'Error recording SMS metric: % (type: %, user: %)', SQLERRM, p_metric_type, p_user_id;
END;
$function$
