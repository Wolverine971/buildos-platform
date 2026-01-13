-- packages/shared-types/src/functions/cleanup_stale_brief_generations.sql
-- cleanup_stale_brief_generations(uuid, integer)
-- Cleanup stale brief generations
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION cleanup_stale_brief_generations(
  p_user_id uuid,
  p_timeout_minutes integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  brief_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark stale generations as failed
  UPDATE ontology_daily_briefs
  SET generation_status = 'failed',
      generation_error = 'Stale generation cleaned up'
  WHERE user_id = p_user_id
    AND generation_status = 'processing'
    AND generation_started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;

  RETURN QUERY
  SELECT odb.id, odb.brief_date
  FROM ontology_daily_briefs odb
  WHERE odb.user_id = p_user_id
    AND odb.generation_status = 'failed'
    AND odb.generation_error = 'Stale generation cleaned up';
END;
$$;
