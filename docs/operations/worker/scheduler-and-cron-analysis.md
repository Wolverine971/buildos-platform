<!-- docs/operations/worker/scheduler-and-cron-analysis.md -->

# Worker Scheduler Configuration & Cron Jobs Analysis

**Created:** 2025-10-27  
**Location:** `apps/worker/src/scheduler.ts` and `apps/worker/src/worker.ts`  
**Status:** COMPLETE DOCUMENTATION

---

## 1. Scheduler Overview

The BuildOS worker uses **node-cron** (library: `import cron from 'node-cron'`) for scheduling recurring jobs. The scheduler is **initialized in `src/index.ts`** and **started in `src/scheduler.ts`**.

### Entry Point

- File: `apps/worker/src/index.ts` (line 10, 478)
- Imports: `import { startScheduler } from './scheduler'`
- Called: `startScheduler()` after worker starts

---

## 2. Cron Jobs Configuration

All cron jobs are defined in `apps/worker/src/scheduler.ts` in the `startScheduler()` function (lines 123-151).

### Job 1: Hourly Brief Scheduling Check

**Cron Expression:** `0 * * * *` (Runs every hour at minute 0)

Purpose:

- Checks all active user brief preferences
- Calculates next run time based on user timezone and frequency (daily/weekly)
- Queues brief generation jobs for users whose notification time is within the next hour
- Includes 2-minute pre-generation buffer (GENERATION_BUFFER_MS = 120000ms)

Function: `checkAndScheduleBriefs()` (lines 157-425)

Features:

- Batch fetches user timezones from centralized users table
- Implements engagement backoff (skips briefs for inactive users if ENGAGEMENT_BACKOFF_ENABLED=true)
- Checks for existing jobs to prevent duplicate scheduling
- Uses 30-minute time window tolerance for conflict detection
- Processes up to 20 concurrent engagement checks per batch

Database Tables Used:

- user_brief_preferences (is_active, time_of_day, frequency, day_of_week)
- users (timezone, name, email)
- queue_jobs (check for existing pending jobs)

---

### Job 2: Nightly SMS Scheduling

**Cron Expression:** `0 0 * * *` (Runs daily at midnight UTC)

Purpose:

- Queues SMS scheduling jobs for all users with SMS event reminders enabled
- Runs once per day to prepare SMS messages for calendar event reminders
- Queues schedule_daily_sms jobs (processed by processDailySMS worker)

Function: `checkAndScheduleDailySMS()` (lines 617-710)

Features:

- Filters users with event_reminders_enabled=true, phone_verified=true, opted_out=false
- Fetches user timezones from users table
- Creates dedup key: schedule-daily-sms-{userId}-{date}
- Queues jobs with priority 5 (medium), scheduled to run immediately
- Includes leadTimeMinutes from user preferences (default: 15 minutes before event)

Database Tables Used:

- user_sms_preferences
- users
- queue_jobs

---

### Job 3: Hourly SMS Alerts Check

**Cron Expression:** `0 * * * *` (Runs every hour at minute 0)

Purpose:

- Monitors SMS system health and thresholds
- Refreshes SMS metrics materialized view
- Checks alert thresholds and triggers notifications if exceeded

Function: `checkSMSAlerts()` (lines 716-744)

Features:

- Refreshes materialized view via smsMetricsService.refreshMaterializedView()
- Calls smsAlertsService.checkAlerts() to check all configured thresholds
- Logs triggered alerts with severity level (INFO, WARNING, CRITICAL)
- Non-blocking (continues even if alerts fail)

---

## 3. Event Reminder Scheduling Flow

Stage 1: Nightly Scheduler (scheduler.ts)

- Midnight UTC
- checkAndScheduleDailySMS() runs
- Fetches users with event_reminders_enabled=true
- Creates schedule_daily_sms job for each user

Stage 2: Worker Processing (dailySmsWorker.ts)

- processDailySMS() worker handles schedule_daily_sms job
- Fetches calendar events for user's day (synced_status=synced)
- Filters events that:
    - Have valid start times
    - Reminder time is in the future
    - Are NOT all-day events
    - Fall OUTSIDE quiet hours (if configured)
- Generates intelligent SMS messages via LLM (DeepSeek)
- Creates scheduled_sms_messages records
- Creates sms_messages records
- Queues send_sms jobs for each message

---

## 4. Why Event Reminder Jobs Might Not Be Running

Issue 1: Scheduler Not Started

- Check worker logs for "📅 Starting scheduler..."
- Verify startScheduler() is called in src/index.ts line 478

Issue 2: No Users with Event Reminders Enabled

- Check: SELECT \* FROM user_sms_preferences WHERE event_reminders_enabled=true AND phone_verified=true AND opted_out=false
- Look for logs: "📝 [SMS Scheduler] No users with SMS event reminders enabled"

Issue 3: Timezone Issues

- Verify user timezone with: SELECT id, timezone FROM users WHERE id='user-id'
- Check for error logs: "⚠️ Invalid timezone..."

Issue 4: Quiet Hours Blocking All Reminders

- Check: SELECT quiet_hours_start, quiet_hours_end FROM user_sms_preferences
- Look for logs: "⏭️ [DailySMS] Skipping event - falls in quiet hours"

Issue 5: Daily SMS Limit Reached

- Check: SELECT daily_sms_count, daily_sms_limit FROM user_sms_preferences
- Default limit is 10 per day
- Look for logs: "⏭️ [DailySMS] User has reached daily SMS limit"

Issue 6: Calendar Events Not Synced

- Check: SELECT \* FROM task_calendar_events WHERE sync_status='synced' AND event_start >= NOW()
- Look for logs: "📝 [DailySMS] No calendar events found"

Issue 7: LLM Generation Failures

- Check LLM API availability and logs for: "❌ [DailySMS] Error generating message"

Issue 8: Scheduled Jobs Not Being Processed

- Check queue: SELECT \* FROM queue_jobs WHERE job_type IN ('schedule_daily_sms', 'send_sms')
- Verify worker is running via: /health or /queue/stats endpoints

---

## 5. Cron Schedule Summary

| Cron Pattern  | Time               | Function                   | Purpose              |
| ------------- | ------------------ | -------------------------- | -------------------- |
| 0 \* \* \* \* | Every hour :00     | checkAndScheduleBriefs()   | Queue briefs         |
| 0 0 \* \* \*  | Daily midnight UTC | checkAndScheduleDailySMS() | Queue SMS scheduling |
| 0 \* \* \* \* | Every hour :00     | checkSMSAlerts()           | Monitor SMS health   |

All times are UTC. User-specific notifications are converted to user's timezone.

---

## 6. Configuration Environment Variables

Scheduler-Related:

- ENGAGEMENT_BACKOFF_ENABLED=false (default)
- QUEUE_POLL_INTERVAL=5000 (ms)
- QUEUE_BATCH_SIZE=5
- QUEUE_STALLED_TIMEOUT=300000 (ms)
- QUEUE_ENABLE_HEALTH_CHECKS=true
- QUEUE_STATS_UPDATE_INTERVAL=60000 (ms)

SMS-Related:

- PRIVATE_TWILIO_ACCOUNT_SID (required for SMS)
- PRIVATE_TWILIO_AUTH_TOKEN
- PRIVATE_TWILIO_MESSAGING_SERVICE_SID
- PRIVATE_OPENROUTER_API_KEY (for LLM)

---

## 7. Key Files Reference

- apps/worker/src/scheduler.ts - Cron definitions & scheduling logic
- apps/worker/src/worker.ts - Job processor registrations
- apps/worker/src/workers/dailySmsWorker.ts - SMS scheduling job handler
- apps/worker/src/index.ts - Entry point, scheduler startup
- apps/worker/src/config/queueConfig.ts - Queue configuration
- apps/worker/src/routes/sms/scheduled.ts - SMS management API

---

## 8. API Endpoints

GET /health - Health check endpoint
GET /queue/stats - Queue statistics
POST /queue/brief - Queue brief generation
GET /sms/scheduled/user/:userId - List scheduled SMS messages
POST /sms/scheduled/:id/cancel - Cancel a scheduled SMS
PATCH /sms/scheduled/:id/update - Update scheduled time
POST /sms/scheduled/:id/regenerate - Regenerate message content
