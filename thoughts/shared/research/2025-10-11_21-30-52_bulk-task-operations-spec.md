---
date: 2025-10-11T21:30:52Z
researcher: Claude Code
git_commit: a9edfdc5ccc2d07aac4dcde470eb7a80d94a7c11
branch: main
repository: buildos-platform
topic: 'Bulk Task Operations - Multi-Selection and Batch Updates in TasksList.svelte'
tags: [research, spec, tasks, bulk-operations, ui-patterns, calendar-integration]
status: complete
last_updated: 2025-10-11
last_updated_by: Claude Code
---

# Specification: Bulk Task Operations in TasksList Component

**Date**: 2025-10-11T21:30:52Z
**Researcher**: Claude Code
**Git Commit**: a9edfdc5ccc2d07aac4dcde470eb7a80d94a7c11
**Branch**: main
**Repository**: buildos-platform

## Research Question

How to implement Gmail-style multi-selection with bulk task operations in TasksList.svelte, including:

- Checkbox-based selection UI
- Bulk status updates (mark done, change status)
- Bulk priority changes
- Bulk start_date removal
- Proper task_calendar_events handling

---

## Executive Summary

This specification defines a comprehensive bulk task operation system for the TasksList component, enabling users to select multiple tasks and perform batch operations. The implementation leverages:

1. **Existing API**: The `/api/projects/[id]/tasks/batch/` endpoint already supports bulk updates with automatic calendar sync
2. **Proven UI Patterns**: RecipientSelector and Admin Errors page demonstrate checkbox-based multi-selection patterns
3. **Intelligent Calendar Handling**: CalendarService provides bulk methods for calendar event management
4. **Optimistic Updates**: projectStoreV2 supports immediate UI feedback with rollback capability

### Key Capabilities to Implement

- ✅ Multi-selection with checkboxes (Gmail-style)
- ✅ Bulk status changes (backlog, in_progress, done, blocked)
- ✅ Bulk priority changes (low, medium, high)
- ✅ Bulk start_date removal (with calendar cleanup)
- ✅ Bulk deletion (soft delete)
- ✅ Select all / Deselect all within current filter
- ✅ Visual bulk action toolbar

---

## Table of Contents

1. [UI/UX Design](#1-uiux-design)
2. [Selection State Management](#2-selection-state-management)
3. [Bulk Operations](#3-bulk-operations)
4. [API Integration](#4-api-integration)
5. [Calendar Event Handling](#5-calendar-event-handling)
6. [Implementation Plan](#6-implementation-plan)
7. [Edge Cases & Constraints](#7-edge-cases--constraints)
8. [Testing Strategy](#8-testing-strategy)
9. [Code References](#9-code-references)

---

## 1. UI/UX Design

### 1.1 Gmail-Style Checkbox Pattern

Implement checkbox selection pattern similar to Gmail:

```
┌─────────────────────────────────────────────────────────────┐
│ Tasks (12)                                    [+ New Task]   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ [✓] Sort by: Start Date ▼    [↓]                            │
│                                                               │
│ [✓] All (12)  [✓] Active (8)  [ ] Scheduled (3) ...         │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ 5 tasks selected                                             │
│ Status: [Done ▼] Priority: [High ▼] [Remove Dates] [Delete] │
├─────────────────────────────────────────────────────────────┤
│ [ ] ○ Task 1                            [Priority: Medium]   │
│ [✓] ○ Task 2                            [Priority: High]     │  ← Selected
│ [✓] ○ Task 3                            [Priority: Low]      │  ← Selected
│ [ ] ○ Task 4                            [Priority: Medium]   │
│ [✓] ○ Task 5                            [Priority: High]     │  ← Selected
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Component Modifications

**File**: `/apps/web/src/lib/components/project/TasksList.svelte`

#### Add Selection UI Elements

1. **Checkbox Column** (Left side of each task card)
    - Position: Before the task status icon
    - Size: 16px × 16px (h-4 w-4)
    - Styling: Match existing checkbox patterns
    - Behavior: Stop event propagation (don't trigger task edit)

2. **Select All Checkbox** (In header/filter area)
    - Position: In the filter controls section
    - Label: "Select all [N] tasks"
    - Behavior: Selects all tasks in current filter view

3. **Bulk Action Toolbar** (Conditional - appears when items selected)
    - Position: Between filters and task list
    - Background: `bg-blue-50 dark:bg-blue-900/20`
    - Border: `border-blue-200 dark:border-blue-700`
    - Shadow: Subtle elevation
    - Sticky: Fixed position on mobile when scrolling

#### Visual States

**Selected Task Card**:

```svelte
class="bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600"
```

**Bulk Action Toolbar**:

```svelte
{#if selectedTaskIds.size > 0}
	<div
		class="sticky top-0 z-10 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4 shadow-sm"
	>
		<div class="flex items-center justify-between gap-4">
			<span class="text-sm font-medium text-blue-900 dark:text-blue-100">
				{selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''} selected
			</span>

			<div class="flex items-center gap-2 flex-wrap">
				<!-- Status Dropdown -->
				<div class="relative">
					<Button variant="outline" size="sm" icon={Circle}>
						Status: {bulkStatus || 'Change...'} ▼
					</Button>
					{#if showStatusDropdown}
						<!-- Dropdown menu with status options -->
					{/if}
				</div>

				<!-- Priority Dropdown -->
				<div class="relative">
					<Button variant="outline" size="sm" icon={ArrowUp}>
						Priority: {bulkPriority || 'Change...'} ▼
					</Button>
					{#if showPriorityDropdown}
						<!-- Dropdown menu with priority options -->
					{/if}
				</div>

				<!-- Remove Dates -->
				<Button
					onclick={handleBulkRemoveDates}
					variant="outline"
					size="sm"
					icon={CalendarX}
					disabled={bulkActionInProgress}
				>
					Remove Dates
				</Button>

				<!-- Delete -->
				<Button
					onclick={handleBulkDelete}
					variant="outline"
					size="sm"
					icon={Trash2}
					disabled={bulkActionInProgress}
					class="text-red-600 dark:text-red-400"
				>
					Delete
				</Button>

				<!-- Clear Selection -->
				<Button onclick={clearSelection} variant="ghost" size="sm" icon={X}>Clear</Button>
			</div>
		</div>

		{#if bulkActionWarnings.length > 0}
			<div class="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
				⚠️ {bulkActionWarnings.join(', ')}
			</div>
		{/if}
	</div>
{/if}
```

### 1.3 Accessibility

- All checkboxes must have `aria-label` attributes
- Bulk action buttons must have clear labels
- Selected tasks should have `aria-selected="true"`
- Keyboard navigation: Space/Enter to toggle selection
- Screen reader announcements for selection count changes

---

## 2. Selection State Management

### 2.1 Svelte 5 State Pattern

Based on RecipientSelector and Admin Errors patterns:

```javascript
// Selection state (using Set for efficient lookups)
let selectedTaskIds = $state(new Set<string>());
let bulkActionInProgress = $state(false);
let bulkActionWarnings = $state<string[]>([]);

// UI state for dropdowns
let showStatusDropdown = $state(false);
let showPriorityDropdown = $state(false);

// Reactive computed values
let allTasksSelected = $derived(
  filteredTasks.length > 0 &&
  filteredTasks.every(task => selectedTaskIds.has(task.id))
);

let someTasksSelected = $derived(
  selectedTaskIds.size > 0 && !allTasksSelected
);

// Get selected task objects
let selectedTasks = $derived(
  filteredTasks.filter(task => selectedTaskIds.has(task.id))
);
```

### 2.2 Selection Functions

```javascript
/**
 * Toggle individual task selection
 * Stops event propagation to prevent opening task edit modal
 */
function toggleTaskSelection(taskId: string, event: Event) {
  event.stopPropagation();

  if (selectedTaskIds.has(taskId)) {
    selectedTaskIds.delete(taskId);
  } else {
    selectedTaskIds.add(taskId);
  }

  // CRITICAL: Reassign to trigger Svelte 5 reactivity
  selectedTaskIds = new Set(selectedTaskIds);
}

/**
 * Toggle "select all" for current filtered view
 */
function toggleSelectAll() {
  if (allTasksSelected) {
    // Deselect all
    selectedTaskIds = new Set();
  } else {
    // Select all filtered tasks
    selectedTaskIds = new Set(filteredTasks.map(t => t.id));
  }
}

/**
 * Clear all selections
 */
function clearSelection() {
  selectedTaskIds = new Set();
  bulkActionWarnings = [];
}

/**
 * Remove deleted/completed tasks from selection
 * Call after bulk operations complete
 */
function cleanupSelection() {
  const validTaskIds = new Set(filteredTasks.map(t => t.id));
  const newSelection = new Set<string>();

  for (const id of selectedTaskIds) {
    if (validTaskIds.has(id)) {
      newSelection.add(id);
    }
  }

  selectedTaskIds = newSelection;
}
```

### 2.3 Reactivity Triggers

**CRITICAL**: Svelte 5 requires explicit reassignment for Set reactivity:

```javascript
// ❌ WRONG - Won't trigger reactivity
selectedTaskIds.add(id);

// ✅ CORRECT - Triggers reactivity
selectedTaskIds.add(id);
selectedTaskIds = new Set(selectedTaskIds);

// OR
selectedTaskIds = selectedTaskIds; // Also works
```

---

## 3. Bulk Operations

### 3.1 Supported Operations

#### 3.1.1 Bulk Status Change

**UI**: Dropdown with status options
**Options**: `backlog`, `in_progress`, `done`, `blocked`
**Special Handling**: Status `done` requires calendar event cleanup

```javascript
async function handleBulkStatusChange(newStatus: 'backlog' | 'in_progress' | 'done' | 'blocked') {
  if (selectedTaskIds.size === 0) return;

  bulkActionInProgress = true;
  bulkActionWarnings = [];

  try {
    const updates = Array.from(selectedTaskIds).map(id => ({
      id,
      data: {
        status: newStatus,
        ...(newStatus === 'done' ? { completed_at: new Date().toISOString() } : {}),
        ...(newStatus !== 'done' && selectedTasks.find(t => t.id === id)?.status === 'done'
          ? { completed_at: null }
          : {}
        )
      }
    }));

    // Optimistic update
    updates.forEach(({ id, data }) => {
      const task = allTasksFromStore.find(t => t.id === id);
      if (task) {
        projectStoreV2.updateTask({ ...task, ...data });
      }
    });

    // Call batch API
    const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });

    const result = await response.json();

    if (result.failed && result.failed.length > 0) {
      // Partial failure - rollback failed tasks
      result.failed.forEach(({ id, error }) => {
        const originalTask = allTasksFromStore.find(t => t.id === id);
        if (originalTask) {
          projectStoreV2.updateTask(originalTask);
        }
        bulkActionWarnings.push(`Failed to update task: ${error}`);
      });
    }

    // Update store with successful results
    result.successful.forEach(task => {
      projectStoreV2.updateTask(task);
    });

    toastService.success(
      `${result.summary.successful} task${result.summary.successful > 1 ? 's' : ''} updated`
    );

    // Clear selection
    clearSelection();

  } catch (error) {
    console.error('Bulk status change failed:', error);
    toastService.error('Failed to update tasks');

    // Rollback all
    allTasksFromStore.forEach(task => {
      projectStoreV2.updateTask(task);
    });
  } finally {
    bulkActionInProgress = false;
  }
}
```

#### 3.1.2 Bulk Priority Change

**UI**: Dropdown with priority options
**Options**: `low`, `medium`, `high`
**Special Handling**: None (simple field update)

```javascript
async function handleBulkPriorityChange(newPriority: 'low' | 'medium' | 'high') {
  if (selectedTaskIds.size === 0) return;

  bulkActionInProgress = true;

  try {
    const updates = Array.from(selectedTaskIds).map(id => ({
      id,
      data: { priority: newPriority }
    }));

    // Optimistic update
    updates.forEach(({ id, data }) => {
      const task = allTasksFromStore.find(t => t.id === id);
      if (task) {
        projectStoreV2.updateTask({ ...task, ...data });
      }
    });

    // Call batch API
    const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });

    const result = await response.json();

    // Handle results (same pattern as status change)
    result.successful.forEach(task => projectStoreV2.updateTask(task));

    toastService.success(
      `${result.summary.successful} task${result.summary.successful > 1 ? 's' : ''} updated`
    );

    clearSelection();

  } catch (error) {
    console.error('Bulk priority change failed:', error);
    toastService.error('Failed to update tasks');
    allTasksFromStore.forEach(task => projectStoreV2.updateTask(task));
  } finally {
    bulkActionInProgress = false;
  }
}
```

#### 3.1.3 Bulk Remove Start Dates

**UI**: Button "Remove Dates"
**Icon**: `CalendarX`
**Special Handling**:

- Clears `start_date` to `null`
- Triggers calendar event deletion
- May remove tasks from phases

```javascript
async function handleBulkRemoveDates() {
	if (selectedTaskIds.size === 0) return;

	// Check which tasks actually have dates
	const tasksWithDates = selectedTasks.filter((t) => t.start_date);

	if (tasksWithDates.length === 0) {
		toastService.info('No tasks have dates to remove');
		return;
	}

	// Confirm with user
	const confirmed = await confirmDialog({
		title: 'Remove Start Dates',
		message: `Remove start dates from ${tasksWithDates.length} task${tasksWithDates.length > 1 ? 's' : ''}? This will also remove them from your calendar.`,
		confirmText: 'Remove Dates',
		confirmVariant: 'warning'
	});

	if (!confirmed) return;

	bulkActionInProgress = true;

	try {
		const updates = tasksWithDates.map((task) => ({
			id: task.id,
			data: {
				start_date: null,
				// Also clear recurrence if it's a recurring task
				...(task.task_type === 'recurring'
					? {
							task_type: 'one_off',
							recurrence_pattern: null,
							recurrence_ends: null
						}
					: {})
			}
		}));

		// Optimistic update
		updates.forEach(({ id, data }) => {
			const task = allTasksFromStore.find((t) => t.id === id);
			if (task) {
				projectStoreV2.updateTask({ ...task, ...data });
			}
		});

		// Call batch API (will automatically handle calendar cleanup)
		const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ updates })
		});

		const result = await response.json();

		result.successful.forEach((task) => projectStoreV2.updateTask(task));

		toastService.success(
			`Removed dates from ${result.summary.successful} task${result.summary.successful > 1 ? 's' : ''}`
		);

		clearSelection();
	} catch (error) {
		console.error('Bulk remove dates failed:', error);
		toastService.error('Failed to remove dates');
		allTasksFromStore.forEach((task) => projectStoreV2.updateTask(task));
	} finally {
		bulkActionInProgress = false;
	}
}
```

#### 3.1.4 Bulk Delete (Soft Delete)

**UI**: Button "Delete"
**Icon**: `Trash2`
**Color**: Red text
**Special Handling**:

- Sets `deleted_at` timestamp (soft delete)
- Triggers calendar event deletion
- Removes from phases
- Requires confirmation

```javascript
async function handleBulkDelete() {
	if (selectedTaskIds.size === 0) return;

	// Confirm with user
	const confirmed = await confirmDialog({
		title: 'Delete Tasks',
		message: `Delete ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''}? You can restore them later from the Deleted filter.`,
		confirmText: 'Delete',
		confirmVariant: 'danger'
	});

	if (!confirmed) return;

	bulkActionInProgress = true;

	try {
		const updates = Array.from(selectedTaskIds).map((id) => ({
			id,
			data: { deleted_at: new Date().toISOString() }
		}));

		// Optimistic update
		updates.forEach(({ id, data }) => {
			const task = allTasksFromStore.find((t) => t.id === id);
			if (task) {
				projectStoreV2.updateTask({ ...task, ...data });
			}
		});

		// Call batch API (will automatically handle calendar cleanup)
		const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ updates })
		});

		const result = await response.json();

		result.successful.forEach((task) => projectStoreV2.updateTask(task));

		toastService.success(
			`Deleted ${result.summary.successful} task${result.summary.successful > 1 ? 's' : ''}`
		);

		clearSelection();
	} catch (error) {
		console.error('Bulk delete failed:', error);
		toastService.error('Failed to delete tasks');
		allTasksFromStore.forEach((task) => projectStoreV2.updateTask(task));
	} finally {
		bulkActionInProgress = false;
	}
}
```

### 3.2 Operation Validation

**Pre-flight Checks** before executing bulk operations:

```javascript
function validateBulkOperation(operation: string): string[] {
  const warnings: string[] = [];

  switch (operation) {
    case 'delete':
      // Check for tasks with active subtasks
      const tasksWithSubtasks = selectedTasks.filter(task => {
        return allTasksFromStore.some(t =>
          t.parent_task_id === task.id && !t.deleted_at
        );
      });
      if (tasksWithSubtasks.length > 0) {
        warnings.push(
          `${tasksWithSubtasks.length} task${tasksWithSubtasks.length > 1 ? 's have' : ' has'} active subtasks`
        );
      }
      break;

    case 'remove_dates':
      // Check which tasks have dates
      const withDates = selectedTasks.filter(t => t.start_date);
      if (withDates.length === 0) {
        warnings.push('No tasks have dates to remove');
      }
      break;

    case 'status_done':
      // Check for tasks with calendar events
      const withCalendar = selectedTasks.filter(t =>
        t.task_calendar_events?.some(e =>
          e.sync_status === 'synced' || e.sync_status === 'pending'
        )
      );
      if (withCalendar.length > 0) {
        warnings.push(
          `${withCalendar.length} task${withCalendar.length > 1 ? 's' : ''} will be removed from calendar`
        );
      }
      break;
  }

  return warnings;
}
```

---

## 4. API Integration

### 4.1 Use Existing Batch Endpoint

**Endpoint**: `/api/projects/[id]/tasks/batch/`
**Method**: `PATCH`
**File**: `/apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts`

This endpoint **already supports** everything we need:

- ✅ Bulk task updates
- ✅ Automatic calendar sync detection
- ✅ Bulk calendar event deletion (batch size: 5)
- ✅ Bulk calendar event updates (batch size: 5)
- ✅ Partial failure handling
- ✅ Recurrence pattern clearing
- ✅ Status transition logic

### 4.2 Request Format

```typescript
POST / api / projects / { projectId } / tasks / batch;

{
	updates: Array<{
		id: string; // Task ID
		data: Partial<Task>; // Fields to update
	}>;
}
```

### 4.3 Response Format

```typescript
{
  successful: Task[],  // Tasks updated successfully
  failed: Array<{      // Tasks that failed to update
    id: string,
    error: string
  }>,
  summary: {
    total: number,
    successful: number,
    failed: number
  }
}
```

### 4.4 Calendar Sync Behavior

The batch endpoint automatically detects and handles calendar operations:

**Triggers DELETE calendar events when**:

- Task status → `'done'`
- Task `start_date` → `null`
- Task `deleted_at` → non-null

**Triggers UPDATE calendar events when**:

- Task `start_date` changes
- Task `duration_minutes` changes
- Task `title` changes
- Non-recurring tasks only (recurring requires delete + create)

**Batch Processing**:

- Calendar operations use `calendarService.bulkDeleteCalendarEvents()` with batch size 5
- Calendar operations use `calendarService.bulkUpdateCalendarEvents()` with batch size 5
- Calendar operations are **non-blocking** (fire-and-forget)
- Failures are logged but don't fail the task update

### 4.5 No New Endpoints Required

**Conclusion**: We do NOT need to create new API endpoints. The existing batch endpoint provides all necessary functionality.

---

## 5. Calendar Event Handling

### 5.1 Calendar Event Lifecycle

Based on comprehensive research (see `/thoughts/shared/research/2025-10-11_18-30-00_task-calendar-events-lifecycle-research.md`):

#### When Calendar Events Are DELETED

1. **Task marked as done**

    ```javascript
    if (task.status === 'done' && task.task_calendar_events.length > 0) {
    	// DELETE all associated calendar events
    	// Reason: 'task_completed'
    }
    ```

2. **Task start_date cleared**

    ```javascript
    if (task.start_date === null && task.task_calendar_events.length > 0) {
    	// DELETE all associated calendar events
    	// Reason: 'date_cleared'
    }
    ```

3. **Task deleted (soft delete)**
    ```javascript
    if (task.deleted_at !== null && task.task_calendar_events.length > 0) {
    	// DELETE all associated calendar events
    	// Reason: 'task_deleted'
    }
    ```

#### Sync Status Values

```typescript
type SyncStatus =
	| 'synced' // Successfully synced with Google Calendar
	| 'pending' // Not yet synced (rare)
	| 'failed' // Sync failed (with sync_error message)
	| 'cancelled'; // Marked as cancelled
```

### 5.2 Bulk Calendar Operations

**File**: `/packages/supabase-client/src/services/calendar-service.ts`

The CalendarService provides bulk methods:

```typescript
async bulkDeleteCalendarEvents(
  userId: string,
  events: Array<{
    id: string,
    calendar_event_id: string,
    calendar_id: string
  }>,
  options?: {
    batchSize?: number,  // Default: 5
    reason?: string      // For logging
  }
): Promise<{
  successful: string[],
  failed: Array<{ id: string, error: string }>
}>

async bulkUpdateCalendarEvents(
  userId: string,
  events: Array<{
    id: string,
    calendar_event_id: string,
    calendar_id: string,
    updates: {
      start?: string,
      end?: string,
      summary?: string
    }
  }>,
  options?: {
    batchSize?: number   // Default: 5
  }
): Promise<{
  successful: string[],
  failed: Array<{ id: string, error: string }>
}>
```

### 5.3 Error Handling

**404 Errors are EXPECTED**: Calendar events might already be deleted in Google Calendar.

```javascript
// In CalendarService
try {
	await this.googleCalendarAPI.deleteEvent(calendarId, eventId);
} catch (error) {
	if (error.status === 404) {
		// Event already deleted - this is OK
		console.log('Event already deleted:', eventId);
		// Still update database to mark as deleted
		await this.updateSyncStatus(eventId, 'cancelled');
	} else {
		// Other errors are real problems
		throw error;
	}
}
```

### 5.4 Database Updates

**CRITICAL**: Always use CalendarService, never update `task_calendar_events` directly.

CalendarService handles both:

1. Google Calendar API call
2. Database `task_calendar_events` update

Atomically in a single operation.

### 5.5 Bulk Operation Pattern

```javascript
// 1. Update tasks first
const taskUpdates = await updateTasks(updates);

// 2. Collect calendar events to delete
const eventsToDelete = [];
for (const task of tasksMarkedDone) {
  if (task.task_calendar_events) {
    eventsToDelete.push(...task.task_calendar_events.map(e => ({
      id: e.id,
      calendar_event_id: e.calendar_event_id,
      calendar_id: e.calendar_id || 'primary'
    })));
  }
}

// 3. Bulk delete calendar events (fire and forget)
if (eventsToDelete.length > 0) {
  calendarService.bulkDeleteCalendarEvents(
    userId,
    eventsToDelete,
    { batchSize: 5, reason: 'bulk_completion' }
  ).catch(error => {
    console.error('Calendar bulk delete failed:', error);
    // Don't fail the task update - log warning instead
  });
}

// 4. Return success immediately (don't wait for calendar)
return { successful: taskUpdates, ... };
```

---

## 6. Implementation Plan

### Phase 1: UI Setup (2-3 hours)

**Tasks**:

1. Add checkbox column to task cards
2. Add "Select All" checkbox in header
3. Implement selection state with Set<string>
4. Add visual feedback for selected tasks
5. Test checkbox interaction (stop propagation)

**Files to Modify**:

- `/apps/web/src/lib/components/project/TasksList.svelte`

**Success Criteria**:

- ✅ Can select/deselect individual tasks
- ✅ Can select/deselect all filtered tasks
- ✅ Selected tasks show visual highlight
- ✅ Clicking checkbox doesn't open task edit modal

---

### Phase 2: Bulk Action Toolbar (2-3 hours)

**Tasks**:

1. Create conditional bulk action toolbar component
2. Add status dropdown with 4 options
3. Add priority dropdown with 3 options
4. Add "Remove Dates" button
5. Add "Delete" button with red styling
6. Add "Clear Selection" button
7. Show selection count
8. Add warning messages area

**Files to Modify**:

- `/apps/web/src/lib/components/project/TasksList.svelte`

**Success Criteria**:

- ✅ Toolbar appears only when tasks selected
- ✅ Toolbar shows correct selection count
- ✅ Dropdowns open/close correctly
- ✅ All buttons are accessible and labeled
- ✅ Toolbar is sticky on mobile

---

### Phase 3: Bulk Operations Logic (4-5 hours)

**Tasks**:

1. Implement `handleBulkStatusChange()`
2. Implement `handleBulkPriorityChange()`
3. Implement `handleBulkRemoveDates()`
4. Implement `handleBulkDelete()`
5. Add optimistic updates
6. Add rollback on failure
7. Add validation and warnings
8. Add loading states
9. Add confirmation dialogs (for delete and remove dates)

**Files to Modify**:

- `/apps/web/src/lib/components/project/TasksList.svelte`
- `/apps/web/src/lib/services/projectService.ts` (if needed)

**API Calls**:

- Use existing `/api/projects/[id]/tasks/batch/` endpoint

**Success Criteria**:

- ✅ All bulk operations work correctly
- ✅ Optimistic updates provide instant feedback
- ✅ Failed operations roll back properly
- ✅ Toast notifications show success/error
- ✅ Calendar events are cleaned up automatically
- ✅ Selection clears after successful operation

---

### Phase 4: Edge Cases & Polish (2-3 hours)

**Tasks**:

1. Handle partial failures (some tasks update, some don't)
2. Show warnings for risky operations
3. Prevent operations on invalid tasks (e.g., already deleted)
4. Clean up selection after filter changes
5. Add keyboard shortcuts (optional)
6. Test with large selections (100+ tasks)
7. Test with slow network conditions
8. Add proper error messages

**Files to Modify**:

- `/apps/web/src/lib/components/project/TasksList.svelte`

**Success Criteria**:

- ✅ Partial failures handled gracefully
- ✅ Clear error messages for users
- ✅ No orphaned selections after filter changes
- ✅ Performance acceptable with 100+ tasks
- ✅ Works on slow networks

---

### Phase 5: Testing & Documentation (2-3 hours)

**Tasks**:

1. Write unit tests for selection logic
2. Write integration tests for bulk operations
3. Test calendar event cleanup
4. Test with different task types (recurring, completed, deleted)
5. Test accessibility (screen readers, keyboard nav)
6. Update component documentation
7. Create user guide for bulk operations

**Files to Create/Modify**:

- `/apps/web/src/lib/components/project/TasksList.test.ts`
- `/apps/web/docs/features/tasks/bulk-operations.md`

**Success Criteria**:

- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Calendar events properly cleaned up
- ✅ Accessible via keyboard and screen readers
- ✅ Documentation complete

---

### Total Estimated Time: 12-17 hours

---

## 7. Edge Cases & Constraints

### 7.1 Selection Edge Cases

| Edge Case                    | Behavior                                 | Implementation                                                    |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Filter change**            | Clear selection                          | `$effect(() => { if (activeFilters changed) clearSelection(); })` |
| **Task deleted**             | Remove from selection                    | Call `cleanupSelection()` after delete                            |
| **Task completed**           | Remove from selection if "Active" filter | Call `cleanupSelection()` after status change                     |
| **Empty selection**          | Hide bulk toolbar                        | `{#if selectedTaskIds.size > 0}`                                  |
| **Select all on empty list** | No-op                                    | Check `filteredTasks.length > 0`                                  |
| **Select deleted tasks**     | Allow (for bulk restore)                 | No restriction                                                    |
| **Select mix of types**      | Allow                                    | Warn if operation doesn't make sense                              |

### 7.2 Operation Constraints

| Constraint                 | Validation                        | Error Message                               |
| -------------------------- | --------------------------------- | ------------------------------------------- |
| **No tasks selected**      | `if (selectedTaskIds.size === 0)` | "Please select at least one task"           |
| **Task has subtasks**      | Check `parent_task_id` references | "Cannot delete tasks with active subtasks"  |
| **Already deleted**        | Check `deleted_at !== null`       | Already filtered out by UI                  |
| **No dates to remove**     | Check `start_date !== null`       | "No tasks have dates to remove"             |
| **Calendar not connected** | Check calendar connection         | Warning: "Tasks won't be added to calendar" |
| **Recurring task**         | Check `task_type === 'recurring'` | Handled automatically by batch endpoint     |

### 7.3 Performance Considerations

| Scenario                    | Optimization                      | Rationale                      |
| --------------------------- | --------------------------------- | ------------------------------ |
| **100+ tasks selected**     | Use batch API, max 5 concurrent   | Prevent API throttling         |
| **Large selection UI**      | Use virtual scrolling (if needed) | Prevent UI lag                 |
| **Rapid selection changes** | Debounce validation (100ms)       | Reduce unnecessary computation |
| **Calendar sync**           | Fire-and-forget, don't block      | Prevent slow bulk operations   |
| **Optimistic updates**      | Update store immediately          | Instant feedback               |

### 7.4 Calendar Event Edge Cases

| Edge Case                    | Behavior                   | Implementation                    |
| ---------------------------- | -------------------------- | --------------------------------- |
| **Event already deleted**    | Handle 404 gracefully      | Don't fail operation, log warning |
| **Calendar disconnected**    | Skip calendar operations   | Check connection status first     |
| **Recurring event**          | Delete master event        | CalendarService handles RRULE     |
| **Event modified in Google** | Overwrite with our changes | CalendarService handles conflicts |
| **Partial calendar failure** | Continue with task updates | Collect warnings, don't block     |

### 7.5 Data Consistency

| Issue                    | Solution                                | Why                                      |
| ------------------------ | --------------------------------------- | ---------------------------------------- |
| **Stale data**           | Use projectStoreV2 as source of truth   | Real-time updates via Supabase           |
| **Race conditions**      | Optimistic update + rollback on failure | Immediate feedback, eventual consistency |
| **Partial failures**     | Track successful/failed separately      | User can retry failed operations         |
| **Calendar out of sync** | Fire-and-forget + log errors            | Don't block critical task updates        |

---

## 8. Testing Strategy

### 8.1 Unit Tests

**File**: `/apps/web/src/lib/components/project/TasksList.test.ts`

```typescript
describe('TasksList - Multi-Selection', () => {
	describe('Selection State', () => {
		it('should toggle individual task selection', () => {
			// Test toggleTaskSelection()
		});

		it('should select all filtered tasks', () => {
			// Test toggleSelectAll()
		});

		it('should clear all selections', () => {
			// Test clearSelection()
		});

		it('should maintain selection state after filter change', () => {
			// Test selection persistence
		});

		it('should trigger Svelte 5 reactivity correctly', () => {
			// Test Set reassignment pattern
		});
	});

	describe('Bulk Operations', () => {
		it('should update task status in bulk', async () => {
			// Test handleBulkStatusChange()
		});

		it('should update task priority in bulk', async () => {
			// Test handleBulkPriorityChange()
		});

		it('should remove start dates in bulk', async () => {
			// Test handleBulkRemoveDates()
		});

		it('should delete tasks in bulk', async () => {
			// Test handleBulkDelete()
		});

		it('should handle partial failures gracefully', async () => {
			// Test mixed success/failure response
		});

		it('should rollback on complete failure', async () => {
			// Test error handling
		});
	});

	describe('Validation', () => {
		it('should validate bulk delete operation', () => {
			// Test validateBulkOperation('delete')
		});

		it('should warn about calendar event removal', () => {
			// Test warning generation
		});

		it('should prevent operations with no selection', () => {
			// Test empty selection handling
		});
	});
});
```

### 8.2 Integration Tests

```typescript
describe('TasksList - Integration', () => {
	it('should bulk mark tasks as done and remove from calendar', async () => {
		// 1. Select multiple tasks with calendar events
		// 2. Mark as done
		// 3. Verify tasks updated
		// 4. Verify calendar events deleted
	});

	it('should handle bulk operations on 100+ tasks', async () => {
		// Test performance with large selections
	});

	it('should maintain data consistency during concurrent operations', async () => {
		// Test race conditions
	});
});
```

### 8.3 Manual Testing Checklist

- [ ] Select single task, verify highlight
- [ ] Select multiple tasks, verify count
- [ ] Select all, verify all tasks selected
- [ ] Deselect all, verify selection cleared
- [ ] Bulk change status to "done", verify calendar cleanup
- [ ] Bulk change priority, verify update
- [ ] Bulk remove dates, verify calendar cleanup
- [ ] Bulk delete tasks, verify soft delete
- [ ] Handle partial failure (disconnect network mid-operation)
- [ ] Test with deleted tasks filter
- [ ] Test with completed tasks filter
- [ ] Test with recurring tasks
- [ ] Test keyboard navigation
- [ ] Test screen reader announcements
- [ ] Test on mobile (touch interactions)
- [ ] Test with slow network (throttle to 3G)

### 8.4 Acceptance Criteria

✅ **Must Have**:

- Can select/deselect tasks via checkbox
- Can select all / deselect all
- Bulk action toolbar appears when tasks selected
- Can change status in bulk
- Can change priority in bulk
- Can remove dates in bulk
- Can delete tasks in bulk
- Calendar events cleaned up automatically
- Optimistic updates with rollback
- Loading states shown during operations
- Success/error toast notifications

✅ **Should Have**:

- Confirmation dialogs for destructive operations
- Validation warnings before operations
- Partial failure handling with clear messaging
- Selection cleared after successful operation
- Proper keyboard navigation
- Screen reader support

✅ **Nice to Have**:

- Keyboard shortcuts (Cmd+A for select all, Delete for bulk delete)
- Undo functionality
- Bulk operations history
- Export selected tasks

---

## 9. Code References

### 9.1 Key Files

| File                                                            | Purpose                  | Lines     |
| --------------------------------------------------------------- | ------------------------ | --------- |
| `/apps/web/src/lib/components/project/TasksList.svelte`         | Main component to modify | Full file |
| `/apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts` | Batch update endpoint    | 7-304     |
| `/apps/web/src/lib/stores/project.store.ts`                     | Task state management    | Full file |
| `/apps/web/src/lib/services/projectService.ts`                  | Task operations          | Full file |
| `/packages/supabase-client/src/services/calendar-service.ts`    | Calendar operations      | Full file |
| `/packages/shared-types/src/database.types.ts`                  | Schema types             | 3547-3808 |

### 9.2 UI Pattern References

| Pattern                        | Example File                                                           | Lines   |
| ------------------------------ | ---------------------------------------------------------------------- | ------- |
| **Checkbox selection**         | `/apps/web/src/lib/components/email/RecipientSelector.svelte`          | 1-600   |
| **Bulk action toolbar**        | `/apps/web/src/routes/admin/errors/+page.svelte`                       | 1-400   |
| **Select all pattern**         | `/apps/web/src/routes/admin/errors/+page.svelte`                       | 150-180 |
| **Visual selection highlight** | `/apps/web/src/lib/components/project/RecurringTaskReviewModal.svelte` | 1-300   |

### 9.3 API References

| Endpoint                                | File                                                            | Purpose              |
| --------------------------------------- | --------------------------------------------------------------- | -------------------- |
| `PATCH /api/projects/[id]/tasks/batch/` | `/apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts` | Bulk task updates    |
| `GET /api/projects/[id]/tasks/batch/`   | `/apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts` | Batch task retrieval |

### 9.4 Related Research Documents

| Document                                                                                     | Topic                   | Date       |
| -------------------------------------------------------------------------------------------- | ----------------------- | ---------- |
| `/thoughts/shared/research/2025-10-11_18-30-00_task-calendar-events-lifecycle-research.md`   | Calendar event handling | 2025-10-11 |
| `/thoughts/shared/research/2025-10-11_17-20-49_task-data-model-and-status-field-research.md` | Task schema             | 2025-10-11 |

---

## 10. Summary

This specification provides a complete blueprint for implementing Gmail-style bulk task operations in the TasksList component. The implementation:

1. **Leverages existing infrastructure**: No new API endpoints needed
2. **Follows established patterns**: Uses proven UI patterns from RecipientSelector and Admin Errors
3. **Handles calendar integration**: Automatic cleanup via batch endpoint
4. **Provides excellent UX**: Optimistic updates, clear feedback, proper error handling
5. **Maintains data consistency**: Rollback on failure, partial failure handling
6. **Is accessible**: Keyboard navigation, screen readers, clear labels
7. **Performs well**: Batched operations, fire-and-forget calendar sync

### Key Implementation Points

✅ Use `Set<string>` for selection state with manual reassignment for reactivity
✅ Use existing `/api/projects/[id]/tasks/batch/` endpoint
✅ Implement optimistic updates with rollback on failure
✅ Fire-and-forget calendar operations to prevent blocking
✅ Show confirmation dialogs for destructive operations
✅ Provide clear validation warnings
✅ Handle partial failures gracefully
✅ Clear selection after successful operations

### Estimated Timeline

- **Phase 1** (UI Setup): 2-3 hours
- **Phase 2** (Bulk Action Toolbar): 2-3 hours
- **Phase 3** (Bulk Operations Logic): 4-5 hours
- **Phase 4** (Edge Cases & Polish): 2-3 hours
- **Phase 5** (Testing & Documentation): 2-3 hours

**Total**: 12-17 hours of focused development time

---

## Appendix A: Complete Code Example

For reference, here's the complete selection state setup:

```typescript
// ===== SELECTION STATE =====
let selectedTaskIds = $state(new Set<string>());
let bulkActionInProgress = $state(false);
let bulkActionWarnings = $state<string[]>([]);
let showStatusDropdown = $state(false);
let showPriorityDropdown = $state(false);

// ===== REACTIVE DERIVATIONS =====
let allTasksSelected = $derived(
	filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.has(task.id))
);

let someTasksSelected = $derived(selectedTaskIds.size > 0 && !allTasksSelected);

let selectedTasks = $derived(filteredTasks.filter((task) => selectedTaskIds.has(task.id)));

// ===== SELECTION FUNCTIONS =====
function toggleTaskSelection(taskId: string, event: Event) {
	event.stopPropagation();

	if (selectedTaskIds.has(taskId)) {
		selectedTaskIds.delete(taskId);
	} else {
		selectedTaskIds.add(taskId);
	}

	selectedTaskIds = new Set(selectedTaskIds);
}

function toggleSelectAll() {
	if (allTasksSelected) {
		selectedTaskIds = new Set();
	} else {
		selectedTaskIds = new Set(filteredTasks.map((t) => t.id));
	}
}

function clearSelection() {
	selectedTaskIds = new Set();
	bulkActionWarnings = [];
}

// ===== BULK OPERATIONS =====
// (See section 3 for complete implementations)
```

---

**End of Specification**
