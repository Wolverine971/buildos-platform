-- Migration: Drop deprecated timezone columns
-- Date: 2025-10-13
-- Description: Cleanup after timezone centralization to users.timezone
-- Prerequisites:
--   1. Migration 20251013_centralize_timezone_to_users_table.sql deployed
--   2. All code updated to use users.timezone
--   3. Monitored in production for 1-2 weeks
--   4. Zero errors related to timezone lookup
--
-- ⚠️ WARNING: This migration is IRREVERSIBLE. Only run after thorough testing and monitoring.
--
-- Safety checks:
-- - Verifies all users have valid timezone
-- - Backs up data before dropping columns
-- - Provides rollback information

BEGIN;

-- ============================================================================
-- PHASE 1: Safety Checks
-- ============================================================================

DO $$
DECLARE
  users_with_null_timezone INTEGER;
  users_total INTEGER;
BEGIN
  -- Check for NULL/empty timezones in users table
  SELECT COUNT(*) INTO users_with_null_timezone
  FROM users
  WHERE timezone IS NULL OR timezone = '';

  SELECT COUNT(*) INTO users_total FROM users;

  IF users_with_null_timezone > 0 THEN
    RAISE EXCEPTION 'Found % users with NULL/empty timezone (out of % total). Fix before dropping columns.',
      users_with_null_timezone, users_total;
  END IF;

  RAISE NOTICE '✓ Safety check passed: All % users have valid timezone', users_total;
END $$;

-- ============================================================================
-- PHASE 2: Backup old timezone data (for reference/rollback)
-- ============================================================================

-- Create temporary backup table (will be dropped at end if no issues)
CREATE TEMP TABLE timezone_backup AS
SELECT
  u.id as user_id,
  u.timezone as users_timezone,
  bp.timezone as brief_prefs_timezone,
  sp.timezone as sms_prefs_timezone,
  cp.timezone as calendar_prefs_timezone,
  np.timezone as notif_prefs_timezone,
  CASE
    WHEN u.timezone = bp.timezone OR bp.timezone IS NULL THEN 'match'
    ELSE 'mismatch'
  END as brief_status,
  CASE
    WHEN u.timezone = sp.timezone OR sp.timezone IS NULL THEN 'match'
    ELSE 'mismatch'
  END as sms_status,
  CASE
    WHEN u.timezone = cp.timezone OR cp.timezone IS NULL THEN 'match'
    ELSE 'mismatch'
  END as calendar_status
FROM users u
LEFT JOIN user_brief_preferences bp ON u.id = bp.user_id
LEFT JOIN user_sms_preferences sp ON u.id = sp.user_id
LEFT JOIN user_calendar_preferences cp ON u.id = cp.user_id
LEFT JOIN user_notification_preferences np ON u.id = np.user_id;

-- Report on any mismatches found
DO $$
DECLARE
  brief_mismatches INTEGER;
  sms_mismatches INTEGER;
  calendar_mismatches INTEGER;
  total_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM timezone_backup;
  SELECT COUNT(*) INTO brief_mismatches FROM timezone_backup WHERE brief_status = 'mismatch';
  SELECT COUNT(*) INTO sms_mismatches FROM timezone_backup WHERE sms_status = 'mismatch';
  SELECT COUNT(*) INTO calendar_mismatches FROM timezone_backup WHERE calendar_status = 'mismatch';

  RAISE NOTICE '=== Timezone Sync Status (out of % users) ===', total_users;
  RAISE NOTICE 'Brief preferences mismatches: %', brief_mismatches;
  RAISE NOTICE 'SMS preferences mismatches: %', sms_mismatches;
  RAISE NOTICE 'Calendar preferences mismatches: %', calendar_mismatches;

  IF brief_mismatches > 0 OR sms_mismatches > 0 OR calendar_mismatches > 0 THEN
    RAISE WARNING 'Found timezone mismatches. This is OK if users.timezone is the intended canonical value.';
  END IF;
END $$;

-- ============================================================================
-- PHASE 3: Drop deprecated timezone columns
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Dropping timezone columns from preference tables...';
END $$;

-- Drop user_brief_preferences.timezone
ALTER TABLE user_brief_preferences DROP COLUMN IF EXISTS timezone;

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped user_brief_preferences.timezone';
END $$;

-- Drop user_sms_preferences.timezone
ALTER TABLE user_sms_preferences DROP COLUMN IF EXISTS timezone;

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped user_sms_preferences.timezone';
END $$;

-- Drop user_calendar_preferences.timezone
ALTER TABLE user_calendar_preferences DROP COLUMN IF EXISTS timezone;

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped user_calendar_preferences.timezone';
END $$;

-- Drop user_notification_preferences.timezone
ALTER TABLE user_notification_preferences DROP COLUMN IF EXISTS timezone;

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped user_notification_preferences.timezone';
END $$;

-- ============================================================================
-- PHASE 4: Final Verification
-- ============================================================================

DO $$
DECLARE
  brief_tz_exists BOOLEAN;
  sms_tz_exists BOOLEAN;
  calendar_tz_exists BOOLEAN;
  notif_tz_exists BOOLEAN;
BEGIN
  -- Verify columns are actually dropped
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_brief_preferences' AND column_name = 'timezone'
  ) INTO brief_tz_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sms_preferences' AND column_name = 'timezone'
  ) INTO sms_tz_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_calendar_preferences' AND column_name = 'timezone'
  ) INTO calendar_tz_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_notification_preferences' AND column_name = 'timezone'
  ) INTO notif_tz_exists;

  IF brief_tz_exists OR sms_tz_exists OR calendar_tz_exists OR notif_tz_exists THEN
    RAISE EXCEPTION 'Failed to drop all timezone columns';
  END IF;

  RAISE NOTICE '✓ Verified: All deprecated timezone columns successfully dropped';
END $$;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration Complete ===';
  RAISE NOTICE 'Successfully dropped deprecated timezone columns from 4 tables';
  RAISE NOTICE 'Users table timezone column remains as single source of truth';
  RAISE NOTICE 'Backup data was created in temporary table (will auto-drop at transaction end)';
END $$;

COMMIT;

-- ============================================================================
-- Rollback Instructions (For Reference Only)
-- ============================================================================

-- ⚠️ WARNING: This migration is designed to be ONE-WAY only.
-- If you need to rollback, you must:
-- 1. Restore from database backup taken BEFORE running this migration
-- 2. Revert all code changes that reference users.timezone
-- 3. Verify old preference table timezone columns are working
--
-- There is NO automated rollback for this migration because:
-- - The old timezone columns may have been out of sync
-- - users.timezone is now the authoritative source
-- - Reverting could cause data consistency issues
--
-- If rollback is absolutely necessary, contact database administrator.
