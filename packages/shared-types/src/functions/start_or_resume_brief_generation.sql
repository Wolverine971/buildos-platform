-- packages/shared-types/src/functions/start_or_resume_brief_generation.sql
-- start_or_resume_brief_generation(uuid, date, boolean)
-- Start or resume brief generation
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION start_or_resume_brief_generation(
  p_user_id uuid,
  p_brief_date date,
  p_force_regenerate boolean DEFAULT false
)
RETURNS TABLE (
  brief_id uuid,
  started boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing RECORD;
  v_actor_id uuid;
  v_brief_id uuid;
BEGIN
  -- Get actor ID
  SELECT id INTO v_actor_id FROM onto_actors WHERE user_id = p_user_id LIMIT 1;

  -- Check for existing brief
  SELECT * INTO v_existing
  FROM ontology_daily_briefs
  WHERE user_id = p_user_id AND brief_date = p_brief_date;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.generation_status = 'completed' AND NOT p_force_regenerate THEN
      RETURN QUERY SELECT v_existing.id, false, 'Brief already completed'::text;
      RETURN;
    END IF;

    IF v_existing.generation_status = 'processing' THEN
      RETURN QUERY SELECT v_existing.id, false, 'Brief generation in progress'::text;
      RETURN;
    END IF;

    -- Update existing to restart
    UPDATE ontology_daily_briefs
    SET generation_status = 'processing',
        generation_started_at = NOW(),
        generation_error = NULL
    WHERE id = v_existing.id;

    RETURN QUERY SELECT v_existing.id, true, 'Resuming generation'::text;
    RETURN;
  END IF;

  -- Create new brief
  INSERT INTO ontology_daily_briefs (user_id, actor_id, brief_date, generation_status, generation_started_at)
  VALUES (p_user_id, v_actor_id, p_brief_date, 'processing', NOW())
  RETURNING id INTO v_brief_id;

  RETURN QUERY SELECT v_brief_id, true, 'Started new generation'::text;
END;
$$;
