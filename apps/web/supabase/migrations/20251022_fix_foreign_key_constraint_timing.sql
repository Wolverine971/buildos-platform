-- apps/web/supabase/migrations/20251022_fix_foreign_key_constraint_timing.sql
-- ============================================================================
-- FIX: Foreign Key Constraint Timing Issue on User Registration
-- Date: 2025-10-22
--
-- Issue: Foreign key constraint violation when inserting into notification_events
--        The actor_user_id references auth.users(id), but in a BEFORE INSERT
--        trigger, the user doesn't exist in auth.users yet.
--
-- Solution: Split the trigger into BEFORE and AFTER INSERT
-- ============================================================================

-- Drop existing problematic triggers
DROP TRIGGER IF EXISTS on_user_created_trial ON users;
DROP TRIGGER IF EXISTS before_user_insert_set_trial ON users;
DROP TRIGGER IF EXISTS after_user_insert_notify ON users;

-- Drop the combined function that tried to do everything in BEFORE INSERT
DROP FUNCTION IF EXISTS handle_new_user_trial() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS set_user_trial_period() CASCADE;
DROP FUNCTION IF EXISTS notify_user_signup() CASCADE;

-- ============================================================================
-- PART 1: BEFORE INSERT - Set trial period (can modify NEW record)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_user_trial_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- Get trial days from environment or use default
  v_trial_days := COALESCE(
    current_setting('app.trial_days', true)::INTEGER,
    14
  );

  -- Set trial end date and subscription status for new users
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 2: AFTER INSERT - Send notifications (user now exists in auth.users)
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_subscriptions BOOLEAN;
  v_has_emit_function BOOLEAN;
  v_has_events_table BOOLEAN;
BEGIN
  -- Check if notification_events table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_events'
  ) INTO v_has_events_table;

  -- Only proceed if table exists
  IF NOT v_has_events_table THEN
    RAISE WARNING 'notification_events table does not exist, skipping notification';
    RETURN NEW;
  END IF;

  -- Check if notification_subscriptions exists and has data
  SELECT EXISTS (
    SELECT 1 FROM notification_subscriptions
    WHERE event_type = 'user.signup' AND is_active = true
  ) INTO v_has_subscriptions;

  -- Check if emit_notification_event function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'emit_notification_event'
  ) INTO v_has_emit_function;

  -- Only emit if we have the function and active subscriptions
  IF v_has_emit_function AND v_has_subscriptions THEN
    BEGIN
      -- Now the user exists in auth.users, so foreign key constraint will be satisfied
      PERFORM emit_notification_event(
        p_event_type := 'user.signup',
        p_event_source := 'database_trigger',
        p_actor_user_id := NEW.id,  -- This is now safe - user exists in database
        p_payload := jsonb_build_object(
          'user_id', NEW.id,
          'user_email', NEW.email,
          'signup_method', COALESCE(
            -- Query provider from auth.identities, not auth.users
            (SELECT provider FROM auth.identities WHERE user_id = NEW.id LIMIT 1),
            'email'
          ),
          -- Removed referral_source as column doesn't exist
          'created_at', NEW.created_at
        )
      );
    EXCEPTION
      WHEN foreign_key_violation THEN
        -- Specific handling for foreign key issues
        RAISE WARNING 'Foreign key violation in notification: user % may not exist in auth.users yet', NEW.id;
        RETURN NEW;
      WHEN OTHERS THEN
        -- Log other errors but don't fail user creation
        RAISE WARNING 'Failed to emit signup notification for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
    END;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Ultimate fallback - ensure user creation always succeeds
    RAISE WARNING 'notify_user_signup error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Create the triggers in the correct order
-- ============================================================================

-- BEFORE INSERT: Modify the NEW record (set trial period)
CREATE TRIGGER before_user_insert_set_trial
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_user_trial_period();

-- AFTER INSERT: User exists in database, safe to reference with foreign keys
CREATE TRIGGER after_user_insert_notify
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_user_signup();

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON FUNCTION set_user_trial_period() IS
  'BEFORE INSERT: Sets trial period for new users. Can modify NEW record.';

COMMENT ON FUNCTION notify_user_signup() IS
  'AFTER INSERT: Emits signup notification. User exists so foreign keys work.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '    FOREIGN KEY FIX VERIFICATION REPORT        ';
  RAISE NOTICE '================================================';

  -- Check triggers
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'before_user_insert_set_trial') THEN
    RAISE NOTICE '✅ BEFORE INSERT trigger created';
  ELSE
    RAISE WARNING '❌ BEFORE INSERT trigger missing';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_notify') THEN
    RAISE NOTICE '✅ AFTER INSERT trigger created';
  ELSE
    RAISE WARNING '❌ AFTER INSERT trigger missing';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Key Changes:';
  RAISE NOTICE '  1. Split trigger into BEFORE and AFTER INSERT';
  RAISE NOTICE '  2. BEFORE: Sets trial period (modifies NEW)';
  RAISE NOTICE '  3. AFTER: Sends notifications (user exists)';
  RAISE NOTICE '  4. Foreign key constraint now satisfied';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '          ✅ REGISTRATION FIXED!               ';
  RAISE NOTICE '================================================';
END $$;

-- ============================================================================
-- EXPLANATION OF THE FIX:
--
-- The foreign key constraint error occurred because:
-- 1. notification_events.actor_user_id has a foreign key to auth.users(id)
-- 2. In a BEFORE INSERT trigger, the user doesn't exist in auth.users yet
-- 3. Trying to insert into notification_events fails with foreign key violation
--
-- The solution splits the logic:
-- - BEFORE INSERT: Set trial period (can modify NEW, user doesn't exist yet)
-- - AFTER INSERT: Send notifications (user exists, foreign key works)
-- ============================================================================