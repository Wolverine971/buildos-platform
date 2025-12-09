-- apps/web/supabase/diagnostics/verify_user_registration.sql
-- ============================================================================
-- COMPREHENSIVE USER REGISTRATION VERIFICATION QUERY
-- Date: 2025-10-22
--
-- Run this query after registering a new user to verify everything worked
-- Replace 'YOUR_USER_EMAIL@example.com' with the email of the user you just registered
-- ============================================================================

-- Set the email of the user you just registered
DO $$
DECLARE
  v_user_email TEXT := 'YOUR_USER_EMAIL@example.com'; -- CHANGE THIS to the email you registered with
  v_user_id UUID;
  v_auth_user_id UUID;
BEGIN
  -- Get user ID from public.users
  SELECT id INTO v_user_id
  FROM users
  WHERE email = v_user_email;

  -- Get user ID from auth.users
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = v_user_email;

  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '     USER REGISTRATION VERIFICATION REPORT      ';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Checking user: %', v_user_email;
  RAISE NOTICE '';

  -- 1. Check if user exists in both tables
  RAISE NOTICE '1. USER EXISTENCE CHECK:';
  RAISE NOTICE '----------------------------------------';

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE '✅ User found in public.users with ID: %', v_user_id;
  ELSE
    RAISE WARNING '❌ User NOT found in public.users!';
  END IF;

  IF v_auth_user_id IS NOT NULL THEN
    RAISE NOTICE '✅ User found in auth.users with ID: %', v_auth_user_id;
  ELSE
    RAISE WARNING '❌ User NOT found in auth.users!';
  END IF;

  IF v_user_id = v_auth_user_id THEN
    RAISE NOTICE '✅ User IDs match between auth and public schemas';
  ELSIF v_user_id IS NOT NULL AND v_auth_user_id IS NOT NULL THEN
    RAISE WARNING '⚠️  User IDs do not match! Public: %, Auth: %', v_user_id, v_auth_user_id;
  END IF;

  RAISE NOTICE '';

  -- Only continue if user was found
  IF v_user_id IS NOT NULL THEN

    -- 2. Check user trial status
    RAISE NOTICE '2. TRIAL STATUS CHECK:';
    RAISE NOTICE '----------------------------------------';

    PERFORM 1 FROM users
    WHERE id = v_user_id
      AND subscription_status = 'trialing';

    IF FOUND THEN
      RAISE NOTICE '✅ Subscription status is "trialing"';
    ELSE
      RAISE WARNING '❌ Subscription status is NOT "trialing"';
      RAISE NOTICE '   Current status: %', (SELECT subscription_status FROM users WHERE id = v_user_id);
    END IF;

    PERFORM 1 FROM users
    WHERE id = v_user_id
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW();

    IF FOUND THEN
      RAISE NOTICE '✅ Trial end date is set and in the future';
      RAISE NOTICE '   Trial ends at: %', (SELECT trial_ends_at FROM users WHERE id = v_user_id);
      RAISE NOTICE '   Days remaining: %', (SELECT EXTRACT(DAY FROM trial_ends_at - NOW()) FROM users WHERE id = v_user_id);
    ELSE
      RAISE WARNING '❌ Trial end date issue';
      RAISE NOTICE '   Trial ends at: %', COALESCE((SELECT trial_ends_at::TEXT FROM users WHERE id = v_user_id), 'NULL');
    END IF;

    RAISE NOTICE '';

    -- 3. Check auth provider
    RAISE NOTICE '3. AUTH PROVIDER CHECK:';
    RAISE NOTICE '----------------------------------------';

    IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_auth_user_id) THEN
      RAISE NOTICE '✅ Auth identity found';
      RAISE NOTICE '   Provider: %', (SELECT provider FROM auth.identities WHERE user_id = v_auth_user_id LIMIT 1);
      RAISE NOTICE '   Created at: %', (SELECT created_at FROM auth.identities WHERE user_id = v_auth_user_id LIMIT 1);
    ELSE
      RAISE WARNING '❌ No auth identity found!';
    END IF;

    RAISE NOTICE '';

    -- 4. Check notification events
    RAISE NOTICE '4. NOTIFICATION EVENT CHECK:';
    RAISE NOTICE '----------------------------------------';

    IF EXISTS (SELECT 1 FROM notification_events WHERE actor_user_id = v_user_id AND event_type = 'user.signup') THEN
      RAISE NOTICE '✅ Signup notification event created';

      FOR v_event IN
        SELECT id, event_source, created_at, payload
        FROM notification_events
        WHERE actor_user_id = v_user_id AND event_type = 'user.signup'
        ORDER BY created_at DESC
        LIMIT 1
      LOOP
        RAISE NOTICE '   Event ID: %', v_event.id;
        RAISE NOTICE '   Source: %', v_event.event_source;
        RAISE NOTICE '   Created: %', v_event.created_at;
        RAISE NOTICE '   Payload contains email: %', (v_event.payload->>'user_email' = v_user_email);
      END LOOP;
    ELSE
      RAISE WARNING '⚠️  No signup notification event found (may be normal if no subscriptions active)';
    END IF;

    RAISE NOTICE '';

    -- 5. Check notification subscriptions
    RAISE NOTICE '5. NOTIFICATION SUBSCRIPTION CHECK:';
    RAISE NOTICE '----------------------------------------';

    IF EXISTS (SELECT 1 FROM notification_subscriptions WHERE event_type = 'user.signup' AND is_active = true) THEN
      RAISE NOTICE '✅ Active signup notification subscriptions exist';
      RAISE NOTICE '   Active subscriptions: %', (SELECT COUNT(*) FROM notification_subscriptions WHERE event_type = 'user.signup' AND is_active = true);
      RAISE NOTICE '   Admin subscriptions: %', (SELECT COUNT(*) FROM notification_subscriptions WHERE event_type = 'user.signup' AND admin_only = true);
    ELSE
      RAISE NOTICE '⚠️  No active signup notification subscriptions (notifications won''t be sent)';
    END IF;

    RAISE NOTICE '';

    -- 6. Check trigger functions
    RAISE NOTICE '6. TRIGGER FUNCTION CHECK:';
    RAISE NOTICE '----------------------------------------';

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'before_user_insert_set_trial') THEN
      RAISE NOTICE '✅ BEFORE INSERT trigger exists (sets trial period)';
    ELSE
      RAISE WARNING '❌ BEFORE INSERT trigger missing!';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_notify') THEN
      RAISE NOTICE '✅ AFTER INSERT trigger exists (sends notifications)';
    ELSE
      RAISE WARNING '❌ AFTER INSERT trigger missing!';
    END IF;

    RAISE NOTICE '';

    -- 7. Summary
    RAISE NOTICE '================================================';
    RAISE NOTICE '                    SUMMARY                     ';
    RAISE NOTICE '================================================';

    RAISE NOTICE '';
    RAISE NOTICE 'User Details:';
    RAISE NOTICE '  Email: %', v_user_email;
    RAISE NOTICE '  User ID: %', v_user_id;
    RAISE NOTICE '  Created: %', (SELECT created_at FROM users WHERE id = v_user_id);
    RAISE NOTICE '  Status: %', (SELECT subscription_status FROM users WHERE id = v_user_id);
    RAISE NOTICE '  Trial Ends: %', (SELECT trial_ends_at FROM users WHERE id = v_user_id);

    RAISE NOTICE '';
    RAISE NOTICE 'If all checks show ✅, registration worked perfectly!';
    RAISE NOTICE 'If you see ❌ or ⚠️, investigate those specific areas.';

  ELSE
    RAISE NOTICE '';
    RAISE WARNING 'Cannot continue verification - user not found in database!';
    RAISE NOTICE 'Make sure you:';
    RAISE NOTICE '1. Changed the email at the top of this query to match the registered user';
    RAISE NOTICE '2. The registration actually succeeded';
    RAISE NOTICE '3. You''re connected to the correct database';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '================================================';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '';
    RAISE WARNING 'Error during verification: %', SQLERRM;
    RAISE NOTICE 'This might indicate a problem with the registration or database state.';
END $$;

-- ============================================================================
-- ADDITIONAL QUERIES FOR MANUAL INSPECTION
-- ============================================================================

-- Uncomment these queries to run them individually:

-- -- Check the most recent users registered
-- SELECT id, email, created_at, subscription_status, trial_ends_at
-- FROM users
-- ORDER BY created_at DESC
-- LIMIT 5;

-- -- Check recent notification events
-- SELECT id, event_type, actor_user_id, created_at, payload
-- FROM notification_events
-- WHERE event_type = 'user.signup'
-- ORDER BY created_at DESC
-- LIMIT 5;

-- -- Check active notification subscriptions
-- SELECT id, user_id, event_type, is_active, admin_only
-- FROM notification_subscriptions
-- WHERE event_type = 'user.signup';

-- -- Check trigger status
-- SELECT tgname as trigger_name,
--        tgrelid::regclass as table_name,
--        tgtype,
--        proname as function_name
-- FROM pg_trigger
-- JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
-- WHERE tgrelid::regclass::text = 'users'
-- ORDER BY tgname;