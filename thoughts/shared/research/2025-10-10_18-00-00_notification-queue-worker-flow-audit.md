---
title: 'Notification Queue and Worker Flow Audit'
date: 2025-10-10
type: technical-audit
status: complete
tags: [notifications, queue, worker, debugging, architecture]
---

# Notification Queue and Worker Flow Audit

## Executive Summary

This document provides a complete audit of the BuildOS notification system, tracing the entire flow from event creation through delivery. It identifies all logging points, gaps in observability, and potential bugs in status tracking.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NOTIFICATION FLOW DIAGRAM                        │
└─────────────────────────────────────────────────────────────────────┘

1. Event Creation
   ├─ emit_notification_event() RPC (Database Function)
   │  ├─ Creates notification_events record
   │  ├─ Finds active subscriptions (notification_subscriptions)
   │  ├─ Gets user preferences (user_notification_preferences)
   │  ├─ FOR EACH enabled channel:
   │  │  ├─ Creates notification_deliveries record (status='pending')
   │  │  └─ Creates queue_jobs record (job_type='send_notification')
   │  └─ Returns event_id
   │
2. Queue Job Processing (Worker)
   ├─ processNotificationJobs() polls queue_jobs
   │  ├─ SELECT job_type='send_notification', status='pending'
   │  ├─ Updates queue_jobs status='processing'
   │  └─ Calls processNotification()
   │
3. Delivery Processing (Worker)
   ├─ processNotification(job)
   │  ├─ Fetches notification_deliveries record
   │  ├─ Validates status (skip if already sent/delivered/clicked)
   │  ├─ Checks max attempts (fail if exceeded)
   │  ├─ Enriches payload (transformEventPayload)
   │  ├─ Routes to channel adapter (push/in_app/email/sms)
   │  ├─ Updates notification_deliveries:
   │  │  ├─ SUCCESS: status='sent', sent_at=NOW(), external_id
   │  │  └─ FAILURE: status='failed', failed_at=NOW(), last_error
   │  └─ Updates queue_jobs: status='completed' or 'failed'
   │
4. Channel Adapters
   ├─ Push: sendPushNotification()
   │  ├─ Uses web-push library
   │  ├─ Updates push_subscriptions.last_used_at
   │  └─ Handles subscription expiration (410/404 → deactivate)
   │
   ├─ In-App: sendInAppNotification()
   │  └─ Inserts into user_notifications table
   │
   ├─ Email: sendEmailNotification()
   │  ├─ Creates emails record
   │  ├─ Creates email_recipients record
   │  └─ Calls webhook: POST /api/webhooks/send-notification-email
   │
   └─ SMS: sendSMSNotification()
      ├─ Formats message (with template support)
      ├─ Shortens URLs (notification_tracking_links)
      ├─ Creates sms_messages record
      └─ Queues via queue_sms_message() RPC
```

---

## Detailed Flow Analysis

### Phase 1: Event Creation

#### Entry Points

**1. Database Function: `emit_notification_event()`**

- **File:** `/apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql`
- **Parameters:**
    ```sql
    p_event_type TEXT              -- e.g., 'brief.completed', 'user.signup'
    p_event_source TEXT            -- 'database_trigger', 'worker_job', 'api_action', 'cron_scheduler'
    p_actor_user_id UUID           -- User who caused the event (optional)
    p_target_user_id UUID          -- User affected by event (optional)
    p_payload JSONB                -- Event-specific data
    p_metadata JSONB               -- Additional metadata
    p_scheduled_for TIMESTAMPTZ    -- When to send notification (optional, defaults to NOW())
    ```

**2. Daily Brief Completion (Worker)**

- **File:** `/apps/worker/src/workers/brief/briefWorker.ts`
- **Lines:** 299-381
- **When:** After brief generation completes successfully
- **Logging:**
    - ✅ Line 342-349: Logs notification scheduling info
    - ✅ Line 352: Logs task count statistics
    - ✅ Line 375-377: Logs event emission success

**3. Test Notification API (Admin)**

- **File:** `/apps/web/src/routes/api/admin/notifications/test/+server.ts`
- **Lines:** 106-206 (test mode), 208-237 (production mode)
- **When:** Admin manually triggers test notification
- **Logging:**
    - ✅ Line 59-62: Logs payload transformation attempts
    - ✅ Line 160-162: Warns when channel unavailable

**4. User Signup Trigger (Database)**

- **File:** `/apps/web/supabase/migrations/20251006_notification_system_phase1.sql`
- **Lines:** 509-547
- **Function:** `handle_new_user_trial()`
- **When:** New user inserted into `users` table
- **Logging:** ⚠️ **NO LOGGING** - silent database trigger

#### Database Operations

**notification_events Table:**

```sql
CREATE TABLE notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,              -- Format: 'domain.action'
  event_source TEXT NOT NULL,            -- Source that triggered event
  actor_user_id UUID,                    -- User who caused event
  target_user_id UUID,                   -- User affected by event
  payload JSONB NOT NULL DEFAULT '{}',   -- Event data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
```

**Logging in emit_notification_event():**

- ⚠️ **NO LOGGING** - Runs silently in database
- **Gap:** No visibility into:
    - How many subscriptions matched
    - Which channels were enabled/disabled
    - Whether deliveries were created
    - Any errors during subscription processing

---

### Phase 2: Delivery Creation

#### Database Logic (inside emit_notification_event)

**Process for each active subscription:**

1. **Find Active Subscriptions**

    ```sql
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
    ```

2. **Get User Preferences**

    ```sql
    SELECT * FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id
      AND event_type = p_event_type
    ```

    - If not found, uses defaults: `push=true, email=false, sms=false, in_app=true`

3. **For Each Enabled Channel:**

    **PUSH Channel:**
    - Queries `push_subscriptions` for active subscriptions
    - For each push subscription:
        - Creates `notification_deliveries` record with:
            - `channel='push'`
            - `channel_identifier=endpoint`
            - `status='pending'`
        - Creates `queue_jobs` record with:
            - `job_type='send_notification'`
            - `queue_job_id='notif_{delivery_id}'`
            - `scheduled_for=v_scheduled_time` (from p_scheduled_for or NOW())
            - `metadata={event_id, delivery_id, channel, event_type}`

    **IN_APP Channel:**
    - Creates `notification_deliveries` record
    - Creates `queue_jobs` record
    - Similar structure to push

    **EMAIL Channel:**
    - ⚠️ **NOT IMPLEMENTED** in current emit_notification_event
    - Comment: "Email and SMS would be added here in future phases"

    **SMS Channel:**
    - Implemented in migration `20251006_sms_notification_channel_phase1.sql`
    - Checks `user_sms_preferences` for verified phone
    - Creates delivery and queue job if phone verified and not opted out

**notification_deliveries Table:**

```sql
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES notification_events(id),
  subscription_id UUID REFERENCES notification_subscriptions(id),
  recipient_user_id UUID NOT NULL,
  channel TEXT NOT NULL,                  -- 'push', 'email', 'sms', 'in_app'
  channel_identifier TEXT,                -- Push endpoint, email, or phone
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed, bounced, opened, clicked
  payload JSONB NOT NULL DEFAULT '{}',

  -- Tracking timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- External tracking
  external_id TEXT,
  tracking_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**queue_jobs Table:**

```sql
-- Relevant fields for notification jobs
job_type = 'send_notification'
status = 'pending' → 'processing' → 'completed' or 'failed'
scheduled_for TIMESTAMPTZ  -- When to process the job
metadata JSONB  -- {event_id, delivery_id, channel, event_type}
```

**Logging:**

- ⚠️ **NO LOGGING** - Database function runs silently
- **Critical Gap:** Cannot see:
    - Which users got delivery records created
    - Which channels were skipped (no subscription, disabled, etc.)
    - Whether queue jobs were successfully created
    - Any database errors during batch creation

---

### Phase 3: Queue Job Processing

#### Worker Poll Loop

**File:** `/apps/worker/src/workers/notification/notificationWorker.ts`
**Function:** `processNotificationJobs()`
**Lines:** 525-618

**Process:**

1. **Query for Pending Jobs:**

    ```typescript
    const { data: jobs, error } = await supabase
    	.from('queue_jobs')
    	.select('*')
    	.eq('job_type', 'send_notification')
    	.eq('status', 'pending')
    	.lte('scheduled_for', new Date().toISOString())
    	.order('scheduled_for', { ascending: true })
    	.limit(10);
    ```

2. **Process Jobs in Parallel:**

    ```typescript
    await Promise.allSettled(
    	jobs.map(async (job) => {
    		// Mark as processing
    		await supabase
    			.from('queue_jobs')
    			.update({
    				status: 'processing',
    				started_at: new Date().toISOString()
    			})
    			.eq('id', job.id);

    		// Process notification
    		await processNotification(typedJob);

    		// Mark as completed
    		await supabase
    			.from('queue_jobs')
    			.update({
    				status: 'completed',
    				completed_at: new Date().toISOString()
    			})
    			.eq('id', job.id);
    	})
    );
    ```

**Logging:**

- ✅ Line 538: Logs database query errors
- ✅ Line 547: Logs number of jobs being processed
- ✅ Line 587: Logs individual job failures
- ⚠️ **Missing:** No log when NO jobs found (silent polling)
- ⚠️ **Missing:** No log of query parameters (helpful for debugging scheduling issues)

**Status Updates:**

- ✅ `queue_jobs.status`: pending → processing → completed/failed
- ✅ `queue_jobs.started_at`: Set when processing starts
- ✅ `queue_jobs.completed_at`: Set when job completes
- ✅ `queue_jobs.error_message`: Set on failure
- ✅ `queue_jobs.attempts`: Incremented on each attempt
- ✅ Retry with exponential backoff on failure (if attempts < max_attempts)

---

### Phase 4: Notification Delivery Processing

#### Main Processing Function

**File:** `/apps/worker/src/workers/notification/notificationWorker.ts`
**Function:** `processNotification(job)`
**Lines:** 315-520

**Process Flow:**

1. **Fetch Delivery Record** (Lines 326-336)

    ```typescript
    const { data: delivery, error: fetchError } = await supabase
    	.from('notification_deliveries')
    	.select('*')
    	.eq('id', delivery_id)
    	.single();
    ```

    - **Logging:**
        - ✅ Line 320-322: Logs job and delivery being processed
        - ✅ Line 333-335: Logs error if delivery not found

2. **Status Validation** (Lines 338-348)
    - Skips if already in final state: `sent`, `delivered`, or `clicked`
    - **Logging:**
        - ✅ Line 344-346: Logs when delivery already completed
    - **Gap:** Doesn't log status, only that it's completed

3. **Attempt Limit Check** (Lines 350-367)
    - Fails if `attempts >= max_attempts`
    - **Logging:**
        - ✅ Line 354-356: Logs when max attempts exceeded
    - **Status Updates:**
        - ✅ Sets `status='failed'`, `failed_at=NOW()`, `last_error`

4. **Payload Enrichment** (Lines 392-404)
    - Calls `enrichDeliveryPayload()` to transform event data
    - Validates final payload has title and body
    - **Logging:**
        - ✅ Line 397-400: Logs validation errors
    - **Gap:** No log of successful transformation

5. **Send Notification** (Lines 406-410)
    - Routes to channel adapter
    - **Logging:**
        - ✅ Line 406-408: Logs attempt number and channel
        - ✅ Line 425-427: Logs success
        - ✅ Line 433-435: Logs failure
    - **Status Updates:**
        - ✅ Increments `attempts`
        - ✅ Success: `status='sent'`, `sent_at=NOW()`, `external_id` (if provided)
        - ✅ Failure: `status='failed'`, `failed_at=NOW()`, `last_error`

6. **Critical Status Update** (Lines 438-456)

    ```typescript
    const { error: updateError } = await supabase
    	.from('notification_deliveries')
    	.update(updateData)
    	.eq('id', delivery_id);

    if (updateError) {
    	console.error(
    		`[NotificationWorker] ⚠️  CRITICAL: Failed to update delivery status for ${delivery_id}`
    	);
    	console.error(
    		`[NotificationWorker] This may cause duplicate sends! Delivery data:`,
    		updateData
    	);
    	throw new Error(`Failed to update delivery status: ${updateError.message}`);
    }
    ```

    - **Logging:**
        - ✅ Line 446-451: **CRITICAL** warning about potential duplicates
        - ✅ Line 458-460: Logs successful status update
    - **Gap:** No tracking of duplicate sends if this fails

7. **Error Handling** (Lines 471-519)
    - Catches all errors
    - Tries to mark delivery as failed
    - Uses optimistic locking to prevent race conditions
    - **Logging:**
        - ✅ Line 472-475: Logs processing error
        - ✅ Line 507-509: Logs delivery marked as failed
        - ✅ Line 512-515: Logs if cleanup fails
    - **Status Updates:**
        - ✅ Only updates if not already in final state
        - ✅ Uses `.eq("status", currentDelivery.status)` for optimistic lock

---

### Phase 5: Channel Adapters

#### 1. Push Notifications

**File:** `/apps/worker/src/workers/notification/notificationWorker.ts`
**Function:** `sendPushNotification()`
**Lines:** 139-210

**Process:**

1. Validates VAPID keys configured
2. Fetches active push subscription
3. Formats Web Push API payload
4. Sends via `webpush.sendNotification()`
5. Updates `push_subscriptions.last_used_at`
6. Handles subscription expiration (410/404 status codes)

**Logging:**

- ✅ Line 204: Logs push notification errors
- ⚠️ **Missing:** No success log (only returned in result)
- ⚠️ **Missing:** No log of subscription expiration handling

**Status Updates:**

- ✅ Returns `{success: true}` or `{success: false, error: string}`
- ✅ Deactivates expired subscriptions (`is_active=false`)

**Error Handling:**

- ✅ Handles 410 (Gone) - subscription expired
- ✅ Handles 404 (Not Found) - subscription not found
- ✅ Returns error message for retry logic

#### 2. In-App Notifications

**File:** `/apps/worker/src/workers/notification/notificationWorker.ts`
**Function:** `sendInAppNotification()`
**Lines:** 215-245

**Process:**

1. Inserts into `user_notifications` table
2. Maps notification payload to existing schema

**Schema Mapping:**

```typescript
{
  user_id: delivery.recipient_user_id,
  type: delivery.payload.type || "info",
  title: delivery.payload.title,
  message: delivery.payload.body,
  priority: delivery.payload.priority || "normal",
  action_url: delivery.payload.action_url || undefined,
  expires_at: delivery.payload.expires_at || undefined,
}
```

**Logging:**

- ✅ Line 239: Logs in-app notification errors
- ⚠️ **Missing:** No success log

**Status Updates:**

- ✅ Returns `{success: true}` or `{success: false, error: string}`

#### 3. Email Notifications

**File:** `/apps/worker/src/workers/notification/emailAdapter.ts`
**Function:** `sendEmailNotification()`
**Lines:** 129-288

**Process:**

1. Fetches user email
2. Formats email template (HTML + text)
3. Generates tracking ID
4. Rewrites links for click tracking
5. Adds tracking pixel
6. Creates `emails` record
7. Creates `email_recipients` record
8. Sends via webhook to web app

**Logging:**

- ⚠️ **Missing:** No entry log
- ✅ Line 206-208: Logs recipient record creation failure (non-fatal)
- ✅ Line 217-223: Logs webhook configuration errors
- ✅ Line 264: Logs successful email send
- ✅ Line 273-275: Logs webhook errors
- ✅ Line 282: Logs general email errors

**Status Updates:**

- ✅ Creates email with `status='scheduled'`
- ✅ Creates recipient with `status='pending'`
- ✅ Returns `{success: true, external_id: emailRecord.id}`

**Dependencies:**

- Webhook URL: `process.env.PUBLIC_APP_URL || "https://build-os.com"`
- Webhook Secret: `process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET`
- Endpoint: `POST /api/webhooks/send-notification-email`

#### 4. SMS Notifications

**File:** `/apps/worker/src/workers/notification/smsAdapter.ts`
**Function:** `sendSMSNotification()`
**Lines:** 358-464

**Process:**

1. Validates phone number present
2. Formats message using template system (async)
3. Shortens URLs for click tracking
4. Creates `sms_messages` record
5. Queues via `queue_sms_message()` RPC

**Template System:**

- **Lines:** 48-85 - `getTemplate()` with 5-minute cache
- **Lines:** 91-103 - `renderTemplate()` with `{{variable}}` syntax
- **Lines:** 108-156 - `extractTemplateVars()` for event-specific variables
- **Lines:** 162-249 - `formatSMSMessage()` with fallback to hardcoded
- **Logging:**
    - ✅ Line 67-70: Warns when template not found
    - ✅ Line 187-189: Logs template rendering
    - ✅ Line 195-198: Warns when message truncated
    - ✅ Line 206-208: Logs fallback formatting

**URL Shortening:**

- **Lines:** 274-346 - `shortenUrlsInMessage()`
- Uses `create_tracking_link()` RPC
- Creates records in `notification_tracking_links`
- **Logging:**
    - ✅ Line 304-310: Logs shortening failures
    - ✅ Line 313-315: Warns when no short code generated
    - ✅ Line 324-326: Logs successful URL shortening
    - ✅ Line 328-331: Logs errors per URL
    - ✅ Line 336-338: Logs summary of shortened URLs

**Message Creation:**

- **Logging:**
    - ✅ Line 381-383: Logs message formatting and recipient
    - ✅ Line 406: Logs sms_messages creation errors
    - ✅ Line 413-415: Logs sms_messages record created
    - ✅ Line 450-451: Logs SMS job queued
    - ✅ Line 458: Logs general SMS errors

**Status Updates:**

- ✅ Creates `sms_messages` with `status='pending'`
- ✅ Creates queue job via `queue_sms_message()` RPC
- ✅ Updates to `status='failed'` if queueing fails
- ✅ Returns `{success: true, external_id: smsMessage.id}`

**Dependencies:**

- RPC: `queue_sms_message(p_user_id, p_phone_number, p_message, p_priority, p_metadata)`
- Tables: `sms_messages`, `sms_templates`, `notification_tracking_links`

---

## Status Transition Matrix

### notification_deliveries.status

| From State | To State    | Trigger                           | File:Line                     | Logged? |
| ---------- | ----------- | --------------------------------- | ----------------------------- | ------- |
| `NULL`     | `pending`   | emit_notification_event() creates | Migration SQL                 | ❌      |
| `pending`  | `sent`      | Successful channel delivery       | notificationWorker.ts:419     | ✅      |
| `pending`  | `failed`    | Channel delivery failed           | notificationWorker.ts:429     | ✅      |
| `pending`  | `failed`    | Max attempts exceeded             | notificationWorker.ts:360-365 | ✅      |
| `sent`     | `delivered` | Delivery confirmation (future)    | Not implemented               | N/A     |
| `sent`     | `opened`    | Tracking pixel loaded             | Email/SMS tracking            | ❌      |
| `sent`     | `clicked`   | Link clicked                      | Email/SMS tracking            | ❌      |
| `*`        | `bounced`   | Hard bounce (email/SMS)           | Not implemented in worker     | N/A     |

**Gap:** No logging for tracking events (opened, clicked, bounced)

### queue_jobs.status

| From State   | To State     | Trigger                      | File:Line                     | Logged? |
| ------------ | ------------ | ---------------------------- | ----------------------------- | ------- |
| `NULL`       | `pending`    | Job created                  | emit_notification_event()     | ❌      |
| `pending`    | `processing` | Worker claims job            | notificationWorker.ts:555-560 | ✅      |
| `processing` | `completed`  | Delivery succeeded           | notificationWorker.ts:578-584 | ✅      |
| `processing` | `failed`     | Delivery failed (no retries) | notificationWorker.ts:594-608 | ✅      |
| `processing` | `pending`    | Delivery failed (will retry) | notificationWorker.ts:594-608 | ✅      |

**Note:** Exponential backoff applied when retrying (2^attempts \* 60000 ms)

---

## Logging Analysis

### Adequate Logging

1. **Worker Processing:**
    - ✅ Job claim and processing start
    - ✅ Delivery attempts and channel
    - ✅ Success/failure results
    - ✅ Status update confirmations
    - ✅ Critical warnings (duplicate send risk)

2. **Channel Adapters:**
    - ✅ Email: Template formatting, webhook calls
    - ✅ SMS: Template rendering, URL shortening, message queueing
    - ✅ Push: Error handling
    - ✅ In-App: Error handling

3. **Brief Worker:**
    - ✅ Notification scheduling info
    - ✅ Task count statistics
    - ✅ Event emission

### Missing or Insufficient Logging

#### Critical Gaps

1. **Database Event Creation (emit_notification_event):**
    - ❌ No logging whatsoever
    - **Impact:** Cannot debug why deliveries weren't created
    - **Cannot see:**
        - How many subscriptions matched
        - Which channels were enabled/disabled per user
        - Which users got deliveries created
        - Any database errors during batch creation
    - **Recommendation:** Add a companion audit table or use RAISE NOTICE

2. **Queue Polling (Silent Polls):**
    - ❌ No log when no jobs found
    - **Impact:** Cannot verify worker is running when idle
    - **Recommendation:** Periodic heartbeat log (every 5 minutes)

3. **Tracking Events:**
    - ❌ No logging when deliveries transition to `opened`, `clicked`, `bounced`
    - **Impact:** Cannot debug tracking failures
    - **Files to check:** Email/SMS tracking endpoints

#### Minor Gaps

4. **Push Notifications:**
    - ⚠️ No log on successful send (only on error)
    - ⚠️ No log when subscription expired/deactivated
    - **Impact:** Cannot count successes without querying database

5. **In-App Notifications:**
    - ⚠️ No log on successful insertion
    - **Impact:** Cannot verify in-app delivery without database query

6. **Payload Transformation:**
    - ⚠️ No log of successful transformation
    - Only logs errors and fallbacks
    - **Impact:** Cannot verify correct payload generation

7. **Test API:**
    - ⚠️ Limited logging of channel availability checks
    - Could log more detail about why channels are skipped

---

## Identified Bugs and Issues

### 1. Critical: Status Update Failure Can Cause Duplicates

**Location:** `/apps/worker/src/workers/notification/notificationWorker.ts:438-456`

**Issue:**

```typescript
const { error: updateError } = await supabase
	.from('notification_deliveries')
	.update(updateData)
	.eq('id', delivery_id);

if (updateError) {
	console.error(`[NotificationWorker] ⚠️  CRITICAL: Failed to update delivery status`);
	console.error(`[NotificationWorker] This may cause duplicate sends!`);
	throw new Error(`Failed to update delivery status: ${updateError.message}`);
}
```

**Problem:**

- If delivery succeeds but status update fails, the notification was sent but database still shows `pending`
- On retry, the worker will skip the delivery (line 339-348 checks status first)
- BUT if job is retried from scratch or worker restarts, it might re-send

**Mitigation (Current):**

- Worker checks status before sending (lines 339-348)
- Error is thrown, marking queue job as failed
- Optimistic locking in error handler (line 505) prevents race conditions

**Recommendation:**

- Add idempotency tracking in channel adapters (especially email/SMS)
- Log `external_id` before attempting send
- Consider two-phase commit pattern

### 2. Race Condition: Concurrent Job Processing

**Location:** `/apps/worker/src/workers/notification/notificationWorker.ts:552-576`

**Issue:**

- Jobs are fetched with `status='pending'`
- Status updated to `processing` AFTER fetching
- No atomic claim operation

**Problem:**

- If two worker instances run simultaneously, both could claim same jobs
- Supabase queue (supabaseQueue.ts) uses `claim_pending_jobs()` RPC for atomic claims
- But notification worker uses direct SELECT/UPDATE

**Current Code:**

```typescript
const { data: jobs, error } = await supabase
	.from('queue_jobs')
	.select('*')
	.eq('job_type', 'send_notification')
	.eq('status', 'pending')
	.lte('scheduled_for', new Date().toISOString())
	.order('scheduled_for', { ascending: true })
	.limit(10);

// Later...
await supabase
	.from('queue_jobs')
	.update({
		status: 'processing',
		started_at: new Date().toISOString()
	})
	.eq('id', job.id);
```

**Mitigation (Current):**

- Delivery status check (lines 339-348) prevents duplicate sends
- Only one worker instance deployed in production

**Recommendation:**

- Use atomic `claim_pending_jobs()` RPC like briefWorker does
- Or add `WHERE status='pending'` to UPDATE to detect races

### 3. Email Channel Not Implemented in emit_notification_event

**Location:** `/apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql:161`

**Issue:**

```sql
-- Email and SMS would be added here in future phases
```

**Problem:**

- Email preferences can be enabled in `user_notification_preferences`
- But `emit_notification_event()` doesn't create email deliveries
- Email notifications only work when explicitly created (e.g., daily brief)

**Impact:**

- Generic `brief.completed` events don't trigger email notifications
- Users expecting email won't receive them

**Recommendation:**

- Implement email channel in `emit_notification_event()`
- Or document that email is handled separately (daily brief flow)

### 4. SMS Channel Implementation Mismatch

**Location:** Migration `20251006_sms_notification_channel_phase1.sql`

**Issue:**

- SMS channel implemented in older migration
- But latest migration (20251010) doesn't include SMS logic
- **Lines 161:** Comment says "Email and SMS would be added here"

**Problem:**

- Not clear which migration is "current" for production
- SMS might work or might not depending on migration order

**Recommendation:**

- Verify migration order in production
- Consolidate to single source of truth for emit_notification_event

### 5. Template Cache Has No Invalidation

**Location:** `/apps/worker/src/workers/notification/smsAdapter.ts:36-85`

**Issue:**

```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const templateCache = new Map<...>();
```

**Problem:**

- Templates cached for 5 minutes
- If template updated in database, worker won't see changes for up to 5 minutes
- No manual invalidation mechanism

**Impact:**

- Template fixes/updates delayed
- Could cause confusion during testing

**Recommendation:**

- Add webhook or RPC to clear cache on template update
- Or reduce TTL to 1 minute

### 6. Exponential Backoff Can Delay Notifications Significantly

**Location:** `/apps/worker/src/workers/notification/notificationWorker.ts:602-607`

**Issue:**

```typescript
scheduled_for: isRetryable
  ? new Date(
      Date.now() + Math.pow(2, currentAttempts) * 60000,
    ).toISOString()
  : undefined,
```

**Problem:**

- Attempt 0: Immediate
- Attempt 1: +1 minute (2^0 \* 60s)
- Attempt 2: +2 minutes (2^1 \* 60s)
- Attempt 3: +4 minutes (2^2 \* 60s)
- Total delay: 7 minutes for a notification that fails 3 times

**Impact:**

- Time-sensitive notifications (daily briefs) could arrive 7+ minutes late
- User might not be waiting anymore

**Recommendation:**

- Reduce backoff for urgent notifications
- Consider priority-based backoff strategy

---

## Testing Recommendations

### Integration Tests Needed

1. **End-to-End Notification Flow:**
    - Create event via `emit_notification_event()`
    - Verify deliveries created
    - Verify queue jobs created
    - Mock channel adapters
    - Verify status transitions
    - **File to create:** `apps/worker/tests/integration/notification-flow.test.ts`

2. **Status Transition Tests:**
    - Test all state transitions in Status Transition Matrix
    - Verify timestamps set correctly
    - Verify optimistic locking works
    - **File to create:** `apps/worker/tests/integration/notification-status.test.ts`

3. **Retry Logic Tests:**
    - Test max attempts enforcement
    - Test exponential backoff calculation
    - Test retry on transient errors
    - **File to create:** `apps/worker/tests/unit/notification-retry.test.ts`

4. **Concurrent Processing Tests:**
    - Simulate multiple workers
    - Verify no duplicate sends
    - Verify atomic job claiming
    - **File to create:** `apps/worker/tests/integration/notification-concurrency.test.ts`

### Manual Testing Checklist

1. **Push Notifications:**
    - [ ] Subscribe to brief.completed event
    - [ ] Generate daily brief
    - [ ] Verify push notification received
    - [ ] Check delivery status in database
    - [ ] Verify queue job status

2. **In-App Notifications:**
    - [ ] Same as above for in-app channel
    - [ ] Verify user_notifications record created

3. **Email Notifications:**
    - [ ] Enable email in preferences
    - [ ] Generate daily brief
    - [ ] Verify email sent via webhook
    - [ ] Check tracking pixel and links

4. **SMS Notifications:**
    - [ ] Set phone number and verify
    - [ ] Enable SMS in preferences
    - [ ] Generate daily brief
    - [ ] Verify SMS message queued
    - [ ] Check URL shortening worked

5. **Error Scenarios:**
    - [ ] Test with expired push subscription (should deactivate)
    - [ ] Test with invalid email (should fail gracefully)
    - [ ] Test with unverified phone (should skip)
    - [ ] Test with max attempts exceeded (should mark failed)

---

## Monitoring Recommendations

### Database Views

1. **Notification Health Dashboard:**

    ```sql
    CREATE VIEW notification_health AS
    SELECT
      DATE(created_at) as date,
      event_type,
      COUNT(*) as total_events,
      COUNT(DISTINCT recipient_user_id) as unique_recipients,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_delivery_time_sec
    FROM notification_deliveries d
    JOIN notification_events e ON d.event_id = e.id
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2;
    ```

2. **Queue Job Health:**
    ```sql
    CREATE VIEW queue_health AS
    SELECT
      DATE(created_at) as date,
      job_type,
      status,
      COUNT(*) as count,
      AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time_sec,
      AVG(attempts) as avg_attempts
    FROM queue_jobs
    WHERE job_type = 'send_notification'
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, 2, 3;
    ```

### Alerts

1. **High Failure Rate:**
    - Alert if >10% of deliveries fail in last hour
    - Query: `SELECT COUNT(*) WHERE status='failed' AND created_at > NOW() - INTERVAL '1 hour'`

2. **Stuck Jobs:**
    - Alert if jobs in `processing` state for >10 minutes
    - Query: `SELECT * WHERE status='processing' AND started_at < NOW() - INTERVAL '10 minutes'`

3. **Delayed Jobs:**
    - Alert if `pending` jobs scheduled more than 5 minutes ago
    - Query: `SELECT * WHERE status='pending' AND scheduled_for < NOW() - INTERVAL '5 minutes'`

4. **Worker Heartbeat:**
    - Alert if no jobs processed in last 15 minutes during business hours
    - Requires adding periodic heartbeat log

---

## File Reference Index

### Worker Files

| File                                                         | Purpose                          | Key Functions                                | Lines   |
| ------------------------------------------------------------ | -------------------------------- | -------------------------------------------- | ------- |
| `apps/worker/src/workers/notification/notificationWorker.ts` | Main notification processor      | processNotification, processNotificationJobs | 315-618 |
| `apps/worker/src/workers/notification/emailAdapter.ts`       | Email delivery                   | sendEmailNotification, formatEmailTemplate   | 129-288 |
| `apps/worker/src/workers/notification/smsAdapter.ts`         | SMS delivery                     | sendSMSNotification, formatSMSMessage        | 358-464 |
| `apps/worker/src/workers/brief/briefWorker.ts`               | Brief completion notifications   | processBriefJob (emit event)                 | 299-381 |
| `apps/worker/src/lib/supabaseQueue.ts`                       | Queue management (for reference) | processJobs, claimJobs                       | N/A     |

### Database Files

| File                                                                                 | Purpose                  | Key Objects                                                      | Lines |
| ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------- | ----- |
| `apps/web/supabase/migrations/20251006_notification_system_phase1.sql`               | Core notification tables | notification_events, notification_deliveries, push_subscriptions | 1-562 |
| `apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql` | Scheduled notifications  | emit_notification_event (v2)                                     | 1-171 |
| `apps/web/supabase/migrations/20251006_sms_notification_channel_phase1.sql`          | SMS channel              | emit_notification_event (SMS version)                            | N/A   |

### Web API Files

| File                                                                  | Purpose                | Key Functions | Lines  |
| --------------------------------------------------------------------- | ---------------------- | ------------- | ------ |
| `apps/web/src/routes/api/admin/notifications/test/+server.ts`         | Test notifications     | POST handler  | 19-247 |
| `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts` | Email webhook (likely) | POST handler  | N/A    |

---

## Conclusion

The BuildOS notification system has a well-architected flow from event creation through delivery. The main strengths are:

1. **Separation of Concerns:** Clear separation between event creation, delivery scheduling, and channel adapters
2. **Channel Abstraction:** Easy to add new channels (email, SMS already implemented)
3. **Retry Logic:** Exponential backoff with configurable max attempts
4. **Status Tracking:** Comprehensive status field with transition tracking

The main weaknesses are:

1. **Database Function Logging Gap:** No visibility into emit_notification_event execution
2. **Potential Race Conditions:** Non-atomic job claiming in notification worker
3. **Tracking Event Logging:** No logs for opened/clicked/bounced transitions
4. **Email Channel Gap:** Not implemented in latest emit_notification_event migration

**Priority Fixes:**

1. **Add logging to emit_notification_event** (companion audit table or RAISE NOTICE)
2. **Use atomic job claiming** (switch to claim_pending_jobs RPC)
3. **Implement email channel** in emit_notification_event
4. **Add tracking event logging** (webhook endpoints)
5. **Add monitoring views** and alerts

This audit provides a complete map of the notification flow and should enable efficient debugging and future enhancements.
