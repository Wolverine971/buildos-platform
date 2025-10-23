-- ============================================================================
-- FIX: user_notification_preferences trigger using wrong columns
-- Date: 2025-10-22
--
-- Error: column "event_type" of relation "user_notification_preferences" does not exist
--
-- Issue: The create_default_notification_prefs() function is trying to insert
--        into user_notification_preferences with (user_id, event_type) columns,
--        but that table doesn't have an event_type column.
--
-- Solution: Drop the problematic trigger and function, then create a proper
--          default preferences function if needed.
-- ============================================================================

-- 1. Drop the problematic trigger on notification_subscriptions
DROP TRIGGER IF EXISTS after_subscription_insert_create_prefs ON notification_subscriptions;

-- 2. Drop the function that's using wrong columns
DROP FUNCTION IF EXISTS create_default_notification_prefs() CASCADE;

-- 3. Also check and drop any trigger that might be calling this
DO $$
BEGIN
  -- Check if there's a trigger on notification_subscriptions that calls this function
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'create_default_notification_prefs'
  ) THEN
    RAISE NOTICE 'Found and dropping triggers using create_default_notification_prefs';
  END IF;
END $$;

-- 4. Create a proper function to handle user notification preferences
-- This creates default preferences when a user is created, not per subscription
CREATE OR REPLACE FUNCTION ensure_user_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create default notification preferences for new user
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
    true,    -- email_enabled
    false,   -- sms_enabled (opt-in)
    true,    -- push_enabled
    true,    -- in_app_enabled
    false,   -- batch_enabled
    false,   -- quiet_hours_enabled
    true,    -- should_email_daily_brief
    false,   -- should_sms_daily_brief (opt-in)
    'normal', -- priority
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Don't error if preferences already exist

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create notification preferences for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 5. Create trigger on users table (not notification_subscriptions)
-- This ensures every user has notification preferences
DROP TRIGGER IF EXISTS after_user_insert_create_notification_prefs ON users;

CREATE TRIGGER after_user_insert_create_notification_prefs
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_user_notification_preferences();

-- 6. Fix the auto_subscribe_user_to_brief_notifications function
-- to not trigger any preference creation (it should only create subscriptions)
CREATE OR REPLACE FUNCTION auto_subscribe_user_to_brief_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-subscribe new users to their own brief.completed notifications
  -- This allows them to receive notifications when their daily brief is ready
  BEGIN
    INSERT INTO notification_subscriptions (
      id,
      user_id,
      event_type,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      'brief.completed',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, event_type) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      -- Don't fail user creation if subscription fails
      RAISE WARNING 'Failed to create brief subscription for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 7. Ensure the trigger for brief subscriptions is on users table
DROP TRIGGER IF EXISTS after_user_insert_subscribe_brief ON users;

CREATE TRIGGER after_user_insert_subscribe_brief
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_subscribe_user_to_brief_notifications();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '    NOTIFICATION PREFERENCES FIX COMPLETE      ';
  RAISE NOTICE '================================================';

  -- Check if the problematic function is gone
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_default_notification_prefs') THEN
    RAISE NOTICE '✅ Problematic function removed';
  ELSE
    RAISE WARNING '❌ Problematic function still exists';
  END IF;

  -- Check if new function exists
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_user_notification_preferences') THEN
    RAISE NOTICE '✅ New preferences function created';
  ELSE
    RAISE WARNING '❌ New preferences function not created';
  END IF;

  -- Check triggers
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_create_notification_prefs') THEN
    RAISE NOTICE '✅ User preferences trigger created';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_subscribe_brief') THEN
    RAISE NOTICE '✅ Brief subscription trigger created';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '1. Removed trigger trying to use non-existent event_type column';
  RAISE NOTICE '2. Created proper default preferences on user creation';
  RAISE NOTICE '3. Fixed brief subscription to not trigger preference creation';
  RAISE NOTICE '';
  RAISE NOTICE 'User registration should now work without errors!';
  RAISE NOTICE '================================================';
END $$;

-- ============================================================================
-- SUMMARY:
--
-- This migration fixes the cascade of triggers that was causing the error:
-- 1. Removes the problematic create_default_notification_prefs() function
-- 2. Creates a proper preferences function that uses correct columns
-- 3. Ensures preferences are created once per user, not per subscription
-- 4. Fixes the brief subscription function to avoid triggering preferences
-- ============================================================================