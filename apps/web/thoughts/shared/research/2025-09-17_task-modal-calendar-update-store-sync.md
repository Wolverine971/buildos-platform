---
date: 2025-09-17T10:30:00-08:00
researcher: Claude Code
git_commit: d02731b
branch: main
repository: build_os
topic: 'Task Modal Calendar Update Store Synchronization Issue'
tags: [research, codebase, task-modal, calendar-integration, project-store, filter-groups]
status: complete
last_updated: 2025-09-17
last_updated_by: Claude Code
---

# Research: Task Modal Calendar Update Store Synchronization Issue

**Date**: 2025-09-17T10:30:00-08:00
**Researcher**: Claude Code
**Git Commit**: d02731b
**Branch**: main
**Repository**: build_os

## Research Question

In the projects/[slug]/+page.svelte page, when a task is updated via the task modal and added to the user's calendar, it needs to be properly updated in the store and appear in the correct filter group.

## Summary

The issue stems from a timing gap in the calendar synchronization flow. When a task is added to the calendar via the TaskModal, the API returns immediately with an empty `task_calendar_events` array because calendar operations run asynchronously in the background. This causes the task to not appear in the "Scheduled" filter group until a page refresh, as the store is updated with incomplete data.

## Detailed Findings

### Task Update Flow Architecture

The task update flow follows this sequence:

1. **TaskModal Submit** (`src/lib/components/project/TaskModal.svelte:513-558`)
    - Collects form data and calls parent's `onUpdate` callback
    - Closes immediately after triggering update

2. **ProjectModals Handler** (`src/lib/components/project/ProjectModals.svelte:186-199`)
    - Delegates to project page's `handleTaskUpdated`

3. **Project Page Handler** (`src/routes/projects/[slug]/+page.svelte:196-206`)
    - Calls `dataService.updateTask()` for optimistic update
    - Shows success toast

4. **Store Update** (`src/lib/stores/project.store.ts:425-584`)
    - `optimisticUpdateTask` immediately updates both main tasks array and phase tasks
    - Triggers derived store recalculation
    - Updates stats

### Calendar Integration Gap

**The Core Problem** (`src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:149-181`):

```typescript
// Lines 149-154: Calendar operations run in background
Promise.allSettled(calendarPromises).then(async (results) => {
	// Calendar events are created here
});

// Lines 157-181: Task data returned immediately
const { data: finalTask } = await supabase
	.from('tasks')
	.select(`*, task_calendar_events(*)`)
	.eq('id', taskId)
	.single();

return ApiResponse.success({
	task: finalTask, // Has empty task_calendar_events
	calendarSync: { status: 'processing' }
});
```

**Impact**: The task is updated in the store with empty `task_calendar_events`, so it doesn't appear as "scheduled".

### Task Categorization Logic

Tasks are categorized into filter groups based on these rules (`src/lib/components/project/TasksList.svelte:92-133`):

- **Scheduled**: Has `task_calendar_events` with `sync_status` = 'synced' OR 'pending'
- **Active**: No calendar events, not deleted, not done
- **Overdue**: `start_date` < now, not done
- **Completed**: `status` = 'done'
- **Deleted**: Has `deleted_at`
- **Recurring**: `task_type` = 'recurring'

The derived stores in projectStoreV2 (`src/lib/stores/project.store.ts:1273-1283`) use the same logic and are properly reactive.

### Filter System Inconsistencies

1. **Recurring Task Support Gap**:
    - `TasksList.svelte` fully supports 'recurring' filter
    - `PhaseCard.svelte` and `TaskItem.svelte` don't check for recurring type
    - Default global filters exclude 'recurring' tasks

2. **Component Type Definitions**:
    - TasksList: `'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring'`
    - PhaseCard: `'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue'` (missing 'recurring')

## Code References

- `src/routes/projects/[slug]/+page.svelte:196-206` - handleTaskUpdated function
- `src/routes/projects/[slug]/+page.svelte:220-247` - handleAddTaskToCalendar function
- `src/lib/components/project/TaskModal.svelte:513-558` - Modal submit handler
- `src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:149-181` - API calendar sync gap
- `src/lib/stores/project.store.ts:425-584` - optimisticUpdateTask implementation
- `src/lib/services/calendar.service.ts:577-595` - Calendar event creation
- `src/lib/components/project/TasksList.svelte:92-133` - Task type categorization
- `src/lib/components/phases/PhaseCard.svelte:173-188` - Phase task filtering

## Architecture Insights

1. **Optimistic Updates Work Correctly**: The projectStoreV2's optimistic update system properly updates both main tasks array and phase-specific tasks, triggering derived store recalculation.

2. **Reactivity Chain is Sound**: Svelte's reactivity ensures derived stores update when the main store changes.

3. **Background Processing Trade-off**: The API prioritizes non-blocking response over completeness, creating a UX gap.

4. **Missing Refresh Mechanism**: No automatic way to fetch updated task data after calendar operations complete.

## Solutions

### Option 1: Wait for Calendar Operations (Blocking)

Modify the API to await calendar operations before returning:

```typescript
// src/routes/api/projects/[id]/tasks/[taskId]/+server.ts
// Change line 149-154 to:
await Promise.allSettled(calendarPromises);

// Then fetch and return the complete task with calendar events
```

**Pros**: Simple, ensures data completeness
**Cons**: Slower response, blocks UI

### Option 2: Add Task Refresh After Calendar Sync

Add a mechanism to refresh the task after calendar operations:

```typescript
// src/routes/projects/[slug]/+page.svelte
async function handleTaskUpdated(task: Task) {
	await dataService.updateTask(task.id, task);

	// If calendar sync was requested, refresh after delay
	if (task.addTaskToCalendar) {
		setTimeout(async () => {
			await dataService.refreshTask(task.id); // New method needed
		}, 2000);
	}
}
```

**Pros**: Non-blocking, eventual consistency
**Cons**: Requires new refresh method, arbitrary delay

### Option 3: Real-time Subscription for Calendar Events

Use Supabase real-time to listen for task_calendar_events changes:

```typescript
// src/lib/services/realtimeProject.service.ts
// Add subscription to task_calendar_events table
supabase
	.channel(`task-calendar-events:${projectId}`)
	.on(
		'postgres_changes',
		{
			event: 'INSERT',
			schema: 'public',
			table: 'task_calendar_events',
			filter: `task_id=in.(${taskIds})`
		},
		(payload) => {
			// Update the specific task with new calendar events
			projectStoreV2.updateTaskCalendarEvents(payload.new);
		}
	)
	.subscribe();
```

**Pros**: Automatic updates, no polling
**Cons**: More complex, additional real-time channel

### Recommended Solution

**Immediate Fix**: Modify the API endpoint to await calendar operations (Option 1) for tasks being added to calendar individually. This ensures the returned task has complete data.

**Long-term Enhancement**: Implement real-time subscriptions (Option 3) for bulk operations and background sync scenarios.

## Open Questions

1. Should recurring tasks be included in the default global filters?
2. Why do some components (PhaseCard, TaskItem) not support the 'recurring' filter type?
3. Should there be a visual indicator when calendar sync is in progress?
4. Would users prefer faster response with eventual consistency or slower response with immediate accuracy?
