---
date: 2025-10-10T17:36:09Z
researcher: Claude Code
git_commit: 27b0cb62a982e6a98364bf465c89048c874fa6c3
branch: main
repository: buildos-platform
topic: "Notification System Analysis - Repeated Notifications and Task Count Discrepancies"
tags: [research, notifications, task-count, multi-device, brief-completed, payload-transformer]
status: complete
last_updated: 2025-10-10
last_updated_by: Claude Code
---

# Research: Notification System - Repeated Notifications and Task Count Discrepancies

**Date**: 2025-10-10T17:36:09Z
**Researcher**: Claude Code
**Git Commit**: 27b0cb62a982e6a98364bf465c89048c874fa6c3
**Branch**: main
**Repository**: buildos-platform

## Research Question

User reported two issues:
1. "Notifications that are getting pinged repeatedly somehow"
2. "Computing the number of tasks differently"

Investigation goals:
- Understand why notifications appear to be repeated
- Trace how task counts are calculated and where discrepancies occur
- Identify root causes and provide recommendations

## Executive Summary

### Issue 1: "Repeated Notifications" ✅ INTENTIONAL BY DESIGN

**Root Cause**: Multi-device push notification behavior

The system sends push notifications to **ALL active devices** for a user (desktop Chrome, mobile Chrome, etc.). This is **intentional and matches industry standards** (Gmail, Slack, Discord all behave this way).

**Technical Details**:
- Each device creates a unique push subscription
- `emit_notification_event` RPC loops through ALL active subscriptions
- Creates one delivery + one job for EACH subscription
- Result: User with 3 devices gets 3 notifications (one per device)

**Status**: Working as designed, not a bug

---

### Issue 2: "Computing Tasks Differently" ⚠️ POTENTIAL UX ISSUE

**Root Cause**: Notification shows only **today's tasks**, not all pending tasks

**Technical Details**:
- Notification: `task_count` = sum of `todays_task_count` from project briefs
- "Today's tasks" = tasks with `start_date` within today's bounds (timezone-aware)
- Excludes: overdue tasks, upcoming tasks, tasks without start dates

**Potential Discrepancy**: User might see different counts in:
- **Notification**: "2 tasks" (only today's tasks)
- **Brief UI**: Shows 5 categories (today, overdue, upcoming, next 7 days, completed)
- **Project Pages**: Shows all pending tasks (could be 20+)

**Status**: Technically correct but potentially confusing UX

---

## Detailed Findings

### Part 1: Multi-Device Notification Flow

#### 1.1 Push Subscription Creation

**File**: `apps/web/src/lib/services/browser-push.service.ts` (Lines 85-156)

Each device/browser creates a unique push subscription:

```typescript
async subscribe(): Promise<void> {
  // 1. Request browser permission
  const hasPermission = await this.requestPermission();

  // 2. Subscribe via PushManager API
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  // 3. Save to database with UPSERT
  await this.supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: request.endpoint,        // ← Unique per device
      p256dh_key: request.keys.p256dh,
      auth_key: request.keys.auth,
      user_agent: request.user_agent,
      is_active: true
    },
    { onConflict: 'endpoint' }  // Prevents duplicate endpoints
  );
}
```

**Key Points**:
- Desktop Chrome: unique endpoint
- Mobile Chrome: unique endpoint
- Safari: unique endpoint
- Each gets its own record in `push_subscriptions` table

#### 1.2 Notification Delivery Creation

**File**: `apps/web/supabase/migrations/20251006_notification_system_phase1.sql` (Lines 318-365)

**Updated File**: `apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql` (Lines 71-118)

The RPC loops through ALL active push subscriptions:

```sql
-- Find active push subscriptions for this user
FOR v_push_sub IN
  SELECT * FROM push_subscriptions
  WHERE user_id = v_subscription.user_id
    AND is_active = true  -- ✅ LOOPS THROUGH ALL ACTIVE SUBSCRIPTIONS
LOOP
  -- Create delivery record for THIS device
  INSERT INTO notification_deliveries (
    event_id,
    subscription_id,
    recipient_user_id,
    channel,
    channel_identifier,  -- ✅ Set to v_push_sub.endpoint (unique per device)
    payload,
    status
  ) VALUES (
    v_event_id,
    v_subscription.id,
    v_subscription.user_id,
    'push',
    v_push_sub.endpoint,  -- ✅ Each device gets its own delivery
    p_payload,
    'pending'
  ) RETURNING id INTO v_delivery_id;

  -- Queue notification job for THIS device
  INSERT INTO queue_jobs (
    user_id,
    job_type,
    status,
    scheduled_for,
    metadata
  ) VALUES (
    v_subscription.user_id,
    'send_notification',
    'pending',
    v_scheduled_time,  -- Same scheduled time for all devices
    jsonb_build_object(
      'event_id', v_event_id,
      'delivery_id', v_delivery_id,  -- ✅ Unique per device
      'channel', 'push'
    )
  );
END LOOP;  -- ✅ Creates one delivery + one job PER device
```

**Result**:
- User with 1 device: 1 delivery + 1 job
- User with 3 devices: 3 deliveries + 3 jobs
- Each delivery tracked separately in `notification_deliveries` table

#### 1.3 Worker Deduplication Logic

**File**: `apps/worker/src/workers/notification/notificationWorker.ts` (Lines 338-348)

The worker prevents duplicate sends **per delivery**:

```typescript
// Skip if already sent or currently being processed
if (
  delivery.status === "sent" ||
  delivery.status === "delivered" ||
  delivery.status === "clicked"
) {
  console.log(
    `[NotificationWorker] Delivery ${delivery_id} already completed (${delivery.status}), skipping`
  );
  return;
}
```

**Deduplication Strategy**:
- ✅ **Per-delivery deduplication**: Each delivery processed exactly once
- ❌ **No cross-device deduplication**: By design, each device gets its own notification
- ✅ **Idempotent jobs**: Re-running a job for completed delivery is no-op

#### 1.4 Is This a Bug or Feature?

**✅ INTENTIONAL BY DESIGN** - Matches industry standards:

| Service | Behavior |
|---------|----------|
| **Gmail** | Notifications appear on ALL logged-in devices |
| **Slack** | Notifications sent to ALL active devices (with smart dismissal) |
| **Discord** | Notifications appear on ALL devices |
| **WhatsApp** | Notifications sent to ALL devices until one is opened |
| **BuildOS** | Notifications sent to ALL active devices ✅ |

**Design Rationale**:
1. **User expectation**: Users expect to see notifications wherever they are
2. **Device availability**: User might not have their primary device with them
3. **Reliability**: If one device is offline, others still receive notification
4. **Engagement**: Increases likelihood of notification being seen

**Advanced Patterns (Not Currently Implemented)**:
- Smart dismissal (dismiss on other devices when opened on one)
- Primary device preference (allow users to designate primary device)
- Focus-based delivery (only send to device user is actively using)

---

### Part 2: Task Count Calculation Flow

#### 2.1 Brief Generation Task Categorization

**File**: `apps/worker/src/workers/brief/briefGenerator.ts`

Tasks are categorized into 5 groups:

##### A. Today's Tasks (Lines 499-507)

```typescript
const todaysTasks = project.tasks.filter((task: TaskWithCalendarEvent) => {
  if (!task.start_date || task.outdated || task.status === "done")
    return false;
  const taskStartDate = parseISO(task.start_date);
  return (
    taskStartDate >= todayBounds.start && taskStartDate <= todayBounds.end
  );
});
```

**Criteria**:
- Has `start_date`
- `outdated = false`
- `status != 'done'`
- `start_date` within today's bounds in user's timezone

**Stored as**: `metadata.todays_task_count: todaysTasks.length` (Line 579)

##### B. Overdue Tasks (Lines 651-671)

```typescript
const overdueTasks = tasks.filter((task) => {
  if (!task.start_date || task.status === "done" || task.outdated)
    return false;
  const taskStartDate = parseISO(task.start_date);
  return taskStartDate < todayBounds.start; // Before today
});
```

**Stored as**: `metadata.overdue_task_count: overdueTasks.length` (Line 580)

##### C. Upcoming Tasks (Lines 512-526)

Two strategies based on project structure:
- **With phases**: Tasks in current phase from today forward (limited to 10)
- **Without phases**: Next 10 tasks from today forward

**Stored as**: `metadata.upcoming_task_count: upcomingTasks.length` (Line 581)

##### D. Next Seven Days Tasks (Lines 529-533, 725-748)

```typescript
const nextSevenDaysTasks = getUpcomingTasks(project.tasks, briefDate, timezone);
// Returns tasks where: taskStartDate > todayBounds.end && taskStartDate <= nextWeekDate
```

**Stored as**: `metadata.next_seven_days_task_count: nextSevenDaysTasks.length` (Line 582)

##### E. Recently Completed Tasks (Lines 536-540, 750-772)

```typescript
const recentlyCompletedTasks = getRecentlyCompletedTasks(
  project.tasks, briefDate, timezone
);
// Returns tasks completed in last 24 hours (based on updated_at)
```

**Stored as**: `metadata.recently_completed_count: recentlyCompletedTasks.length` (Line 583)

#### 2.2 Notification Task Count Calculation

**File**: `apps/worker/src/workers/brief/briefWorker.ts` (Lines 302-314)

```typescript
// Get task and project counts from project_daily_briefs
const { data: projectBriefs } = await supabase
  .from("project_daily_briefs")
  .select("id, metadata")
  .eq("daily_brief_id", brief.id);

const projectCount = projectBriefs?.length || 0;

// Calculate task count from project briefs (today's tasks only)
const taskCount = projectBriefs?.reduce((sum, pb) => {
  const metadata = pb.metadata as any;
  return sum + (metadata?.todays_task_count || 0); // ← ONLY TODAY'S TASKS
}, 0) || 0;
```

**Critical Finding**: Notification `task_count` = **ONLY today's tasks**, not all tasks

#### 2.3 Notification Event Emission

**File**: `apps/worker/src/workers/brief/briefWorker.ts` (Lines 332-344)

```typescript
await (serviceClient.rpc as any)("emit_notification_event", {
  p_event_type: "brief.completed",
  p_event_source: "worker_job",
  p_target_user_id: job.data.userId,
  p_payload: {
    brief_id: brief.id,
    brief_date: briefDate,
    timezone: timezone,
    task_count: taskCount,        // ← TODAY'S TASKS ONLY
    project_count: projectCount,
  },
  p_scheduled_for: notificationScheduledFor?.toISOString(),
});
```

#### 2.4 Notification Payload Transformation

**File**: `packages/shared-types/src/payloadTransformer.ts` (Lines 51-72)

```typescript
function transformBriefCompleted(
  payload: BriefCompletedEventPayload,
): NotificationPayload {
  const taskText =
    payload.task_count === 1 ? "1 task" : `${payload.task_count || 0} tasks`;
  const projectText =
    payload.project_count === 1
      ? "1 project"
      : `${payload.project_count || 0} projects`;

  return {
    title: "Your Daily Brief is Ready! 📋",
    body: `${taskText} across ${projectText} for ${payload.brief_date}`,
    action_url: `/briefs/${payload.brief_id}`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      brief_id: payload.brief_id,
      brief_date: payload.brief_date,
      timezone: payload.timezone,
    },
  };
}
```

**Notification Message**: "Your Daily Brief is Ready! 📋 - {taskCount} tasks across {projectCount} projects for {briefDate}"

Where `{taskCount}` = **only today's tasks**

#### 2.5 Task Count Discrepancy Scenarios

| Context | Task Count Shown | Calculation |
|---------|------------------|-------------|
| **Notification** | 2 tasks | `todays_task_count` only |
| **Brief Summary** | All 5 categories | Shows today, overdue, upcoming, next 7 days, completed separately |
| **Project Page** | All pending tasks | All tasks with `status != 'done'` and `!outdated` |
| **LLM Analysis** | All 5 counts | Uses full metadata for AI insights |

**Example Scenario**:
- **Today's tasks**: 2 (start today)
- **Overdue tasks**: 10 (started before today, not done)
- **Upcoming tasks**: 8 (start after today)
- **Total pending**: 20 tasks

**What user sees**:
- **Notification**: "2 tasks across 3 projects" ← Potentially misleading
- **Brief UI**: Shows all categories with full context
- **User perception**: "Why does notification say 2 tasks when I have 20?"

---

## Complete Flow Diagram

```
1. Brief Generation Scheduled (scheduler.ts)
   ↓
2. Worker picks up job (briefWorker.ts)
   ↓
3. Generate project briefs in parallel (briefGenerator.ts)
   ↓ Categorizes tasks into 5 groups per project
   ↓ Stores 5 counts in project_daily_briefs.metadata

4. Calculate notification payload (briefWorker.ts:310-314)
   ↓ Queries project_daily_briefs
   ↓ Sums ONLY todays_task_count

5. Emit notification event (briefWorker.ts:332-344)
   ↓ Payload: { task_count: taskCount, project_count, ... }
   ↓ With p_scheduled_for parameter

6. emit_notification_event RPC (migration SQL)
   ↓ Creates notification_events record
   ↓ FOR EACH active push subscription:
   ↓   - Creates notification_deliveries record
   ↓   - Queues send_notification job
   ↓ Result: 1 delivery + 1 job PER DEVICE

7. Notification Worker (notificationWorker.ts)
   ↓ Processes at scheduled time
   ↓ enrichDeliveryPayload() → transformEventPayload()
   ↓ Transforms to: "Your Daily Brief is Ready! 📋"
   ↓            "2 tasks across 3 projects for 2025-10-10"

8. Send to ALL devices (sendPushNotification)
   ↓ webpush.sendNotification() called once per delivery
   ↓ Each device gets notification independently
```

---

## Code References

### Multi-Device Notifications

- `apps/web/src/lib/services/browser-push.service.ts:85-156` - Subscription creation
- `apps/web/supabase/migrations/20251010_add_scheduled_for_to_notification_events.sql:71-118` - RPC loops through subscriptions
- `apps/worker/src/workers/notification/notificationWorker.ts:138-210` - Send push notification
- `apps/worker/src/workers/notification/notificationWorker.ts:338-348` - Per-delivery deduplication

### Task Count Calculation

- `apps/worker/src/workers/brief/briefGenerator.ts:499-507` - Today's tasks filtering
- `apps/worker/src/workers/brief/briefGenerator.ts:579-583` - Metadata storage (5 counts)
- `apps/worker/src/workers/brief/briefWorker.ts:302-314` - Notification task count (today's only)
- `apps/worker/src/workers/brief/briefWorker.ts:332-344` - Event emission with task_count
- `packages/shared-types/src/payloadTransformer.ts:51-72` - Transform to notification message

### Payload Transformation

- `packages/shared-types/src/payloadTransformer.ts:272-326` - Main transformer function
- `apps/worker/src/workers/notification/notificationWorker.ts:58-124` - Enrich delivery payload

---

## Recommendations

### Issue 1: Multi-Device Notifications

#### Option A: Keep Current Behavior (✅ RECOMMENDED)

**Rationale**: Matches industry standards, provides best user experience

**Action Items**:
- ✅ No code changes needed
- Document behavior in user-facing help docs
- Consider adding "smart dismissal" feature in future (dismiss on all devices when opened on one)

#### Option B: Add Device Control Settings (Optional)

**Implementation**:
1. Add `send_to_all_devices` boolean to `user_notification_preferences` table
2. Add `is_preferred` boolean to `push_subscriptions` table
3. Modify RPC to filter subscriptions based on preference
4. Add UI toggle in notification preferences

**Complexity**: Low | **Timeline**: 2-3 days

---

### Issue 2: Task Count Discrepancy

#### Option A: Make Task Count More Descriptive (✅ RECOMMENDED)

**Change**: Update notification message to clarify what tasks are counted

**Before**:
```
"Your Daily Brief is Ready! 📋"
"2 tasks across 3 projects for 2025-10-10"
```

**After**:
```
"Your Daily Brief is Ready! 📋"
"2 tasks scheduled for today across 3 projects"
```

Or:

```
"Your Daily Brief is Ready! 📋"
"Today: 2 tasks | Overdue: 10 | Upcoming: 8 across 3 projects"
```

**Implementation**:
1. Modify `transformBriefCompleted()` in `payloadTransformer.ts:51-72`
2. Pass all task counts in event payload (not just `todays_task_count`)
3. Update notification message template

**Complexity**: Low | **Timeline**: 1-2 hours

**Files to modify**:
- `apps/worker/src/workers/brief/briefWorker.ts:302-344` - Include all counts in payload
- `packages/shared-types/src/payloadTransformer.ts:51-72` - Update message format

#### Option B: Include All Pending Tasks in Notification (Alternative)

**Change**: Change `task_count` to include today + overdue + upcoming

**Before**:
```typescript
const taskCount = projectBriefs?.reduce((sum, pb) => {
  const metadata = pb.metadata as any;
  return sum + (metadata?.todays_task_count || 0);
}, 0) || 0;
```

**After**:
```typescript
const taskCount = projectBriefs?.reduce((sum, pb) => {
  const metadata = pb.metadata as any;
  return sum +
    (metadata?.todays_task_count || 0) +
    (metadata?.overdue_task_count || 0) +
    (metadata?.upcoming_task_count || 0);
}, 0) || 0;
```

**Pros**:
- Matches user's mental model of "tasks I need to do"
- More accurate representation of workload

**Cons**:
- Could be overwhelming (showing 20+ tasks in notification)
- Less actionable ("what do I do TODAY?")

**Complexity**: Low | **Timeline**: 30 minutes

---

## Related Research

- `thoughts/shared/research/2025-10-10_06-10-46_daily-brief-notification-timing-issue.md` - Notification timing analysis
- `thoughts/shared/research/2025-10-09_16-19-12_random-push-notifications-investigation.md` - Empty notification payloads
- `thoughts/shared/research/2025-10-08_02-00-00_daily-brief-manual-scheduling-timezone-bugs.md` - Timezone bugs

---

## Testing Strategy

### Test Case 1: Multi-Device Notification Delivery

1. Subscribe to push notifications on 3 devices (desktop Chrome, mobile Chrome, Safari)
2. Verify 3 records in `push_subscriptions` table with `is_active=true`
3. Trigger daily brief generation
4. Verify 3 records in `notification_deliveries` table with same `event_id`
5. Verify 3 jobs in `queue_jobs` table with `job_type='send_notification'`
6. Verify all 3 devices receive notification at scheduled time

**Expected**: Each device receives notification independently ✅

### Test Case 2: Task Count Accuracy

1. Create project with:
   - 2 tasks starting today
   - 10 tasks overdue (start date before today)
   - 8 tasks upcoming (start date after today)
2. Generate daily brief
3. Check notification message
4. Compare with brief UI

**Current Behavior**: Notification shows "2 tasks"
**Brief UI Shows**: All 5 categories with full counts

### Test Case 3: Delivery Deduplication

1. Subscribe on device A
2. Trigger notification
3. Re-process same job (simulate retry)
4. Verify notification sent only once to device A

**Expected**: Worker skips delivery with `status='sent'` ✅

---

## Open Questions

1. **Should we implement smart dismissal?**
   - Dismiss notifications on all devices when opened on one device
   - Requires real-time sync via Supabase Realtime
   - **Recommendation**: Future enhancement, not urgent

2. **Should notification show all pending tasks or just today's tasks?**
   - Current: Only today's tasks
   - Alternative: Today + overdue + upcoming
   - **Recommendation**: Keep today's only, but make message clearer

3. **Should users have option to control multi-device behavior?**
   - Current: All devices always receive notifications
   - Alternative: Add "preferred device only" setting
   - **Recommendation**: Not needed - matches industry standards

4. **Should we add task count breakdown to notification?**
   - Current: "2 tasks across 3 projects"
   - Alternative: "Today: 2 | Overdue: 10 | Upcoming: 8"
   - **Recommendation**: Yes - improves clarity without overwhelming

---

## Conclusion

### Issue 1: "Repeated Notifications" ✅ NOT A BUG

The multi-device notification behavior is **intentional and matches industry standards**. Users with multiple devices receive one notification per device, which is the expected behavior for modern notification systems.

**No code changes recommended** - this is working as designed.

### Issue 2: "Task Count Discrepancy" ⚠️ UX IMPROVEMENT NEEDED

The notification shows **only today's tasks**, while users might expect to see all pending tasks. This creates a discrepancy between the notification message and the brief UI.

**Recommended fix**: Update notification message to clarify task count scope:
- From: "2 tasks across 3 projects"
- To: "2 tasks scheduled for today across 3 projects"

Or provide breakdown:
- "Today: 2 | Overdue: 10 | Upcoming: 8 across 3 projects"

**Priority**: Medium - Not breaking functionality, but could reduce user confusion

**Effort**: Low - 1-2 hours to implement

---

## Next Steps

### Immediate (High Priority)

1. ✅ **Document multi-device behavior** - Add to user help docs explaining expected behavior
2. ✅ **Clarify task count in notification message** - Update `transformBriefCompleted()` to be more descriptive
3. Monitor delivery metrics to ensure no performance issues with multiple deliveries

### Short-term (Medium Priority)

1. Consider adding task count breakdown to notification message
2. Add user preference for notification message format (verbose vs concise)
3. Monitor user feedback on notification experience

### Long-term (Low Priority)

1. Implement smart dismissal (dismiss on all devices when opened on one)
2. Add "preferred device" setting for power users
3. Implement focus-based delivery (only notify active device)
