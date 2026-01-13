-- packages/shared-types/src/functions/start_or_resume_brief_generation.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.start_or_resume_brief_generation(p_user_id uuid, p_brief_date date, p_force_regenerate boolean DEFAULT false)
 RETURNS TABLE(started boolean, brief_id uuid, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_existing_brief RECORD;
  v_brief_id UUID;
  v_message TEXT;
  v_started BOOLEAN DEFAULT FALSE;
BEGIN
  -- Lock the row for this user and date to prevent concurrent modifications
  SELECT * INTO v_existing_brief
  FROM daily_briefs
  WHERE user_id = p_user_id AND brief_date = p_brief_date
  FOR UPDATE;

  -- Check if brief exists and its status
  IF v_existing_brief.id IS NOT NULL THEN
    -- Check if we should force regenerate
    IF p_force_regenerate THEN
      -- Update existing brief to restart generation
      UPDATE daily_briefs
      SET
        generation_status = 'processing',
        generation_started_at = NOW(),
        generation_error = NULL,
        generation_completed_at = NULL,
        generation_progress = jsonb_build_object('step', 'starting', 'progress', 0),
        updated_at = NOW()
      WHERE id = v_existing_brief.id;

      v_brief_id := v_existing_brief.id;
      v_started := TRUE;
      v_message := 'Brief generation restarted';
    ELSIF v_existing_brief.generation_status = 'processing' THEN
      -- Brief is already being processed
      RAISE EXCEPTION 'P0001:Brief generation already in progress' USING HINT = 'already in progress';
    ELSIF v_existing_brief.generation_status = 'completed' AND NOT p_force_regenerate THEN
      -- Brief already completed and not forcing
      RAISE EXCEPTION 'P0002:Brief already completed for this date' USING HINT = 'already completed';
    ELSE
      -- Resume a failed generation
      UPDATE daily_briefs
      SET
        generation_status = 'processing',
        generation_started_at = NOW(),
        generation_error = NULL,
        updated_at = NOW()
      WHERE id = v_existing_brief.id;

      v_brief_id := v_existing_brief.id;
      v_started := TRUE;
      v_message := 'Brief generation resumed';
    END IF;
  ELSE
    -- Create new brief
    INSERT INTO daily_briefs (
      user_id,
      brief_date,
      summary_content,
      generation_status,
      generation_started_at,
      generation_progress
    )
    VALUES (
      p_user_id,
      p_brief_date,
      '',
      'processing',
      NOW(),
      jsonb_build_object('step', 'starting', 'progress', 0)
    )
    RETURNING id INTO v_brief_id;

    v_started := TRUE;
    v_message := 'New brief generation started';
  END IF;

  -- Return the result
  RETURN QUERY
  SELECT v_started, v_brief_id, v_message;
END;
$function$
