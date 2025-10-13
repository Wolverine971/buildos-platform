-- Migration: Refactor daily brief notification preferences
-- Purpose: Separate brief generation timing from notification delivery
-- Date: 2025-10-13
--
-- Background:
-- - user_brief_preferences controls WHEN briefs are generated (frequency, time, timezone)
-- - user_notification_preferences controls HOW users are notified (email, SMS, push, etc.)
-- - Daily brief notification prefs are stored with event_type='user' for user-level settings
--
-- Changes:
-- 1. Add should_email_daily_brief to user_notification_preferences
-- 2. Add should_sms_daily_brief to user_notification_preferences
-- 3. Migrate existing email_daily_brief values to new location (event_type='user')
-- 4. Mark old email_daily_brief column as deprecated

-- Step 1: Add new columns to user_notification_preferences
ALTER TABLE user_notification_preferences
ADD COLUMN IF NOT EXISTS should_email_daily_brief BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS should_sms_daily_brief BOOLEAN DEFAULT false;

-- Step 2: Migrate existing email_daily_brief preferences
-- Use event_type='user' for user-level daily brief preferences
-- This upsert will create new records or update existing ones
INSERT INTO user_notification_preferences (
  user_id,
  event_type,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at,
  updated_at
)
SELECT
  ubp.user_id,
  'user' as event_type,
  COALESCE(ubp.email_daily_brief, false) as should_email_daily_brief,
  false as should_sms_daily_brief,
  NOW() as created_at,
  NOW() as updated_at
FROM user_brief_preferences ubp
ON CONFLICT (user_id, event_type)
DO UPDATE SET
  should_email_daily_brief = COALESCE(EXCLUDED.should_email_daily_brief, user_notification_preferences.should_email_daily_brief),
  updated_at = NOW();

-- Step 3: Mark old column as deprecated (don't drop yet - allows rollback)
COMMENT ON COLUMN user_brief_preferences.email_daily_brief IS
  'DEPRECATED as of 2025-10-13: Migrated to user_notification_preferences.should_email_daily_brief. This column will be removed in a future version. Code should use the new column instead.';

-- Step 4: Create index for performance on notification queries
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_daily_brief_email
  ON user_notification_preferences(user_id, should_email_daily_brief)
  WHERE should_email_daily_brief = true;

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_daily_brief_sms
  ON user_notification_preferences(user_id, should_sms_daily_brief)
  WHERE should_sms_daily_brief = true;

-- Step 5: Verify migration (this will show counts in logs)
DO $$
DECLARE
  migrated_count INTEGER;
  total_email_enabled INTEGER;
  total_users_with_prefs INTEGER;
  total_migrated_records INTEGER;
BEGIN
  -- Count how many users had email_daily_brief = true
  SELECT COUNT(*) INTO total_email_enabled
  FROM user_brief_preferences
  WHERE email_daily_brief = true;

  -- Count how many were successfully migrated with event_type='user'
  SELECT COUNT(*) INTO migrated_count
  FROM user_notification_preferences
  WHERE should_email_daily_brief = true AND event_type = 'user';

  -- Count total users with brief preferences
  SELECT COUNT(*) INTO total_users_with_prefs
  FROM user_brief_preferences;

  -- Count total notification preference records created
  SELECT COUNT(*) INTO total_migrated_records
  FROM user_notification_preferences
  WHERE event_type = 'user';

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  → % users had email_daily_brief=true in brief preferences', total_email_enabled;
  RAISE NOTICE '  → % users now have should_email_daily_brief=true in notification preferences', migrated_count;
  RAISE NOTICE '  → % total users with brief preferences', total_users_with_prefs;
  RAISE NOTICE '  → % total notification preference records created (event_type=user)', total_migrated_records;

  IF total_email_enabled != migrated_count THEN
    RAISE WARNING 'Email preference count mismatch! Expected % but got %', total_email_enabled, migrated_count;
  END IF;

  IF total_users_with_prefs != total_migrated_records THEN
    RAISE WARNING 'User count mismatch! Expected % records but got %', total_users_with_prefs, total_migrated_records;
  END IF;
END $$;

-- Rollback instructions (commented out):
-- To rollback this migration:
/*
-- Remove user-level notification preference records (event_type='user')
DELETE FROM user_notification_preferences
WHERE event_type = 'user';

-- Remove new columns
ALTER TABLE user_notification_preferences
DROP COLUMN IF EXISTS should_email_daily_brief,
DROP COLUMN IF EXISTS should_sms_daily_brief;

-- Remove comment
COMMENT ON COLUMN user_brief_preferences.email_daily_brief IS NULL;

-- Drop indexes
DROP INDEX IF EXISTS idx_user_notification_preferences_daily_brief_email;
DROP INDEX IF EXISTS idx_user_notification_preferences_daily_brief_sms;
*/
