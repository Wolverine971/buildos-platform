---
date: 2025-09-07T21:10:34-04:00
researcher: Claude
git_commit: c5a3a561ce2c5969333f164a63adb92e7b4ffa28
branch: main
repository: build_os
topic: 'Braindump Task Updates and Google Calendar Event Synchronization'
tags: [research, codebase, braindump, calendar-sync, task-calendar-events]
status: complete
last_updated: 2025-09-07
last_updated_by: Claude
---

# Research: Braindump Task Updates and Google Calendar Event Synchronization

**Date**: 2025-09-07T21:10:34-04:00
**Researcher**: Claude
**Git Commit**: c5a3a561ce2c5969333f164a63adb92e7b4ffa28
**Branch**: main
**Repository**: build_os

## Research Question

In the braindump flow when tasks get updated, need to check if the updated task has any Google Calendar events attached via task_calendar_events and update them accordingly using the calendar-service.

## Summary

The braindump flow currently creates and schedules tasks intelligently using `TaskTimeSlotFinder` but **does not sync tasks to Google Calendar**. While the main task update API (`/api/projects/[id]/tasks/[taskId]`) has comprehensive calendar synchronization, the braindump operations executor lacks this integration. The solution requires adding calendar sync to the braindump flow's task creation and update operations.

## Critical Gap Identified

**Current State**: Tasks created/updated through braindump flow are NOT synced to Google Calendar
**Required State**: Tasks should sync to calendar when created/updated via braindump

## Detailed Findings

### Task Calendar Events Table Structure

The `task_calendar_events` table (`src/lib/database.types.ts:2753-2789`) links tasks to Google Calendar events:

**Key Fields**:

- `task_id`: Foreign key to tasks table
- `calendar_event_id`: Google Calendar event ID
- `calendar_id`: Calendar ID (default 'primary')
- `sync_status`: Tracks sync state ('synced', 'error', 'deleted', 'pending')
- `sync_source`: Prevents sync loops ('app', 'google')
- `is_master_event`: Identifies recurring series master
- `recurrence_rule`: RRULE for recurring events
- `is_exception`: Marks recurring event exceptions

### Braindump Flow Architecture

**Primary Files**:

- `src/lib/utils/brain-dump-processor.ts` - Core processing with TaskTimeSlotFinder integration
- `src/lib/utils/operations/operations-executor.ts` - Executes task operations (lines 340-365)
- `src/routes/api/braindumps/generate/+server.ts` - Main processing endpoint

**Current Task Creation Flow**:

1. Brain dump content is parsed into operations
2. `TaskTimeSlotFinder` schedules tasks intelligently (lines 904-964 in processor)
3. `OperationsExecutor.handleCreateOperation()` creates tasks (lines 340-365)
4. **Missing**: No calendar sync happens after task creation

### Calendar Service Typed Implementation

**Service Location**: `src/lib/services/calendar-service.ts`

**Key Methods for Task Updates**:

- `scheduleTask()` - Creates new calendar events for tasks
- `updateCalendarEvent()` - Updates existing events (lines 619-790)
- `bulkUpdateCalendarEvents()` - Batch updates (lines 1119-1195)

**Update Capabilities**:

- Single instance updates for recurring events
- Full series updates
- Future instances updates
- Exception handling for recurring events

### Existing Calendar Sync Pattern

The main task update API (`src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`) demonstrates the correct pattern:

```typescript
// 1. Query task with calendar events
const { data: existingTask } = await supabase
	.from('tasks')
	.select(`*, task_calendar_events(*)`)
	.eq('id', taskId)
	.single();

// 2. Update task
const { data: updatedTask } = await supabase.from('tasks').update(taskUpdate).eq('id', taskId);

// 3. Determine calendar operations
const operations = await determineCalendarOperations(existingTask, updates);

// 4. Process calendar sync asynchronously
if (operations.update_events) {
	for (const event of existingTask.task_calendar_events) {
		await calendarService.updateCalendarEvent(userId, {
			event_id: event.calendar_event_id,
			calendar_id: event.calendar_id,
			start_time: newStartDate,
			end_time: newEndTime,
			summary: newTitle,
			description: newDescription
		});
	}
}
```

## Code References

### Braindump Task Operations

- `src/lib/utils/operations/operations-executor.ts:340-365` - Task creation without calendar sync
- `src/lib/utils/operations/operations-executor.ts:370-415` - Task updates without calendar sync
- `src/lib/utils/brain-dump-processor.ts:904-964` - TaskTimeSlotFinder integration

### Calendar Service Methods

- `src/lib/services/calendar-service.ts:619-790` - updateCalendarEvent method
- `src/lib/services/calendar-service.ts:256-273` - markAppInitiatedChange for sync tracking
- `src/lib/api/calendar-client.ts:153-167` - Client-side wrapper with error handling

### Working Examples

- `src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:654-679` - Proper calendar sync pattern
- `src/routes/api/tasks/[id]/recurrence/+server.ts` - Recurring task calendar updates
- `src/lib/services/calendar-webhook-service.ts` - Bidirectional sync implementation

## Implementation Requirements

### For Task Creation in Braindump

1. **Import CalendarService** in `operations-executor.ts`
2. **After task creation** (line 365), add:
    ```typescript
    // Check if user has calendar connected
    if (userId && hasCalendarConnection) {
    	const calendarService = new CalendarService(supabase);
    	await calendarService.scheduleTask(userId, createdTask.id, createdTask, 'primary');
    }
    ```

### For Task Updates in Braindump

1. **Query existing task with calendar events** before update:

    ```typescript
    const { data: existingTask } = await supabase
    	.from('tasks')
    	.select('*, task_calendar_events(*)')
    	.eq('id', taskId)
    	.single();
    ```

2. **After task update** (line 415), add calendar sync:
    ```typescript
    if (existingTask?.task_calendar_events?.length > 0) {
    	for (const event of existingTask.task_calendar_events) {
    		if (event.sync_status !== 'deleted') {
    			await calendarService.updateCalendarEvent(userId, {
    				event_id: event.calendar_event_id,
    				calendar_id: event.calendar_id,
    				start_time: updates.start_date,
    				end_time: calculateEndTime(updates.start_date, updates.duration_minutes),
    				summary: updates.name,
    				description: updates.description
    			});
    		}
    	}
    }
    ```

### Additional Considerations

1. **User Calendar Connection Check**: Verify user has Google Calendar connected before attempting sync
2. **Asynchronous Processing**: Consider making calendar sync non-blocking for better UX
3. **Error Handling**: Calendar sync failures shouldn't block task operations
4. **Recurrence Support**: Handle recurring tasks appropriately
5. **Sync Status Tracking**: Update `task_calendar_events` table with sync metadata

## Architecture Insights

1. **Separation of Concerns**: Calendar sync is handled separately from task operations for resilience
2. **Bidirectional Sync**: System supports both app-to-calendar and calendar-to-app updates
3. **Performance Optimization**: Calendar operations run asynchronously to avoid blocking UI
4. **Error Resilience**: Task operations succeed even if calendar sync fails
5. **Intelligent Scheduling**: TaskTimeSlotFinder ensures tasks are scheduled during working hours

## Open Questions

1. Should calendar sync in braindump be synchronous or asynchronous?
2. How should recurring task patterns be handled when created via braindump?
3. Should failed calendar syncs be retried automatically?
4. What UI feedback should users receive about calendar sync status during braindump?
