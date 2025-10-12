---
title: Task Calendar Events Lifecycle Research
date: 2025-10-11T18:30:00Z
author: Claude Code
tags: [calendar, tasks, sync, database, architecture]
related:
  - /apps/web/src/lib/services/calendar-service.ts
  - /apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts
  - /apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts
  - /apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md
status: complete
---

# Task Calendar Events Lifecycle Research

## Executive Summary

This document details how `task_calendar_events` are created, updated, and deleted throughout the BuildOS codebase. Understanding this lifecycle is critical for implementing bulk operations that maintain calendar sync integrity.

## Table of Contents

1. [Database Schema](#database-schema)
2. [Lifecycle Overview](#lifecycle-overview)
3. [Calendar Event Creation](#calendar-event-creation)
4. [Calendar Event Updates](#calendar-event-updates)
5. [Calendar Event Deletion](#calendar-event-deletion)
6. [Sync Status Field](#sync-status-field)
7. [Services & Architecture](#services--architecture)
8. [Bulk Operations Guidelines](#bulk-operations-guidelines)
9. [Important Constraints](#important-constraints)

---

## Database Schema

### task_calendar_events Table

```typescript
{
  id: string; // UUID primary key
  user_id: string; // Foreign key to users
  task_id: string; // Foreign key to tasks
  calendar_event_id: string; // Google Calendar event ID
  calendar_id: string; // Google Calendar ID (usually 'primary')
  project_calendar_id: string | null; // Optional project calendar reference

  // Event details
  event_title: string | null;
  event_start: string | null; // ISO timestamp
  event_end: string | null; // ISO timestamp
  event_link: string | null; // Google Calendar URL

  // Recurring event tracking
  is_master_event: boolean | null; // True if this is the main recurring event
  is_exception: boolean | null; // True if this is a modified instance
  recurrence_rule: string | null; // RRULE format (e.g., "RRULE:FREQ=DAILY")
  recurrence_master_id: string | null; // Links to master event for exceptions
  recurrence_instance_date: string | null;
  exception_type: string | null; // 'modified' | 'cancelled'
  original_start_time: string | null;
  series_update_scope: string | null; // 'single' | 'all' | 'future'

  // Sync tracking
  sync_status: string; // 'synced' | 'pending' | 'error' | 'deleted'
  sync_source: string | null; // 'app' | 'google' | 'system'
  sync_error: string | null;
  sync_version: number | null; // Incremented on each update
  last_synced_at: string | null; // ISO timestamp

  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}
```

---

## Lifecycle Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Task Calendar Event Lifecycle          │
└─────────────────────────────────────────────────────────┘

1. CREATION
   ├─ User schedules task (sets start_date)
   ├─ CalendarService.scheduleTask() called
   ├─ Event created in Google Calendar
   └─ Record inserted in task_calendar_events
      └─ sync_status = 'synced'
      └─ sync_source = 'app'

2. UPDATE SCENARIOS
   ├─ Task start_date changed
   │  └─ Update existing calendar event
   ├─ Task marked as 'done'
   │  └─ Delete calendar event (status → 'done')
   ├─ Task start_date cleared (null)
   │  └─ Delete calendar event (reason: 'date_cleared')
   └─ Task type changes (recurring ↔ one_off)
      └─ Delete old event, create new one

3. DELETION SCENARIOS
   ├─ Task deleted
   │  └─ Delete all associated calendar events
   ├─ Task status → 'done'
   │  └─ Delete from calendar
   ├─ Task start_date → null
   │  └─ Delete from calendar
   └─ Calendar event marked as 'deleted'
      └─ Soft delete (record preserved)
```

---

## Calendar Event Creation

### When Calendar Events Are Created

1. **Task Scheduled with Start Date**
   - File: `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`
   - Trigger: `updates.addTaskToCalendar === true` AND task has `start_date`
   - Service: `CalendarService.scheduleTask()`

2. **Recurring Task Creation**
   - Same as above, but includes recurrence parameters
   - Stores RRULE in `recurrence_rule` column
   - Sets `is_master_event = true`

3. **Phase Task Scheduling**
   - File: `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`
   - Bulk operation that schedules multiple tasks to calendar

### Creation Implementation

```typescript
// Location: calendar-service.ts, scheduleTask()
await this.supabase.from("task_calendar_events").upsert({
  user_id: userId,
  task_id: task_id,
  calendar_event_id: response.data.id!,
  calendar_id: calendar_id,
  event_link: response.data.htmlLink,
  event_start: startDate.toISOString(),
  event_end: endDate.toISOString(),
  event_title: task.title,
  // Mark as master event if it's recurring
  is_master_event: isRecurring,
  // Store the RRULE if recurring
  recurrence_rule: isRecurring && recurrence.length > 0 ? recurrence[0] : null,
  // Sync metadata
  last_synced_at: new Date().toISOString(),
  sync_status: "synced", // ← IMPORTANT
  sync_source: "app", // ← IMPORTANT
  updated_at: new Date().toISOString(),
});
```

**Key Points:**

- Uses `upsert` to handle edge cases
- Always sets `sync_status = 'synced'` on successful creation
- Always sets `sync_source = 'app'` to track origin
- Stores `recurrence_rule` for recurring events
- `is_master_event = true` for recurring tasks

---

## Calendar Event Updates

### Update Triggers

1. **Task start_date Changed**
   - Updates event start/end times in Google Calendar
   - Updates database record with new times

2. **Task Duration Changed**
   - Recalculates end time
   - Updates Google Calendar event

3. **Task Title Changed**
   - Updates event summary in Google Calendar
   - Updates `event_title` in database

4. **Recurrence Pattern Changed**
   - **Deletes old event** (entire series)
   - **Creates new event** with new recurrence
   - Critical: This is a delete + create, not an update!

### Update Implementation

```typescript
// Location: /apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts

// Edge Case 5: Updates to existing calendar events
if (
  hasCalendarEvents &&
  !isDateCleared &&
  existingTask.status !== "done" &&
  newTaskData.status !== "done"
) {
  // Check for recurrence changes
  const recurrenceChanged =
    wasRecurring !== isNowRecurring ||
    (isNowRecurring &&
      wasRecurring &&
      ((newTaskData.recurrence_pattern &&
        newTaskData.recurrence_pattern !== existingTask.recurrence_pattern) ||
        (newTaskData.recurrence_ends !== undefined &&
          newTaskData.recurrence_ends !== existingTask.recurrence_ends)));

  if (recurrenceChanged) {
    // DELETE old events first
    operations.push({
      type: "delete_events",
      data: {
        events: existingTask.task_calendar_events,
        reason: "recurrence_changed",
      },
    });

    // CREATE new event with new recurrence
    operations.push({
      type: "schedule_task",
      data: {
        startTime: formatStartTime(
          newTaskData.start_date || existingTask.start_date,
        ),
        duration:
          newTaskData.duration_minutes || existingTask.duration_minutes || 60,
        title: newTaskData.title || existingTask.title,
        projectName: existingTask.project.name,
        timeZone: timeZone,
        task_type:
          newTaskData.task_type !== undefined
            ? newTaskData.task_type
            : existingTask.task_type,
        recurrence_pattern:
          newTaskData.task_type === "one_off"
            ? null
            : newTaskData.recurrence_pattern !== undefined
              ? newTaskData.recurrence_pattern
              : existingTask.recurrence_pattern,
        recurrence_ends:
          newTaskData.task_type === "one_off"
            ? null
            : newTaskData.recurrence_ends !== undefined
              ? newTaskData.recurrence_ends
              : existingTask.recurrence_ends,
      },
    });
  } else {
    // Simple update (no recurrence change)
    operations.push({
      type: "update_events",
      data: {
        task: existingTask,
        updates: newTaskData,
        timeZone: timeZone,
      },
    });
  }
}
```

**Critical Pattern:**

- **Recurrence changes = DELETE + CREATE** (not update)
- This ensures Google Calendar properly handles the RRULE change
- Old event is marked `sync_status = 'deleted'`
- New event is created with `sync_status = 'synced'`

---

## Calendar Event Deletion

### When Calendar Events Are Deleted

1. **Task Status Changed to 'done'**
   - Trigger: `newTaskData.status === 'done' && existingTask.status !== 'done'`
   - Action: Delete all associated calendar events
   - Reason: `'task_completed'`

2. **Task start_date Cleared (set to null)**
   - Trigger: `newTaskData.start_date === null && existingTask.start_date !== null`
   - Action: Delete all associated calendar events
   - Reason: `'date_cleared'`

3. **Task Deleted**
   - File: `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts` (DELETE handler)
   - Action: Delete all associated calendar events
   - Reason: `'task_deletion'`

4. **Task Type Changed (recurring → one_off)**
   - Action: Delete recurring event, create new one-off event
   - Reason: `'recurrence_changed'`

### Deletion Implementation

```typescript
// Location: calendar-service.ts, deleteCalendarEvent()
async deleteCalendarEvent(userId: string, params: DeleteCalendarEventParams) {
  try {
    // 1. Delete from Google Calendar
    await calendar.events.delete({
      calendarId: calendar_id,
      eventId: event_id,
      sendNotifications: send_notifications
    });

    // 2. Mark as deleted in database (soft delete for audit trail)
    await this.supabase
      .from('task_calendar_events')
      .delete()                    // ← Actually DELETES the record
      .eq('calendar_event_id', event_id);

    return {
      success: true,
      event_id: event_id,
      message: 'Calendar event deleted successfully'
    };
  } catch (error: any) {
    // 404 is not an error for delete operations
    if (error.code === 404 || error.message?.includes('404')) {
      // Still mark as deleted in database
      await this.supabase
        .from('task_calendar_events')
        .delete()
        .eq('calendar_event_id', params.event_id);

      return {
        success: true,
        event_id: params.event_id,
        message: 'Event already deleted or not found'
      };
    }
    // ... error handling
  }
}
```

**Important Notes:**

- The service uses `.delete()` which **actually removes** the record
- However, in some error cases, it updates `sync_status = 'deleted'` instead
- 404 errors are handled gracefully (idempotent deletes)
- The task update endpoint sometimes updates `sync_status = 'deleted'` for soft delete

**Two Deletion Patterns:**

1. **Hard Delete**: `.delete().eq('calendar_event_id', event_id)` - removes record
2. **Soft Delete**: `.update({ sync_status: 'deleted' })` - preserves record

---

## Sync Status Field

### Possible Values

Based on code analysis:

```typescript
type SyncStatus =
  | "synced" // Successfully synced with Google Calendar
  | "pending" // Not yet synced (queued)
  | "error" // Sync failed
  | "deleted"; // Marked as deleted (soft delete)
```

**Note:** The database schema shows `sync_status: string` (not an enum), allowing these string values.

### Status Lifecycle

```
┌─────────┐
│ PENDING │  Initial state when queued (rare - usually goes straight to synced)
└────┬────┘
     │
     v
┌─────────┐
│ SYNCED  │  Successfully created/updated in Google Calendar
└────┬────┘
     │
     ├─── Update needed ──→ stays SYNCED (updated in place)
     │
     ├─── Error occurs ──→ ERROR (with sync_error message)
     │
     └─── Deleted ──→ DELETED (soft delete) OR record removed (hard delete)
```

### Status Usage Examples

```typescript
// On successful creation
sync_status: 'synced',
last_synced_at: new Date().toISOString()

// On error
sync_status: 'error',
sync_error: error.message,
last_synced_at: new Date().toISOString()

// On soft delete
sync_status: 'deleted',
sync_error: 'Task moved to past date',
last_synced_at: new Date().toISOString()
```

---

## Services & Architecture

### CalendarService (`calendar-service.ts`)

**Primary service for all Google Calendar operations.**

Key Methods:

```typescript
class CalendarService {
  // Create calendar event
  async scheduleTask(userId: string, params: ScheduleTaskParams): Promise<ScheduleTaskResponse>

  // Update calendar event
  async updateCalendarEvent(userId: string, params: UpdateCalendarEventParams): Promise<UpdateCalendarEventResponse>

  // Delete calendar event
  async deleteCalendarEvent(userId: string, params: DeleteCalendarEventParams): Promise<DeleteCalendarEventResponse>

  // Bulk operations
  async bulkDeleteCalendarEvents(userId: string, events: BulkDeleteEventParams[], options): Promise<BulkDeleteResponse>
  async bulkScheduleTasks(userId: string, tasks: Array<...>, options): Promise<...>
  async bulkUpdateCalendarEvents(userId: string, updates: Array<...>, options): Promise<...>
}
```

**Important Characteristics:**

- Handles **both** Google Calendar API calls **and** database updates
- Sets `sync_source = 'app'` for all operations
- Handles errors and marks events with `sync_status = 'error'`
- Implements exponential backoff for rate limiting
- Thread-safe batch operations with configurable batch size

### API Endpoints

1. **Single Task Update**: `/api/projects/[id]/tasks/[taskId]` (PATCH)
   - Determines required calendar operations
   - Calls `CalendarService` methods directly
   - Fire-and-forget pattern (non-blocking)

2. **Batch Task Update**: `/api/projects/[id]/tasks/batch` (PATCH)
   - Tracks calendar sync requirements
   - Uses `bulkDeleteCalendarEvents()` and `bulkUpdateCalendarEvents()`
   - Returns warnings for failed calendar operations

3. **Task Deletion**: `/api/projects/[id]/tasks/[taskId]` (DELETE)
   - Handles recurring event deletion scopes
   - Deletes all associated calendar events
   - Uses enhanced error handling

### Architectural Pattern

```
┌─────────────────┐
│   API Endpoint  │  (Determines what calendar ops needed)
└────────┬────────┘
         │
         v
┌─────────────────┐
│ CalendarService │  (Executes Google API calls + DB updates)
└────────┬────────┘
         │
         ├──────────────────┐
         │                  │
         v                  v
┌──────────────┐    ┌──────────────────┐
│ Google Cal   │    │ task_calendar_   │
│ API          │    │ events table     │
└──────────────┘    └──────────────────┘
```

**Key Insight:** CalendarService is **atomic** - it handles both the Google Calendar API call and the database update in the same operation, ensuring consistency.

---

## Bulk Operations Guidelines

### 1. When Deleting Multiple Calendar Events

**Pattern from batch endpoint:**

```typescript
// Collect events to delete
const calendarDeletions = [];
for (const {
  task,
  operation,
  existingEvents,
} of results.calendarSyncRequired) {
  if (operation === "delete" && existingEvents.length > 0) {
    calendarDeletions.push(
      ...existingEvents.map((e: any) => ({
        event_id: e.calendar_event_id,
        calendar_id: e.calendar_id || "primary",
      })),
    );
  }
}

// Execute bulk delete
if (calendarDeletions.length > 0) {
  const deleteResult = await calendarService.bulkDeleteCalendarEvents(
    user.id,
    calendarDeletions,
    { batchSize: 5, reason: "bulk_status_update" }, // ← Add reason for logging
  );

  // Handle results
  results.warnings.push(
    `Calendar sync: ${deleteResult.deletedCount} events deleted, ${deleteResult.warnings.length} warnings`,
  );
}
```

**Important:**

- Use `bulkDeleteCalendarEvents()` instead of individual deletes
- Set `batchSize` (default: 5) to avoid rate limits
- Include `reason` for analytics/debugging
- Handle partial failures gracefully (collect warnings)
- CalendarService handles the database cleanup

### 2. When Updating Multiple Calendar Events

```typescript
const calendarUpdates = [];
for (const {
  task,
  operation,
  existingEvents,
} of results.calendarSyncRequired) {
  if (operation === "update" && existingEvents.length > 0 && task.start_date) {
    const startTime = new Date(task.start_date);
    const endTime = new Date(startTime);
    endTime.setMinutes(startTime.getMinutes() + (task.duration_minutes || 60));

    for (const event of existingEvents) {
      calendarUpdates.push({
        event_id: event.calendar_event_id,
        calendar_id: event.calendar_id || "primary",
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        summary: task.title,
      });
    }
  }
}

// Execute bulk update
if (calendarUpdates.length > 0) {
  const updateResult = await calendarService.bulkUpdateCalendarEvents(
    user.id,
    calendarUpdates,
    { batchSize: 5 },
  );

  results.warnings.push(
    `Calendar sync: ${updateResult.updated} events updated, ${updateResult.failed} failed`,
  );
}
```

### 3. Fire-and-Forget vs Await Pattern

**Single Calendar Operations** (await for immediate consistency):

```typescript
const isSingleCalendarAdd =
  updates.addTaskToCalendar && calendarPromises.length === 1;

if (calendarPromises.length > 0) {
  if (isSingleCalendarAdd) {
    // Wait for single calendar operations to complete
    // Ensures task_calendar_events are populated in response
    await Promise.allSettled(calendarPromises);
  } else {
    // For bulk operations, process in background
    Promise.allSettled(calendarPromises).catch((error) =>
      console.error("Calendar operations failed:", error),
    );
  }
}
```

**Bulk Operations** (background processing):

```typescript
// Don't block the response for bulk operations
// Return immediately with status
return ApiResponse.success({
  successful: results.successful,
  failed: results.failed,
  calendarSync: {
    status: "processing",
    deletedCount: deleteResult.deletedCount,
    warnings: results.warnings,
  },
});
```

### 4. Error Handling in Bulk Operations

```typescript
try {
  const calendarService = new CalendarService(supabase);
  const result = await calendarService.bulkDeleteCalendarEvents(
    user.id,
    calendarDeletions,
    { batchSize: 5, reason: "bulk_operation" },
  );

  // Check for warnings/errors
  if (result.warnings.length > 0) {
    results.warnings.push(...result.warnings);
  }

  if (result.errors.length > 0) {
    results.errors.push(...result.errors);
  }

  // Log summary
  console.log(
    `Bulk delete completed: ${result.deletedCount} deleted, ${result.warnings.length} warnings`,
  );
} catch (calendarError) {
  console.error("Calendar sync failed during bulk update:", calendarError);
  results.warnings.push("Some calendar events may not have been updated");
  // Don't fail the entire operation
}
```

---

## Important Constraints

### 1. Always Update Tasks First, Calendar Second

```typescript
// ✅ CORRECT ORDER
// 1. Update task in database
const { error: updateError } = await supabase
  .from('tasks')
  .update(newTaskData)
  .eq('id', taskId);

// 2. Then handle calendar operations (can be async/background)
const calendarOperations = determineCalendarOperations(...);
processCalendarOperations(calendarOperations); // Fire and forget
```

**Why:** Task updates must be atomic and fast. Calendar operations can fail or be slow.

### 2. Calendar Event Deletion Considerations

**When Task Status = 'done':**

```typescript
// Edge Case 1: Task marked as done - remove from calendar
if (
  newTaskData.status === "done" &&
  existingTask.status !== "done" &&
  hasCalendarEvents
) {
  operations.push({
    type: "delete_events",
    data: {
      events: existingTask.task_calendar_events,
      reason: "task_completed",
    },
  });
  return operations; // No further calendar operations needed
}
```

**When start_date Cleared:**

```typescript
// Edge Case 3: Date cleared - remove from calendar
const isDateCleared =
  (newTaskData.start_date === null ||
    newTaskData.start_date === "" ||
    newTaskData.start_date === undefined) &&
  existingTask.start_date;

if (isDateCleared && hasCalendarEvents) {
  operations.push({
    type: "delete_events",
    data: {
      events: existingTask.task_calendar_events,
      reason: "date_cleared",
    },
  });
  return operations; // No further calendar operations needed
}
```

**When Task Deleted:**

```typescript
// In DELETE handler
if (task.task_calendar_events?.length > 0) {
  const calendarResults = await handleCalendarEventDeletion(
    task.task_calendar_events,
    user.id,
    supabase,
    taskId,
    projectId,
  );
  warnings.push(...calendarResults.warnings);
  errors.push(...calendarResults.errors);
}
```

### 3. Recurrence Pattern Changes

**ALWAYS delete and recreate** when recurrence changes:

```typescript
if (recurrenceChanged) {
  // Step 1: Delete old events
  operations.push({
    type: "delete_events",
    data: {
      events: existingTask.task_calendar_events,
      reason: "recurrence_changed",
    },
  });

  // Step 2: Create new event with new recurrence
  operations.push({
    type: "schedule_task",
    data: {
      /* ... new recurrence settings ... */
    },
  });
}
```

**Why:** Google Calendar requires recreating events to change RRULE properly.

### 4. 404 Errors Are Expected

```typescript
// Calendar event might already be deleted
if (error.code === 404 || error.message?.includes("404")) {
  // Still mark as deleted in database
  await supabase
    .from("task_calendar_events")
    .update({
      sync_status: "deleted",
      sync_error: "Event not found in calendar",
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", event.id);

  // Return success for idempotency
  return { success: true, eventId: event.calendar_event_id };
}
```

### 5. No Database Triggers or RLS Impact

**Finding:** No database triggers found for `task_calendar_events`

**Implication:** Calendar event lifecycle is **entirely managed in application code**, specifically:

- CalendarService methods
- API endpoint handlers
- No automatic cleanup via triggers

**Therefore:**

- Must explicitly handle all deletions
- Must explicitly update sync_status
- Must explicitly track sync_source

### 6. Batch Size Recommendations

```typescript
// Recommended batch sizes
const BATCH_SIZE = {
  delete: 5, // Conservative for deletion (avoid rate limits)
  update: 5, // Conservative for updates
  create: 10, // Can be more aggressive for creation
};

// Usage
await calendarService.bulkDeleteCalendarEvents(userId, events, {
  batchSize: BATCH_SIZE.delete,
});
```

---

## Key Takeaways for Bulk Operations

### DO:

✅ Use `CalendarService.bulkDeleteCalendarEvents()` for multiple deletions
✅ Set appropriate `batchSize` (5 for deletes/updates, 10 for creates)
✅ Include `reason` parameter for analytics/debugging
✅ Handle partial failures gracefully (collect warnings)
✅ Let CalendarService manage database updates
✅ Check for `hasCalendarEvents` before processing
✅ Delete calendar events when task status → 'done'
✅ Delete calendar events when start_date → null
✅ Delete + recreate when recurrence pattern changes
✅ Handle 404 errors gracefully (idempotent)
✅ Use fire-and-forget for background operations
✅ Await for single operations that need immediate consistency

### DON'T:

❌ Make individual API calls in a loop
❌ Update task_calendar_events directly (use CalendarService)
❌ Block task updates waiting for calendar operations
❌ Fail entire operation if calendar sync fails
❌ Ignore sync_status and sync_source fields
❌ Try to update Google Calendar events when recurrence changes (delete + create instead)
❌ Assume calendar events exist (always check)
❌ Skip error handling for partial failures

---

## Code Examples

### Example: Bulk Status Change to 'done'

```typescript
// In batch update endpoint
const tasksToComplete = updates.filter((u) => u.data.status === "done");

// 1. Update tasks first
const updatePromises = tasksToComplete.map(async ({ id, data }) => {
  const { data: existingTask } = await supabase
    .from("tasks")
    .select("task_calendar_events(*)")
    .eq("id", id)
    .single();

  await supabase
    .from("tasks")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  return existingTask;
});

const existingTasks = await Promise.all(updatePromises);

// 2. Collect calendar events to delete
const eventsToDelete = existingTasks
  .filter((task) => task?.task_calendar_events?.length > 0)
  .flatMap((task) =>
    task.task_calendar_events.map((e) => ({
      id: e.id,
      calendar_event_id: e.calendar_event_id,
      calendar_id: e.calendar_id || "primary",
    })),
  );

// 3. Bulk delete calendar events (fire and forget)
if (eventsToDelete.length > 0) {
  const calendarService = new CalendarService(supabase);
  calendarService
    .bulkDeleteCalendarEvents(user.id, eventsToDelete, {
      batchSize: 5,
      reason: "bulk_completion",
    })
    .then((result) => {
      console.log(
        `Bulk completion: ${result.deletedCount} calendar events removed`,
      );
    })
    .catch((error) => {
      console.error("Calendar cleanup failed:", error);
    });
}

// 4. Return immediately
return ApiResponse.success({
  successful: tasksToComplete.length,
  calendarSync: { status: "processing" },
});
```

### Example: Bulk start_date Removal

```typescript
// In batch update endpoint
const tasksWithClearedDates = updates.filter(
  (u) => u.data.start_date === null && existingTaskHasDate(u.id),
);

// Track calendar events to delete
const calendarDeletions = [];

for (const { id } of tasksWithClearedDates) {
  const { data: task } = await supabase
    .from("tasks")
    .select("task_calendar_events(*)")
    .eq("id", id)
    .single();

  if (task?.task_calendar_events?.length > 0) {
    calendarDeletions.push(
      ...task.task_calendar_events.map((e) => ({
        id: e.id,
        calendar_event_id: e.calendar_event_id,
        calendar_id: e.calendar_id || "primary",
      })),
    );
  }
}

// Bulk delete
if (calendarDeletions.length > 0) {
  const deleteResult = await calendarService.bulkDeleteCalendarEvents(
    user.id,
    calendarDeletions,
    { batchSize: 5, reason: "date_cleared" },
  );

  return ApiResponse.success({
    deletedEvents: deleteResult.deletedCount,
    warnings: deleteResult.warnings,
  });
}
```

---

## Related Documentation

- **Calendar Service Flow**: `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md`
- **Calendar Service Implementation**: `/apps/web/src/lib/services/calendar-service.ts`
- **Task Update Endpoint**: `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`
- **Batch Update Endpoint**: `/apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts`
- **Database Schema**: `/packages/shared-types/src/database.schema.ts`

---

## Conclusion

The `task_calendar_events` lifecycle is entirely managed through the `CalendarService` class, which handles both Google Calendar API operations and database updates atomically.

**Critical Pattern for Bulk Operations:**

1. Update tasks in database first
2. Collect calendar events that need changes
3. Use `bulkDeleteCalendarEvents()` or `bulkUpdateCalendarEvents()`
4. Handle partial failures gracefully
5. Return immediately (fire-and-forget for calendar ops)

**Special Cases Requiring Calendar Deletion:**

- Task status → 'done'
- Task start_date → null
- Task deleted
- Task recurrence pattern changed (delete + recreate)

**Always use CalendarService methods** - never update `task_calendar_events` directly, as the service handles sync tracking, error states, and Google Calendar API consistency.
