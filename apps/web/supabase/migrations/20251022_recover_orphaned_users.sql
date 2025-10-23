-- ============================================================================
-- RECOVERY: Create missing public.users entries for orphaned auth.users
-- Date: 2025-10-22
--
-- Issue: Some users exist in auth.users but not in public.users, causing
--        authentication to fail with "User data not found for authenticated user"
--
-- Solution: Create missing public.users entries for any orphaned auth.users
--           (Registration endpoint now handles this for new users)
-- ============================================================================

-- ============================================================================
-- Data recovery - Create missing public.users entries
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER := 0;
  v_auth_user RECORD;
BEGIN
  RAISE NOTICE 'Starting recovery of orphaned auth.users...';

  -- Find all auth.users that don't have a corresponding public.users entry
  FOR v_auth_user IN
    SELECT
      au.id,
      au.email,
      au.raw_user_meta_data,
      au.created_at
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
  LOOP
    -- Create the missing public.users entry
    INSERT INTO public.users (
      id,
      email,
      name,
      is_admin,
      completed_onboarding,
      created_at,
      updated_at
      -- Note: NOT setting trial_ends_at or subscription_status
      -- These will be handled by existing before_user_insert_set_trial trigger
    )
    VALUES (
      v_auth_user.id,
      v_auth_user.email,
      -- Use name from metadata or email prefix as fallback (matches google-oauth.ts:200)
      COALESCE(
        v_auth_user.raw_user_meta_data->>'name',
        v_auth_user.raw_user_meta_data->>'full_name',
        split_part(v_auth_user.email, '@', 1)
      ),
      false,  -- is_admin defaults to false
      false,  -- completed_onboarding defaults to false
      v_auth_user.created_at,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    v_count := v_count + 1;
    RAISE NOTICE 'Created missing public.users entry for: %', v_auth_user.email;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '      DATA RECOVERY COMPLETE                   ';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created % missing public.users entries', v_count;
  RAISE NOTICE '================================================';
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_orphaned_count INTEGER;
  v_total_auth_users INTEGER;
  v_total_public_users INTEGER;
BEGIN
  -- Count total auth users
  SELECT COUNT(*)
  FROM auth.users
  INTO v_total_auth_users;

  -- Count total public users
  SELECT COUNT(*)
  FROM public.users
  INTO v_total_public_users;

  -- Count any remaining orphaned auth users
  SELECT COUNT(*)
  FROM auth.users au
  LEFT JOIN public.users pu ON au.id = pu.id
  WHERE pu.id IS NULL
  INTO v_orphaned_count;

  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '    USER RECOVERY VERIFICATION                 ';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total auth.users: %', v_total_auth_users;
  RAISE NOTICE 'Total public.users: %', v_total_public_users;

  IF v_orphaned_count = 0 THEN
    RAISE NOTICE '✅ No orphaned auth.users found';
    RAISE NOTICE 'All users have corresponding public.users entries';
  ELSE
    RAISE WARNING '⚠️  Still have % orphaned auth.users', v_orphaned_count;
    RAISE WARNING 'Manual investigation required for remaining orphans';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Note: New registrations are now handled by the';
  RAISE NOTICE 'application code in /api/auth/register/+server.ts';
  RAISE NOTICE '================================================';
END $$;

-- ============================================================================
-- IMPORTANT NOTES:
--
-- 1. We cannot create triggers on auth.users in Supabase (permission denied)
-- 2. The registration endpoint now creates public.users entries
-- 3. Google OAuth flow already handles this correctly
-- 4. This migration only recovers existing orphaned users
-- ============================================================================