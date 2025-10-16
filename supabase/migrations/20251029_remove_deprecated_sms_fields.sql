-- =====================================================
-- Phase 3b: Remove Deprecated SMS Fields
-- =====================================================
-- Part of: SMS Flow Data Model Cleanup (Phase 3)
--
-- ⚠️ WARNING: DO NOT RUN THIS MIGRATION BEFORE 2025-10-29 ⚠️
--
-- This migration drops deprecated columns from user_sms_preferences.
-- These columns were marked as deprecated on 2025-10-15.
-- A 2-week waiting period is required to ensure safe rollback.
--
-- Columns to be dropped:
--   - daily_brief_sms (replaced by user_notification_preferences.should_sms_daily_brief)
--   - task_reminders (never implemented)
--   - next_up_enabled (never implemented)
--
-- Prerequisites:
--   ✅ Phase 1 deployed: Fixed quiet hours and rate limiting bugs
--   ✅ Phase 2 deployed: Removed all code references to these fields
--   ✅ Phase 3a deployed: Marked columns as deprecated (20251015_deprecate_unused_sms_fields.sql)
--   ⏳ 2 weeks elapsed since Phase 3a (deployed 2025-10-15)
--   ⏳ No issues reported from production
--
-- Related Docs:
--   - Migration Plan: /thoughts/shared/research/2025-10-13_17-40-27_sms-flow-deprecation-migration-plan.md
-- =====================================================

-- Pre-flight checks
DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_deploy_date DATE := '2025-10-15'::DATE;
  v_today DATE := CURRENT_DATE;
  v_days_since_deprecation INTEGER;
BEGIN
  -- Calculate days since deprecation
  v_days_since_deprecation := v_today - v_deploy_date;

  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Phase 3b: Remove Deprecated SMS Fields';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Deprecation date: %', v_deploy_date;
  RAISE NOTICE 'Today: %', v_today;
  RAISE NOTICE 'Days since deprecation: %', v_days_since_deprecation;
  RAISE NOTICE '';

  -- Safety check: Ensure at least 14 days have passed
  IF v_days_since_deprecation < 14 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Only % days have passed since deprecation. Wait until % (14 days after deprecation) before running this migration.',
      v_days_since_deprecation,
      v_deploy_date + INTERVAL '14 days';
  END IF;

  RAISE NOTICE '✅ Safety check passed: 14+ days have elapsed';
  RAISE NOTICE '';
END $$;

-- Check current column usage (should be minimal/zero)
DO $$
DECLARE
  v_daily_brief_sms_true_count INTEGER;
  v_task_reminders_true_count INTEGER;
  v_next_up_true_count INTEGER;
BEGIN
  -- Count users with these fields enabled
  SELECT
    COUNT(*) FILTER (WHERE daily_brief_sms = true),
    COUNT(*) FILTER (WHERE task_reminders = true),
    COUNT(*) FILTER (WHERE next_up_enabled = true)
  INTO
    v_daily_brief_sms_true_count,
    v_task_reminders_true_count,
    v_next_up_true_count
  FROM user_sms_preferences;

  RAISE NOTICE 'Current field usage:';
  RAISE NOTICE '  daily_brief_sms = true: % users', v_daily_brief_sms_true_count;
  RAISE NOTICE '  task_reminders = true: % users', v_task_reminders_true_count;
  RAISE NOTICE '  next_up_enabled = true: % users', v_next_up_true_count;
  RAISE NOTICE '';

  -- Warning if any users have these enabled
  IF v_daily_brief_sms_true_count > 0 OR v_task_reminders_true_count > 0 OR v_next_up_true_count > 0 THEN
    RAISE WARNING 'Some users still have deprecated fields enabled. This should not affect functionality as code no longer checks these fields.';
  END IF;
END $$;

-- Drop the deprecated columns
ALTER TABLE user_sms_preferences
  DROP COLUMN IF EXISTS daily_brief_sms,
  DROP COLUMN IF EXISTS task_reminders,
  DROP COLUMN IF EXISTS next_up_enabled;

-- Verify columns are dropped
DO $$
DECLARE
  v_daily_brief_exists BOOLEAN;
  v_task_reminders_exists BOOLEAN;
  v_next_up_exists BOOLEAN;
BEGIN
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sms_preferences' AND column_name = 'daily_brief_sms'
  ) INTO v_daily_brief_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sms_preferences' AND column_name = 'task_reminders'
  ) INTO v_task_reminders_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sms_preferences' AND column_name = 'next_up_enabled'
  ) INTO v_next_up_exists;

  -- Verify all are dropped
  IF v_daily_brief_exists OR v_task_reminders_exists OR v_next_up_exists THEN
    RAISE EXCEPTION 'Column drop failed! Some columns still exist.';
  END IF;

  RAISE NOTICE '=================================================';
  RAISE NOTICE '✅ SUCCESS: All deprecated columns dropped';
  RAISE NOTICE '=================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining user_sms_preferences columns:';
  RAISE NOTICE '  ✅ phone_number';
  RAISE NOTICE '  ✅ phone_verified';
  RAISE NOTICE '  ✅ phone_verified_at';
  RAISE NOTICE '  ✅ opted_out';
  RAISE NOTICE '  ✅ opted_out_at';
  RAISE NOTICE '  ✅ opt_out_reason';
  RAISE NOTICE '  ✅ event_reminders_enabled';
  RAISE NOTICE '  ✅ event_reminder_lead_time_minutes';
  RAISE NOTICE '  ✅ morning_kickoff_enabled';
  RAISE NOTICE '  ✅ morning_kickoff_time';
  RAISE NOTICE '  ✅ evening_recap_enabled';
  RAISE NOTICE '  ✅ quiet_hours_start';
  RAISE NOTICE '  ✅ quiet_hours_end';
  RAISE NOTICE '  ✅ daily_sms_limit';
  RAISE NOTICE '  ✅ daily_sms_count';
  RAISE NOTICE '  ✅ daily_count_reset_at';
  RAISE NOTICE '  ✅ urgent_alerts';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Regenerate TypeScript schemas';
  RAISE NOTICE '  cd packages/shared-types && pnpm run generate:types';
  RAISE NOTICE '=================================================';
END $$;

-- =====================================================
-- ROLLBACK PLAN (if needed immediately after running)
-- =====================================================
-- To rollback, restore the columns with default values:
--
-- ALTER TABLE user_sms_preferences
--   ADD COLUMN IF NOT EXISTS daily_brief_sms BOOLEAN DEFAULT false,
--   ADD COLUMN IF NOT EXISTS task_reminders BOOLEAN DEFAULT false,
--   ADD COLUMN IF NOT EXISTS next_up_enabled BOOLEAN DEFAULT false;
--
-- COMMENT ON COLUMN user_sms_preferences.daily_brief_sms IS
--   'RESTORED after rollback - originally deprecated 2025-10-15';
-- COMMENT ON COLUMN user_sms_preferences.task_reminders IS
--   'RESTORED after rollback - originally deprecated 2025-10-15';
-- COMMENT ON COLUMN user_sms_preferences.next_up_enabled IS
--   'RESTORED after rollback - originally deprecated 2025-10-15';
--
-- ⚠️ Note: You will lose any data that was in these columns!
-- This is acceptable because:
--   1. Code no longer reads these fields (Phase 2 removed all references)
--   2. New data hasn't been written to these fields in 2+ weeks
--   3. The functionality has been moved to user_notification_preferences
-- =====================================================
