-- supabase/migrations/20251016_999_POST_MIGRATION_VERIFICATION.sql
-- =====================================================
-- POST-MIGRATION VERIFICATION SCRIPT
-- =====================================================
-- Run these queries AFTER all migrations complete
-- to verify the refactor was successful
-- =====================================================

-- Save output to a file for comparison
-- \o /tmp/post_migration_verification.txt

\echo '============================================================'
\echo 'POST-MIGRATION VERIFICATION - NOTIFICATION PREFERENCES REFACTOR'
\echo 'Date: 2025-10-16'
\echo '============================================================'
\echo ''

-- =====================================================
-- 1. New Table Structure
-- =====================================================
\echo '1. VERIFY: New table structure (event_type column should be REMOVED):'
\echo ''
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_notification_preferences'
ORDER BY ordinal_position;

\echo ''
\echo 'Expected: NO event_type column should appear above'
\echo ''

-- =====================================================
-- 2. Constraint Verification
-- =====================================================
\echo '2. VERIFY: Constraints (should have UNIQUE on user_id only):'
\echo ''
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'user_notification_preferences'
ORDER BY constraint_type, constraint_name;

\echo ''
\echo 'Expected: UNIQUE constraint on user_id (not composite key)'
\echo ''

-- =====================================================
-- 3. Index Verification
-- =====================================================
\echo '3. VERIFY: Indexes (should include user_id and partial indexes):'
\echo ''
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'user_notification_preferences'
ORDER BY indexname;

\echo ''

-- =====================================================
-- 4. Row Count Verification
-- =====================================================
\echo '4. CRITICAL CHECK: Row counts (after vs before):'
\echo ''
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) as users_before,
  (SELECT COUNT(*) FROM user_notification_preferences) as rows_after,
  (SELECT COUNT(*) FROM user_notification_preferences_backup) as rows_before,
  (SELECT COUNT(*) FROM user_notification_preferences_backup) -
    (SELECT COUNT(*) FROM user_notification_preferences) as rows_reduced,
  ROUND(
    ((SELECT COUNT(*) FROM user_notification_preferences_backup) -
     (SELECT COUNT(*) FROM user_notification_preferences))::numeric /
    NULLIF((SELECT COUNT(*) FROM user_notification_preferences_backup), 0) * 100,
    2
  ) as reduction_percentage;

\echo ''
\echo 'Expected: rows_after should equal users_before (one row per user)'
\echo ''

-- =====================================================
-- 5. Duplicate Check (MUST BE ZERO)
-- =====================================================
\echo '5. CRITICAL CHECK: Duplicate user_ids (MUST BE ZERO):'
\echo ''
SELECT
  user_id,
  COUNT(*) as row_count
FROM user_notification_preferences
GROUP BY user_id
HAVING COUNT(*) > 1;

\echo ''
\echo 'Expected: NO ROWS (zero duplicates)'
\echo ''

-- =====================================================
-- 6. Data Integrity Check
-- =====================================================
\echo '6. VERIFY: All users migrated successfully:'
\echo ''
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) as users_in_backup,
  (SELECT COUNT(*) FROM user_notification_preferences) as users_in_new_table,
  (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) =
    (SELECT COUNT(*) FROM user_notification_preferences) as counts_match;

\echo ''
\echo 'Expected: counts_match = true'
\echo ''

-- =====================================================
-- 7. Sample Consolidated Data
-- =====================================================
\echo '7. Sample consolidated data (first 5 users):'
\echo ''
SELECT
  user_id,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at,
  updated_at
FROM user_notification_preferences
ORDER BY created_at DESC
LIMIT 5;

\echo ''

-- =====================================================
-- 8. Compare Sample User (Before vs After)
-- =====================================================
\echo '8. Compare sample user (before vs after consolidation):'
\echo ''
\echo 'BEFORE (from backup):'
SELECT
  user_id,
  event_type,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled
FROM user_notification_preferences_backup
WHERE user_id IN (
  SELECT user_id
  FROM user_notification_preferences_backup
  GROUP BY user_id
  HAVING COUNT(*) > 1
  LIMIT 1
)
ORDER BY event_type;

\echo ''
\echo 'AFTER (consolidated):'
SELECT
  user_id,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled
FROM user_notification_preferences
WHERE user_id IN (
  SELECT user_id
  FROM user_notification_preferences_backup
  GROUP BY user_id
  HAVING COUNT(*) > 1
  LIMIT 1
);

\echo ''

-- =====================================================
-- 9. Channel Statistics After Migration
-- =====================================================
\echo '9. Channel enable statistics (post-migration):'
\echo ''
SELECT
  COUNT(*) as total_users,
  SUM(CASE WHEN push_enabled THEN 1 ELSE 0 END) as push_enabled_count,
  SUM(CASE WHEN email_enabled THEN 1 ELSE 0 END) as email_enabled_count,
  SUM(CASE WHEN sms_enabled THEN 1 ELSE 0 END) as sms_enabled_count,
  SUM(CASE WHEN in_app_enabled THEN 1 ELSE 0 END) as in_app_enabled_count,
  ROUND(AVG(CASE WHEN push_enabled THEN 1 ELSE 0 END) * 100, 2) as push_enabled_pct,
  ROUND(AVG(CASE WHEN email_enabled THEN 1 ELSE 0 END) * 100, 2) as email_enabled_pct,
  ROUND(AVG(CASE WHEN sms_enabled THEN 1 ELSE 0 END) * 100, 2) as sms_enabled_pct,
  ROUND(AVG(CASE WHEN in_app_enabled THEN 1 ELSE 0 END) * 100, 2) as in_app_enabled_pct
FROM user_notification_preferences;

\echo ''

-- =====================================================
-- 10. Backup Table Verification
-- =====================================================
\echo '10. VERIFY: Backup table exists and has correct data:'
\echo ''
SELECT
  (SELECT COUNT(*) FROM user_notification_preferences_backup) as backup_row_count,
  (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) as backup_user_count,
  (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'user_notification_preferences_backup'
  )) as backup_table_exists;

\echo ''
\echo 'Expected: backup_table_exists = true, row counts should be preserved'
\echo ''

-- =====================================================
-- 11. Function Verification
-- =====================================================
\echo '11. VERIFY: emit_notification_event function updated:'
\echo ''
SELECT
  routine_name,
  routine_type,
  last_altered
FROM information_schema.routines
WHERE routine_name = 'emit_notification_event'
  AND routine_schema = 'public';

\echo ''
\echo 'Expected: Function should exist and show recent last_altered date'
\echo ''

-- =====================================================
-- 12. Storage Reduction
-- =====================================================
\echo '12. Storage comparison (before vs after):'
\echo ''
SELECT
  'BEFORE (backup)' as state,
  pg_size_pretty(pg_total_relation_size('user_notification_preferences_backup')) as total_size,
  pg_size_pretty(pg_relation_size('user_notification_preferences_backup')) as table_size,
  pg_size_pretty(pg_indexes_size('user_notification_preferences_backup')) as indexes_size
UNION ALL
SELECT
  'AFTER (new)' as state,
  pg_size_pretty(pg_total_relation_size('user_notification_preferences')) as total_size,
  pg_size_pretty(pg_relation_size('user_notification_preferences')) as table_size,
  pg_size_pretty(pg_indexes_size('user_notification_preferences')) as indexes_size;

\echo ''

-- =====================================================
-- FUNCTIONAL TESTS
-- =====================================================
\echo '============================================================'
\echo 'FUNCTIONAL TESTS'
\echo '============================================================'
\echo ''

-- Test 1: Query without event_type filter (should work)
\echo 'Test 1: Query preferences without event_type (should succeed):'
SELECT COUNT(*) as test_1_result
FROM user_notification_preferences
WHERE user_id IS NOT NULL;
\echo 'Expected: Returns count without errors'
\echo ''

-- Test 2: Check unique constraint enforcement
\echo 'Test 2: Attempt to insert duplicate user_id (should FAIL):'
\echo '   (Test skipped - dont run in verification script)'
\echo '   Run manually: INSERT INTO user_notification_preferences (user_id, push_enabled) VALUES (''test-id'', true);'
\echo ''

-- Test 3: Verify daily brief preferences exist
\echo 'Test 3: Check daily brief preferences are preserved:'
SELECT
  COUNT(*) as users_with_email_brief,
  COUNT(*) FILTER (WHERE should_email_daily_brief = true) as email_brief_enabled,
  COUNT(*) FILTER (WHERE should_sms_daily_brief = true) as sms_brief_enabled
FROM user_notification_preferences;
\echo ''

-- =====================================================
-- CRITICAL VALIDATION SUMMARY
-- =====================================================
\echo '============================================================'
\echo 'CRITICAL VALIDATION CHECKLIST'
\echo '============================================================'
\echo ''
\echo 'Verify all of the following are TRUE:'
\echo ''
\echo '  [ ] event_type column REMOVED from user_notification_preferences'
\echo '  [ ] UNIQUE constraint on user_id exists (not composite key)'
\echo '  [ ] Zero duplicate user_id entries'
\echo '  [ ] All users from backup table migrated (count matches)'
\echo '  [ ] Backup table exists with original data'
\echo '  [ ] emit_notification_event function updated'
\echo '  [ ] Channel statistics look reasonable (no major changes)'
\echo '  [ ] Storage reduced significantly'
\echo '  [ ] Daily brief preferences preserved'
\echo '  [ ] Sample users consolidated correctly (MAX strategy applied)'
\echo ''
\echo 'If ANY of the above are FALSE, review migration logs immediately!'
\echo '============================================================'

-- =====================================================
-- ROLLBACK INSTRUCTIONS
-- =====================================================
\echo ''
\echo '============================================================'
\echo 'ROLLBACK INSTRUCTIONS (if needed)'
\echo '============================================================'
\echo ''
\echo 'If migration failed or data is incorrect, run:'
\echo ''
\echo '  BEGIN;'
\echo '  DROP TABLE user_notification_preferences;'
\echo '  CREATE TABLE user_notification_preferences AS'
\echo '  SELECT * FROM user_notification_preferences_backup;'
\echo '  -- Restore indexes and constraints --'
\echo '  COMMIT;'
\echo ''
\echo 'See Phase 3 migration file for complete rollback script.'
\echo '============================================================'

-- \o
