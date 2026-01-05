-- supabase/migrations/20260205_001_notification_opt_in_defaults.sql
-- =====================================================
-- Opt-in Defaults for Notification Preferences
-- =====================================================
-- Ensures new users start with all channels disabled
-- and removes any auto-created subscriptions.
-- =====================================================

BEGIN;

-- Align default preferences with explicit opt-in requirement
ALTER TABLE user_notification_preferences
  ALTER COLUMN push_enabled SET DEFAULT false,
  ALTER COLUMN email_enabled SET DEFAULT false,
  ALTER COLUMN sms_enabled SET DEFAULT false,
  ALTER COLUMN in_app_enabled SET DEFAULT false,
  ALTER COLUMN should_email_daily_brief SET DEFAULT false,
  ALTER COLUMN should_sms_daily_brief SET DEFAULT false;

-- Ensure any trigger-created preferences default to opt-in (all false)
CREATE OR REPLACE FUNCTION ensure_user_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_notification_preferences (
    id,
    user_id,
    email_enabled,
    sms_enabled,
    push_enabled,
    in_app_enabled,
    batch_enabled,
    quiet_hours_enabled,
    should_email_daily_brief,
    should_sms_daily_brief,
    priority,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    NEW.id,
    false,   -- email_enabled (explicit opt-in)
    false,   -- sms_enabled (explicit opt-in)
    false,   -- push_enabled (explicit opt-in)
    false,   -- in_app_enabled (explicit opt-in)
    false,   -- batch_enabled
    false,   -- quiet_hours_enabled
    false,   -- should_email_daily_brief (explicit opt-in)
    false,   -- should_sms_daily_brief (explicit opt-in)
    'normal',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create notification preferences for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_user_notification_preferences() IS
  'Creates user_notification_preferences with explicit opt-in defaults (all channels disabled).';

-- Remove any auto-subscribe trigger/function (notifications require explicit opt-in)
-- Some environments still use the older trigger name.
DROP TRIGGER IF EXISTS after_user_insert_subscribe_brief ON users;
DROP TRIGGER IF EXISTS trigger_auto_subscribe_user_to_brief_notifications ON users;
DROP FUNCTION IF EXISTS auto_subscribe_user_to_brief_notifications();

-- Deactivate any subscriptions that were created without explicit opt-in
UPDATE notification_subscriptions
SET is_active = false,
    updated_at = NOW()
WHERE is_active = true
  AND admin_only IS NOT TRUE
  AND created_by IS NULL;

COMMIT;
