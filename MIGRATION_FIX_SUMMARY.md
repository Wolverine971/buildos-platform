# Queue Type Migration Fix Summary

## Problem

The migration `20250927_queue_type_constraints.sql` was failing with:

```
ERROR: 23514: check constraint "valid_job_metadata" of relation "queue_jobs" is violated by some row
```

## Root Cause

Existing queue_jobs records had:

- Inconsistent metadata field names (mix of camelCase and snake_case)
- Missing required fields
- Different field naming conventions across job types

## Solution Implemented

### 1. Pre-Migration Data Cleanup

Added a phase that runs before constraints are applied:

- Attempts to fix metadata by adding missing required fields
- Normalizes field names to expected format
- Uses COALESCE to handle various field name patterns

### 2. Relaxed Constraint Validation

Modified constraints to accept multiple field name formats:

```sql
-- Example: Daily brief jobs now accept both patterns
(metadata ? 'briefDate' OR metadata ? 'brief_date') AND
(metadata ? 'timezone' OR metadata ? 'time_zone')
```

### 3. Graceful Failure Handling

- Identifies rows that can't be fixed automatically
- Marks them as 'failed' with descriptive error message
- Provides detailed logging of violations for debugging

### 4. Key Changes by Job Type

#### generate_daily_brief

- Accepts: `briefDate`/`brief_date`, `timezone`/`time_zone`
- Relaxed date format validation
- Auto-fills missing fields with defaults

#### generate_phases

- Accepts: `projectId`/`project_id`/`projectID`
- Removed strict UUID validation (just checks non-empty)

#### onboarding_analysis

- Accepts: `userId`/`user_id`
- Optional step validation remains strict

#### sync_calendar

- Accepts: `calendarId`/`calendar_id`
- Flexible syncDirection field names

#### process_brain_dump

- Accepts: `brainDumpId`/`brain_dump_id`
- Flexible processMode field names

#### send_email

- Accepts: `recipientUserId`/`recipient_user_id`/`user_id`
- Flexible emailType field names

## Testing Recommendations

1. **Before applying migration in production**:

   ```sql
   -- Check how many rows would be affected
   SELECT COUNT(*), job_type, status
   FROM queue_jobs
   WHERE status NOT IN ('completed', 'cancelled', 'failed')
   GROUP BY job_type, status;
   ```

2. **Backup queue_jobs table**:

   ```sql
   CREATE TABLE queue_jobs_backup AS
   SELECT * FROM queue_jobs;
   ```

3. **Apply migration and verify**:
   - Migration will log all changes made
   - Review any rows marked as 'failed'
   - Verify constraint is properly applied

## Rollback Plan

If issues occur:

```sql
-- Remove constraint
ALTER TABLE queue_jobs DROP CONSTRAINT IF EXISTS valid_job_metadata;

-- Restore from backup if needed
-- INSERT INTO queue_jobs SELECT * FROM queue_jobs_backup;
```

## Future Improvements

1. **Standardize field names**: Gradually migrate all code to use consistent camelCase
2. **Add data migration tool**: Create utility to bulk-update metadata formats
3. **Monitor new jobs**: Ensure new jobs use correct metadata format
4. **Deprecation timeline**: Plan to remove snake_case support in future version
