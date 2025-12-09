-- supabase/migrations/20251015_deprecate_unused_sms_fields.sql
-- =====================================================
-- Phase 3a: Mark Deprecated SMS Fields
-- =====================================================
-- Part of: SMS Flow Data Model Cleanup (Phase 3)
-- Issue: Three fields in user_sms_preferences are no longer used:
--        - daily_brief_sms (replaced by user_notification_preferences.should_sms_daily_brief)
--        - task_reminders (never implemented)
--        - next_up_enabled (never implemented)
--
-- Solution: Mark columns as deprecated with comments (safe, non-breaking change)
--           Actual column removal will happen in 20251029_remove_deprecated_sms_fields.sql
--           This 2-week waiting period allows for safe rollback if issues are discovered.
--
-- Related Changes (already deployed):
--   Phase 1: Fixed quiet hours and rate limiting bugs
--   Phase 2: Removed all code references to these fields
--
-- Migration Plan: /thoughts/shared/research/2025-10-13_17-40-27_sms-flow-deprecation-migration-plan.md
-- =====================================================

-- Mark deprecated columns with comments
COMMENT ON COLUMN user_sms_preferences.daily_brief_sms IS
  'DEPRECATED as of 2025-10-15: Replaced by user_notification_preferences.should_sms_daily_brief (event_type=''user''). All code references removed in Phase 2. Will be dropped on 2025-10-29.';

COMMENT ON COLUMN user_sms_preferences.task_reminders IS
  'DEPRECATED as of 2025-10-15: Never implemented, no worker flow exists. All code references removed in Phase 2. Will be dropped on 2025-10-29.';

COMMENT ON COLUMN user_sms_preferences.next_up_enabled IS
  'DEPRECATED as of 2025-10-15: Never implemented, no worker flow exists. All code references removed in Phase 2. Will be dropped on 2025-10-29.';

-- Verification query
DO $$
DECLARE
  v_daily_brief_comment TEXT;
  v_task_reminders_comment TEXT;
  v_next_up_comment TEXT;
BEGIN
  -- Get comments
  SELECT col_description('user_sms_preferences'::regclass, attnum)
  INTO v_daily_brief_comment
  FROM pg_attribute
  WHERE attrelid = 'user_sms_preferences'::regclass
    AND attname = 'daily_brief_sms';

  SELECT col_description('user_sms_preferences'::regclass, attnum)
  INTO v_task_reminders_comment
  FROM pg_attribute
  WHERE attrelid = 'user_sms_preferences'::regclass
    AND attname = 'task_reminders';

  SELECT col_description('user_sms_preferences'::regclass, attnum)
  INTO v_next_up_comment
  FROM pg_attribute
  WHERE attrelid = 'user_sms_preferences'::regclass
    AND attname = 'next_up_enabled';

  -- Log results
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Phase 3a: Deprecated SMS fields marked';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'daily_brief_sms: %', COALESCE(v_daily_brief_comment, 'No comment');
  RAISE NOTICE 'task_reminders: %', COALESCE(v_task_reminders_comment, 'No comment');
  RAISE NOTICE 'next_up_enabled: %', COALESCE(v_next_up_comment, 'No comment');
  RAISE NOTICE '';
  RAISE NOTICE 'These columns will be dropped on 2025-10-29 (2 weeks from now)';
  RAISE NOTICE 'See migration: 20251029_remove_deprecated_sms_fields.sql';
  RAISE NOTICE '=================================================';
END $$;

-- =====================================================
-- ROLLBACK PLAN
-- =====================================================
-- If issues are discovered, simply remove the comments:
--
-- COMMENT ON COLUMN user_sms_preferences.daily_brief_sms IS NULL;
-- COMMENT ON COLUMN user_sms_preferences.task_reminders IS NULL;
-- COMMENT ON COLUMN user_sms_preferences.next_up_enabled IS NULL;
-- =====================================================
