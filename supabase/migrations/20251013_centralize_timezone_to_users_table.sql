-- supabase/migrations/20251013_centralize_timezone_to_users_table.sql
-- Migration: Centralize timezone storage to users table
-- Date: 2025-10-13
-- Description: Adds timezone column to users table and migrates data from various preference tables
-- Related: https://github.com/buildos/platform/issues/XXX (timezone consolidation)

-- ============================================================================
-- PROBLEM:
-- Timezone is currently stored in 4 different preference tables:
--   1. user_brief_preferences.timezone (ACTIVELY USED - brief scheduling)
--   2. user_sms_preferences.timezone (ACTIVELY USED - SMS scheduling)
--   3. user_calendar_preferences.timezone (ACTIVELY USED - calendar ops)
--   4. user_notification_preferences.timezone (UNUSED - can be dropped)
--
-- This causes:
--   - Data inconsistency when user updates timezone in one place
--   - Complex queries with multiple potential timezone sources
--   - Confusion about which timezone is "correct"
--
-- SOLUTION:
-- Add timezone to users table as single source of truth
-- Migrate existing data (prioritizing most reliable sources)
-- Update all code to query users.timezone
-- (Future migration will drop old timezone columns after verification)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Add timezone column to users table
-- ============================================================================

-- Add timezone column with UTC as default
-- NOT NULL ensures every user always has a timezone
ALTER TABLE users
ADD COLUMN timezone TEXT DEFAULT 'UTC' NOT NULL;

COMMENT ON COLUMN users.timezone IS 'User''s IANA timezone (e.g., America/New_York). Single source of truth for all scheduling operations. Default: UTC';

-- ============================================================================
-- Step 2: Migrate existing timezone data (prioritized by reliability)
-- ============================================================================

-- Priority 1: user_brief_preferences.timezone
-- This is the most reliable source because users actively configure it
-- for daily brief delivery timing
UPDATE users u
SET timezone = bp.timezone
FROM user_brief_preferences bp
WHERE u.id = bp.user_id
  AND bp.timezone IS NOT NULL
  AND bp.timezone != ''
  AND bp.timezone != 'UTC'; -- Only copy if user explicitly set a non-UTC timezone

-- Log how many users got timezone from brief preferences
DO $$
DECLARE
  count_from_brief INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_from_brief
  FROM users
  WHERE timezone != 'UTC';

  RAISE NOTICE 'Migrated timezone for % users from user_brief_preferences', count_from_brief;
END $$;

-- Priority 2: user_sms_preferences.timezone
-- Secondary source: auto-detected from browser when user set up SMS
-- Only update users who still have UTC (didn't have brief preferences)
UPDATE users u
SET timezone = sp.timezone
FROM user_sms_preferences sp
WHERE u.id = sp.user_id
  AND sp.timezone IS NOT NULL
  AND sp.timezone != ''
  AND sp.timezone != 'UTC'
  AND u.timezone = 'UTC'; -- Only update if still at default

-- Log migration progress
DO $$
DECLARE
  count_from_sms INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_from_sms
  FROM users u
  JOIN user_sms_preferences sp ON u.id = sp.user_id
  WHERE u.timezone = sp.timezone
    AND u.timezone != 'UTC';

  RAISE NOTICE 'Migrated timezone for additional % users from user_sms_preferences', count_from_sms;
END $$;

-- Priority 3: user_calendar_preferences.timezone
-- Tertiary source: set during calendar integration
-- Only update users who still have UTC
UPDATE users u
SET timezone = cp.timezone
FROM user_calendar_preferences cp
WHERE u.id = cp.user_id
  AND cp.timezone IS NOT NULL
  AND cp.timezone != ''
  AND cp.timezone != 'UTC'
  AND u.timezone = 'UTC'; -- Only update if still at default

-- Log final migration stats
DO $$
DECLARE
  count_from_calendar INTEGER;
  total_non_utc INTEGER;
  total_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_from_calendar
  FROM users u
  JOIN user_calendar_preferences cp ON u.id = cp.user_id
  WHERE u.timezone = cp.timezone
    AND u.timezone != 'UTC';

  SELECT COUNT(*) INTO total_non_utc
  FROM users
  WHERE timezone != 'UTC';

  SELECT COUNT(*) INTO total_users
  FROM users;

  RAISE NOTICE 'Migrated timezone for additional % users from user_calendar_preferences', count_from_calendar;
  RAISE NOTICE 'Final stats: % of % users have non-UTC timezone', total_non_utc, total_users;
  RAISE NOTICE 'Migration complete: % users remain at UTC default', (total_users - total_non_utc);
END $$;

-- ============================================================================
-- Step 3: Create index for query performance
-- ============================================================================

-- Index on timezone for queries that filter/group by timezone
-- Used by scheduler to find users in specific timezones
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);

COMMENT ON INDEX idx_users_timezone IS 'Optimizes scheduler queries that need to find users by timezone';

-- ============================================================================
-- Step 4: Add validation constraint (optional but recommended)
-- ============================================================================

-- Note: We're NOT adding a CHECK constraint for valid IANA timezones here
-- because PostgreSQL doesn't have a built-in list of valid timezone names.
-- Instead, validation should happen at the application layer using date-fns-tz
-- or similar library that can verify timezone validity.

-- However, we can add a basic constraint to prevent empty strings:
ALTER TABLE users
ADD CONSTRAINT timezone_not_empty CHECK (timezone != '');

COMMENT ON CONSTRAINT timezone_not_empty ON users IS 'Ensures timezone is never empty string (NULL not allowed by NOT NULL constraint)';

-- ============================================================================
-- Step 5: Mark old timezone columns as deprecated (documentation only)
-- ============================================================================

-- Add comments to old columns indicating they are deprecated
COMMENT ON COLUMN user_brief_preferences.timezone IS '[DEPRECATED] Use users.timezone instead. This column will be removed in a future migration after code is updated.';
COMMENT ON COLUMN user_sms_preferences.timezone IS '[DEPRECATED] Use users.timezone instead. This column will be removed in a future migration after code is updated.';
COMMENT ON COLUMN user_calendar_preferences.timezone IS '[DEPRECATED] Use users.timezone instead. This column will be removed in a future migration after code is updated.';
COMMENT ON COLUMN user_notification_preferences.timezone IS '[UNUSED & DEPRECATED] This column was never used in code. Use users.timezone instead. Will be removed in future migration.';

-- ============================================================================
-- Step 6: Verify migration integrity
-- ============================================================================

-- Check for any mismatches between users.timezone and the old columns
-- This helps identify data consistency issues before we switch code over
DO $$
DECLARE
  brief_mismatches INTEGER;
  sms_mismatches INTEGER;
  calendar_mismatches INTEGER;
BEGIN
  -- Count mismatches with brief preferences
  SELECT COUNT(*) INTO brief_mismatches
  FROM users u
  JOIN user_brief_preferences bp ON u.id = bp.user_id
  WHERE bp.timezone IS NOT NULL
    AND bp.timezone != ''
    AND u.timezone != bp.timezone;

  -- Count mismatches with SMS preferences
  SELECT COUNT(*) INTO sms_mismatches
  FROM users u
  JOIN user_sms_preferences sp ON u.id = sp.user_id
  WHERE sp.timezone IS NOT NULL
    AND sp.timezone != ''
    AND u.timezone != sp.timezone;

  -- Count mismatches with calendar preferences
  SELECT COUNT(*) INTO calendar_mismatches
  FROM users u
  JOIN user_calendar_preferences cp ON u.id = cp.user_id
  WHERE cp.timezone IS NOT NULL
    AND cp.timezone != ''
    AND u.timezone != cp.timezone;

  RAISE NOTICE '=== Timezone Migration Verification ===';
  RAISE NOTICE 'Mismatches with user_brief_preferences: % (expected: 0 for non-UTC)', brief_mismatches;
  RAISE NOTICE 'Mismatches with user_sms_preferences: % (expected: some users may have different timezones)', sms_mismatches;
  RAISE NOTICE 'Mismatches with user_calendar_preferences: % (expected: some users may have different timezones)', calendar_mismatches;

  IF brief_mismatches > 0 THEN
    RAISE WARNING 'Found % users where users.timezone != user_brief_preferences.timezone', brief_mismatches;
    RAISE WARNING 'This is unexpected. Review data before deploying code changes.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- NEXT STEPS:
-- ============================================================================
-- 1. Deploy this migration to staging/production
-- 2. Update application code to read from users.timezone instead of preference tables
-- 3. Update UI components to edit users.timezone
-- 4. Test thoroughly in staging (verify briefs and SMS send at correct times)
-- 5. Monitor production for 1-2 weeks
-- 6. Run cleanup migration to drop old timezone columns (see: 20251013_drop_deprecated_timezone_columns.sql)
-- ============================================================================
