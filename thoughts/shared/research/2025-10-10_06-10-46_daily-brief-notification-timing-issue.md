---
date: 2025-10-10T06:10:46Z
researcher: Claude Code
git_commit: 27b0cb62a982e6a98364bf465c89048c874fa6c3
branch: main
repository: buildos-platform
topic: "Daily Brief Notification Timing Issue - Why Notifications Are Sent on Completion Instead of Scheduled Time"
tags: [research, codebase, daily-briefs, notifications, worker, timing, bug]
status: complete
last_updated: 2025-10-10
last_updated_by: Claude Code
---

# Research: Daily Brief Notification Timing Issue

**Date**: 2025-10-10T06:10:46Z
**Researcher**: Claude Code
**Git Commit**: 27b0cb62a982e6a98364bf465c89048c874fa6c3
**Branch**: main
**Repository**: buildos-platform

## Research Question

User reported: "I just got a notification that my daily brief was ready but I think this is wrong. It should be sending that notification at the time the daily brief is scheduled for."

Investigation goal: Understand when and how daily brief notifications are triggered, and determine if they're being sent at the correct time.

## Summary

**CONFIRMED BUG**: Daily brief notifications are sent **immediately upon completion** of brief generation, NOT at the user's scheduled time. This creates a timing mismatch where users expect notifications at their configured time (e.g., 8:00 AM), but actually receive them 10-60 seconds later when the brief finishes generating.

**Root Cause**: The notification event is emitted directly after brief generation completes (`apps/worker/src/workers/brief/briefWorker.ts:319`) with no delay or scheduling logic to align with the user's preferred time.

**Additional Issues Found**:

1. Empty notification payloads (documented Oct 9, 2025)
2. Midnight cron jobs potentially triggering unwanted notifications
3. Missing payload transformation layer for notification content

## Detailed Findings

### 1. Current Notification Flow (Incorrect Behavior)

**File**: `apps/worker/src/workers/brief/briefWorker.ts` (Lines 298-348)

**Actual Flow**:

```
User's scheduled time: 8:00 AM
    ↓
Scheduler queues job: ~8:00:00 AM (hourly cron checks within 1-hour window)
    ↓
Worker picks up job: ~8:00:10 AM (5-second poll interval)
    ↓
Brief generates: 10-60 seconds (varies by project count, AI processing)
    ↓
Brief completes: ~8:00:45 AM
    ↓
🚨 NOTIFICATION SENT: 8:00:45 AM ← PROBLEM: Should be 8:00:00 AM
```

**Code Reference** (`briefWorker.ts:319-334`):

```typescript
// Immediately after updating job status to "completed" (line 296)
await serviceClient.rpc("emit_notification_event", {
  p_event_type: "brief.completed",
  p_event_source: "worker_job",
  p_target_user_id: job.data.userId,
  p_payload: {
    brief_id: brief.id,
    brief_date: briefDate,
    timezone: timezone,
    task_count: taskCount,
    project_count: projectCount,
  },
});
```

**No scheduling logic** - the notification fires immediately with no delay or alignment to the user's preferred time.

### 2. Expected Notification Flow (Correct Behavior)

**What users expect**:

```
User's scheduled time: 8:00 AM
    ↓
🔔 NOTIFICATION SENT: 8:00:00 AM ← User's configured time
    ↓
Brief generation happens in background
    ↓
Brief becomes available: 8:00:30 AM (after generation completes)
```

**Alternative Design** (if immediate notification is preferred):

```
User's scheduled time: 8:00 AM
    ↓
Brief generation starts EARLY: 7:58:00 AM (2-minute buffer)
    ↓
Brief completes: 7:59:45 AM
    ↓
Notification scheduled for: 8:00:00 AM (user's preferred time)
```

### 3. Notification System Architecture

**Trigger Chain** (Step-by-step):

1. **Scheduler** (`apps/worker/src/scheduler.ts:122-125`)
   - Runs hourly: `cron.schedule("0 * * * *")`
   - Checks `user_brief_preferences` table
   - Queues jobs for users whose `time_of_day` falls within next hour

2. **Worker** (`apps/worker/src/worker.ts:47-53`)
   - Polls queue every 5 seconds
   - Claims up to 5 jobs concurrently
   - Processes via `processBriefJob()` function

3. **Brief Generation** (`apps/worker/src/workers/brief/briefWorker.ts:31-296`)
   - Fetches user data (projects, tasks, calendar events)
   - Generates AI analysis with DeepSeek Chat V3
   - Saves to `daily_briefs` table
   - Updates job status to "completed"

4. **Notification Emission** (`briefWorker.ts:298-348`)
   - **IMMEDIATELY** calls `emit_notification_event` RPC
   - No delay, no scheduling logic

5. **Notification Processing** (`apps/web/supabase/migrations/20251006_notification_system_phase1.sql:264-413`)
   - RPC creates event in `notification_events` table
   - Finds subscribers from `notification_subscriptions`
   - Creates delivery records in `notification_deliveries`
   - Queues `send_notification` jobs with `scheduled_for: NOW()`

6. **Notification Delivery** (`apps/worker/src/workers/notification/notificationWorker.ts`)
   - Processes `send_notification` jobs
   - Sends via push, in-app, email, or SMS adapters

### 4. User Preferences and Timing Configuration

**Table**: `user_brief_preferences`

**Fields** (from `packages/shared-types/src/database.schema.ts:1087-1098`):

- `time_of_day`: "HH:MM:SS" format (e.g., "09:00:00")
- `timezone`: IANA timezone (e.g., "America/New_York")
- `frequency`: "daily" | "weekly"
- `is_active`: boolean

**User Control**:

- ✅ Users control **when the brief is generated** (`time_of_day`)
- ❌ Users have **NO control** over when notification is sent (always immediate)

**Scheduler Calculation** (`scheduler.ts:455-478`):

```typescript
function calculateDailyRunTime(
  now: Date,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string,
): Date {
  // Convert current time to user's timezone
  const nowInUserTz = utcToZonedTime(now, timezone);

  // Set target time for today
  let targetInUserTz = setHours(nowInUserTz, hours);
  targetInUserTz = setMinutes(targetInUserTz, minutes);
  targetInUserTz = setSeconds(targetInUserTz, seconds);

  // If time has passed, schedule for tomorrow
  if (isBefore(targetInUserTz, nowInUserTz)) {
    targetInUserTz = addDays(targetInUserTz, 1);
  }

  // Convert back to UTC for storage
  return zonedTimeToUtc(targetInUserTz, timezone);
}
```

This calculates the **job scheduling time**, not the notification time.

### 5. Additional Related Issues

#### Issue #1: Empty Notification Payloads (Oct 9, 2025)

**Research Document**: `thoughts/shared/research/2025-10-09_16-19-12_random-push-notifications-investigation.md`

**Problem**: Notifications being sent with no `title` or `body` content

**Root Cause**:

- Event payloads don't include `title`/`body` fields
- Notification system expects these fields
- Falls back to empty strings when missing
- No centralized payload transformation

**Impact**: Users receive blank/empty push notifications

#### Issue #2: Midnight Cron Jobs Triggering Notifications

**File**: `apps/worker/src/scheduler.ts` (Lines 127-131)

**Code**:

```typescript
// Runs at midnight to schedule daily SMS reminders
cron.schedule("0 0 * * *", async () => {
  console.log("📱 Checking for daily SMS reminders...");
  await checkAndScheduleDailySMS();
});
```

**Potential Issue**:

- Midnight cron could be triggering notifications
- Not related to user's brief schedule
- May explain unexpected notification timing

#### Issue #3: Timezone Bug in Manual Scheduling (Oct 8, 2025)

**Research Document**: `thoughts/shared/research/2025-10-08_02-00-00_daily-brief-manual-scheduling-timezone-bugs.md`

**File**: `apps/web/src/routes/api/daily-briefs/generate/+server.ts:26`

**Problem**: Manual brief generation uses UTC instead of user's timezone

**Impact**: Users near midnight in negative UTC offset timezones (PST, MST, EST) get wrong brief date

### 6. Brief Generation Timing Characteristics

**Performance Metrics** (from research):

- **Project fetching**: 200-500ms (5 parallel database queries)
- **Project brief generation**: 2-5s per project (parallel LLM calls)
- **Main brief consolidation**: 100-200ms
- **LLM analysis**: 3-8s (DeepSeek Chat V3)
- **Email preparation**: 200-500ms (non-blocking)
- **Total time**: 5-15 seconds for 1-3 projects

**Variability**:

- Brief generation time is **unpredictable**
- Depends on project count, task count, LLM response time
- Makes it difficult to pre-schedule notifications accurately

### 7. Notification Payload Structure

**Event Payload** (`briefWorker.ts:320-329`):

```typescript
p_payload: {
  brief_id: brief.id,
  brief_date: briefDate,
  timezone: timezone,
  task_count: taskCount,
  project_count: projectCount,
}
```

**Transformed Payload** (`packages/shared-types/src/payloadTransformer.ts:278+`):

```typescript
case "brief.completed":
  return {
    title: "Your Daily Brief is Ready",
    body: `${payload.task_count} tasks across ${payload.project_count} projects`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    action_url: `/briefs/${payload.brief_id}`,
    priority: "normal",
    event_type: "brief.completed",
    data: { ... },
  };
```

**Issue**: Transformation happens in notification worker, not at event emission time.

## Code References

### Primary Issue (Notification Timing)

- `apps/worker/src/workers/brief/briefWorker.ts:319-334` - Notification emitted immediately on completion
- `apps/worker/src/scheduler.ts:455-478` - Scheduler calculates job time, not notification time
- `apps/web/supabase/migrations/20251006_notification_system_phase1.sql:349-356` - Jobs scheduled with `NOW()`

### Supporting Files

- `apps/worker/src/scheduler.ts:122-125` - Hourly cron for brief scheduling
- `apps/worker/src/worker.ts:47-53` - Worker job processing
- `apps/worker/src/workers/brief/briefGenerator.ts:1-1312` - Core brief generation logic
- `packages/shared-types/src/database.schema.ts:1087-1098` - `user_brief_preferences` schema
- `apps/web/src/lib/stores/briefPreferences.ts` - Client-side preference management
- `apps/web/src/routes/api/brief-preferences/+server.ts` - API for preference updates

### Related Issues

- `thoughts/shared/research/2025-10-09_16-19-12_random-push-notifications-investigation.md` - Empty notifications
- `thoughts/shared/research/2025-10-08_02-00-00_daily-brief-manual-scheduling-timezone-bugs.md` - Timezone bug
- `thoughts/shared/research/2025-09-27_22-11-17_daily-brief-system-analysis.md` - 17 critical bugs

## Architecture Insights

### Current Design Philosophy

The current implementation prioritizes **immediate feedback**:

- Brief completes → User notified immediately
- Ensures notification only sent when brief is actually ready
- Avoids notifying about incomplete/unavailable briefs

### Problems with Current Design

1. **User Expectation Mismatch**: Users expect notification at scheduled time (8:00 AM), not completion time (8:00:45 AM)
2. **No Configuration Option**: Users can't control notification timing separately from generation timing
3. **Inconsistent UX**: Brief schedule says "8:00 AM" but notification arrives at random time between 8:00-8:01 AM
4. **No Pre-generation**: System doesn't start generating early to ensure completion by scheduled time

### Design Trade-offs

**Option A: Notify Immediately on Completion** (Current)

- ✅ Pro: Never notifies for incomplete briefs
- ✅ Pro: Simple implementation
- ❌ Con: Unpredictable notification time
- ❌ Con: Doesn't match user expectations

**Option B: Notify at Scheduled Time** (Recommended)

- ✅ Pro: Predictable, matches user expectations
- ✅ Pro: Better UX consistency
- ❌ Con: Requires pre-generation buffer
- ❌ Con: May notify before brief is ready (if generation fails/delays)

**Option C: Pre-generate with Buffer**

- ✅ Pro: Best of both worlds
- ✅ Pro: Ensures brief ready by scheduled time
- ❌ Con: More complex scheduling
- ❌ Con: Wasted computation if user doesn't check brief

## Recommended Solutions

### Solution 1: Schedule Notification at User's Preferred Time (High Priority)

**Change**: Decouple notification timing from brief completion

**Implementation**:

1. **Modify** `apps/worker/src/workers/brief/briefWorker.ts` (Line 319)

   **Before**:

   ```typescript
   await serviceClient.rpc("emit_notification_event", {
     p_event_type: "brief.completed",
     // ... payload
   });
   ```

   **After**:

   ```typescript
   // Calculate notification time based on user's preference
   const notificationTime = await calculateNotificationTime(
     job.data.userId,
     job.data.scheduledFor, // Original scheduled time
     timezone,
   );

   await serviceClient.rpc("emit_notification_event", {
     p_event_type: "brief.completed",
     p_scheduled_for: notificationTime, // NEW: Schedule for user's time
     // ... payload
   });
   ```

2. **Update** `apps/web/supabase/migrations/20251006_notification_system_phase1.sql`
   - Add `p_scheduled_for` parameter to `emit_notification_event` RPC
   - Pass through to job creation (line 349-356)

   **Current**:

   ```sql
   scheduled_for: NOW()
   ```

   **New**:

   ```sql
   scheduled_for: COALESCE(p_scheduled_for, NOW())
   ```

3. **Add User Preference** (Optional)
   - Add `notification_delay_minutes` to `user_notification_preferences` table
   - Default: 0 (notify at scheduled time)
   - Allow users to customize (e.g., notify 5 minutes after)

**Pros**:

- Notifications arrive at predictable time
- Matches user expectations
- Minimal code changes

**Cons**:

- Brief may not be ready when notification arrives (if generation fails)
- Need error handling for delayed briefs

### Solution 2: Pre-generate Briefs with 2-5 Minute Buffer (Medium Priority)

**Change**: Start brief generation BEFORE scheduled time to ensure completion

**Implementation**:

1. **Modify** `apps/worker/src/scheduler.ts` (Line 260)

   **Before**:

   ```typescript
   if (isAfter(nextRunTime, now) && isBefore(nextRunTime, oneHourFromNow)) {
     usersToSchedule.push({ preference, nextRunTime });
   }
   ```

   **After**:

   ```typescript
   // Start generation 2 minutes early to ensure completion by scheduled time
   const GENERATION_BUFFER_MS = 2 * 60 * 1000; // 2 minutes
   const generationStartTime = new Date(
     nextRunTime.getTime() - GENERATION_BUFFER_MS,
   );

   if (isAfter(nextRunTime, now) && isBefore(nextRunTime, oneHourFromNow)) {
     usersToSchedule.push({
       preference,
       nextRunTime,
       generationStartTime,
       notificationTime: nextRunTime, // Notify at scheduled time
     });
   }
   ```

2. **Store Notification Time in Job Metadata**

   ```typescript
   const jobData = {
     userId,
     briefDate,
     timezone,
     notificationScheduledFor: nextRunTime, // NEW: When to notify user
     options: { ... }
   };
   ```

3. **Update Brief Worker** to use stored notification time
   ```typescript
   const notificationTime = job.data.notificationScheduledFor || new Date();
   await serviceClient.rpc("emit_notification_event", {
     p_scheduled_for: notificationTime,
     // ...
   });
   ```

**Pros**:

- Brief guaranteed ready when notification arrives
- Best user experience
- No user-facing errors

**Cons**:

- More complex scheduling logic
- Slightly higher compute costs (early generation)
- Need to tune buffer time based on metrics

### Solution 3: Add Notification Timing Preference (Low Priority)

**Change**: Let users control notification timing separately from brief generation

**Implementation**:

1. **Add Column** to `user_notification_preferences` table:

   ```sql
   ALTER TABLE user_notification_preferences
   ADD COLUMN notification_timing VARCHAR(20) DEFAULT 'immediate';
   -- Options: 'immediate', 'scheduled', 'custom'

   ALTER TABLE user_notification_preferences
   ADD COLUMN notification_delay_minutes INTEGER DEFAULT 0;
   ```

2. **Update UI** (`apps/web/src/lib/components/profile/BriefsTab.svelte`)
   - Add notification timing selector
   - Show preview: "Brief generates at 8:00 AM, notification at 8:00 AM"

3. **Update Worker** to respect preference

   ```typescript
   const preference = await fetchNotificationPreference(userId);

   let notificationTime;
   if (preference.notification_timing === "scheduled") {
     notificationTime = job.data.scheduledFor;
   } else if (preference.notification_timing === "custom") {
     notificationTime = addMinutes(
       new Date(),
       preference.notification_delay_minutes,
     );
   } else {
     notificationTime = new Date(); // immediate (current behavior)
   }
   ```

**Pros**:

- Gives users full control
- Backwards compatible (default to current behavior)
- Flexible for different user preferences

**Cons**:

- Adds complexity to UI/UX
- May confuse non-technical users
- More code to maintain

### Solution 4: Fix Empty Notification Payloads (High Priority)

**Change**: Ensure all notifications have proper title/body content

**Implementation**:

1. **Add Centralized Payload Transformer** at event emission time

   **File**: `apps/worker/src/workers/brief/briefWorker.ts`

   ```typescript
   import { transformNotificationPayload } from "@buildos/shared-types/payloadTransformer";

   const notificationPayload = transformNotificationPayload({
     event_type: "brief.completed",
     payload: {
       brief_id: brief.id,
       brief_date: briefDate,
       task_count: taskCount,
       project_count: projectCount,
     },
   });

   await serviceClient.rpc("emit_notification_event", {
     p_event_type: "brief.completed",
     p_payload: notificationPayload, // Now includes title/body
   });
   ```

2. **Update** `emit_notification_event` RPC to validate payload
   ```sql
   -- Validate that payload has required fields
   IF p_payload->>'title' IS NULL OR p_payload->>'body' IS NULL THEN
     RAISE WARNING 'Notification payload missing title/body for event %', p_event_type;
   END IF;
   ```

**Pros**:

- Fixes empty notifications immediately
- Prevents similar bugs in future
- Better error visibility

**Cons**:

- Requires refactoring payload transformation logic
- May need migration for existing events

## Testing Strategy

### Unit Tests

- Test `calculateNotificationTime()` function with various timezones
- Test notification scheduling logic
- Test buffer time calculations

### Integration Tests

- Schedule brief for specific time, verify notification arrives at correct time
- Test with various timezones (PST, EST, UTC, Tokyo)
- Test edge cases (midnight, DST transitions)

### Manual Testing Checklist

1. Set brief schedule for 8:00 AM in user's timezone
2. Verify notification arrives at 8:00:00 AM (not 8:00:30 AM)
3. Verify brief is available when notification arrives
4. Test with different timezones
5. Test with slow brief generation (many projects)
6. Test with failed brief generation (notification should not be sent)

## Related Research

- `thoughts/shared/research/2025-10-09_16-19-12_random-push-notifications-investigation.md` - Empty notification payloads
- `thoughts/shared/research/2025-10-08_02-00-00_daily-brief-manual-scheduling-timezone-bugs.md` - Manual scheduling timezone bug
- `thoughts/shared/research/2025-09-27_22-11-17_daily-brief-system-analysis.md` - Daily brief system analysis with 17 bugs
- `thoughts/shared/research/2025-10-05_21-31-45_daily-brief-notification-system-research.md` - Notification system overview
- `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - Overall system architecture
- `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` - Queue system flow

## Open Questions

1. **Should we notify users if brief generation fails?**
   - Current: No notification if generation fails
   - Proposed: Send error notification with retry option

2. **What's the optimal pre-generation buffer time?**
   - Need metrics on average generation time
   - Consider P95/P99 latency to set buffer

3. **Should notification timing be per-event or global preference?**
   - Per-event: More granular control (brief vs task vs project)
   - Global: Simpler UX

4. **How to handle slow brief generation?**
   - If generation takes > 2 minutes, notification may arrive before completion
   - Should we skip notification or send anyway?

5. **Should we migrate existing user preferences?**
   - Add default notification timing for existing users
   - Or let them opt-in to new behavior?

## Next Steps

### Immediate (High Priority)

1. **Implement Solution 1** - Schedule notifications at user's preferred time
2. **Implement Solution 4** - Fix empty notification payloads
3. **Add monitoring** for notification timing accuracy

### Short-term (Medium Priority)

1. **Implement Solution 2** - Pre-generate briefs with buffer
2. **Add metrics** for brief generation time (P50, P95, P99)
3. **Fix timezone bug** in manual scheduling (from Oct 8 research)

### Long-term (Low Priority)

1. **Implement Solution 3** - Add user preference for notification timing
2. **Add error notifications** for failed brief generation
3. **Optimize brief generation** to reduce latency

## Conclusion

The daily brief notification system currently sends notifications **immediately upon completion** instead of at the user's **scheduled time**. This creates a timing mismatch where users expect notifications at their configured time (e.g., 8:00 AM) but receive them 10-60 seconds later.

**Root cause**: `apps/worker/src/workers/brief/briefWorker.ts:319` emits notification event immediately after brief completion with no delay or scheduling logic.

**Recommended fix**: Decouple notification timing from brief completion by scheduling notifications at the user's preferred time, with optional pre-generation buffer to ensure brief is ready.

**Priority**: High - This is a user-facing bug that violates user expectations and creates UX inconsistency.
