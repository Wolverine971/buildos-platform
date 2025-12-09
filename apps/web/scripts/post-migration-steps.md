<!-- apps/web/scripts/post-migration-steps.md -->

# Post-Migration Steps

After running the `create-claim-pending-jobs-function.sql` script in Supabase:

## 1. Regenerate TypeScript Types

Run this command to update your database types:

```bash
pnpm run gen:types
```

## 2. Verify the Changes

Check that the function works correctly by running this test query in Supabase:

```sql
-- Check current enum values
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'queue_type';

-- Test claiming a job
SELECT * FROM claim_pending_jobs(
    ARRAY['generate_daily_brief', 'generate_phases'],
    1
);
```

## 3. Update Any Existing Data (if needed)

If you have any jobs with old status or type values, update them:

```sql
-- Update any old job_type values
UPDATE queue_jobs
SET job_type = 'generate_daily_brief'::queue_type
WHERE job_type::text = 'brief_generation';

UPDATE queue_jobs
SET job_type = 'generate_phases'::queue_type
WHERE job_type::text = 'phases_generation';

-- Update any old status values
UPDATE queue_jobs
SET status = 'processing'::queue_status
WHERE status::text = 'generating';
```

## 4. Clean Up

You can now delete these temporary SQL files:

- `/scripts/cleanup-and-fix-claim-pending-jobs.sql`
- `/scripts/create-claim-pending-jobs-function.sql`
- `/scripts/debug-queue-job-calls.sql`
- `/scripts/fix-all-queue-functions.sql`
- `/scripts/fix-claim-pending-jobs-function.sql`

## Summary of Changes Made

1. ✅ Updated all TypeScript code to use `'generate_daily_brief'` instead of `'brief_generation'`
2. ✅ Updated all TypeScript code to use `'generate_phases'` instead of `'phases_generation'`
3. ✅ Updated all TypeScript code to use `'processing'` instead of `'generating'`
4. ✅ Fixed the `claim_pending_jobs` database function to use correct enum values
5. ✅ All code now uses the database enum types for type safety
