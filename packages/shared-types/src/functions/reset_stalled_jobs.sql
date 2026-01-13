-- packages/shared-types/src/functions/reset_stalled_jobs.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE queue_jobs
  SET
    status = 'pending',
    started_at = NULL,
    updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - p_stall_timeout::INTERVAL;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  IF v_reset_count > 0 THEN
    RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
  END IF;

  RETURN v_reset_count;
END;
$function$
