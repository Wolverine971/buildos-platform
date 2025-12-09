-- supabase/migrations/20251016_002_consolidate_notification_preferences.sql
-- Migration: Phase 3 - Consolidate Notification Preferences
-- Description: Consolidate multiple user_notification_preferences rows into one per user
-- Date: 2025-10-16
-- Phase: 3 of 9
-- Risk: High (destructive operation - creates backup first)

-- This migration consolidates multiple rows per user (one per event_type)
-- into a single row per user with global preferences.
--
-- IMPORTANT: This is a DESTRUCTIVE migration. A backup was created in Phase 1.
-- Rollback instructions are provided at the end of this file.

BEGIN;

-- ============================================================================
-- STEP 1: Verify backup exists
-- ============================================================================

DO $$
DECLARE
  backup_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'user_notification_preferences_backup'
  ) INTO backup_exists;

  IF NOT backup_exists THEN
    RAISE EXCEPTION 'Backup table user_notification_preferences_backup does not exist. Run Phase 1 migration first.';
  END IF;

  RAISE NOTICE 'Backup table verified: user_notification_preferences_backup exists';
END $$;

-- ============================================================================
-- STEP 2: Create temporary consolidated table
-- ============================================================================
-- Strategy: Use MAX() for boolean fields (most permissive)
--           Prefer event_type='user' for user-level settings
--           Use MIN/MAX for scalar values

CREATE TEMP TABLE consolidated_prefs AS
SELECT
  user_id,

  -- Boolean channel preferences: Use MAX (most permissive approach)
  -- If ANY event type had a channel enabled, enable it globally
  COALESCE(MAX(push_enabled::int)::boolean, true) AS push_enabled,
  COALESCE(MAX(email_enabled::int)::boolean, true) AS email_enabled,
  COALESCE(MAX(sms_enabled::int)::boolean, false) AS sms_enabled,
  COALESCE(MAX(in_app_enabled::int)::boolean, true) AS in_app_enabled,

  -- Delivery preferences
  COALESCE(MAX(batch_enabled::int)::boolean, false) AS batch_enabled,
  COALESCE(MAX(quiet_hours_enabled::int)::boolean, false) AS quiet_hours_enabled,

  -- Scalar values: Prefer event_type='user' if exists, otherwise take first non-null
  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN batch_interval_minutes END),
    MAX(batch_interval_minutes)
  ) AS batch_interval_minutes,

  COALESCE(
    MIN(CASE WHEN event_type = 'user' THEN quiet_hours_start END),
    MIN(quiet_hours_start)
  ) AS quiet_hours_start,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN quiet_hours_end END),
    MAX(quiet_hours_end)
  ) AS quiet_hours_end,

  -- Frequency limits
  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN max_per_day END),
    MAX(max_per_day)
  ) AS max_per_day,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN max_per_hour END),
    MAX(max_per_hour)
  ) AS max_per_hour,

  -- Priority: Prefer event_type='user', otherwise take most common
  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN priority END),
    MODE() WITHIN GROUP (ORDER BY priority)
  ) AS priority,

  -- Daily brief preferences: ALWAYS from event_type='user' (user-level settings)
  -- Must cast boolean to int for MAX, then back to boolean
  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN should_email_daily_brief::int END)::boolean,
    true
  ) AS should_email_daily_brief,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN should_sms_daily_brief::int END)::boolean,
    false
  ) AS should_sms_daily_brief,

  -- Timestamps: Keep earliest created_at, set updated_at to now
  MIN(created_at) AS created_at,
  NOW() AS updated_at

FROM user_notification_preferences
GROUP BY user_id;

-- ============================================================================
-- STEP 3: Verify consolidation
-- ============================================================================

DO $$
DECLARE
  distinct_users INTEGER;
  consolidated_rows INTEGER;
  original_total_rows INTEGER;
BEGIN
  -- Count distinct users in original table
  SELECT COUNT(DISTINCT user_id) INTO distinct_users
  FROM user_notification_preferences;

  -- Count rows in consolidated table
  SELECT COUNT(*) INTO consolidated_rows
  FROM consolidated_prefs;

  -- Count total rows in original (for logging)
  SELECT COUNT(*) INTO original_total_rows
  FROM user_notification_preferences;

  IF distinct_users != consolidated_rows THEN
    RAISE EXCEPTION 'Consolidation failed: % distinct users but % consolidated rows',
      distinct_users, consolidated_rows;
  END IF;

  RAISE NOTICE '✓ Consolidation verified:';
  RAISE NOTICE '  - Original: % total rows across % users', original_total_rows, distinct_users;
  RAISE NOTICE '  - Consolidated: % rows (1 per user)', consolidated_rows;
  RAISE NOTICE '  - Reduction: % rows removed', original_total_rows - consolidated_rows;
END $$;

-- ============================================================================
-- STEP 4: Drop old table
-- ============================================================================
-- Backup already exists from Phase 1, so safe to drop

DO $$
BEGIN
  RAISE NOTICE 'Dropping old user_notification_preferences table...';
END $$;

DROP TABLE user_notification_preferences;

DO $$
BEGIN
  RAISE NOTICE '✓ Old table dropped';
END $$;

-- ============================================================================
-- STEP 5: Create new table schema (without event_type column)
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Creating new user_notification_preferences table...';
END $$;

CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Channel preferences
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Delivery preferences
  priority TEXT NOT NULL DEFAULT 'normal',
  batch_enabled BOOLEAN NOT NULL DEFAULT false,
  batch_interval_minutes INTEGER,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  -- Frequency limits
  max_per_day INTEGER,
  max_per_hour INTEGER,

  -- Daily brief preferences (user-level)
  should_email_daily_brief BOOLEAN NOT NULL DEFAULT true,
  should_sms_daily_brief BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  RAISE NOTICE '✓ New table created';
END $$;

-- ============================================================================
-- STEP 6: Insert consolidated data
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Inserting consolidated preferences...';
END $$;

INSERT INTO user_notification_preferences (
  user_id,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  priority,
  batch_enabled,
  batch_interval_minutes,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  max_per_day,
  max_per_hour,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at,
  updated_at
)
SELECT
  user_id,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  priority,
  batch_enabled,
  batch_interval_minutes,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  max_per_day,
  max_per_hour,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at,
  updated_at
FROM consolidated_prefs;

DO $$
BEGIN
  RAISE NOTICE '✓ Consolidated data inserted';
END $$;

-- ============================================================================
-- STEP 7: Create indexes
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Creating indexes...';
END $$;

-- Primary lookup index
CREATE INDEX idx_user_notification_preferences_user_id
ON user_notification_preferences(user_id);

-- Daily brief email preference index (partial for performance)
CREATE INDEX idx_user_notification_preferences_daily_brief_email
ON user_notification_preferences(user_id, should_email_daily_brief)
WHERE should_email_daily_brief = true;

-- Daily brief SMS preference index (partial for performance)
CREATE INDEX idx_user_notification_preferences_daily_brief_sms
ON user_notification_preferences(user_id, should_sms_daily_brief)
WHERE should_sms_daily_brief = true;

DO $$
BEGIN
  RAISE NOTICE '✓ Indexes created';
END $$;

-- ============================================================================
-- STEP 8: Add table comments
-- ============================================================================

COMMENT ON TABLE user_notification_preferences IS
  'User notification preferences (refactored 2025-10-16). One row per user with global channel preferences. event_type column removed.';

COMMENT ON COLUMN user_notification_preferences.user_id IS
  'Unique constraint ensures one preference set per user';

COMMENT ON COLUMN user_notification_preferences.should_email_daily_brief IS
  'User-level preference for daily brief email delivery';

COMMENT ON COLUMN user_notification_preferences.should_sms_daily_brief IS
  'User-level preference for daily brief SMS delivery';

-- ============================================================================
-- STEP 9: Final verification
-- ============================================================================

DO $$
DECLARE
  user_count_before INTEGER;
  user_count_after INTEGER;
  duplicate_check INTEGER;
  row_count_reduction INTEGER;
BEGIN
  -- Get user counts
  SELECT COUNT(DISTINCT user_id) INTO user_count_before
  FROM user_notification_preferences_backup;

  SELECT COUNT(*) INTO user_count_after
  FROM user_notification_preferences;

  -- Check for duplicate user_ids
  SELECT COUNT(*) INTO duplicate_check
  FROM (
    SELECT user_id, COUNT(*)
    FROM user_notification_preferences
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) dups;

  -- Calculate reduction
  SELECT
    (SELECT COUNT(*) FROM user_notification_preferences_backup) -
    (SELECT COUNT(*) FROM user_notification_preferences)
  INTO row_count_reduction;

  -- Validate
  IF user_count_before != user_count_after THEN
    RAISE EXCEPTION 'Migration failed: user count mismatch (before: %, after: %)',
      user_count_before, user_count_after;
  END IF;

  IF duplicate_check > 0 THEN
    RAISE EXCEPTION 'Migration failed: % duplicate user_id entries found', duplicate_check;
  END IF;

  -- Success!
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ Migration successful!';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - Users migrated: %', user_count_after;
  RAISE NOTICE '  - Rows reduced by: % (%.1f%% reduction)',
    row_count_reduction,
    (row_count_reduction::float / (user_count_before + row_count_reduction) * 100);
  RAISE NOTICE '  - Duplicate check: 0 duplicates found';
  RAISE NOTICE '  - Constraint: user_id is UNIQUE';
  RAISE NOTICE '';
  RAISE NOTICE 'Database changes:';
  RAISE NOTICE '  - user_notification_preferences: event_type column removed';
  RAISE NOTICE '  - user_notification_preferences: one row per user';
  RAISE NOTICE '  - user_notification_preferences_backup: preserved for rollback';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (DO NOT RUN - For reference only)
-- ============================================================================
-- If you need to rollback this migration, run the following commands:
--
-- BEGIN;
--
-- -- Drop new table
-- DROP TABLE user_notification_preferences;
--
-- -- Restore from backup
-- CREATE TABLE user_notification_preferences AS
-- SELECT * FROM user_notification_preferences_backup;
--
-- -- Restore indexes
-- CREATE INDEX idx_backup_user_id ON user_notification_preferences(user_id);
-- CREATE INDEX idx_backup_user_event ON user_notification_preferences(user_id, event_type);
--
-- -- Verify restoration
-- SELECT COUNT(*) FROM user_notification_preferences; -- Should match backup count
--
-- COMMIT;
--
-- ============================================================================
-- POST-MIGRATION VALIDATION QUERIES
-- ============================================================================
-- Run these queries after migration to verify success:

-- 1. Check one row per user
-- SELECT user_id, COUNT(*) as row_count
-- FROM user_notification_preferences
-- GROUP BY user_id
-- HAVING COUNT(*) > 1;
-- -- Should return 0 rows

-- 2. Check all users migrated
-- SELECT
--   (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) as before_users,
--   (SELECT COUNT(*) FROM user_notification_preferences) as after_users,
--   (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) =
--     (SELECT COUNT(*) FROM user_notification_preferences) as counts_match;
-- -- counts_match should be true

-- 3. Sample data check
-- SELECT
--   user_id,
--   push_enabled,
--   email_enabled,
--   sms_enabled,
--   in_app_enabled,
--   should_email_daily_brief,
--   should_sms_daily_brief
-- FROM user_notification_preferences
-- LIMIT 5;

-- 4. Check table structure
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_notification_preferences'
-- ORDER BY ordinal_position;
-- -- Should NOT have event_type column

-- 5. Check unique constraint
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'user_notification_preferences'
--   AND constraint_type = 'UNIQUE';
-- -- Should have unique constraint on user_id
