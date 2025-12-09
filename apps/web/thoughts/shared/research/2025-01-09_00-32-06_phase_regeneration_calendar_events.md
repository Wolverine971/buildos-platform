---
date: 2025-01-09T00:32:06-05:00
researcher: Claude
git_commit: 845a3636668b247e25f200e6b8a8aed4f42724ba
branch: main
repository: build_os
topic: 'Phase Regeneration and Task Calendar Events Synchronization'
tags: [research, codebase, phase-generation, calendar-sync, task-calendar-events]
status: complete
last_updated: 2025-01-09
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-01-09_00-32-06_phase_regeneration_calendar_events.md
---

# Research: Phase Regeneration and Task Calendar Events Synchronization

**Date**: 2025-01-09T00:32:06-05:00
**Researcher**: Claude
**Git Commit**: 845a3636668b247e25f200e6b8a8aed4f42724ba
**Branch**: main
**Repository**: build_os

## Research Question

In the phase regeneration flow where tasks are rescheduled into phases, are task_calendar_events properly updated when task start_dates get changed? Need to check phase actions endpoints and ensure they all properly update task_calendar_events when task dates change, noting that not every task has a calendar event associated with it.

## Summary

**Critical Issue Found**: The phase regeneration flow does NOT update task_calendar_events when rescheduling tasks. When tasks are moved between phases or have their dates changed during phase regeneration, the calendar events remain at their original times, causing a desynchronization between the task database and the user's Google Calendar.

## Detailed Findings

### Phase Regeneration Flow Issues

The phase regeneration process has a significant gap in calendar event management:

1. **Direct Database Updates Without Calendar Sync** (`src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts:231-234`):

    ```typescript
    const { error } = await this.supabase
    	.from('tasks')
    	.update({ start_date: startDate })
    	.in('id', taskIds);
    ```

    - Updates task dates directly in database
    - No corresponding calendar event updates
    - No check for existing task_calendar_events

2. **Phase Generation Endpoint** (`src/routes/api/projects/[id]/phases/generate/+server.ts`):
    - Delegates to PhaseGenerationOrchestrator
    - No calendar synchronization logic
    - Returns success without updating calendar events

3. **Batch Task Updates** (`src/routes/api/projects/[id]/tasks/batch/+server.ts`):
    - Updates multiple task properties including dates
    - Missing calendar event synchronization
    - Can change task types (recurring ↔ one_off) without calendar updates

### Properly Implemented Calendar Sync

In contrast, these endpoints handle calendar events correctly:

1. **Individual Task Updates** (`src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`):
    - Sophisticated `determineCalendarOperations()` function
    - Handles all edge cases (completion, date changes, recurrence)
    - Updates calendar events asynchronously

2. **Phase Scheduling** (`src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`):
    - Uses CalendarService for all operations
    - Creates/updates calendar events when scheduling
    - Bulk deletes events when unscheduling

3. **Move Tasks Between Phases** (`src/routes/api/projects/[id]/phases/tasks/+server.ts`):
    - Bulk deletes calendar events when moving tasks
    - Proper error handling and batch processing

## Code References

- `src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts:212-249` - handleTaskDateUpdates method that doesn't sync calendar
- `src/lib/services/phase-generation/strategies/base-strategy.ts` - Base class with no calendar sync logic
- `src/routes/api/projects/[id]/phases/generate/+server.ts:57-59` - Orchestrator execution without calendar sync
- `src/routes/api/projects/[id]/tasks/batch/+server.ts` - Batch updates without calendar management
- `src/lib/services/calendar-service.ts` - Proper calendar service implementation
- `src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:400-600` - Correct calendar sync pattern

## Architecture Insights

### Database-First Pattern

The codebase follows a "database-first, calendar-second" pattern where:

1. Database updates are performed immediately
2. Calendar operations happen asynchronously
3. UI updates reflect database state immediately
4. Calendar sync failures don't block operations

### CalendarService Integration

The `CalendarService` service properly manages both:

- Google Calendar API calls
- `task_calendar_events` table updates
- Error handling and sync status tracking

### Missing Integration Points

Phase generation strategies and batch operations bypass the calendar service entirely, leading to desynchronization.

## Recommended Solution

### 1. Add Calendar Sync to Phase Generation Strategy

```typescript
// In schedule-in-phases.strategy.ts
protected async handleTaskDateUpdates(assignments: PhaseTaskAssignment[]): Promise<void> {
    // ... existing database updates ...

    // Add calendar sync
    const calendarService = new CalendarService(this.supabase);
    const tasksWithCalendarEvents = await this.getTasksWithCalendarEvents(assignments);

    for (const task of tasksWithCalendarEvents) {
        await calendarService.updateCalendarEvent(this.context.userId, {
            task_id: task.task_id,
            new_start_time: task.suggested_start_date,
            // ... other params
        });
    }
}
```

### 2. Add Calendar Sync to Batch Operations

```typescript
// In batch update endpoint
if (dateChanges.length > 0) {
	const calendarOps = await determineCalendarOperations(dateChanges);
	await Promise.allSettled(calendarOps);
}
```

### 3. Create Utility Function for Calendar Sync After Date Changes

```typescript
async function syncCalendarAfterDateChange(
	supabase: SupabaseClient,
	userId: string,
	taskUpdates: Array<{ taskId: string; oldDate: string; newDate: string }>
) {
	const calendarService = new CalendarService(supabase);
	// Check for existing calendar events
	// Update or create as needed
	// Handle errors gracefully
}
```

## Open Questions

1. Should calendar sync be synchronous or asynchronous during phase regeneration?
2. How should the system handle calendar API rate limits during bulk operations?
3. Should users be notified when calendar sync fails during phase regeneration?
4. Should there be a "resync calendar" button for manual recovery?

## Related Research

- Task scheduling patterns and TaskTimeSlotFinder integration
- Calendar webhook bidirectional sync implementation
- Recurring task calendar event management
