---
type: research
status: completed
priority: high
tags: [notifications, worker, timing, debugging]
related_files:
    - apps/worker/src/workers/brief/briefWorker.ts
    - apps/worker/src/workers/notification/notificationWorker.ts
    - packages/shared-types/src/payloadTransformer.ts
    - apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql
    - apps/web/supabase/migrations/20251006_notification_system_phase3.sql
    - apps/web/supabase/migrations/20251011_fix_queue_status_comparison.sql
created: 2025-10-10
path: thoughts/shared/research/2025-10-10_14-30-00_notification-timing-and-duplication-analysis.md
---

# Daily Brief Notification Timing and Duplication Analysis

## Problem Statement

User reported two issues with daily brief notifications:

1. **Repeated notifications** - notifications appearing multiple times
2. **Incorrect task counts** - task counts computed differently than expected

## Complete Notification Flow

### 1. Brief Generation (briefWorker.ts)

```typescript
// apps/worker/src/workers/brief/briefWorker.ts:367-389

// Calculate task counts from project briefs
const todaysTaskCount =
	projectBriefs?.reduce((sum, pb) => {
		const metadata = pb.metadata as any;
		return sum + (metadata?.todays_task_count || 0);
	}, 0) || 0;

// Similar calculations for overdue, upcoming, next 7 days, recently completed

// Call emit_notification_event RPC with scheduled time
await (serviceClient.rpc as any)('emit_notification_event', {
	p_event_type: 'brief.completed',
	p_target_user_id: job.data.userId,
	p_payload: {
		brief_id: brief.id,
		brief_date: briefDate,
		task_count: todaysTaskCount, // backward compatibility
		todays_task_count: todaysTaskCount,
		overdue_task_count: overdueTaskCount,
		upcoming_task_count: upcomingTaskCount,
		next_seven_days_task_count: nextSevenDaysTaskCount,
		recently_completed_count: recentlyCompletedCount,
		project_count: projectCount
	},
	p_scheduled_for: notificationScheduledFor?.toISOString() // User's preferred time
});
```

### 2. Event Emission (emit_notification_event RPC)

```sql
-- apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql

CREATE OR REPLACE FUNCTION emit_notification_event(...)
BEGIN
  -- Insert event into notification_events
  INSERT INTO notification_events (...) VALUES (...) RETURNING id INTO v_event_id;

  -- Loop through ALL active subscriptions for this event type
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type AND is_active = true
  LOOP
    -- Get user preferences (defaults: push=true, in_app=true, email=true)

    -- If push enabled:
    FOR v_push_sub IN
      SELECT * FROM push_subscriptions
      WHERE user_id = v_subscription.user_id AND is_active = true
    LOOP
      -- Create ONE delivery per push subscription (device/browser)
      INSERT INTO notification_deliveries (...);
      INSERT INTO queue_jobs (..., scheduled_for = v_scheduled_time, ...);
    END LOOP;

    -- If in_app enabled:
    INSERT INTO notification_deliveries (...);
    INSERT INTO queue_jobs (..., scheduled_for = v_scheduled_time, ...);
  END LOOP;
END;
```

**Key Observations:**

- Creates ONE notification event
- Loops through active subscriptions (normally ONE per user for brief.completed)
- For each subscription:
    - Creates ONE push delivery **per active push subscription** (can be multiple devices)
    - Creates ONE in-app delivery (if enabled)
- ALL jobs scheduled for `v_scheduled_time` (user's preferred time)

### 3. Worker Job Claiming (claim_pending_jobs RPC)

```sql
-- apps/web/supabase/migrations/20251011_fix_queue_status_comparison.sql

WHERE queue_jobs.status = 'pending'
  AND queue_jobs.job_type::TEXT = ANY(p_job_types)
  AND queue_jobs.scheduled_for <= NOW()  -- ✅ RESPECTS SCHEDULED TIME
ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC
```

**Key Finding:** The worker **DOES respect** the `scheduled_for` field. Jobs are only claimed when `scheduled_for <= NOW()`.

### 4. Notification Delivery (notificationWorker.ts)

```typescript
// apps/worker/src/workers/notification/notificationWorker.ts:474

// Enrich payload with transformed event data
typedDelivery = await enrichDeliveryPayload(typedDelivery, jobLogger);

// Transform event payload to notification message
const transformedPayload = transformEventPayload(
	event.event_type as EventType,
	event.payload as any
);
```

### 5. Payload Transformation (payloadTransformer.ts)

```typescript
// packages/shared-types/src/payloadTransformer.ts:51-96

function transformBriefCompleted(payload: BriefCompletedEventPayload): NotificationPayload {
	const todaysCount = payload.todays_task_count || 0;
	const overdueCount = payload.overdue_task_count || 0;
	const upcomingCount = payload.upcoming_task_count || 0;

	const taskBreakdown: string[] = [];
	if (todaysCount > 0) taskBreakdown.push(`Today: ${todaysCount}`);
	if (overdueCount > 0) taskBreakdown.push(`Overdue: ${overdueCount}`);
	if (upcomingCount > 0) taskBreakdown.push(`Upcoming: ${upcomingCount}`);

	const taskSummary = taskBreakdown.length > 0 ? taskBreakdown.join(' | ') : 'No tasks scheduled';

	return {
		title: 'Your Daily Brief is Ready! 📋',
		body: `${taskSummary} across ${projectText}`
		// ...
	};
}
```

**Key Finding:** Task count transformation is working correctly - uses the new detailed breakdown fields.

## Root Cause Analysis

### Issue #1: "Repeated Notifications"

**NOT a bug, but BY DESIGN** - here's why users might see "repeated" notifications:

#### Scenario A: Multiple Devices

If user has registered push notifications on multiple devices/browsers:

- Desktop Chrome
- Mobile Safari
- Laptop Firefox

Each device gets its own push subscription → Each gets a separate notification delivery.

**Evidence:**

```sql
-- emit_notification_event loops through ALL push subscriptions
FOR v_push_sub IN
  SELECT * FROM push_subscriptions
  WHERE user_id = v_subscription.user_id AND is_active = true
LOOP
  -- Creates ONE delivery per device
  INSERT INTO notification_deliveries (...);
END LOOP;
```

#### Scenario B: Push + In-App Duplication

Default preferences enable BOTH:

- Push notifications (browser/mobile)
- In-app notifications (notification center in app)

This means TWO notifications per device:

1. Browser push notification (pops up)
2. In-app notification (appears in notification bell)

**Evidence:**

```sql
-- User preferences default to ALL channels enabled
push_enabled := true;
email_enabled := true;
in_app_enabled := true;
```

#### Scenario C: Multiple Brief.Completed Subscriptions

If migration ran multiple times or subscriptions were manually created, users could have duplicate subscriptions.

**To verify:** Check database for duplicate subscriptions:

```sql
SELECT user_id, event_type, COUNT(*) as subscription_count
FROM notification_subscriptions
WHERE event_type = 'brief.completed' AND is_active = true
GROUP BY user_id, event_type
HAVING COUNT(*) > 1;
```

### Issue #2: "Task Counts Computed Differently"

**RESOLVED** - Task counts are now calculated correctly:

**Before (incorrect):**

```typescript
// Counted ALL user tasks, not just tasks in the brief
const { data: tasks } = await supabase
	.from('tasks')
	.select('id')
	.eq('user_id', job.data.userId)
	.is('deleted_at', null);
const taskCount = tasks?.length || 0;
```

**After (correct):**

```typescript
// Sum today's tasks from project briefs metadata
const taskCount =
	projectBriefs?.reduce((sum, pb) => {
		const metadata = pb.metadata as any;
		return sum + (metadata?.todays_task_count || 0);
	}, 0) || 0;
```

Now includes comprehensive breakdown:

- `todays_task_count` - Tasks scheduled for today
- `overdue_task_count` - Past due tasks
- `upcoming_task_count` - Future tasks (next 7 days excluded)
- `next_seven_days_task_count` - Tasks in the next week
- `recently_completed_count` - Recently completed tasks

The `transformBriefCompleted()` function builds a detailed message showing Today/Overdue/Upcoming breakdown.

## Timing Analysis

### Brief Generation Timeline

```
User's Scheduled Time: 8:00 AM
Generation Buffer: 2 minutes

7:58:00 AM - Brief generation starts (2 min early)
7:58:45 AM - Brief generation completes
7:58:45 AM - emit_notification_event called with p_scheduled_for = "8:00 AM"
7:58:45 AM - Notification jobs created with scheduled_for = "8:00 AM"
8:00:00 AM - Worker claims jobs (scheduled_for <= NOW())
8:00:02 AM - Notifications delivered to user
```

**Key Finding:** The timing mechanism works correctly! Jobs are NOT processed until the scheduled time arrives.

### Worker Poll Cycle

```typescript
// apps/worker/src/lib/supabaseQueue.ts

const { data: jobs } = await supabase.rpc('claim_pending_jobs', {
	p_job_types: ['send_notification'],
	p_batch_size: 10
});
```

- Worker polls every 5 seconds (production default)
- Claims up to 10 jobs per batch
- Only claims jobs where `scheduled_for <= NOW()`

## Recommendations

### 1. Add Deduplication for Push Subscriptions (Optional)

If you want to send only ONE push notification regardless of device count:

```sql
-- Modify emit_notification_event to send to most recently used device only
FOR v_push_sub IN
  SELECT * FROM push_subscriptions
  WHERE user_id = v_subscription.user_id AND is_active = true
  ORDER BY last_used_at DESC NULLS LAST
  LIMIT 1  -- ← Only send to most recent device
LOOP
  -- ...
END LOOP;
```

### 2. Separate Push and In-App Preferences (Recommended)

Users might want push OR in-app, not both. Update default preferences:

```sql
-- Change defaults in migration
push_enabled := true,   -- Keep push by default
in_app_enabled := false  -- Disable in-app to avoid duplication
```

Or add UI to let users choose:

- "Push notifications only"
- "In-app only"
- "Both" (current default)

### 3. Check for Duplicate Subscriptions

Run this query to verify:

```sql
SELECT user_id, event_type, COUNT(*) as count, array_agg(id) as subscription_ids
FROM notification_subscriptions
WHERE event_type = 'brief.completed' AND is_active = true
GROUP BY user_id, event_type
HAVING COUNT(*) > 1;
```

If duplicates exist, clean them up:

```sql
-- Keep only the oldest subscription per user/event_type
WITH duplicates AS (
  SELECT
    user_id,
    event_type,
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id, event_type ORDER BY created_at ASC) as rn
  FROM notification_subscriptions
  WHERE event_type = 'brief.completed' AND is_active = true
)
UPDATE notification_subscriptions
SET is_active = false
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
```

### 4. Add Logging for Debugging

Add correlation ID tracking to trace notification flow:

```typescript
// Already implemented in user's updated code
const correlationId = generateCorrelationId();
console.log(`🔗 Generated correlation ID: ${correlationId}`);
```

Use this ID to trace notifications across:

- Brief generation
- Event emission
- Job creation
- Delivery processing

### 5. User-Facing Preference UI

Add settings page for notification preferences:

- Enable/disable push notifications
- Enable/disable in-app notifications
- Manage devices (view/delete push subscriptions)
- Set quiet hours
- Choose notification channels per event type

## Verification Steps

1. **Check user's push subscriptions:**

    ```sql
    SELECT id, endpoint, user_agent, is_active, last_used_at, created_at
    FROM push_subscriptions
    WHERE user_id = 'USER_ID_HERE'
    ORDER BY created_at DESC;
    ```

2. **Check user's notification subscriptions:**

    ```sql
    SELECT event_type, is_active, created_at
    FROM notification_subscriptions
    WHERE user_id = 'USER_ID_HERE';
    ```

3. **Check user's preferences:**

    ```sql
    SELECT event_type, push_enabled, in_app_enabled, email_enabled
    FROM user_notification_preferences
    WHERE user_id = 'USER_ID_HERE';
    ```

4. **Check recent notification deliveries:**
    ```sql
    SELECT
      nd.id,
      nd.channel,
      nd.status,
      nd.created_at,
      nd.sent_at,
      ne.event_type,
      ne.payload->>'brief_id' as brief_id
    FROM notification_deliveries nd
    JOIN notification_events ne ON nd.event_id = ne.id
    WHERE nd.recipient_user_id = 'USER_ID_HERE'
      AND ne.event_type = 'brief.completed'
    ORDER BY nd.created_at DESC
    LIMIT 20;
    ```

## Summary

### What's Working ✅

- Notification scheduling (jobs wait until scheduled time)
- Task count calculation (now shows detailed breakdown)
- Payload transformation (creates clear messages)
- Worker timing (respects `scheduled_for` field)

### What Might Cause "Repeated Notifications" ⚠️

- Multiple push subscriptions (one per device/browser) - **BY DESIGN**
- Both push AND in-app enabled (two notifications per event) - **BY DESIGN**
- Possible duplicate subscriptions - **NEEDS VERIFICATION**

### Next Steps

1. Run verification queries to check user's subscription/preference state
2. Consider updating default preferences (disable in-app if push is enabled)
3. Add user-facing notification preference UI
4. Optional: Limit push to most recently used device only

### Technical Debt

- No deduplication in `emit_notification_event` (calling twice creates duplicate events)
- Default preferences enable all channels (might be overwhelming)
- No UI for managing notification preferences yet
- No UI for viewing/managing push subscriptions per device
