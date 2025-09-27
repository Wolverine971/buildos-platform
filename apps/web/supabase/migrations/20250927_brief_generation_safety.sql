-- Migration: Add RPC functions for safe brief generation
-- Description: Adds atomic operations for brief generation to prevent race conditions

-- Function to clean up stale brief generations
CREATE OR REPLACE FUNCTION cleanup_stale_brief_generations(
  p_user_id UUID,
  p_timeout_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(id UUID, brief_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Function to atomically start or resume brief generation
CREATE OR REPLACE FUNCTION start_or_resume_brief_generation(
  p_user_id UUID,
  p_brief_date DATE,
  p_force_regenerate BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(started BOOLEAN, brief_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_stale_brief_generations(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION start_or_resume_brief_generation(UUID, DATE, BOOLEAN) TO authenticated;