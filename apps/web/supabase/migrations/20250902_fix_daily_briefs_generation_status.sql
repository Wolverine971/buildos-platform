-- Fix daily_briefs generation_status constraint to align with queue_jobs status values
-- The issue: daily_briefs uses ['not_started', 'generating', 'completed', 'failed']
-- while queue_jobs uses ['pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying']
-- This migration aligns them for consistency

BEGIN;

-- First, update any existing 'generating' status to 'processing'
UPDATE daily_briefs 
SET generation_status = 'processing' 
WHERE generation_status = 'generating';

-- Update any 'not_started' status to 'pending'
UPDATE daily_briefs 
SET generation_status = 'pending' 
WHERE generation_status = 'not_started';

-- Drop the existing constraint
ALTER TABLE daily_briefs 
DROP CONSTRAINT IF EXISTS daily_briefs_generation_status_check;

-- Add the new constraint that matches queue_jobs status values
ALTER TABLE daily_briefs 
ADD CONSTRAINT daily_briefs_generation_status_check 
CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying'));

-- Also update project_daily_briefs table to match
UPDATE project_daily_briefs 
SET generation_status = 'processing' 
WHERE generation_status = 'generating';

UPDATE project_daily_briefs 
SET generation_status = 'pending' 
WHERE generation_status = 'not_started';

-- Drop the existing constraint on project_daily_briefs
ALTER TABLE project_daily_briefs 
DROP CONSTRAINT IF EXISTS project_daily_briefs_generation_status_check;

-- Add the new constraint to project_daily_briefs
ALTER TABLE project_daily_briefs 
ADD CONSTRAINT project_daily_briefs_generation_status_check 
CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying'));

-- Update the start_daily_brief_generation function to use the correct status values
CREATE OR REPLACE FUNCTION start_daily_brief_generation(
    p_user_id UUID,
    p_brief_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_brief_id UUID;
    v_existing_generation RECORD;
    v_result JSONB;
BEGIN
    -- Check for existing generation in progress for this user
    SELECT id, generation_status, generation_started_at
    INTO v_existing_generation
    FROM daily_briefs
    WHERE user_id = p_user_id
      AND generation_status = 'processing'
      AND generation_started_at > NOW() - INTERVAL '10 minutes'
    LIMIT 1;

    -- If there's an active generation, return error
    IF v_existing_generation.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'started', false,
            'message', 'Another brief is already being generated',
            'existing_brief_id', v_existing_generation.id
        );
    END IF;

    -- Check if brief already exists for this date
    SELECT id INTO v_brief_id
    FROM daily_briefs
    WHERE user_id = p_user_id
      AND brief_date = p_brief_date;

    -- If brief exists, update it for regeneration
    IF v_brief_id IS NOT NULL THEN
        UPDATE daily_briefs
        SET generation_status = 'processing',
            generation_started_at = NOW(),
            generation_error = NULL,
            generation_completed_at = NULL,
            generation_progress = jsonb_build_object(
                'projects_completed', 0,
                'life_goals_completed', 0,
                'total_projects', 0,
                'total_life_goals', 0
            ),
            updated_at = NOW()
        WHERE id = v_brief_id;
    ELSE
        -- Create new brief
        INSERT INTO daily_briefs (
            user_id,
            brief_date,
            summary_content,
            generation_status,
            generation_started_at,
            generation_progress
        ) VALUES (
            p_user_id,
            p_brief_date,
            '',
            'processing',
            NOW(),
            jsonb_build_object(
                'projects_completed', 0,
                'life_goals_completed', 0,
                'total_projects', 0,
                'total_life_goals', 0
            )
        )
        RETURNING id INTO v_brief_id;
    END IF;

    -- Clean up any stale generations for this user
    UPDATE daily_briefs
    SET generation_status = 'failed',
        generation_error = 'Generation timeout',
        generation_completed_at = NOW()
    WHERE user_id = p_user_id
      AND generation_status = 'processing'
      AND generation_started_at < NOW() - INTERVAL '10 minutes'
      AND id != v_brief_id;

    RETURN jsonb_build_object(
        'started', true,
        'brief_id', v_brief_id,
        'message', 'Generation started successfully'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION start_daily_brief_generation TO authenticated;

-- Add comment to document the function
COMMENT ON FUNCTION start_daily_brief_generation IS 'Starts the generation process for a daily brief, managing status transitions and preventing duplicate generations';

COMMIT;