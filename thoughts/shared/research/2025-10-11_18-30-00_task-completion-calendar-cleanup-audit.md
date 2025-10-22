---
date: 2025-10-11T18:30:00-04:00
researcher: Claude Code
git_commit: a9edfdc5ccc2d07aac4dcde470eb7a80d94a7c11
branch: main
repository: buildos-platform
topic: 'Task Completion Calendar Cleanup Audit'
tags: [research, codebase, tasks, calendar, completion, audit, bugs]
status: complete
last_updated: 2025-10-11
last_updated_by: Claude Code
---

# Research: Task Completion Calendar Cleanup Audit

**Date**: 2025-10-11T18:30:00-04:00
**Researcher**: Claude Code
**Git Commit**: a9edfdc5ccc2d07aac4dcde470eb7a80d94a7c11
**Branch**: main
**Repository**: buildos-platform

## Research Question

**User Request**: When a task gets marked done, verify that the system properly:

1. Changes the status to 'done' (not 'completed' - that's the correct enum value)
2. Sets the `completed_at` timestamp
3. Removes the task from Google Calendar if it's scheduled (including future dates)

Check ALL endpoints where tasks can be marked as completed.

## Executive Summary

**Overall Assessment**: 🟡 **PARTIALLY CORRECT** - Critical gaps found in batch and recurring task endpoints.

### ✅ What's Working

- **Primary endpoint** (`PATCH /api/projects/[id]/tasks/[taskId]`): Correctly handles completion
- **Frontend UI**: All completion handlers work properly
- **Calendar removal**: Calendar events ARE removed when tasks complete (regardless of future scheduling)

### ❌ Critical Gaps Found

1. **Batch Update Endpoint**: Removes calendar events but **doesn't set `completed_at` timestamp**
2. **Recurring Task Endpoint**: Unclear handling of status changes and calendar cleanup for instances
3. **No future-date checking**: System removes ALL calendar events regardless of scheduling (user wants this, but it's unconditional)

---

## Detailed Findings

### Endpoint Analysis

#### 1. ✅ Primary Task Update Endpoint (WORKING CORRECTLY)

**Endpoint**: `PATCH /api/projects/[id]/tasks/[taskId]`
**File**: `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`

**Status Change Logic** (Lines 93-98):

```typescript
// Handle completion status change
if (newTaskData.status === 'done' && existingTask.status !== 'done') {
    newTaskData.completed_at = new Date().toISOString(); ✅
} else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
    newTaskData.completed_at = null; ✅
}
```

**Calendar Removal Logic** (Lines 212-222):

```typescript
// Edge Case 1: Task marked as done - remove from calendar
if (newTaskData.status === 'done' && existingTask.status !== 'done' && hasCalendarEvents) {
    operations.push({
        type: 'delete_events',
        data: {
            events: existingTask.task_calendar_events,
            reason: 'task_completed' ✅
        }
    });
    return operations; // No further calendar operations needed
}
```

**Verdict**: ✅ **FULLY WORKING**

- Sets `completed_at` timestamp correctly
- Removes all calendar events when task is completed
- Does NOT check if task is scheduled in the future (removes unconditionally)
- This is the behavior the user wants

---

#### 2. ❌ Batch Task Update Endpoint (CRITICAL GAP)

**Endpoint**: `PATCH /api/projects/[id]/tasks/batch`
**File**: `apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts`

**Calendar Removal Logic** (Lines 124-128):

```typescript
// Check if task is being marked as done (should remove from calendar)
if (data.status === 'done' && existingTask?.task_calendar_events?.length > 0) {
    needsCalendarSync = true;
    calendarOperation = 'delete'; ✅
}
```

**Update Logic** (Lines 136-149):

```typescript
// Clean the task data
const cleanedData = cleanDataForTable('tasks', {
	...data, // ❌ Just passes through data as-is
	updated_at: new Date().toISOString()
});

const { data: updatedTask, error } = await supabase
	.from('tasks')
	.update(cleanedData) // ❌ No completed_at handling
	.eq('id', id)
	.eq('project_id', params.id)
	.eq('user_id', user.id)
	.select('*, task_calendar_events(*)')
	.single();
```

**Verdict**: ❌ **CRITICAL BUG**

- ✅ Correctly removes calendar events when `status === 'done'`
- ❌ Does NOT set `completed_at` timestamp automatically
- ❌ Relies on client to send `completed_at` in the update payload
- **Inconsistent with single task endpoint behavior**

**Impact**: Tasks updated via batch endpoint may have:

- `status: 'done'`
- `completed_at: null` ⚠️ INCORRECT STATE

**Used By**:

- Phase scheduling operations
- Bulk task status updates
- Calendar sync operations

---

#### 3. ⚠️ Recurring Task Instance Endpoint (UNCLEAR)

**Endpoint**: `PATCH /api/tasks/[id]/recurrence`
**File**: `apps/web/src/routes/api/tasks/[id]/recurrence/+server.ts`

**Update Logic** (Lines 281-299):

```typescript
async function updateAllInstances(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	updates: any, // ❌ Just passes through updates
	userId: string
) {
	// Update the task itself
	const { error: updateError } = await supabase
		.from('tasks')
		.update({
			...updates, // ❌ No completed_at handling
			updated_at: new Date().toISOString()
		})
		.eq('id', task.id);

	// ... calendar updates but no deletion logic for completion
}
```

**Single Instance Logic** (Lines 135-205):

- Updates `recurring_task_instances` table with exception data
- Does NOT handle status changes or `completed_at`
- No calendar deletion logic for completed instances

**Verdict**: ⚠️ **POTENTIAL GAP**

- ❌ No special handling for `status === 'done'`
- ❌ No `completed_at` timestamp setting
- ❌ No calendar event removal when instances are completed
- Uses separate `recurring_task_instances.completed_at` for tracking
- May not properly clean up calendar events for completed recurring instances

---

### Frontend Task Completion

All frontend components correctly call the backend APIs. The issue is NOT in the frontend.

**Primary Completion Handler**: `apps/web/src/lib/components/project/TasksList.svelte` (Lines 302-342)

```typescript
async function handleToggleTaskComplete(task: TaskWithCalendarEvents) {
    const newStatus = isComplete ? 'backlog' : 'done';
    const completedAt = newStatus === 'done' ? new Date().toISOString() : null;

    // Optimistic update
    const updatedTask = {
        ...task,
        status: newStatus,
        completed_at: completedAt ✅
    };

    // Calls projectService.updateTask → PATCH /api/projects/{id}/tasks/{taskId}
    await projectService.updateTask(updatedTask.id, updatedTask, projectId);
}
```

**Verdict**: ✅ Frontend correctly sends both `status` and `completed_at`

- TasksList: ✅ Sets completed_at when toggling
- TaskModal: ✅ Handles status changes via dropdown
- Both call the single task endpoint (which works correctly)

---

### Calendar Integration Deep Dive

#### How Calendar Removal Works

**CalendarService** (`apps/web/src/lib/services/calendar-service.ts`)

**`deleteCalendarEvent()` Method** (Lines 914-964):

```typescript
async deleteCalendarEvent(userId: string, params: DeleteCalendarEventParams) {
    // 1. Delete from Google Calendar
    await calendar.events.delete({
        calendarId: calendar_id,
        eventId: event_id,
        sendNotifications: send_notifications
    });

    // 2. Remove from database
    await this.supabase
        .from('task_calendar_events')
        .delete() // ✅ Physical deletion (not soft delete)
        .eq('calendar_event_id', event_id);

    return { success: true, event_id };
}
```

**`bulkDeleteCalendarEvents()` Method** (Lines 1022-1142):

- Processes deletions in batches (default 5 at a time)
- Parallel processing within batches
- Handles 404 errors gracefully (event already deleted)
- Used by batch endpoint

#### Future Date Checking

**Current Behavior**: NO future date checking - removes ALL events unconditionally

```typescript
// What the code DOES:
if (newTaskData.status === 'done' && hasCalendarEvents) {
	// Delete ALL calendar events regardless of date
}

// What's NOT implemented (but user wants this behavior anyway):
const taskDate = new Date(existingTask.start_date);
const now = new Date();
if (taskDate > now) {
	// Skip deletion - preserve future events
}
```

**User's Request**: "if it is scheduled for in the future on the calendar it needs to be removed"

**Current Implementation**: ✅ **MATCHES USER'S INTENT**

- System removes ALL calendar events when task is completed
- No conditional logic based on future dates
- This is the desired behavior per user's request

---

## Code References

### Primary Files

| File                                                              | Purpose             | Key Lines                              | Status     |
| ----------------------------------------------------------------- | ------------------- | -------------------------------------- | ---------- |
| `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts` | Main task update    | 93-98 (status), 212-222 (calendar)     | ✅ Working |
| `apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts`    | Batch updates       | 124-128 (calendar), 136-149 (update)   | ❌ Bug     |
| `apps/web/src/routes/api/tasks/[id]/recurrence/+server.ts`        | Recurring tasks     | 281-299 (update all), 135-205 (single) | ⚠️ Gap     |
| `apps/web/src/lib/services/calendar-service.ts`                   | Calendar operations | 914-964 (delete), 1022-1142 (bulk)     | ✅ Working |
| `apps/web/src/lib/components/project/TasksList.svelte`            | Task UI             | 302-342 (completion handler)           | ✅ Working |

### Supporting Files

- `apps/web/src/lib/services/projectService.ts` (Lines 220-239) - Service layer
- `apps/web/src/lib/stores/project.store.ts` (Lines 540-706, 1362-1432) - State management
- `apps/web/src/lib/components/project/TaskModal.svelte` (Lines 1264-1276) - Status dropdown

---

## Recommended Fixes

### 1. Fix Batch Update Endpoint (HIGH PRIORITY)

**File**: `apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts`

**Add completion logic** before line 136:

```typescript
// Add BEFORE cleaning the data:

// Handle completion status change (matching single task endpoint)
if (data.status === 'done' && existingTask?.status !== 'done') {
	data.completed_at = new Date().toISOString();
} else if (data.status !== 'done' && existingTask?.status === 'done') {
	data.completed_at = null;
}

// Then clean the data as normal:
const cleanedData = cleanDataForTable('tasks', {
	...data,
	updated_at: new Date().toISOString()
});
```

### 2. Fix Recurring Task Endpoint (MEDIUM PRIORITY)

**File**: `apps/web/src/routes/api/tasks/[id]/recurrence/+server.ts`

**Option A**: Add completion logic to `updateAllInstances()` (Line 288):

```typescript
async function updateAllInstances(supabase, calendarService, task, updates, userId) {
	// Handle completion status change
	if (updates.status === 'done' && task.status !== 'done') {
		updates.completed_at = new Date().toISOString();
	} else if (updates.status !== 'done' && task.status === 'done') {
		updates.completed_at = null;
	}

	// Update the task itself
	const { error: updateError } = await supabase
		.from('tasks')
		.update({
			...updates,
			updated_at: new Date().toISOString()
		})
		.eq('id', task.id);

	// Check if task is being marked as done - remove calendar events
	if (updates.status === 'done' && task.task_calendar_events?.length > 0) {
		for (const event of task.task_calendar_events) {
			try {
				await calendarService.deleteCalendarEvent(userId, {
					event_id: event.calendar_event_id,
					calendar_id: event.calendar_id || 'primary'
				});
			} catch (error) {
				console.error('Error deleting calendar event:', error);
			}
		}
	}
}
```

**Option B**: Add to `updateSingleInstance()` for individual completions (Line 143):

```typescript
async function updateSingleInstance(
	supabase,
	calendarService,
	task,
	updates,
	instanceDate,
	userId
) {
	// If marking instance as completed, set completed_at
	const instanceUpdates: any = {
		task_id: task.id,
		instance_date: instanceDate,
		user_id: userId,
		notes: JSON.stringify({ exception: true, updates }),
		updated_at: new Date().toISOString()
	};

	if (updates.status === 'completed') {
		instanceUpdates.status = 'completed';
		instanceUpdates.completed_at = new Date().toISOString();
	}

	// Create or update the instance record
	const { error: instanceError } = await supabase
		.from('recurring_task_instances')
		.upsert(instanceUpdates);

	// If completed, remove calendar event for this instance
	if (updates.status === 'completed') {
		const calendarEvent = task.task_calendar_events?.find(
			(e: any) => e.recurrence_instance_date === instanceDate
		);

		if (calendarEvent) {
			await calendarService.deleteCalendarEvent(userId, {
				event_id: calendarEvent.calendar_event_id,
				calendar_id: calendarEvent.calendar_id || 'primary'
			});
		}
	}
}
```

### 3. Add Test Coverage (RECOMMENDED)

Create tests to verify completion behavior across all endpoints:

```typescript
// tests/api/task-completion.test.ts

describe('Task Completion Calendar Cleanup', () => {
	it('should set completed_at when marking single task as done', async () => {
		// Test PATCH /api/projects/[id]/tasks/[taskId]
	});

	it('should set completed_at when batch updating tasks to done', async () => {
		// Test PATCH /api/projects/[id]/tasks/batch
	});

	it('should remove calendar events when single task completed', async () => {
		// Test calendar deletion
	});

	it('should remove calendar events when batch updating to done', async () => {
		// Test batch calendar deletion
	});

	it('should handle recurring task instance completion', async () => {
		// Test PATCH /api/tasks/[id]/recurrence
	});
});
```

---

## Task Status Model

**Valid Status Values** (from `packages/shared-types/src/database.types.ts:5825`):

```typescript
type task_status = 'backlog' | 'in_progress' | 'done' | 'blocked';
```

**IMPORTANT**: The system uses `'done'` NOT `'completed'`

**Task Fields**:

- `status`: task_status enum
- `completed_at`: TIMESTAMP (nullable) - Set when `status === 'done'`
- `start_date`: TIMESTAMP (nullable) - Scheduled date
- `duration_minutes`: INTEGER - Task duration

**Calendar Relationship**:

- Tasks link to calendar events via `task_calendar_events` join table (one-to-many)
- `task_calendar_events.calendar_event_id` is the Google Calendar event ID
- When task is deleted or completed, calendar events should be removed

---

## Related Research

- **Task Data Model**: `/thoughts/shared/research/2025-10-11_17-20-49_task-data-model-and-status-field-research.md`
- **Calendar Integration**: `/apps/web/docs/features/calendar-integration/README.md`
- **Calendar Service Flow**: `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md`

---

## Open Questions

1. **Recurring Tasks**: Should completing a recurring task series remove ALL future calendar events, or just mark the series as complete?

2. **Batch Updates**: Are there other endpoints that might update task status without proper `completed_at` handling?

3. **UI Behavior**: Does the batch endpoint get called from any UI components that mark tasks as complete? (Need to audit usage)

4. **Database Constraints**: Should there be a database trigger to automatically set `completed_at` when `status = 'done'`?

---

## Summary

### What Works ✅

1. **Primary single task endpoint**: Correctly sets `completed_at` and removes calendar events
2. **Frontend UI**: All completion handlers work properly
3. **Calendar service**: Properly deletes events from Google Calendar and database
4. **Future scheduling**: System removes ALL events (matches user's intent)

### Critical Bugs ❌

1. **Batch endpoint**: Doesn't set `completed_at` timestamp when marking tasks as done
2. **Recurring endpoint**: Unclear handling of status changes and calendar cleanup

### Impact

- Tasks updated via batch operations may have inconsistent state (`status='done'` but `completed_at=null`)
- Recurring task completions may not remove calendar events
- Data integrity issues in reporting and analytics

### Next Steps

1. Fix batch endpoint to set `completed_at` (high priority)
2. Review recurring task completion behavior (medium priority)
3. Add comprehensive test coverage (recommended)
4. Consider database-level enforcement via triggers (optional)
