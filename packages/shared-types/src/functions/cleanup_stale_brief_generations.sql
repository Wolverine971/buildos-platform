-- packages/shared-types/src/functions/cleanup_stale_brief_generations.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.cleanup_stale_brief_generations(p_user_id uuid, p_timeout_minutes integer DEFAULT 10)
 RETURNS TABLE(id uuid, brief_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_timeout_interval INTERVAL;
BEGIN
  v_timeout_interval := (p_timeout_minutes || ' minutes')::INTERVAL;

  -- Update stale processing briefs to failed
  UPDATE daily_briefs
  SET
    generation_status = 'failed',
    generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes',
    generation_completed_at = NOW(),
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND generation_status = 'processing'
    AND generation_started_at IS NOT NULL
    AND generation_started_at < NOW() - v_timeout_interval;

  -- Return the cleaned up briefs
  RETURN QUERY
  SELECT
    db.id,
    db.brief_date
  FROM daily_briefs db
  WHERE
    db.user_id = p_user_id
    AND db.generation_status = 'failed'
    AND db.generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes'
    AND db.generation_completed_at >= NOW() - INTERVAL '1 minute';
END;
$function$
