<!-- apps/worker/docs/SCHEDULER_ANALYSIS_AND_BUGS.md -->

# Scheduler.ts Analysis & Bug Report

**Generated:** 2025-10-01
**Analyzed Files:**

- `/apps/worker/src/scheduler.ts`
- `/apps/worker/src/workers/brief/briefWorker.ts`
- `/apps/worker/src/workers/brief/briefGenerator.ts`
- `/apps/worker/src/workers/brief/emailWorker.ts`
- `/apps/worker/src/lib/services/email-sender.ts`
- `/apps/worker/src/lib/services/email-service.ts`

---

## Executive Summary

The scheduler system has a **two-phase email delivery architecture**:

1. **Phase 1**: Generate daily brief (scheduler → briefWorker → briefGenerator)
2. **Phase 2**: Send email (briefWorker queues email job → emailWorker sends email)

**Critical Finding**: The email decoupling works, but there are **5 potential bugs** and **3 configuration issues** that could cause emails to silently fail.

---

## System Flow Diagram

```
SCHEDULER (cron every hour)
    ↓
Check user_brief_preferences (is_active=true, email_daily_brief=true)
    ↓
Calculate nextRunTime based on timezone + time_of_day
    ↓
Queue job: generate_daily_brief (with engagementMetadata)
    ↓
BRIEF WORKER (processBriefJob)
    ↓
Generate brief content (briefGenerator)
    ↓
Create email record in emails table (status='pending')
    ↓
Create recipient record in email_recipients table (status='pending')
    ↓
Queue job: generate_brief_email (with emailId only)
    ↓
EMAIL WORKER (processEmailBriefJob)
    ↓
Fetch email record from emails table
    ↓
Check user preferences again (email_daily_brief, is_active)
    ↓
Send email via EmailService (webhook OR direct SMTP)
    ↓
Update emails table (status='sent')
    ↓
Update email_recipients table (status='sent')
```

---

## Bug Report

### 🔴 CRITICAL BUG #1: Email Job Type Not in Database Enum (Potential)

**File**: `worker.ts:152-153`
**Issue**: The code has a `@ts-expect-error` comment suggesting the enum might not exist:

```typescript
// @ts-expect-error - generate_brief_email will be added to enum after migration
queue.process('generate_brief_email', processEmailBrief);
```

**Impact**: If the database migration `20250930_add_email_brief_job_type_part1.sql` hasn't been run in production, email jobs will **fail to queue** with a database constraint error.

**Verification Needed**:

```sql
-- Check if enum exists in production
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'queue_type'::regtype
  AND enumlabel = 'generate_brief_email';
```

**Fix**: Run both migration files in order:

1. `20250930_add_email_brief_job_type_part1.sql` (adds enum)
2. `20250930_add_email_brief_job_type_part2.sql` (adds constraints)

---

### 🟠 HIGH BUG #2: Missing Engagement Metadata in Email Jobs

**File**: `briefWorker.ts:193-205`
**Issue**: When queuing the email job, only `emailId` is passed in metadata:

```typescript
p_metadata: {
  emailId: emailRecord.id, // ← Just emailId!
},
```

But the brief's metadata contains important re-engagement info:

```typescript
// From briefGenerator.ts:347-357
const updatedMetadata = {
	is_reengagement: isReengagement,
	days_since_last_login: daysSinceLastLogin,
	email_subject: isReengagement
		? ReengagementBriefPrompt.getSubjectLine(daysSinceLastLogin)
		: undefined
};
```

**Impact**: The email worker **cannot access** re-engagement metadata to customize email behavior or tracking. The custom subject line is stored in the email record's `template_data`, but not passed to the email job.

**Current Workaround**: The email worker fetches the email record which has `template_data.brief_id`, then uses that to get the brief's metadata. This works but adds 2 extra database queries.

**Proposed Fix**: Pass engagement metadata in the email job:

```typescript
p_metadata: {
  emailId: emailRecord.id,
  briefId: brief.id,
  isReengagement: job.data.options?.isReengagement || false,
  daysSinceLastLogin: job.data.options?.daysSinceLastLogin || 0,
},
```

---

### 🟠 HIGH BUG #3: Email Configuration Not Validated at Startup

**File**: `email-sender.ts:62-90`
**Issue**: The system defaults to `USE_WEBHOOK_EMAIL=false` and falls back to direct SMTP, but **never validates** that SMTP is configured.

```typescript
this.useWebhook = process.env.USE_WEBHOOK_EMAIL === 'true';
// ... falls back to direct SMTP if webhook fails
```

**Impact**: If neither webhook nor SMTP is configured, emails will be marked as "simulated" and **never actually sent**, but the system will report success. Users won't receive emails.

**Verification**: The email service logs to `email_logs` with `status='simulated'` but this is buried in logs.

**Fix**: Add startup validation:

```typescript
constructor(private supabase: SupabaseClient) {
  this.useWebhook = process.env.USE_WEBHOOK_EMAIL === "true";

  if (this.useWebhook) {
    if (!process.env.BUILDOS_WEBHOOK_URL || !process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET) {
      throw new Error("Webhook email enabled but BUILDOS_WEBHOOK_URL or SECRET not configured");
    }
  } else {
    const gmailConfig = getGmailConfig();
    if (!gmailConfig) {
      console.warn("⚠️  CRITICAL: No email transport configured. Emails will be simulated only!");
      console.warn("   Set USE_WEBHOOK_EMAIL=true or configure Gmail credentials");
    }
  }
}
```

---

### 🟡 MEDIUM BUG #4: Redundant Email Preference Check

**File**: `emailWorker.ts:60-87` and `briefWorker.ts:98-109`
**Issue**: Email preferences are checked **twice**:

1. **In briefWorker.ts** before creating email record:

```typescript
const shouldSend = await emailSender.shouldSendEmail(job.data.userId);
if (shouldSend) {
	// Create email record
}
```

2. **In emailWorker.ts** before sending email:

```typescript
const { data: preferences } = await supabase
	.from('user_brief_preferences')
	.select('email_daily_brief, is_active')
	.eq('user_id', userId)
	.single();

if (!preferences?.email_daily_brief || !preferences?.is_active) {
	// Cancel email
}
```

**Impact**:

- Extra database query (minor performance hit)
- Potential race condition if user disables email between brief generation and email sending
- Email record created but never sent (orphaned records)

**Rationale**: The second check is intentional to handle users who disable emails after brief generation but before sending. However, this should be documented.

**Recommendation**: Keep both checks but add comment explaining why:

```typescript
// Re-check preferences in case user disabled email between brief generation and sending
```

---

### 🟡 MEDIUM BUG #5: Email Status Not Updated on Cancellation

**File**: `emailWorker.ts:73-86`
**Issue**: When email is cancelled due to preference change, the email status is updated to `'cancelled'` but the **email_recipients status is not updated**.

```typescript
await supabase.from('emails').update({ status: 'cancelled' }).eq('id', emailId);

// Missing: Update email_recipients status to 'cancelled'
```

**Impact**: Email tracking shows inconsistent state:

- `emails.status = 'cancelled'`
- `email_recipients.status = 'pending'` (never updated)

**Fix**:

```typescript
// Update email status
await supabase.from('emails').update({ status: 'cancelled' }).eq('id', emailId);

// Update recipient status too
await supabase
	.from('email_recipients')
	.update({
		status: 'cancelled',
		error_message: 'User disabled email before sending'
	})
	.eq('email_id', emailId);
```

Note: `'cancelled'` is not in the `EmailRecipientStatus` type constraint. Need to either:

1. Add `'cancelled'` to the enum
2. Use `'failed'` with a specific error message

---

## Configuration Issues

### ⚙️ CONFIG #1: Ambiguous Email Transport Selection

**File**: `email-sender.ts:46-90`
**Issue**: The decision tree for email transport is:

```typescript
USE_WEBHOOK_EMAIL === "true" → Webhook (requires BUILDOS_WEBHOOK_URL + SECRET)
                            ↓
                      Webhook fails → Fall back to SMTP
                            ↓
        No SMTP config → Simulated emails (logs only)
```

**Problem**: It's not obvious which transport is being used. Logs show:

```
📨 Email sender initialized: Using WEBHOOK service for BuildOS
```

But then might fall back without clear indication.

**Recommendation**: Add explicit transport validation and logging:

```typescript
console.log('=== EMAIL TRANSPORT CONFIGURATION ===');
console.log(`USE_WEBHOOK_EMAIL: ${process.env.USE_WEBHOOK_EMAIL}`);
console.log(`Webhook URL configured: ${!!process.env.BUILDOS_WEBHOOK_URL}`);
console.log(`Gmail configured: ${!!getGmailConfig()}`);
console.log(`Selected transport: ${this.useWebhook ? 'WEBHOOK' : 'DIRECT SMTP'}`);
console.log('=====================================');
```

---

### ⚙️ CONFIG #2: Missing Environment Variables in .env.example

**File**: `apps/worker/.env.example` (presumed)
**Issue**: Based on the code, these env vars are critical but might not be documented:

```bash
# Email Configuration
USE_WEBHOOK_EMAIL=true                      # Use webhook to main app (recommended)
BUILDOS_WEBHOOK_URL=https://build-os.com/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=your_secret  # HMAC signing key

# OR use direct SMTP
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GMAIL_ALIAS=noreply@build-os.com           # Optional sender alias
```

**Recommendation**: Ensure `.env.example` documents both methods clearly.

---

### ⚙️ CONFIG #3: Timezone Validation Not Strict

**File**: `scheduler.ts:353-434`
**Issue**: The scheduler validates timezones with `isValidTimezone()` and falls back to UTC:

```typescript
if (!isValidTimezone(timezone)) {
	console.warn(`Invalid timezone "${timezone}" detected, falling back to UTC`);
	timezone = 'UTC';
}
```

**Problem**: Silent fallback means users with invalid timezones will get briefs at the wrong time with no error notification.

**Impact**: Users see briefs scheduled for their timezone but receive them at UTC time instead.

**Recommendation**: Alert user when timezone is invalid:

```typescript
if (!isValidTimezone(timezone)) {
	console.error(`Invalid timezone "${timezone}" for user ${userId}, falling back to UTC`);

	// Optionally: Create error log entry
	await supabase.from('error_logs').insert({
		user_id: userId,
		error_type: 'invalid_timezone',
		error_message: `Invalid timezone: ${timezone}`,
		operation_type: 'schedule_brief'
	});

	timezone = 'UTC';
}
```

---

## Data Model Issues

### Schema Validation

**user_brief_preferences table:**

```typescript
{
	user_id: string;
	timezone: string | null; // ← Can be null, validated at runtime
	time_of_day: string | null; // ← Format: "HH:MM:SS"
	frequency: string | null; // ← Options: 'daily', 'weekly', 'custom'
	day_of_week: number | null; // ← 0 (Sunday) to 6 (Saturday)
	is_active: boolean | null; // ← Default: true
	email_daily_brief: boolean | null; // ← Default: false (opt-in)
}
```

**Potential Issues:**

1. All fields except `user_id` are nullable → Scheduler has defensive checks
2. `time_of_day` is string, not TIME type → Validated with regex in `calculateNextRunTime()`
3. `frequency` is string, not enum → Validated with `validateUserPreference()`

**Recommendation**: Consider making critical fields non-nullable with defaults:

```sql
ALTER TABLE user_brief_preferences
  ALTER COLUMN timezone SET DEFAULT 'UTC',
  ALTER COLUMN timezone SET NOT NULL,
  ALTER COLUMN time_of_day SET DEFAULT '09:00:00',
  ALTER COLUMN time_of_day SET NOT NULL,
  ALTER COLUMN frequency SET DEFAULT 'daily',
  ALTER COLUMN frequency SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN email_daily_brief SET DEFAULT false,
  ALTER COLUMN email_daily_brief SET NOT NULL;
```

---

## Variable Usage Analysis

### Scheduler → Worker Flow

**Scheduler queues job with:**

```typescript
{
  userId: string;
  briefDate: string;              // YYYY-MM-DD format in user's timezone
  options: {
    requestedBriefDate?: string;
    isReengagement: boolean;      // ← From engagement backoff
    daysSinceLastLogin: number;   // ← From engagement backoff
  };
  timezone: string;
}
```

**Brief Worker receives:**

```typescript
job.data.userId; // ✅ Used
job.data.briefDate; // ✅ Used
job.data.timezone; // ✅ Used (but re-fetched from preferences for safety)
job.data.options; // ✅ Passed to briefGenerator
```

**Brief Generator uses:**

```typescript
options?.isReengagement; // ✅ Used to generate re-engagement content
options?.daysSinceLastLogin; // ✅ Used in prompts and metadata
```

**Email Worker receives:**

```typescript
job.data.emailId; // ✅ Used to fetch email record
// ⚠️  Does NOT receive engagement metadata directly
```

**Conclusion**: All variables are used correctly, but engagement metadata is **not propagated to email worker** (see Bug #2).

---

## Email Sending Logic Verification

### Decision Tree

```
EmailWorker.processEmailBriefJob()
    ↓
Fetch email record from emails table
    ↓
Check user_brief_preferences.email_daily_brief
    ├─ false → Cancel email, update status='cancelled', exit
    └─ true → Continue
    ↓
Get user email from users.email
    ├─ null → Throw error
    └─ email → Continue
    ↓
Check email transport (DailyBriefEmailSender)
    ├─ USE_WEBHOOK_EMAIL=true → WebhookEmailService
    │   ├─ POST to BUILDOS_WEBHOOK_URL with HMAC signature
    │   └─ Update emails.status='sent'
    └─ USE_WEBHOOK_EMAIL=false → EmailService (SMTP)
        ├─ Gmail configured → Send via nodemailer
        │   ├─ Success → Log to email_logs, update emails.status='sent'
        │   └─ Error → Log to email_logs, update emails.status='failed', throw
        └─ Gmail not configured → Simulated send
            └─ Log to email_logs with status='simulated'
```

### Critical Question: Is Email Actually Sent?

**Answer**: It depends on configuration. The email **will be sent** if:

✅ `user_brief_preferences.email_daily_brief = true`
✅ `user_brief_preferences.is_active = true`
✅ `emails` record created with `status='pending'`
✅ `queue_jobs` has `job_type='generate_brief_email'` in `pending` status
✅ Email worker successfully processes the job
✅ **AND** one of these is true:

- Webhook configured: `USE_WEBHOOK_EMAIL=true`, `BUILDOS_WEBHOOK_URL` set, `PRIVATE_BUILDOS_WEBHOOK_SECRET` set
- SMTP configured: `GMAIL_USER`, `GMAIL_APP_PASSWORD` set

**If NEITHER is configured**: Email is "simulated" and logged with `status='simulated'` in `email_logs` table.

---

## Recommended Debugging Steps

### 1. Check Database State

```sql
-- Check if user has email enabled
SELECT
  user_id,
  email_daily_brief,
  is_active,
  timezone,
  time_of_day,
  frequency
FROM user_brief_preferences
WHERE user_id = 'YOUR_USER_ID';

-- Check recent briefs
SELECT
  id,
  user_id,
  brief_date,
  generation_status,
  generation_completed_at,
  metadata
FROM daily_briefs
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 5;

-- Check email records
SELECT
  id,
  created_by,
  subject,
  status,
  created_at,
  sent_at,
  tracking_id,
  template_data
FROM emails
WHERE created_by = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 5;

-- Check email jobs
SELECT
  queue_job_id,
  user_id,
  job_type,
  status,
  metadata,
  created_at,
  scheduled_for,
  started_at,
  completed_at
FROM queue_jobs
WHERE user_id = 'YOUR_USER_ID'
  AND job_type = 'generate_brief_email'
ORDER BY created_at DESC
LIMIT 10;

-- Check email logs (actual sending attempts)
SELECT
  id,
  to_email,
  subject,
  status,
  sent_at,
  error_message,
  metadata
FROM email_logs
WHERE user_id = 'YOUR_USER_ID'
ORDER BY sent_at DESC
LIMIT 10;
```

### 2. Check Worker Logs

Look for these log patterns:

**Email Creation (in briefWorker):**

```
📨 Queued email job {jobId} for email {emailId} (brief {briefId})
```

**Email Processing (in emailWorker):**

```
📧 Processing email job {jobId} for email {emailId}
📋 Email for brief {briefId}, date {briefDate}, user {userId}
📨 Sending email to {email}
✅ Email sent successfully for brief {briefId}
```

**Email Transport (in email-sender):**

```
📬 Preparing to send daily brief email:
   → User: {userId}
   → Email: {email}
   → Brief Date: {briefDate}
   → Brief ID: {briefId}
   → Method: WEBHOOK | DIRECT SMTP
```

### 3. Check Environment Variables

```bash
# In Railway worker service
echo $USE_WEBHOOK_EMAIL
echo $BUILDOS_WEBHOOK_URL
echo $PRIVATE_BUILDOS_WEBHOOK_SECRET
echo $GMAIL_USER
echo $GMAIL_APP_PASSWORD
```

### 4. Manual Test Email

```typescript
// Run this in worker context to test email sending
import { DailyBriefEmailSender } from './lib/services/email-sender';
import { supabase } from './lib/supabase';

const sender = new DailyBriefEmailSender(supabase);

// Check if user should receive email
const shouldSend = await sender.shouldSendEmail('YOUR_USER_ID');
console.log('Should send:', shouldSend);

// Send test email
const result = await sender.sendDailyBriefEmail('YOUR_USER_ID', '2025-10-01', {
	id: 'test-brief-id',
	summary_content: '# Test Brief\n\nThis is a test.',
	brief_date: '2025-10-01',
	llm_analysis: null
});
console.log('Send result:', result);
```

---

## Summary of Findings

| Issue                          | Severity | Impact                           | Status                  |
| ------------------------------ | -------- | -------------------------------- | ----------------------- |
| Missing database enum          | Critical | Emails fail to queue             | ⚠️ Verify in production |
| Engagement metadata not passed | High     | Re-engagement emails not tracked | 🔧 Needs fix            |
| No email config validation     | High     | Silent failure mode              | 🔧 Needs fix            |
| Redundant preference check     | Medium   | Extra query, potential race      | ✅ Intentional          |
| Email status inconsistency     | Medium   | Tracking data incomplete         | 🔧 Needs fix            |
| Ambiguous transport selection  | Low      | Unclear which method used        | 📝 Document             |
| Missing env var docs           | Low      | Setup confusion                  | 📝 Document             |
| Timezone fallback silent       | Low      | Users get wrong time             | 🔧 Add alerting         |

**Overall Assessment**: The scheduler is **functionally correct** but has **5 bugs** that should be fixed to ensure reliable email delivery and proper tracking. The most critical issue is verifying the database enum exists in production.
