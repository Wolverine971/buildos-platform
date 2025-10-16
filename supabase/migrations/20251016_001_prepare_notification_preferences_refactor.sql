-- Migration: Phase 1 - Prepare for Notification Preferences Refactor
-- Description: Add event_type to user_notifications and create backup of user_notification_preferences
-- Date: 2025-10-16
-- Phase: 1 of 9
-- Risk: Low (additive only, no data loss)

-- This migration prepares the database for the notification preferences refactor
-- by adding necessary columns and creating backups. It makes no breaking changes.

BEGIN;

-- ============================================================================
-- STEP 1: Add event_type column to user_notifications
-- ============================================================================
-- This column will track which event triggered the notification
-- Examples: 'brief.completed', 'task.due_soon', 'calendar.sync_failed'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_notifications'
      AND column_name = 'event_type'
  ) THEN
    ALTER TABLE user_notifications
    ADD COLUMN event_type TEXT;

    RAISE NOTICE 'Added event_type column to user_notifications';
  ELSE
    RAISE NOTICE 'event_type column already exists on user_notifications';
  END IF;
END $$;

-- Create index for event_type queries (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_user_notifications_event_type
ON user_notifications(event_type)
WHERE event_type IS NOT NULL;

-- Create composite index for common query pattern: user_id + event_type
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_event
ON user_notifications(user_id, event_type)
WHERE event_type IS NOT NULL;

-- ============================================================================
-- STEP 2: Create backup table for user_notification_preferences
-- ============================================================================
-- This backup is critical for rollback in case of issues during migration
-- Will be kept for at least 7 days after migration completes

DO $$
BEGIN
  -- Drop existing backup if it exists (for re-runability)
  DROP TABLE IF EXISTS user_notification_preferences_backup;

  -- Create backup table with all data
  CREATE TABLE user_notification_preferences_backup AS
  SELECT * FROM user_notification_preferences;

  -- Add indexes to backup table for performance (if we need to restore)
  CREATE INDEX idx_backup_user_id ON user_notification_preferences_backup(user_id);
  CREATE INDEX idx_backup_user_event ON user_notification_preferences_backup(user_id, event_type);

  RAISE NOTICE 'Created backup table: user_notification_preferences_backup';
END $$;

-- ============================================================================
-- STEP 3: Verify backup integrity
-- ============================================================================

DO $$
DECLARE
  original_count INTEGER;
  backup_count INTEGER;
  original_users INTEGER;
  backup_users INTEGER;
BEGIN
  -- Count total rows
  SELECT COUNT(*) INTO original_count FROM user_notification_preferences;
  SELECT COUNT(*) INTO backup_count FROM user_notification_preferences_backup;

  -- Count distinct users
  SELECT COUNT(DISTINCT user_id) INTO original_users FROM user_notification_preferences;
  SELECT COUNT(DISTINCT user_id) INTO backup_users FROM user_notification_preferences_backup;

  -- Verify counts match
  IF original_count != backup_count THEN
    RAISE EXCEPTION 'Backup verification failed: Row count mismatch (original=%, backup=%)',
      original_count, backup_count;
  END IF;

  IF original_users != backup_users THEN
    RAISE EXCEPTION 'Backup verification failed: User count mismatch (original=%, backup=%)',
      original_users, backup_users;
  END IF;

  -- Success message
  RAISE NOTICE '✓ Backup verification successful:';
  RAISE NOTICE '  - % total rows backed up', backup_count;
  RAISE NOTICE '  - % distinct users backed up', backup_users;
  RAISE NOTICE '  - Backup table: user_notification_preferences_backup';
END $$;

-- ============================================================================
-- STEP 4: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN user_notifications.event_type IS
  'Event that triggered this notification (e.g., brief.completed, task.due_soon). Added in Phase 1 of preferences refactor.';

COMMENT ON TABLE user_notification_preferences_backup IS
  'Backup of user_notification_preferences before refactor migration. Created: 2025-10-16. Keep for minimum 7 days after migration completes.';

-- ============================================================================
-- STEP 5: Log migration completion
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Phase 1 Migration Complete: Database Preparation';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  1. Added event_type column to user_notifications';
  RAISE NOTICE '  2. Created indexes on user_notifications.event_type';
  RAISE NOTICE '  3. Created backup: user_notification_preferences_backup';
  RAISE NOTICE '  4. Verified backup integrity';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  - Phase 2: Update TypeScript types';
  RAISE NOTICE '  - Phase 3: Run consolidation migration';
  RAISE NOTICE '';
  RAISE NOTICE 'Rollback (if needed):';
  RAISE NOTICE '  - DROP INDEX idx_user_notifications_event_type;';
  RAISE NOTICE '  - DROP INDEX idx_user_notifications_user_event;';
  RAISE NOTICE '  - ALTER TABLE user_notifications DROP COLUMN event_type;';
  RAISE NOTICE '  - DROP TABLE user_notification_preferences_backup;';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- ============================================================================
-- VALIDATION QUERIES (run these after migration to verify)
-- ============================================================================

-- Verify event_type column exists on user_notifications
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'user_notifications' AND column_name = 'event_type';

-- Verify backup table exists and has data
-- SELECT COUNT(*) as backup_row_count FROM user_notification_preferences_backup;

-- Compare row counts
-- SELECT
--   (SELECT COUNT(*) FROM user_notification_preferences) as original,
--   (SELECT COUNT(*) FROM user_notification_preferences_backup) as backup,
--   (SELECT COUNT(*) FROM user_notification_preferences) = (SELECT COUNT(*) FROM user_notification_preferences_backup) as counts_match;

-- Check indexes created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'user_notifications' AND indexname LIKE 'idx_user_notifications_%';
