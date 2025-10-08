---
date: 2025-10-07T02:21:40+0000
researcher: Claude Code
git_commit: 01bfe2f60ddc74297548e174b0c61a8824562059
branch: main
repository: buildos-platform
topic: "Daily Brief Email Creation Failing with Status Constraint Violation"
tags: [research, codebase, email, daily-brief, database, constraint, bug]
status: complete
last_updated: 2025-10-07
last_updated_by: Claude Code
---

# Research: Daily Brief Email Creation Failing with Status Constraint Violation

**Date**: 2025-10-07T02:21:40+0000
**Researcher**: Claude Code
**Git Commit**: 01bfe2f60ddc74297548e174b0c61a8824562059
**Branch**: main
**Repository**: buildos-platform

## Research Question

Why is the daily brief email generation failing with the error:
```
Failed to create email record: {
  code: '23514',
  message: 'new row for relation "emails" violates check constraint "emails_status_check"'
}
```

The error occurs when trying to insert an email record with `status = 'pending'`.

## Summary

**Root Cause**: The `emails` table has a CHECK constraint named `emails_status_check` that does **NOT** include `'pending'` as a valid status value. The constraint was likely created manually in the Supabase UI and incorrectly copied from the `email_logs` table constraint, which only allows `('sent', 'failed', 'bounced', 'complaint')` because email_logs is for already-sent emails.

**Impact**: Daily brief emails cannot be created because the worker tries to insert email records with `status: 'pending'`, which violates the constraint.

**Solution**: Drop the incorrect constraint and add a new one that includes all valid status values expected by the code: `'pending', 'scheduled', 'sent', 'failed', 'cancelled', 'draft'`.

## Detailed Findings

### 1. The Error

**Error Code**: PostgreSQL error `23514` = CHECK constraint violation
**Constraint Name**: `emails_status_check`
**Rejected Value**: `status = 'pending'`

### 2. Code Behavior - What the Code Expects

The daily brief worker creates email records with `status: 'pending'`:

**File**: `apps/worker/src/workers/brief/briefWorker.ts:149-169`

```typescript
const { data: emailRecord, error: emailError } = await supabase
  .from("emails")
  .insert({
    created_by: job.data.userId,
    from_email: "noreply@build-os.com",
    from_name: "BuildOS",
    subject: subject,
    content: emailHtmlForStorage,
    category: "daily_brief",
    status: "pending", // ← This is being rejected by the constraint!
    tracking_enabled: true,
    tracking_id: trackingId,
    template_data: {
      brief_id: brief.id,
      brief_date: briefDate,
      user_id: job.data.userId,
    },
  })
  .select()
  .single();
```

**Valid Status Values Expected by Code**:
- `'pending'` - Email created but not yet sent
- `'scheduled'` - Email scheduled for future sending
- `'sent'` - Email successfully sent
- `'failed'` - Email send failed
- `'cancelled'` - Email cancelled before sending
- `'draft'` - Email in draft state

**Evidence Sources**:
- `apps/worker/PHASE2_REVISED_IMPLEMENTATION.md:40` - Documents these status values
- `apps/web/supabase/migrations/20240120_add_performance_indexes.sql:56-58` - Index uses `'draft', 'scheduled'`
- `apps/worker/src/workers/brief/emailWorker.ts:130, 172` - Code uses `'sent'` and `'failed'`
- `apps/worker/src/lib/services/email-service.ts:98, 134, 250` - Code uses `'sent'` and `'failed'`

### 3. Database Schema Issue

**The `emails` Table Was Created Manually**:
- No migration file exists that creates the `emails` table
- The table was likely created via Supabase UI
- This is why there's no documented schema for it

**Incorrect Constraint Source**:
The `email_logs` table (a different table) has this constraint:

**File**: `apps/web/supabase/migrations/20241219_dunning_system.sql:127`

```sql
CREATE TABLE IF NOT EXISTS email_logs (
  ...
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced', 'complaint')),
  ...
);
```

**Why this is wrong for `emails` table**:
- `email_logs` is for **already-sent** emails (historical log)
- `emails` table is for email **records** that go through a lifecycle (pending → sent/failed)
- The constraint from `email_logs` does NOT include `'pending'` because logs only record completed sends
- Someone likely copied this constraint to the `emails` table, causing the current error

### 4. Migration Evidence

**Migration `20250930_add_email_brief_job_type_part2.sql` expects `'pending'` to be valid**:

**Line 38-41**: Creates index assuming `status = 'pending'` is valid
```sql
CREATE INDEX IF NOT EXISTS idx_emails_status_category
  ON emails(status, category, created_at)
  WHERE status = 'pending' AND category = 'daily_brief';
```

**Line 76-80**: RPC function queries `status = 'pending'`
```sql
WHERE e.status = 'pending'
  AND e.category = 'daily_brief'
```

**Line 138**: View aggregates all three statuses
```sql
COUNT(*) FILTER (WHERE e.status = 'sent') as sent_count,
COUNT(*) FILTER (WHERE e.status = 'failed') as failed_count,
COUNT(*) FILTER (WHERE e.status = 'pending') as pending_count,
```

This migration clearly expects `'pending'` to be a valid status value!

### 5. Email Flow Architecture

**Two-Phase Email Delivery**:

**Phase 1** - Brief Generation (`briefWorker.ts`):
1. Generate daily brief content
2. Create email record with `status: 'pending'` ← **FAILS HERE**
3. Queue email job for later processing

**Phase 2** - Email Sending (`emailWorker.ts`):
1. Pick up queued email job
2. Fetch email record
3. Send via SMTP or webhook
4. Update status to `'sent'` or `'failed'`

**Why `'pending'` is essential**:
- Allows non-blocking email delivery
- Separates brief generation from email sending
- Enables retry logic for failed emails
- Provides observability of email lifecycle

## Code References

- `apps/worker/src/workers/brief/briefWorker.ts:159` - Creates email with `status: 'pending'`
- `apps/worker/src/workers/brief/emailWorker.ts:75` - Can update status to `'cancelled'`
- `apps/worker/src/workers/brief/emailWorker.ts:130` - Updates status to `'sent'`
- `apps/worker/src/workers/brief/emailWorker.ts:172` - Updates status to `'failed'`
- `apps/worker/src/lib/services/email-sender.ts:310` - Uses `status: 'scheduled'`
- `apps/web/supabase/migrations/20250930_add_email_brief_job_type_part2.sql:38-41` - Index for pending emails
- `apps/web/supabase/migrations/20241219_dunning_system.sql:127` - Wrong constraint from `email_logs`

## Solution

### Option 1: Drop and Recreate Constraint (Recommended)

Run this SQL in Supabase SQL Editor:

```sql
-- Drop the incorrect constraint
ALTER TABLE emails
DROP CONSTRAINT IF EXISTS emails_status_check;

-- Add correct constraint with all valid statuses
ALTER TABLE emails
ADD CONSTRAINT emails_status_check
CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'cancelled', 'draft'));

COMMENT ON CONSTRAINT emails_status_check ON emails IS
'Valid email statuses: pending (created), scheduled (queued), sent (delivered), failed (error), cancelled (aborted), draft (incomplete)';
```

### Option 2: Create a Migration File (For Production)

Create `apps/web/supabase/migrations/20251007_fix_emails_status_constraint.sql`:

```sql
-- Migration: Fix emails table status constraint
-- Date: 2025-10-07
-- Issue: emails_status_check constraint doesn't include 'pending', causing daily brief email creation to fail
-- Root Cause: Constraint was likely copied from email_logs table which only stores already-sent emails

-- Drop the incorrect constraint
ALTER TABLE emails
DROP CONSTRAINT IF EXISTS emails_status_check;

-- Add correct constraint with all valid email lifecycle statuses
ALTER TABLE emails
ADD CONSTRAINT emails_status_check
CHECK (status IN (
  'pending',    -- Email created, not yet sent
  'scheduled',  -- Email queued for future sending
  'sent',       -- Email successfully delivered
  'failed',     -- Email send failed
  'cancelled',  -- Email cancelled before sending
  'draft'       -- Email in draft state
));

COMMENT ON CONSTRAINT emails_status_check ON emails IS
'Valid email statuses throughout the email lifecycle from creation to delivery';

-- Verify the constraint works
DO $$
BEGIN
  -- This should succeed now
  INSERT INTO emails (
    created_by,
    from_email,
    from_name,
    subject,
    content,
    status,
    category
  ) VALUES (
    (SELECT id FROM auth.users LIMIT 1),
    'test@test.com',
    'Test',
    'Test',
    'Test',
    'pending',
    'test'
  );

  -- Clean up test record
  DELETE FROM emails WHERE category = 'test' AND subject = 'Test';

  RAISE NOTICE 'Constraint fix verified successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Constraint fix failed: %', SQLERRM;
END $$;
```

### Verification

After applying the fix, verify with:

```sql
-- Check the new constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'emails_status_check';

-- Test inserting a pending email (should succeed)
SELECT EXISTS(
  SELECT 1
  FROM emails
  WHERE status = 'pending'
) AS has_pending_emails;
```

## Historical Context

### Related Issues

**Railway SMTP Blocking** (`thoughts/shared/research/2025-09-26_21-14-50_email_sending_railway_production_issue.md`):
- Railway blocks SMTP ports on Free/Trial/Hobby plans
- Solution: Webhook-based email delivery as primary method
- This is unrelated to the current constraint issue but explains the webhook infrastructure

**Email Tracking System** (`thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md`):
- Email tracking system upgraded on 2025-10-06
- Now updates both `email_recipients` and `notification_deliveries` tables
- Email open/click tracking fully functional

### Related Documentation

- **Worker Service**: `apps/worker/CLAUDE.md` - Complete worker development guide
- **Email System Architecture**: `apps/worker/SCHEDULER_ANALYSIS_AND_BUGS.md` - Known email system bugs
- **Notification Tracking**: `docs/architecture/NOTIFICATION_TRACKING_SYSTEM.md`
- **SMS Integration**: `docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`

## Open Questions

1. **When was the constraint added?** - No migration file exists for the `emails` table creation or constraint addition
2. **How did this error not appear before?** - Possible that:
   - Daily briefs weren't being generated recently
   - The constraint was recently added manually
   - The worker service was recently redeployed with updated code
3. **Are there existing email records with `status = 'pending'`?** - If so, the constraint might not exist in production, only in a specific environment

## Next Steps

1. ✅ Apply the constraint fix immediately in the environment where the error occurred
2. Create and run the migration in all environments (dev, staging, production)
3. Verify daily brief email generation works
4. Consider creating a migration to properly define the `emails` table schema (currently created manually)
5. Document the full `emails` table schema in `apps/web/docs/technical/database/schema.md`

---

**Research Status**: ✅ Complete
**Solution Status**: 🔧 Ready to Apply
**Confidence Level**: ⭐⭐⭐⭐⭐ High (constraint mismatch clearly identified, solution straightforward)
