-- Migration: Onboarding V2 Schema
-- Description: Add support for new onboarding flow with user archetypes, productivity challenges, and SMS notification preferences
-- Date: 2025-10-03

-- ============================================================================
-- 1. Add user archetype and productivity tracking to users table
-- ============================================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS usage_archetype TEXT CHECK (
  usage_archetype IN ('second_brain', 'ai_task_manager', 'project_todo_list')
),
ADD COLUMN IF NOT EXISTS productivity_challenges JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS onboarding_v2_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_v2_skipped_calendar BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_v2_skipped_sms BOOLEAN DEFAULT false;

-- Add index for archetype filtering
CREATE INDEX IF NOT EXISTS idx_users_usage_archetype ON users(usage_archetype)
WHERE usage_archetype IS NOT NULL;

-- Add index for onboarding v2 completion tracking
CREATE INDEX IF NOT EXISTS idx_users_onboarding_v2_completed ON users(onboarding_v2_completed_at)
WHERE onboarding_v2_completed_at IS NOT NULL;

-- ============================================================================
-- 2. Update user_context with onboarding v2 fields
-- ============================================================================

ALTER TABLE user_context
ADD COLUMN IF NOT EXISTS onboarding_version INTEGER DEFAULT 1;

-- Add index for onboarding version queries
CREATE INDEX IF NOT EXISTS idx_user_context_onboarding_version ON user_context(onboarding_version);

-- ============================================================================
-- 3. Add SMS notification preferences (extend existing table)
-- ============================================================================

-- Note: user_sms_preferences table already exists from migration 20250928_add_sms_messaging_tables.sql
-- We're just adding new columns for the onboarding flow

ALTER TABLE user_sms_preferences
ADD COLUMN IF NOT EXISTS morning_kickoff_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS morning_kickoff_time TIME DEFAULT '08:00:00',
ADD COLUMN IF NOT EXISTS next_up_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS event_reminders_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS evening_recap_enabled BOOLEAN DEFAULT false;

-- ============================================================================
-- 4. Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN users.usage_archetype IS 'User archetype selected during onboarding: second_brain, ai_task_manager, or project_todo_list';
COMMENT ON COLUMN users.productivity_challenges IS 'Array of productivity challenge IDs selected during onboarding (e.g., ["time_management", "focus_adhd"])';
COMMENT ON COLUMN users.onboarding_v2_completed_at IS 'Timestamp when user completed onboarding v2 flow';
COMMENT ON COLUMN users.onboarding_v2_skipped_calendar IS 'Whether user skipped calendar analysis during onboarding';
COMMENT ON COLUMN users.onboarding_v2_skipped_sms IS 'Whether user skipped SMS setup during onboarding';

COMMENT ON COLUMN user_context.onboarding_version IS 'Version of onboarding flow completed (1 = v1, 2 = v2)';

COMMENT ON COLUMN user_sms_preferences.morning_kickoff_enabled IS 'Send morning SMS with daily priorities';
COMMENT ON COLUMN user_sms_preferences.morning_kickoff_time IS 'Time to send morning kickoff SMS';
COMMENT ON COLUMN user_sms_preferences.next_up_enabled IS 'Send SMS about next item on schedule';
COMMENT ON COLUMN user_sms_preferences.event_reminders_enabled IS 'Send SMS reminders for upcoming events';
COMMENT ON COLUMN user_sms_preferences.evening_recap_enabled IS 'Send evening SMS with daily recap';

-- ============================================================================
-- 5. Update RLS policies (if needed)
-- ============================================================================

-- Users can view/update their own archetype and challenges
-- Existing RLS policies on users table should already cover this

-- Verify user_context policies allow updates to new columns
-- (Should be covered by existing policies, but adding comment for clarity)

-- ============================================================================
-- 6. Data migration - Mark existing users as onboarding v1
-- ============================================================================

-- Update all existing users who have completed onboarding to version 1
UPDATE user_context
SET onboarding_version = 1
WHERE user_id IN (
  SELECT id FROM users WHERE completed_onboarding = true
)
AND onboarding_version IS NULL;

-- ============================================================================
-- 7. Helper function to get onboarding progress
-- ============================================================================

CREATE OR REPLACE FUNCTION get_onboarding_v2_progress(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_user_data RECORD;
  v_sms_data RECORD;
  v_project_count INTEGER;
BEGIN
  -- Get user data
  SELECT
    usage_archetype,
    productivity_challenges,
    onboarding_v2_completed_at,
    onboarding_v2_skipped_calendar,
    onboarding_v2_skipped_sms
  INTO v_user_data
  FROM users
  WHERE id = p_user_id;

  -- Get SMS data
  SELECT phone_verified
  INTO v_sms_data
  FROM user_sms_preferences
  WHERE user_id = p_user_id;

  -- Get project count
  SELECT COUNT(*)
  INTO v_project_count
  FROM projects
  WHERE user_id = p_user_id;

  -- Build result
  v_result := jsonb_build_object(
    'hasCompletedOnboarding', v_user_data.onboarding_v2_completed_at IS NOT NULL,
    'archetype', v_user_data.usage_archetype,
    'challenges', COALESCE(v_user_data.productivity_challenges, '[]'::jsonb),
    'hasPhoneVerified', COALESCE(v_sms_data.phone_verified, false),
    'hasCreatedProjects', v_project_count > 0,
    'skippedCalendar', COALESCE(v_user_data.onboarding_v2_skipped_calendar, false),
    'skippedSMS', COALESCE(v_user_data.onboarding_v2_skipped_sms, false),
    'completedAt', v_user_data.onboarding_v2_completed_at
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_onboarding_v2_progress(UUID) TO authenticated;

COMMENT ON FUNCTION get_onboarding_v2_progress IS 'Get onboarding v2 progress for a user';
