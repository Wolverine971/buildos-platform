-- =====================================================
-- Notification System Phase 3: User Brief Notifications
-- =====================================================
-- This migration adds auto-subscription for users to brief.completed events
-- and sets up default email preferences for daily brief notifications.

-- =====================================================
-- 1. Add brief.completed event type to notification_events check constraint
-- =====================================================

-- Drop existing constraint
ALTER TABLE notification_events DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

-- Add new constraint with brief.completed and brief.failed
ALTER TABLE notification_events
ADD CONSTRAINT notification_events_event_type_check
CHECK (event_type IN (
  'user.signup',
  'user.trial_expired',
  'payment.failed',
  'error.critical',
  'brief.completed',
  'brief.failed',
  'brain_dump.processed',
  'task.due_soon',
  'project.phase_scheduled',
  'calendar.sync_failed'
));

-- =====================================================
-- 2. Create trigger function to auto-subscribe users to brief.completed events
-- =====================================================

CREATE OR REPLACE FUNCTION auto_subscribe_user_to_brief_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- Create subscription for brief.completed events
  INSERT INTO notification_subscriptions (user_id, event_type, is_active, admin_only)
  VALUES (NEW.id, 'brief.completed', true, false)
  ON CONFLICT (user_id, event_type) DO NOTHING;

  -- Create default notification preferences (email enabled, push enabled)
  INSERT INTO user_notification_preferences (
    user_id,
    event_type,
    push_enabled,
    email_enabled,
    sms_enabled,
    in_app_enabled,
    priority,
    batch_enabled,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end,
    timezone
  )
  VALUES (
    NEW.id,
    'brief.completed',
    true,  -- Push enabled by default
    true,  -- Email enabled by default (this is the main channel for briefs)
    false, -- SMS disabled
    true,  -- In-app enabled by default
    'normal',
    false, -- No batching for briefs (send immediately)
    false, -- No quiet hours by default
    '22:00',
    '08:00',
    'UTC'
  )
  ON CONFLICT (user_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. Create trigger on users table
-- =====================================================

DROP TRIGGER IF EXISTS trigger_auto_subscribe_user_to_brief_notifications ON users;

CREATE TRIGGER trigger_auto_subscribe_user_to_brief_notifications
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION auto_subscribe_user_to_brief_notifications();

-- =====================================================
-- 4. Backfill existing users with subscriptions and preferences
-- =====================================================

-- Subscribe all existing users to brief.completed events
INSERT INTO notification_subscriptions (user_id, event_type, is_active, admin_only)
SELECT id, 'brief.completed', true, false
FROM users
ON CONFLICT (user_id, event_type) DO NOTHING;

-- Create default preferences for all existing users
INSERT INTO user_notification_preferences (
  user_id,
  event_type,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  priority,
  batch_enabled,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  timezone
)
SELECT
  id,
  'brief.completed',
  true,  -- Push enabled
  true,  -- Email enabled (primary channel for briefs)
  false, -- SMS disabled
  true,  -- In-app enabled
  'normal',
  false, -- No batching
  false, -- No quiet hours by default
  '22:00',
  '08:00',
  COALESCE(
    (SELECT timezone FROM user_brief_preferences WHERE user_id = users.id LIMIT 1),
    'UTC'
  )
FROM users
ON CONFLICT (user_id, event_type) DO NOTHING;

-- =====================================================
-- 5. Add RLS policies for user notification preferences
-- =====================================================

-- Users can read their own notification preferences
DROP POLICY IF EXISTS "Users can view their own notification preferences" ON user_notification_preferences;
CREATE POLICY "Users can view their own notification preferences"
ON user_notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notification preferences
DROP POLICY IF EXISTS "Users can update their own notification preferences" ON user_notification_preferences;
CREATE POLICY "Users can update their own notification preferences"
ON user_notification_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can insert their own notification preferences
DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON user_notification_preferences;
CREATE POLICY "Users can insert their own notification preferences"
ON user_notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 6. Create helper function to update user notification preferences
-- =====================================================

CREATE OR REPLACE FUNCTION update_user_notification_preferences(
  p_user_id UUID,
  p_event_type TEXT,
  p_push_enabled BOOLEAN DEFAULT NULL,
  p_email_enabled BOOLEAN DEFAULT NULL,
  p_sms_enabled BOOLEAN DEFAULT NULL,
  p_in_app_enabled BOOLEAN DEFAULT NULL,
  p_quiet_hours_enabled BOOLEAN DEFAULT NULL,
  p_quiet_hours_start TEXT DEFAULT NULL,
  p_quiet_hours_end TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Upsert user notification preferences
  INSERT INTO user_notification_preferences (
    user_id,
    event_type,
    push_enabled,
    email_enabled,
    sms_enabled,
    in_app_enabled,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end,
    timezone
  )
  VALUES (
    p_user_id,
    p_event_type,
    COALESCE(p_push_enabled, true),
    COALESCE(p_email_enabled, true),
    COALESCE(p_sms_enabled, false),
    COALESCE(p_in_app_enabled, true),
    COALESCE(p_quiet_hours_enabled, false),
    COALESCE(p_quiet_hours_start, '22:00'),
    COALESCE(p_quiet_hours_end, '08:00'),
    COALESCE(p_timezone, 'UTC')
  )
  ON CONFLICT (user_id, event_type) DO UPDATE SET
    push_enabled = COALESCE(p_push_enabled, user_notification_preferences.push_enabled),
    email_enabled = COALESCE(p_email_enabled, user_notification_preferences.email_enabled),
    sms_enabled = COALESCE(p_sms_enabled, user_notification_preferences.sms_enabled),
    in_app_enabled = COALESCE(p_in_app_enabled, user_notification_preferences.in_app_enabled),
    quiet_hours_enabled = COALESCE(p_quiet_hours_enabled, user_notification_preferences.quiet_hours_enabled),
    quiet_hours_start = COALESCE(p_quiet_hours_start, user_notification_preferences.quiet_hours_start),
    quiet_hours_end = COALESCE(p_quiet_hours_end, user_notification_preferences.quiet_hours_end),
    timezone = COALESCE(p_timezone, user_notification_preferences.timezone),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_notification_preferences TO authenticated;

-- =====================================================
-- 7. Add indexes for performance
-- =====================================================

-- Index for looking up user preferences by event type
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_event
ON user_notification_preferences(user_id, event_type);

-- Index for looking up active subscriptions
CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_event_active
ON notification_subscriptions(event_type, is_active)
WHERE is_active = true;

-- =====================================================
-- Summary
-- =====================================================

-- This migration:
-- 1. Adds brief.completed and brief.failed event types
-- 2. Creates auto-subscription trigger for new users
-- 3. Backfills existing users with subscriptions and preferences
-- 4. Sets up RLS policies for user preference management
-- 5. Creates helper function for updating preferences
-- 6. Adds performance indexes
--
-- Users will now automatically:
-- - Be subscribed to brief.completed events when they sign up
-- - Receive email notifications for completed briefs (default enabled)
-- - Receive push notifications for completed briefs (default enabled)
-- - Receive in-app notifications for completed briefs (default enabled)
--
-- Users can customize their preferences via the UI or API
