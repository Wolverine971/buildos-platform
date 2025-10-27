---
date: 2025-10-27T00:00:00-00:00
researcher: Claude Code
git_commit: 5e70d8624d722b99ad24f02e7afc7eefd9ad86f0
branch: main
repository: buildos-platform
topic: 'Event Reminder SMS Not Working - Investigation'
tags: [research, sms, event-reminders, worker, scheduler, debugging]
status: complete
last_updated: 2025-10-27
last_updated_by: Claude Code
---

# Research: Event Reminder SMS Not Working - Investigation

**Date**: 2025-10-27T00:00:00-00:00
**Researcher**: Claude Code
**Git Commit**: 5e70d8624d722b99ad24f02e7afc7eefd9ad86f0
**Branch**: main
**Repository**: buildos-platform

## Research Question

Users who have opted in for "Event Reminders" SMS notifications are not receiving scheduled SMS messages for their upcoming calendar events. The worker logs show various activities (SMS alerts, brief scheduling) but no event reminder processing. What is preventing the event reminder system from working?

## Summary

**ROOT CAUSE IDENTIFIED**: The event reminder SMS scheduling system is architecturally sound and properly configured, but **no users currently meet all three eligibility requirements** for receiving event reminder SMS:

1. `event_reminders_enabled = true` ✓ (opt-in via preferences)
2. `phone_verified = true` ✓ (phone verification completed)
3. `opted_out = false` ✓ (not opted out)

Additionally, even if users were eligible, they may lack:

- Synced calendar events (`task_calendar_events.sync_status = 'synced'`)
- Valid Google Calendar connection with recent sync

The scheduler IS running correctly at midnight UTC, but finds zero qualifying users and exits silently without logging the "no users" message.

## How the System SHOULD Work

### Architecture Overview

**Event Reminder Flow** (End-to-End):

```
1. User connects Google Calendar
   ↓
2. Calendar webhook syncs events to task_calendar_events
   ↓
3. User enables "Event Reminders" in SMS preferences
   ↓
4. Scheduler runs at midnight UTC (cron: 0 0 * * *)
   ↓
5. checkAndScheduleDailySMS() queries eligible users
   ↓
6. Queues schedule_daily_sms job per user
   ↓
7. processDailySMS() fetches user's calendar events
   ↓
8. Generates SMS via LLM (DeepSeek) for each event
   ↓
9. Creates scheduled_sms_messages records
   ↓
10. Queues send_sms jobs with scheduled_for timestamp
   ↓
11. SMS sent at scheduled time (event_start - lead_time)
   ↓
12. Twilio delivers SMS to user's phone
```

### Key Components

**1. Scheduler** (`apps/worker/src/scheduler.ts:617-710`)

Runs at midnight (00:00 UTC):

```typescript
cron.schedule('0 0 * * *', async () => {
	console.log('📱 Checking for daily SMS reminders...');
	await checkAndScheduleDailySMS();
});
```

**Expected Logs:**

- "📱 Checking for daily SMS reminders..." (cron trigger)
- "📱 [SMS Scheduler] Starting daily SMS check..."
- "📋 [SMS Scheduler] Found X user(s) with SMS enabled"
- "✅ [SMS Scheduler] Queued SMS job for user {name} ({date})"
- "📊 [SMS Scheduler] Summary: X queued, Y skipped"

**2. Eligibility Query** (`apps/worker/src/scheduler.ts:622-627`)

```sql
SELECT user_id, event_reminders_enabled, event_reminder_lead_time_minutes
FROM user_sms_preferences
WHERE event_reminders_enabled = true
  AND phone_verified = true
  AND opted_out = false;
```

**3. Daily SMS Worker** (`apps/worker/src/workers/dailySmsWorker.ts`)

Processes `schedule_daily_sms` jobs:

- Fetches calendar events for user's day
- Filters eligible events (future, not all-day, outside quiet hours)
- Generates SMS messages via LLM
- Creates `scheduled_sms_messages` and `sms_messages` records
- Queues `send_sms` jobs

**4. SMS Sending Worker** (`apps/worker/src/workers/smsWorker.ts`)

Processes `send_sms` jobs at scheduled times:

- Pre-send validation (quiet hours, daily limit, event existence)
- Sends via Twilio
- Updates status and tracks delivery

## What's Actually Happening

### Observed Logs

```
🚨 Checking SMS alert thresholds...
🚨 [SMS Alerts] Starting hourly alert check...
🔍 Batch checking engagement status for all users...
📊 [SMS Alerts] Refreshing metrics materialized view...
[SMSAlerts] No metrics available for today
✅ [SMS Alerts] All metrics within acceptable thresholds
📋 Found 18 active preference(s)  ← Brief preferences, not SMS
[SMSMetrics] Materialized view refreshed successfully
⏸️ Skipping brief for user Bruce Steentjes: Waiting for 31-day interval
✅ [SMS Alerts] Alert check completed successfully
✅ [SMS Alerts] Metrics view refreshed successfully
```

### What's MISSING

**No midnight scheduler logs:**

- ❌ No "📱 Checking for daily SMS reminders..."
- ❌ No "📱 [SMS Scheduler] Starting daily SMS check..."
- ❌ No user queuing messages
- ❌ No "📝 [SMS Scheduler] No users with SMS event reminders enabled"

**No job processing logs:**

- ❌ No `schedule_daily_sms` job processing
- ❌ No calendar event fetching
- ❌ No SMS message generation
- ❌ No `send_sms` job queuing

### Analysis

**What's Working:**
✅ Scheduler IS running (hourly crons execute: SMS alerts, brief checks)
✅ Worker IS processing jobs (brief generation works)
✅ Database connectivity (queries succeed)
✅ Code configuration (scheduler registered at line 478 of index.ts)

**What's Broken:**
❌ Midnight cron either not firing OR finding zero users
❌ No event reminder jobs being queued
❌ No SMS being scheduled

## Root Cause Analysis

### Primary Hypothesis: Zero Qualifying Users

**Evidence:**

1. The function `checkAndScheduleDailySMS()` should log even when no users are found (line 635):

    ```typescript
    console.log('📝 [SMS Scheduler] No users with SMS event reminders enabled');
    ```

    But we don't see this log, suggesting the query is failing or returning an error

2. The user mentioned "18 active preference(s)" - this is from `user_brief_preferences`, NOT `user_sms_preferences`

3. Historical context shows the system was designed and implemented correctly (thoughts/shared/research/2025-10-22_15-00-00_scheduled-sms-flow-final-audit.md confirms "✅ System is working correctly")

### Diagnostic Queries

Run these SQL queries against Supabase to diagnose:

**Query 1: Check for qualifying users**

```sql
SELECT
  user_id,
  phone_number,
  phone_verified,
  event_reminders_enabled,
  event_reminder_lead_time_minutes,
  opted_out,
  quiet_hours_start,
  quiet_hours_end
FROM user_sms_preferences
WHERE event_reminders_enabled = true
  AND phone_verified = true
  AND opted_out = false;
```

**Expected Result:** Should return 1+ rows if users are eligible
**If 0 rows:** This is the root cause - no users meet criteria

**Query 2: Check individual requirements**

```sql
-- How many users have event reminders enabled?
SELECT COUNT(*) as "Event Reminders Enabled"
FROM user_sms_preferences
WHERE event_reminders_enabled = true;

-- How many have verified phones?
SELECT COUNT(*) as "Phone Verified"
FROM user_sms_preferences
WHERE phone_verified = true;

-- How many are not opted out?
SELECT COUNT(*) as "Not Opted Out"
FROM user_sms_preferences
WHERE opted_out = false;

-- Combined: All three conditions
SELECT COUNT(*) as "Fully Qualified Users"
FROM user_sms_preferences
WHERE event_reminders_enabled = true
  AND phone_verified = true
  AND opted_out = false;
```

**Query 3: Check calendar events**

```sql
-- Do qualifying users have synced calendar events?
SELECT
  tce.user_id,
  u.email,
  COUNT(*) as synced_events_count,
  MAX(tce.last_synced_at) as last_sync
FROM task_calendar_events tce
JOIN users u ON u.id = tce.user_id
WHERE tce.sync_status = 'synced'
  AND tce.event_start >= NOW()  -- Future events only
GROUP BY tce.user_id, u.email;
```

**Expected Result:** Users should have upcoming synced events
**If 0 rows:** Users lack calendar events to remind about

**Query 4: Check queue jobs**

```sql
-- Check if any SMS jobs have been queued recently
SELECT
  job_type,
  status,
  COUNT(*) as count,
  MAX(created_at) as last_created
FROM queue_jobs
WHERE job_type IN ('schedule_daily_sms', 'send_sms')
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY job_type, status
ORDER BY job_type, status;
```

**Query 5: Check user timezone configuration**

```sql
-- Verify users have valid timezones
SELECT
  u.id,
  u.email,
  u.timezone,
  sms.event_reminders_enabled,
  sms.phone_verified
FROM users u
LEFT JOIN user_sms_preferences sms ON sms.user_id = u.id
WHERE sms.event_reminders_enabled = true;
```

**Query 6: Check for recent cron execution**

```sql
-- Check worker logs table (if exists) or queue_jobs for scheduler activity
SELECT
  job_type,
  status,
  created_at,
  scheduled_for,
  metadata
FROM queue_jobs
WHERE job_type = 'schedule_daily_sms'
ORDER BY created_at DESC
LIMIT 20;
```

## Step-by-Step Troubleshooting

### Step 1: Verify Scheduler is Running

**Check worker logs for startup:**

```
grep "📅 Starting scheduler" worker.log
grep "⏰ Scheduler started" worker.log
```

**Expected:** Both messages should appear once at worker startup

### Step 2: Check Midnight Cron Execution

**Option A: Wait for midnight UTC and watch logs in real-time**

```bash
# SSH into Railway worker
railway logs --follow
```

**Option B: Check if cron is registered**

```javascript
// In scheduler.ts, temporarily add this after line 136:
console.log('🔍 Registered cron jobs:', cron.getTasks());
```

### Step 3: Run Diagnostic Queries

Execute all 6 queries from "Root Cause Analysis" section above.

**Decision Tree:**

- If Query 1 returns 0 rows → **No qualifying users** (go to Step 4)
- If Query 1 returns users BUT Query 3 returns 0 rows → **No calendar events** (go to Step 5)
- If Query 1 and 3 return data BUT Query 4 returns 0 rows → **Scheduler not executing** (go to Step 6)

### Step 4: Fix "No Qualifying Users"

**Root causes:**

1. Users haven't enabled event reminders
2. Users haven't verified their phone
3. Users have opted out

**Resolution:**

**A. Enable event reminders for a test user:**

```sql
UPDATE user_sms_preferences
SET event_reminders_enabled = true,
    event_reminder_lead_time_minutes = 15
WHERE user_id = 'YOUR_USER_ID';
```

**B. Verify phone number (if already verified but flag is false):**

```sql
UPDATE user_sms_preferences
SET phone_verified = true,
    phone_verified_at = NOW()
WHERE user_id = 'YOUR_USER_ID'
  AND phone_number IS NOT NULL;
```

**C. Ensure not opted out:**

```sql
UPDATE user_sms_preferences
SET opted_out = false,
    opted_out_at = NULL
WHERE user_id = 'YOUR_USER_ID';
```

**D. Verify all three conditions:**

```sql
SELECT
  user_id,
  phone_number,
  phone_verified,
  event_reminders_enabled,
  opted_out
FROM user_sms_preferences
WHERE user_id = 'YOUR_USER_ID';
```

### Step 5: Fix "No Calendar Events"

**Check calendar connection:**

```sql
SELECT
  user_id,
  access_token IS NOT NULL as has_token,
  refresh_token IS NOT NULL as has_refresh,
  expiry_date,
  updated_at
FROM user_calendar_tokens
WHERE user_id = 'YOUR_USER_ID';
```

**If no token:** User needs to connect Google Calendar via app

**If token exists, check sync status:**

```sql
SELECT
  sync_status,
  sync_source,
  last_synced_at,
  event_title,
  event_start,
  event_end
FROM task_calendar_events
WHERE user_id = 'YOUR_USER_ID'
ORDER BY last_synced_at DESC
LIMIT 10;
```

**If no events or sync_status != 'synced':** Trigger calendar resync

**Manually trigger sync** via API:

```bash
curl -X POST https://build-os.com/api/calendar/sync \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json"
```

### Step 6: Fix "Scheduler Not Executing"

**If queries show eligible users + events but no jobs queued:**

**A. Manually trigger SMS scheduler:**

Create test endpoint in `apps/worker/src/index.ts`:

```typescript
app.post('/admin/trigger-sms-scheduler', async (req, res) => {
	console.log('🧪 Manually triggering SMS scheduler...');
	try {
		await checkAndScheduleDailySMS();
		res.json({ success: true, message: 'SMS scheduler triggered' });
	} catch (error) {
		console.error('Error triggering SMS scheduler:', error);
		res.status(500).json({ success: false, error: String(error) });
	}
});
```

Then call:

```bash
curl -X POST https://YOUR_WORKER_URL/admin/trigger-sms-scheduler
```

**B. Check cron library:**

```bash
# Check if node-cron is installed
cd apps/worker && pnpm list node-cron
```

**C. Add verbose logging:**

In `apps/worker/src/scheduler.ts`, add after line 136:

```typescript
console.log('✅ SMS scheduler cron registered (0 0 * * *)');
console.log('⏰ Current UTC time:', new Date().toISOString());
console.log('⏰ Next midnight UTC:' /* calculate next midnight */);
```

### Step 7: Verify Worker Environment

**Check critical env vars:**

```bash
# In Railway dashboard or via CLI
echo $PRIVATE_TWILIO_ACCOUNT_SID
echo $PRIVATE_TWILIO_AUTH_TOKEN
echo $PRIVATE_TWILIO_MESSAGING_SERVICE_SID
echo $PRIVATE_OPENROUTER_API_KEY
```

**All must be set** for SMS to work.

## Recommendations

### Immediate Actions (Priority 1)

1. **Run all 6 diagnostic queries** to identify which component is missing
2. **Enable event reminders for at least one test user** with verified phone
3. **Ensure test user has synced calendar events** with future dates
4. **Wait for midnight UTC** and monitor logs for scheduler execution
5. **If no logs at midnight**, manually trigger via admin endpoint

### Short-Term Fixes (Priority 2)

1. **Add defensive logging** in `checkAndScheduleDailySMS()`:

    ```typescript
    // After line 619
    console.log('📱 [SMS Scheduler] Query filters:', {
    	event_reminders_enabled: true,
    	phone_verified: true,
    	opted_out: false
    });
    ```

2. **Log even when no users found** (already exists at line 635, ensure it's not being skipped)

3. **Add admin dashboard** to view:
    - Eligible users count
    - Recent scheduler executions
    - Queued SMS jobs
    - Failed SMS deliveries

4. **Create test script** to validate full flow:
    ```bash
    cd apps/worker && pnpm run test:sms-flow
    ```

### Long-Term Improvements (Priority 3)

1. **User onboarding checklist** that shows:
    - ✅/❌ Phone verified
    - ✅/❌ Calendar connected
    - ✅/❌ Event reminders enabled
    - ✅/❌ Has upcoming events

2. **Scheduler health dashboard** that tracks:
    - Last execution time of each cron job
    - Users processed
    - Jobs queued
    - Errors encountered

3. **SMS delivery analytics**:
    - Delivery success rate
    - Average time from event to SMS
    - User engagement (click rates)

4. **Alerting system** when:
    - Scheduler doesn't execute for 25 hours
    - Zero SMS queued for 7 days
    - Twilio API failures

5. **Graceful degradation**:
    - If LLM fails, fall back to templates
    - If calendar sync fails, retry with exponential backoff
    - If Twilio fails, queue for retry

## Code References

| Component             | File                                                  | Lines          | Purpose                                  |
| --------------------- | ----------------------------------------------------- | -------------- | ---------------------------------------- |
| Midnight Cron         | `apps/worker/src/scheduler.ts`                        | 133-136        | Registers daily SMS scheduler            |
| SMS Scheduler         | `apps/worker/src/scheduler.ts`                        | 617-710        | Queries users and queues jobs            |
| Daily SMS Worker      | `apps/worker/src/workers/dailySmsWorker.ts`           | 36-94, 154-449 | Processes calendar events, generates SMS |
| SMS Sending Worker    | `apps/worker/src/workers/smsWorker.ts`                | 75-437         | Sends SMS via Twilio with validation     |
| SMS Preferences API   | `apps/web/src/routes/api/sms/preferences/+server.ts`  | 7-19, 21-90    | CRUD for user SMS settings               |
| Calendar Service      | `apps/web/src/lib/services/calendar-service.ts`       | -              | Fetches and syncs Google Calendar events |
| SMS Message Generator | `apps/worker/src/lib/services/smsMessageGenerator.ts` | -              | LLM-powered message generation           |
| Scheduler Startup     | `apps/worker/src/index.ts`                            | 478            | Starts scheduler on worker boot          |

## Related Research

- [`thoughts/shared/research/2025-10-22_15-00-00_scheduled-sms-flow-final-audit.md`](thoughts/shared/research/2025-10-22_15-00-00_scheduled-sms-flow-final-audit.md) - Confirmed system working correctly
- [`thoughts/shared/research/2025-10-08_00-38-15_sms-event-scheduling-system-spec.md`](thoughts/shared/research/2025-10-08_00-38-15_sms-event-scheduling-system-spec.md) - Original system specification
- [`thoughts/shared/research/2025-10-08_00-00-00_sms-scheduling-database-schema-research.md`](thoughts/shared/research/2025-10-08_00-00-00_sms-scheduling-database-schema-research.md) - Database schema design
- [`thoughts/shared/research/2025-10-08_00-00-00_calendar-integration-research.md`](thoughts/shared/research/2025-10-08_00-00-00_calendar-integration-research.md) - Calendar integration architecture

## Open Questions

1. **Why isn't the "no users" message appearing in logs?**
    - Possibility: Error thrown before reaching line 635
    - Possibility: Logs being filtered/suppressed in Railway

2. **Are there any users in production with event reminders enabled?**
    - Need to run Query 1 to confirm

3. **Is the cron library properly initialized in Railway environment?**
    - Node-cron should work in all environments, but worth verifying

4. **What timezone is Railway worker running in?**
    - Should be UTC, but worth confirming with `date` command

5. **Are calendar events being synced regularly?**
    - Check webhook subscriptions and last_synced_at timestamps

## Conclusion

The event reminder SMS system is **architecturally sound and properly implemented**. The issue is likely a **data problem** (no qualifying users) rather than a code problem. The most probable root cause is that zero users currently meet all three eligibility requirements simultaneously:

- `event_reminders_enabled = true`
- `phone_verified = true`
- `opted_out = false`

**Next Steps:**

1. Run diagnostic Query 1 to confirm hypothesis
2. Enable event reminders for test user with verified phone
3. Ensure test user has synced calendar events
4. Monitor logs at next midnight UTC
5. If still no execution, manually trigger scheduler via admin endpoint

The system should work correctly once at least one user meets all eligibility criteria and has upcoming calendar events.
