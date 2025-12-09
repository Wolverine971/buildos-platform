---
date: 2025-10-09T16:19:12+0000
researcher: Claude Code
git_commit: 6bb028d87e33b4a7bbe8ddf1a3482e1e102c2703
branch: main
repository: buildos-platform
topic: 'Investigation: Random Push Notifications with No Information'
tags: [research, codebase, notifications, push-notifications, worker, sms, debugging]
status: complete
last_updated: 2025-10-09
last_updated_by: Claude Code
path: thoughts/shared/research/2025-10-09_16-19-12_random-push-notifications-investigation.md
---

# Research: Investigation of Random Push Notifications with No Information

**Date**: 2025-10-09T16:19:12+0000
**Researcher**: Claude Code
**Git Commit**: 6bb028d87e33b4a7bbe8ddf1a3482e1e102c2703
**Branch**: main
**Repository**: buildos-platform

## Research Question

User is receiving random push notifications with no information (empty or minimal content). What could be triggering these notifications and why are they empty?

## Summary

After comprehensive investigation, I've identified the root cause: **a decoupling between event payloads and notification delivery payloads** that results in empty notification content when proper transformation is missing. The BuildOS platform has multiple notification trigger points (daily briefs, SMS scheduling, background jobs, webhooks) but lacks centralized payload transformation, causing notifications to fall back to empty default values.

### Key Findings:

1. **Multiple trigger sources**: Daily SMS scheduler (midnight cron), SMS webhooks, daily brief jobs, multi-channel notification worker
2. **Root cause**: Event payloads don't include `title`/`body` fields, but notification delivery expects them
3. **Missing component**: No centralized payload transformer service between event creation and delivery
4. **Empty content scenarios**: Test notifications, SMS without event type mapping, fallback payloads with `|| ""`
5. **Current behavior**: System falls back to empty strings when payload fields are missing

## Detailed Findings

### 1. Push Notification System Architecture

The BuildOS platform has a fully implemented browser push notification system with the following components:

#### Client-Side Subscription Management

**File**: `apps/web/src/lib/services/browser-push.service.ts`

- **Lines 85-156**: Main subscription flow using Web Push API
    - Service worker registration at `/sw.js`
    - Push subscription via `pushManager.subscribe()` with VAPID
    - Subscription stored in `push_subscriptions` database table
- **Lines 48-62**: Permission handling and browser support checks
- User interface at `apps/web/src/lib/components/settings/NotificationPreferences.svelte:335-400`

#### Service Worker (Notification Display)

**File**: `apps/web/static/sw.js`

- **Lines 22-47**: `push` event handler that receives and displays notifications
    - Parses push data via `event.data.json()`
    - **Line 46**: Displays via `self.registration.showNotification(title, options)`
    - ⚠️ **Potential issue**: If parsed data has empty `title` or `body`, notification shows empty content
- **Lines 50-111**: Click tracking and app opening on notification click

#### Server-Side Push Sending

**File**: `apps/worker/src/workers/notification/notificationWorker.ts`

- **Lines 56-126**: `sendPushNotification()` function
    - **Lines 76-77**: **CRITICAL ISSUE** - Fallback to empty string:
        ```typescript
        title: delivery.payload.title || "BuildOS Notification",
        body: delivery.payload.body || "",  // ⚠️ Empty string if missing
        ```
    - Uses `web-push` NPM package to send notifications
    - Handles expired subscriptions (410/404 status codes)

### 2. Notification Trigger Sources

#### A. Daily SMS Scheduler (Cron Job)

**File**: `apps/worker/src/workers/dailySmsWorker.ts`
**Scheduler**: `apps/worker/src/scheduler.ts:575`

- **Cron**: Runs at midnight (`0 0 * * *`) every day
- **Purpose**: Fetches calendar events, generates SMS messages, schedules reminders
- **Process**:
    1. Fetches events for user's timezone
    2. Generates SMS content via LLM (DeepSeek) or template fallback
    3. Creates `scheduled_sms_messages` and `sms_messages` records
    4. Queues `send_sms` jobs for delivery
- **Metrics tracking**: Records scheduling, LLM generation, quiet hours skips, daily limits
- **Potential trigger**: If SMS system has notification callbacks, this runs daily at midnight

#### B. SMS Webhook Handler

**File**: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts`

- **Purpose**: Receives Twilio SMS delivery status callbacks
- **Statuses handled**: queued, sending, sent, delivered, failed, undelivered, canceled
- **Actions**:
    - Updates `sms_messages`, `scheduled_sms_messages`, `notification_deliveries` tables
    - Records delivery metrics when status is `delivered`
    - Implements intelligent retry logic for failed messages
    - Categorizes errors (invalid_number, carrier_issue, rate_limit, etc.)
- **Potential trigger**: Each SMS status change could trigger notifications about delivery status

#### C. SMS Send Worker

**File**: `apps/worker/src/workers/smsWorker.ts`

- **Job type**: `send_sms`
- **Pre-send validation**:
    - Checks cancellation status
    - Verifies quiet hours compliance
    - Validates daily SMS limits
    - Confirms calendar event still exists
- **Actions**:
    - Sends SMS via Twilio
    - Updates status in dual-table system
    - Calls `notifyUser()` on successful send ⚠️
    - Implements retry with exponential backoff

#### D. Daily Brief Email Worker

**File**: `apps/worker/src/workers/brief/briefWorker.ts`

- **Lines 298-338**: Sends notification when daily brief completes
    ```typescript
    await serviceClient.rpc('emit_notification_event', {
    	p_event_type: 'brief.completed',
    	p_event_source: 'worker_job',
    	p_target_user_id: job.data.userId,
    	p_payload: {
    		brief_id: brief.id,
    		brief_date: briefDate
    		// ... event-specific fields
    	}
    });
    ```
- ⚠️ **Notice**: Payload contains event-specific fields but NO `title` or `body`

#### E. Multi-Channel Notification Worker

**File**: `apps/worker/src/workers/notification/notificationWorker.ts`

- **Job type**: `send_notification`
- **Channels supported**: push, in-app, email, SMS
- **Lines 165-221**: Routes to channel-specific adapters
- **Lines 230-421**: Main processor that orchestrates delivery
- **Used by**: `notifyUser()` helper function in `apps/worker/src/workers/shared/queueUtils.ts`

#### F. SMS Alert Monitoring (Hourly Cron)

**File**: `apps/worker/src/lib/services/smsAlerts.service.ts`
**Scheduler**: `apps/worker/src/scheduler.ts:665`

- **Cron**: Runs hourly (`0 * * * *`)
- **Monitors**:
    - Delivery rate critical threshold
    - LLM failure rate
    - LLM cost spikes
    - Opt-out rate warnings
    - Daily limit hit warnings
- **Current behavior**: Logs alerts but external integrations (Slack, PagerDuty) are commented out

### 3. The Root Cause: Missing Payload Transformation

#### Event Payload Structure

**File**: `packages/shared-types/src/notification.types.ts:150-204`

Event payloads are event-specific with structured fields:

```typescript
export interface BriefCompletedEventPayload {
	brief_id: string;
	brief_date: string;
	timezone: string;
	task_count: number;
	project_count: number;
	// NO title or body fields
}
```

#### Notification Delivery Payload

**File**: `packages/shared-types/src/notification.types.ts:210-217`

Delivery payloads expect generic fields:

```typescript
export interface NotificationPayload {
	title?: string; // Expected but not in event payloads
	body?: string; // Expected but not in event payloads
	type?: string;
	// ... other fields
}
```

#### Default Empty Payloads

**File**: `apps/web/src/lib/types/notification-channel-payloads.ts:99-128`

```typescript
export const DEFAULT_CHANNEL_PAYLOADS = {
	push: {
		title: 'BuildOS Notification',
		body: '' // ⚠️ EMPTY BODY
	},
	in_app: {
		title: 'Notification',
		body: '' // ⚠️ EMPTY BODY
	},
	sms: {
		title: 'BuildOS Notification',
		body: '' // ⚠️ EMPTY BODY
	}
};
```

#### The Gap

**Current flow** (problematic):

```
Event Created → Delivery Created (raw event payload) → Worker formats on-the-fly → Empty fallbacks
```

**Should be**:

```
Event Created → Payload Transformer → Delivery Created (with title/body) → Worker sends formatted content
```

### 4. Specific Empty Content Scenarios

#### Scenario 1: Database RPC Direct Insertion

**File**: `apps/web/supabase/migrations/20251006_notification_system_phase1.sql:264-413`

The `emit_notification_event()` RPC function:

- **Lines 280-295**: Inserts event into `notification_events` table
- **Lines 326-342**: Creates `notification_deliveries` record with raw event payload
- **Lines 345-364**: Queues `send_notification` job
- ⚠️ **Issue**: Raw event payload inserted without transformation

#### Scenario 2: Push Notification Fallbacks

**File**: `apps/worker/src/workers/notification/notificationWorker.ts:75-90`

```typescript
const payload = JSON.stringify({
	title: delivery.payload.title || 'BuildOS Notification',
	body: delivery.payload.body || '', // ⚠️ Empty if missing
	icon: delivery.payload.icon || '/favicon.png',
	data: {
		url: delivery.payload.url || '/',
		delivery_id: delivery.id
	}
});
```

#### Scenario 3: In-App Notification Fallbacks

**File**: `apps/worker/src/workers/notification/notificationWorker.ts:138-146`

```typescript
const { error } = await supabase.from('user_notifications').insert({
	user_id: delivery.recipient_user_id,
	type: delivery.payload.type || 'info',
	title: delivery.payload.title || 'Notification',
	message: delivery.payload.body || '', // ⚠️ Empty if missing
	link: delivery.payload.url,
	read: false
});
```

#### Scenario 4: SMS Generic Fallback

**File**: `apps/worker/src/workers/notification/smsAdapter.ts:227-229`

```typescript
// Generic fallback - can result in empty body
const title = payload.title || 'BuildOS notification';
const body = payload.body || '';
const message = body ? `${title}: ${body}` : title; // If body empty, only title sent
```

#### Scenario 5: Test Notifications

**File**: `apps/web/src/routes/api/admin/notifications/test/+server.ts:147-154`

```typescript
.insert({
  event_id: eventId,
  recipient_user_id: recipientId,
  channel,
  channel_identifier: channelIdentifier,
  payload,  // ⚠️ No validation that payload has title/body
  status: 'pending'
})
```

### 5. Likely Triggers for Random Push Notifications

Based on the codebase analysis, the random push notifications are most likely triggered by:

1. **Daily SMS Scheduler** (midnight cron):
    - Runs every day at 12:00 AM
    - If user has push notifications enabled for SMS events
    - Location: `apps/worker/src/scheduler.ts:575`

2. **SMS Event Callbacks**:
    - Twilio sends webhooks for every SMS status change
    - Each status update could trigger a notification
    - Location: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts`

3. **Daily Brief Completion**:
    - Triggers notification when brief is generated
    - Uses `emit_notification_event()` with `brief.completed` event
    - Location: `apps/worker/src/workers/brief/briefWorker.ts:298-338`

4. **SMS Send Success**:
    - Worker calls `notifyUser()` after successful SMS send
    - Location: `apps/worker/src/workers/smsWorker.ts`

5. **Background Job Completions**:
    - Various worker jobs call `notifyUser()` on completion
    - Location: `apps/worker/src/workers/shared/queueUtils.ts`

## Code References

### Push Notification System

- `apps/web/src/lib/services/browser-push.service.ts:85-156` - Subscription flow
- `apps/web/static/sw.js:22-47` - Push event handler
- `apps/worker/src/workers/notification/notificationWorker.ts:56-126` - Push sending

### Notification Triggers

- `apps/worker/src/scheduler.ts:575` - Daily SMS scheduler (midnight cron)
- `apps/worker/src/scheduler.ts:665` - SMS alert monitoring (hourly cron)
- `apps/worker/src/workers/brief/briefWorker.ts:298-338` - Brief completion notification
- `apps/web/src/routes/api/webhooks/twilio/status/+server.ts` - SMS status webhooks

### Empty Content Issues

- `apps/worker/src/workers/notification/notificationWorker.ts:76-77` - Push fallback to `""`
- `apps/worker/src/workers/notification/notificationWorker.ts:141-142` - In-app fallback to `""`
- `apps/worker/src/workers/notification/smsAdapter.ts:227-229` - SMS generic fallback
- `apps/web/src/lib/types/notification-channel-payloads.ts:99-128` - Default empty payloads

### Database Layer

- `apps/web/supabase/migrations/20251006_notification_system_phase1.sql:264-413` - `emit_notification_event()` RPC
- Database tables: `notification_events`, `notification_deliveries`, `push_subscriptions`

## Architecture Insights

### Current Notification Flow

```
┌─────────────────┐
│  Event Source   │ (Worker job, webhook, API endpoint)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  emit_notification_event() RPC      │
│  - Creates notification_events      │
│  - Creates notification_deliveries  │ ⚠️ Raw event payload (no title/body)
│  - Queues send_notification jobs    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Notification Worker                │
│  - Fetches delivery record          │
│  - Routes to channel adapter        │ ⚠️ Fallback: payload.title || "default"
│  - Formats content on-the-fly       │ ⚠️ Fallback: payload.body || ""
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  User Receives  │
│  Empty Content  │ ⚠️ Notification with no body
└─────────────────┘
```

### Missing Component: Payload Transformer

A **Payload Transformer Service** should exist between event creation and delivery creation:

```typescript
// MISSING: Payload transformer
interface PayloadTransformer {
	transform(eventType: string, eventPayload: Record<string, any>): NotificationDeliveryPayload;
}

// Example implementation:
class BriefCompletedTransformer {
	transform(payload: BriefCompletedEventPayload) {
		return {
			title: 'Your daily brief is ready!',
			body: `${payload.task_count} tasks across ${payload.project_count} projects`,
			url: `/briefs/${payload.brief_id}`,
			icon: '/icons/brief-ready.png'
		};
	}
}
```

### Pattern: Fallback Chain

The codebase uses a consistent pattern for fallbacks:

```typescript
title: payload.title || 'Default Title';
body: payload.body || ''; // ⚠️ Empty string
```

This pattern assumes `payload.title` and `payload.body` exist, but event payloads don't include them.

## Recommendations

### 1. Immediate Fix: Add Payload Transformation

Create a payload transformer service that maps event types to notification content:

**Location**: `apps/worker/src/lib/services/payloadTransformer.service.ts`

```typescript
export class PayloadTransformer {
	static transform(eventType: string, eventPayload: any): NotificationPayload {
		switch (eventType) {
			case 'brief.completed':
				return {
					title: 'Daily Brief Ready',
					body: `${eventPayload.task_count} tasks for ${eventPayload.brief_date}`,
					url: `/briefs/${eventPayload.brief_id}`
				};
			case 'sms.sent':
				return {
					title: 'SMS Sent',
					body: `Your event reminder was sent`,
					url: '/sms'
				};
			// ... other event types
			default:
				throw new Error(`No transformer for event type: ${eventType}`);
		}
	}
}
```

### 2. Update RPC Function

Modify `emit_notification_event()` to transform payloads before creating deliveries:

**Location**: `apps/web/supabase/migrations/[new]_add_payload_transformation.sql`

### 3. Add Validation

Ensure deliveries always have `title` and `body`:

```typescript
// Before inserting delivery
if (!payload.title || !payload.body) {
	throw new Error('Notification payload must include title and body');
}
```

### 4. Fix SMS Adapter

Update SMS adapter to handle missing event types gracefully:

**Location**: `apps/worker/src/workers/notification/smsAdapter.ts:159-234`

Add default transformers for all event types instead of generic fallback.

### 5. Audit Notification Triggers

Review and document all notification trigger points:

- Which events should trigger push notifications?
- What should the notification content say?
- Are there too many notification types enabled by default?

### 6. Add User Preferences

Allow users to control which events trigger push notifications:

**Location**: `apps/web/src/lib/components/settings/NotificationPreferences.svelte`

Add granular controls:

- Daily brief notifications
- SMS status notifications
- Job completion notifications
- Alert notifications

## Open Questions

1. **Which specific notification is the user receiving?**
    - Need to check browser console for notification payload
    - Check service worker logs: `chrome://inspect/#service-workers`
    - Check `notification_deliveries` table for recent records

2. **When do these notifications appear?**
    - Midnight (daily SMS scheduler)?
    - After SMS sends?
    - After daily brief generation?
    - Random times?

3. **User's notification preferences?**
    - Check `user_preferences` table
    - Check `push_subscriptions` table for active subscriptions
    - Check `notification_subscriptions` table for enabled event types

4. **Recent notification events?**
    - Query `notification_events` table for user's recent events
    - Check `notification_deliveries` for status and payload
    - Review worker logs for notification jobs

## Next Steps for Debugging

1. **Check Browser Console**:

    ```javascript
    // In browser console
    navigator.serviceWorker.getRegistration().then((reg) => {
    	console.log('Service Worker:', reg);
    });
    ```

2. **Query Recent Notifications**:

    ```sql
    SELECT
      ne.event_type,
      ne.payload as event_payload,
      nd.payload as delivery_payload,
      nd.status,
      nd.created_at
    FROM notification_deliveries nd
    JOIN notification_events ne ON nd.event_id = ne.id
    WHERE nd.recipient_user_id = '[user_id]'
      AND nd.channel = 'push'
    ORDER BY nd.created_at DESC
    LIMIT 10;
    ```

3. **Check Active Subscriptions**:

    ```sql
    SELECT event_type, status, created_at
    FROM notification_subscriptions
    WHERE user_id = '[user_id]'
      AND status = 'active';
    ```

4. **Review Worker Logs**:
    - Check Railway logs for `notificationWorker` jobs
    - Look for `send_notification` job processing
    - Check for error patterns

5. **Test with Known Event**:
    - Trigger a test notification via admin endpoint
    - Use proper payload with title and body
    - Verify it appears correctly
    - Location: `/api/admin/notifications/test`

---

## Conclusion

The random push notifications with no information are caused by a **systemic architectural gap**: event payloads lack `title` and `body` fields, but notification delivery expects them. Without a centralized payload transformation layer, the system falls back to empty defaults (`|| ""`), resulting in notifications with no meaningful content.

**Most likely culprits**:

1. Daily SMS scheduler (midnight cron) triggering SMS-related notifications
2. SMS webhook callbacks for every status change
3. Daily brief completion notifications
4. Background job completion notifications

**Immediate action**: Check the user's `notification_deliveries` table to see recent delivery records and their payloads, then implement payload transformation before the `emit_notification_event()` RPC creates deliveries.
