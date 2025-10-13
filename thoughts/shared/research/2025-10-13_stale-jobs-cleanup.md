---
title: "Stale Jobs Cleanup - October 2025"
date: 2025-10-13
type: operations
status: completed
tags: [database, cleanup, maintenance, jobs, queue]
---

# Stale Jobs Cleanup - October 2025

## Summary

Successfully cleaned up 79 stale job records from the database, removing failed and stuck jobs older than 30 days.

## Problem

The database had accumulated stale job records over several months:

- Failed queue jobs from 30-78 days ago
- Failed/pending daily briefs from 30-136 days ago
- Stuck "processing" briefs that never completed
- Pending project briefs from 136 days ago

These records were taking up unnecessary space and cluttering the database.

## Investigation Process

### 1. Schema Analysis

Identified all job-related tables:

- `queue_jobs` - Main queue system (status: pending/processing/completed/failed/cancelled)
- `daily_briefs` - Daily brief generation (generation_status: pending/processing/completed/failed)
- `project_daily_briefs` - Per-project briefs (generation_status: pending/processing/completed/failed)
- `scheduled_sms_messages` - SMS scheduling (status: pending/sent/failed/cancelled)
- `sms_messages` - SMS delivery (status: pending/sent/failed)
- `cron_logs` - Cron execution logs (status: success/failed)

### 2. Data Analysis

Found stale records:

- **Queue Jobs**: 48 failed jobs (30-78 days old)
  - 39 `generate_daily_brief` jobs
  - 9 `other` jobs (onboarding analysis, misc)
- **Daily Briefs**: 28 failed/pending/stuck briefs (30-136 days old)
  - 25 failed/pending (>30 days)
  - 3 stuck in "processing" status (>7 days)
- **Project Briefs**: 3 pending briefs (136 days old)

**Common failure reasons:**

- "Generation timeout after 10 minutes"
- "No active projects found for user"
- "All LLM providers failed" (auth issues)

### 3. Cleanup Criteria

Established safe deletion criteria:

- ✅ Delete failed queue_jobs older than 30 days
- ✅ Delete failed/pending daily_briefs older than 30 days
- ✅ Delete stuck 'processing' daily_briefs older than 7 days
- ✅ Delete failed/pending project_daily_briefs older than 30 days
- ❌ Keep all completed/successful records (historical data)
- ❌ Don't touch cron_logs (useful for debugging)
- ❌ Don't touch active SMS messages

## Cleanup Results

### Records Deleted

- **48** failed queue jobs
- **28** failed/pending/stuck daily briefs
- **3** failed/pending project briefs
- **Total: 79 stale records**

### Verification

After cleanup:

- ✅ 0 old failed queue jobs (>30d)
- ✅ 0 old failed daily briefs (>30d)
- ✅ 0 old pending project briefs (>30d)
- ✅ All completed/successful records preserved

### Remaining Failed Jobs

The database still has recent failed jobs (< 30 days):

- 48 failed queue jobs (all recent, < 30d)
- 46 failed daily briefs (all recent, < 30d)

These are expected and normal - they represent recent failures that may still need investigation.

## Scripts Created

### Analysis Scripts

1. **`scripts/analyze-stale-data.ts`**
   - Comprehensive analysis of all job-related tables
   - Groups by status and type
   - Identifies old records (>30d)

   ```bash
   cd apps/worker
   pnpm tsx scripts/analyze-stale-data.ts
   ```

2. **`scripts/preview-cleanup.ts`**
   - Dry-run preview of what will be deleted
   - Shows sample records with ages and error messages
   - Safety checks and validation

   ```bash
   cd apps/worker
   pnpm tsx scripts/preview-cleanup.ts
   ```

3. **`scripts/check-stale-jobs.ts`** (existing)
   - Monitors for stale jobs >24h old
   - Shows job statistics
   - Useful for ongoing monitoring
   ```bash
   cd apps/worker
   pnpm tsx scripts/check-stale-jobs.ts
   ```

### Migration Files

1. **`supabase/migrations/20251013_cleanup_stale_jobs.sql`**
   - SQL migration for cleanup
   - Includes logging and verification
   - Can be run via psql or Supabase CLI

   ```bash
   # Via psql (if available)
   psql "$DATABASE_URL" -f supabase/migrations/20251013_cleanup_stale_jobs.sql

   # Or use the TypeScript runner (recommended)
   cd apps/worker
   pnpm tsx scripts/run-cleanup-migration.ts
   ```

2. **`scripts/run-cleanup-migration.ts`**
   - TypeScript runner for the migration
   - Interactive confirmation prompt
   - Pre/post verification
   - Safe execution with error handling

   ```bash
   cd apps/worker
   pnpm tsx scripts/run-cleanup-migration.ts

   # Auto-confirm (use with caution)
   echo "" | pnpm tsx scripts/run-cleanup-migration.ts
   ```

## Future Maintenance

### Recommended Practices

1. **Regular Monitoring**: Run `check-stale-jobs.ts` weekly to monitor for accumulating failures
2. **Automated Cleanup**: Consider scheduling quarterly cleanup jobs
3. **Failed Job Investigation**: Investigate recent failures to prevent accumulation
4. **Retention Policy**: Keep completed records for 90 days, failed records for 30 days

### Automated Cleanup (Future Enhancement)

Could create a cron job or scheduled function to automatically clean up:

```sql
-- Run monthly via cron
DELETE FROM queue_jobs WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days';
DELETE FROM daily_briefs WHERE generation_status IN ('failed', 'pending') AND created_at < NOW() - INTERVAL '30 days';
DELETE FROM project_daily_briefs WHERE generation_status IN ('failed', 'pending') AND created_at < NOW() - INTERVAL '30 days';
```

### Monitoring Alerts

Consider adding alerts for:

- Jobs stuck in "processing" for > 1 hour
- Failed job rate exceeding 10% of total jobs
- Accumulation of >100 failed jobs

## Database Impact

### Before Cleanup

- Total queue_jobs: 1,000 records (94 failed, 5 cancelled, 901 completed)
- Total daily_briefs: 531 records (70 failed, 3 processing, 1 pending, 457 completed)
- Total project_daily_briefs: 1,000 records (3 pending, 997 completed)

### After Cleanup

- Total queue_jobs: 1,000 records (48 failed, 5 cancelled, 947 completed)
- Total daily_briefs: 503 records (46 failed, 0 processing, 0 pending, 457 completed)
- Total project_daily_briefs: 1,000 records (0 pending, 1,000 completed)

### Space Savings

Deleted 79 records, reducing:

- Database bloat
- Query overhead on status-based queries
- Confusion when investigating failures

## Lessons Learned

1. **Monitoring**: Need better monitoring for stuck "processing" jobs
2. **Timeouts**: The "Generation timeout after 10 minutes" errors suggest we need better timeout handling
3. **User State**: "No active projects" errors could be prevented with better user state checks
4. **LLM Auth**: The authentication failures indicate need for better credential management

## Related Files

- `/apps/worker/scripts/analyze-stale-data.ts` - Analysis tool
- `/apps/worker/scripts/preview-cleanup.ts` - Preview tool
- `/apps/worker/scripts/run-cleanup-migration.ts` - Migration runner
- `/apps/worker/scripts/check-stale-jobs.ts` - Monitoring tool (existing)
- `/apps/worker/src/lib/utils/queueCleanup.ts` - Cleanup utility (existing)
- `/supabase/migrations/20251013_cleanup_stale_jobs.sql` - SQL migration

## Conclusion

Successfully cleaned up 79 stale job records with zero data loss. The database is now cleaner and the remaining failed jobs are all recent (< 30 days), which is normal and expected for an active system.

The scripts created during this cleanup can be reused for future maintenance, and the process can be automated if needed.
