---
title: Task Update and Delete Patterns in BuildOS
date: 2025-10-11 17:25:38
tags: [research, tasks, architecture, optimistic-updates, api, patterns]
status: completed
related_docs:
    - /apps/web/src/lib/services/projectService.ts
    - /apps/web/src/lib/stores/project.store.ts
    - /apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts
    - /apps/web/src/lib/services/projectData.service.ts
---

# Task Update and Delete Patterns in BuildOS

## Overview

This document provides a comprehensive overview of how task updates and deletions work in the BuildOS platform, including the service layer, optimistic update patterns, validation rules, and error handling.

## Architecture Layers

### 1. Service Layer - ProjectService

**Location:** `/apps/web/src/lib/services/projectService.ts`

The `ProjectService` class extends `ApiService` and provides high-level methods for task operations:

#### Task Update Method

```typescript
async updateTask(
  taskId: string,
  updates: Partial<TaskWithCalendarEvents>,
  projectId?: string
): Promise<TaskResponse> {
  const endpoint = projectId
    ? `/projects/${projectId}/tasks/${taskId}`
    : `/tasks/${taskId}`;

  const result = await this.patch<TaskWithCalendarEvents>(endpoint, updates);

  if (result.success && result.data) {
    // Invalidate related caches
    if (projectId) {
      this.cache.delete(`project:${projectId}`);
    }
    // Update store
    projectStoreV2.updateTask(result.data);
  }

  return result;
}
```

**Key Features:**

- Supports both project-scoped (`/projects/{id}/tasks/{taskId}`) and direct (`/tasks/{taskId}`) endpoints
- Automatic cache invalidation for affected projects
- Direct store update on success
- Returns typed `TaskResponse` with success/error status

#### Task Delete Method (Soft Delete)

```typescript
async deleteTask(taskId: string, projectId: string): Promise<ServiceResponse> {
  const result = await this.delete(`/projects/${projectId}/tasks/${taskId}`);

  if (result.success) {
    // Invalidate project cache
    this.cache.delete(`project:${projectId}`);
    // Update store - remove from tasks array
    const currentTasks = projectStoreV2.getTasks();
    projectStoreV2.setTasks(currentTasks.filter((t) => t.id !== taskId));
  }

  return result;
}
```

**Key Features:**

- Uses soft delete (sets `deleted_at` timestamp)
- Immediate cache invalidation
- Updates store to remove task from UI
- Preserves task in database for recovery

### 2. Optimistic Update Store - projectStoreV2

**Location:** `/apps/web/src/lib/stores/project.store.ts`

The store provides optimistic update methods that update UI immediately and roll back on failure:

#### Optimistic Update Pattern

```typescript
async optimisticUpdateTask(
  taskId: string,
  updates: Partial<TaskWithCalendarEvents>,
  apiCall: () => Promise<any>
) {
  const state = get(this.store);
  const originalTask = state.tasks.find((t) => t.id === taskId);

  if (!originalTask) return;

  const updateId = `update_${taskId}_${Date.now()}`;
  const updatedTask = {
    ...originalTask,
    ...updates,
    updated_at: new Date().toISOString()
  };

  // Track update for rollback capability
  const update: OptimisticUpdate = {
    id: updateId,
    type: 'update',
    entity: 'task',
    tempData: updatedTask,
    originalData: originalTask,
    status: 'pending',
    timestamp: Date.now(),
    retryCount: 0
  };

  // Apply optimistic update - update both tasks array AND tasks within phases
  this.store.update((state) => {
    // ... update logic with phase handling ...
    return {
      ...state,
      tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
      phases: updatedPhases,
      optimisticUpdates: new Map(state.optimisticUpdates).set(updateId, update)
    };
  });

  this.updateStats();

  // Track this update BEFORE API call to prevent race condition
  eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
    entityId: taskId,
    entityType: 'task',
    timestamp: Date.now()
  });

  try {
    const result = await apiCall();

    // Confirm update with server data
    this.store.update((state) => {
      // ... update with real data from server ...
    });

    this.updateStats();
    return result;
  } catch (error) {
    // Rollback to original on failure
    this.rollbackOptimisticUpdate(updateId);
    throw error;
  }
}
```

**Key Features:**

- Immediate UI update for instant feedback
- Tracks original state for rollback
- Updates both tasks array and phase-nested tasks
- Automatic stats recalculation
- Event bus notification to prevent realtime conflicts
- Comprehensive error handling with rollback

#### Optimistic Delete Pattern

```typescript
async optimisticDeleteTask(taskId: string, apiCall: () => Promise<any>) {
  const state = get(this.store);
  const originalTask = state.tasks.find((t) => t.id === taskId);

  if (!originalTask) return;

  const updateId = `delete_${taskId}_${Date.now()}`;

  // Track deletion for potential rollback
  const update: OptimisticUpdate = {
    id: updateId,
    type: 'delete',
    entity: 'task',
    tempData: null,
    originalData: originalTask,
    status: 'pending',
    timestamp: Date.now(),
    retryCount: 0
  };

  // Apply optimistic deletion - remove from tasks AND phases
  this.store.update((state) => ({
    ...state,
    tasks: state.tasks.filter((t) => t.id !== taskId),
    phases: state.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks ? phase.tasks.filter((t) => t.id !== taskId) : []
    })),
    optimisticUpdates: new Map(state.optimisticUpdates).set(updateId, update)
  }));

  this.updateStats();

  try {
    await apiCall();

    // Track this deletion to avoid processing it from realtime
    eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
      entityId: taskId,
      entityType: 'task',
      timestamp: Date.now()
    });

    // Confirm deletion
    this.store.update((state) => ({
      ...state,
      optimisticUpdates: (() => {
        const updates = new Map(state.optimisticUpdates);
        updates.delete(updateId);
        return updates;
      })()
    }));

    return true;
  } catch (error) {
    // Restore on failure
    this.rollbackOptimisticUpdate(updateId);
    throw error;
  }
}
```

**Key Features:**

- Immediate removal from UI
- Preserves original task for rollback
- Cleans up from both tasks and phases
- Event bus notification prevents duplicate processing
- Full restoration on API failure

### 3. Data Service Wrapper - ProjectDataService

**Location:** `/apps/web/src/lib/services/projectData.service.ts`

Provides convenient wrapper methods that call the store's optimistic methods:

```typescript
async updateTask(
  taskId: string,
  updates: Partial<TaskWithCalendarEvents>
): Promise<TaskWithCalendarEvents> {
  return projectStoreV2.optimisticUpdateTask(taskId, updates, async () => {
    const response = await fetch(`/api/projects/${this.projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data.task;
  });
}

async deleteTask(taskId: string): Promise<boolean> {
  return projectStoreV2.optimisticDeleteTask(taskId, async () => {
    const response = await fetch(`/api/projects/${this.projectId}/tasks/${taskId}`, {
      method: 'DELETE'
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return true;
  });
}
```

**Benefits:**

- Encapsulates API call details
- Standardizes error handling
- Provides project-scoped context
- Simplifies component code

## API Endpoint - Task Update

**Location:** `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`

### PATCH Handler

The PATCH endpoint handles all task updates with intelligent calendar sync:

```typescript
export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) return ApiResponse.unauthorized();

		const { id: projectId, taskId } = params;
		const updates = await parseRequestBody(request);
		if (!updates) return ApiResponse.badRequest('Invalid request body');

		let newTaskData = sanitizeTaskData(updates);

		// Extract timezone from request
		const timeZone = updates.timeZone;

		// Get current task data with related records
		const { data: existingTask } = await supabase
			.from('tasks')
			.select(
				`
        *,
        project:projects!inner(id, user_id, name, start_date, end_date),
        phase_tasks(id, phase_id, phases(id, name, start_date, end_date)),
        task_calendar_events(...)
      `
			)
			.eq('id', taskId)
			.eq('project_id', projectId)
			.eq('project.user_id', user.id)
			.single();

		if (!existingTask) return ApiResponse.notFound('Task not found');

		// Validate start_date against project boundaries
		if (newTaskData.start_date) {
			const validationError = validateTaskDate(newTaskData.start_date, existingTask.project);
			if (validationError) {
				toastService.error(validationError);
				return ApiResponse.badRequest(validationError);
			}
		}

		// Handle task type changes and recurrence data
		if (newTaskData.task_type === 'one_off' && existingTask.task_type === 'recurring') {
			// Clear all recurring-specific data
			newTaskData.recurrence_pattern = null;
			newTaskData.recurrence_ends = null;
			newTaskData.recurrence_end_source = null;
		}

		// Handle completion status change
		if (newTaskData.status === 'done' && existingTask.status !== 'done') {
			newTaskData.completed_at = new Date().toISOString();
		} else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
			newTaskData.completed_at = null;
		}

		// Update task immediately (no calendar blocking)
		const { error: updateError } = await supabase
			.from('tasks')
			.update({
				...newTaskData,
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		if (updateError) throw updateError;

		// Handle phase assignment in parallel (non-blocking)
		const phasePromise = handlePhaseAssignment(
			taskId,
			projectId,
			newTaskData.start_date,
			supabase
		);

		// Intelligent calendar operation handling
		const calendarOperations = determineCalendarOperations(
			existingTask,
			newTaskData,
			updates,
			timeZone
		);

		// Process calendar operations directly with CalendarService
		const calendarService = new CalendarService(supabase);
		const calendarPromises = [];

		for (const operation of calendarOperations) {
			calendarPromises.push(
				processCalendarOperationDirectly(
					calendarService,
					errorLogger,
					operation,
					user.id,
					taskId,
					projectId,
					supabase
				)
			);
		}

		// Wait for phase assignment but not calendar operations
		await phasePromise;

		// For individual calendar additions, await to ensure complete data
		const isSingleCalendarAdd = updates.addTaskToCalendar && calendarPromises.length === 1;

		if (calendarPromises.length > 0) {
			if (isSingleCalendarAdd) {
				// Wait for single operations to ensure task_calendar_events are populated
				await Promise.allSettled(calendarPromises);
			} else {
				// For bulk operations, process in background
				Promise.allSettled(calendarPromises).catch((error) =>
					console.error('Calendar operations failed:', error)
				);
			}
		}

		// Get final task data
		const { data: finalTask } = await supabase
			.from('tasks')
			.select(
				`
        *,
        task_calendar_events(*),
        phase_tasks(id, phase_id, suggested_start_date, phases(...))
      `
			)
			.eq('id', taskId)
			.single();

		// Return immediately with success
		return ApiResponse.success({
			task: finalTask,
			calendarSync:
				calendarOperations.length > 0
					? {
							status: 'processing',
							operations: calendarOperations.map((op) => op.type),
							message: getCalendarSyncMessage(calendarOperations),
							timeZone: timeZone
						}
					: { status: 'none' }
		});
	} catch (error) {
		console.error('Error updating task:', error);
		return ApiResponse.internalError(error);
	}
};
```

**Key Features:**

- **Performance Optimized:** Task updated immediately, calendar operations processed in parallel/background
- **Intelligent Calendar Sync:** Determines necessary calendar operations based on changes
- **Validation:** Project boundary validation for dates
- **Status Tracking:** Auto-sets `completed_at` when task marked done
- **Recurrence Handling:** Clears recurrence data when switching to one-off
- **Phase Auto-Assignment:** Automatically assigns tasks to phases based on dates
- **Timezone Support:** Respects user's timezone for calendar operations

### DELETE Handler (Soft Delete)

```typescript
export const DELETE: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) return ApiResponse.unauthorized();

		const { id: projectId, taskId } = params;

		// Parse deletion scope for recurring tasks
		let deletionScope: 'all' | 'this_only' | 'this_and_future' = 'all';
		let instanceDate: string | null = null;

		const contentType = request.headers.get('content-type');
		if (contentType?.includes('application/json')) {
			try {
				const body = await request.json();
				deletionScope = body.deletion_scope || 'all';
				instanceDate = body.instance_date || null;
			} catch {
				// Use defaults
			}
		}

		// Verify user owns the task and get calendar events
		const { data: task } = await supabase
			.from('tasks')
			.select(
				`
        id, title, status, start_date, task_type,
        project:projects!inner(id, user_id, name),
        task_calendar_events(...),
        phase_tasks(id),
        subtasks:tasks!parent_task_id(id, title, status)
      `
			)
			.eq('id', taskId)
			.eq('project_id', projectId)
			.eq('project.user_id', user.id)
			.single();

		if (!task) return ApiResponse.notFound('Task not found');

		// Handle subtasks - prevent deletion if active subtasks exist
		if (task?.subtasks?.length > 0) {
			const activeSubtasks = task.subtasks.filter((st: any) => st.status !== 'done');
			if (activeSubtasks.length > 0) {
				return ApiResponse.badRequest(
					`Cannot delete task with ${activeSubtasks.length} active subtask(s). ` +
						`Complete or delete subtasks first.`
				);
			}
		}

		// Handle recurring task deletion based on scope
		if (task.task_type === 'recurring' && deletionScope !== 'all') {
			// ... special handling for recurring instances ...
		}

		// Delete associated calendar events
		if (task.task_calendar_events?.length > 0) {
			const calendarResults = await handleCalendarEventDeletion(
				task.task_calendar_events,
				user.id,
				supabase,
				taskId,
				projectId
			);
			warnings.push(...calendarResults.warnings);
			errors.push(...calendarResults.errors);
		}

		// Clear brain dump links
		await supabase.from('brain_dump_links').update({ task_id: null }).eq('task_id', taskId);

		// Clear phase tasks association
		if (task.phase_tasks?.length) {
			await supabase.from('phase_tasks').delete().eq('task_id', taskId);
		}

		// Soft delete the task by setting deleted_at timestamp
		await supabase
			.from('tasks')
			.update({
				deleted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		// Log deletion for audit trail
		await supabase.from('user_activity_logs').insert({
			user_id: user.id,
			action: 'task_deleted',
			resource_type: 'task',
			resource_id: taskId,
			metadata: {
				task_title: task.title,
				project_id: projectId,
				had_calendar_events: task.task_calendar_events?.length > 0,
				was_completed: task.status === 'done'
			}
		});

		return ApiResponse.success({
			deleted: true,
			message: 'Task deleted successfully'
		});
	} catch (error) {
		console.error('Error deleting task:', error);
		return ApiResponse.internalError(error);
	}
};
```

**Key Features:**

- **Soft Delete:** Sets `deleted_at` timestamp, preserves data
- **Calendar Cleanup:** Removes associated Google Calendar events
- **Subtask Protection:** Prevents deletion if active subtasks exist
- **Recurring Support:** Handles deletion of specific instances or series
- **Relationship Cleanup:** Clears phase assignments and brain dump links
- **Audit Trail:** Logs deletion to activity logs

## Validation and Business Rules

### 1. Date Validation

**Location:** `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts` (lines 722-734)

```typescript
function validateTaskDate(startDate: string, project: any): string | null {
	const taskDate = new Date(startDate);

	if (project.start_date && taskDate < new Date(project.start_date)) {
		return (
			`Task date cannot be before project start date ` +
			`(${new Date(project.start_date).toLocaleDateString()})`
		);
	}

	if (project.end_date && taskDate > new Date(project.end_date)) {
		return (
			`Task date cannot be after project end date ` +
			`(${new Date(project.end_date).toLocaleDateString()})`
		);
	}

	return null;
}
```

**Rules:**

- Task `start_date` must be within project date boundaries
- Returns user-friendly error message if validation fails
- Null return indicates validation passed

### 2. Data Sanitization

**Location:** `/apps/web/src/lib/utils/sanitize-data.ts`

```typescript
export const sanitizeTaskData = (task: Task): Partial<Task> => {
	let sanitizedData = {
		id: task.id,
		title: task.title,
		description: task.description,
		status: task.status,
		priority: task.priority,
		task_type: task.task_type,
		start_date: task.start_date,
		duration_minutes: task.duration_minutes,
		deleted_at: task.deleted_at || null,
		created_at: task.created_at,
		updated_at: task.updated_at,
		completed_at: task.completed_at,
		project_id: task.project_id,
		user_id: task.user_id,
		parent_task_id: task.parent_task_id,
		dependencies: task.dependencies,
		recurrence_pattern: task.recurrence_pattern,
		recurrence_ends: task.recurrence_ends,
		details: task.details
	};

	// Remove undefined fields
	Object.keys(sanitizedData).forEach((key) => {
		if (sanitizedData[key] === undefined) {
			delete sanitizedData[key];
		}
	});

	return sanitizedData;
};
```

**Rules:**

- Only allows whitelisted fields
- Removes `undefined` values
- Preserves `null` values (important for clearing fields)

### 3. Required Fields Validation

```typescript
const validation = validateRequiredFields(data, ['title']);
if (!validation.valid) {
	return ApiResponse.validationError(validation.missing!, 'This field is required');
}
```

**Rules:**

- Title is the only required field for tasks
- Returns 400 error with field name if validation fails

### 4. Status Change Rules

```typescript
// Handle completion status change
if (newTaskData.status === 'done' && existingTask.status !== 'done') {
	newTaskData.completed_at = new Date().toISOString();
} else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
	newTaskData.completed_at = null;
}
```

**Rules:**

- Automatically sets `completed_at` when task marked as done
- Clears `completed_at` when task unmarked as done
- No manual manipulation of `completed_at` needed

### 5. Recurrence Clearing Rules

```typescript
if (newTaskData.task_type === 'one_off' && existingTask.task_type === 'recurring') {
	// Clear all recurring-specific data when changing to one_off
	newTaskData.recurrence_pattern = null;
	newTaskData.recurrence_ends = null;
	newTaskData.recurrence_end_source = null;
}
```

**Rules:**

- Switching from recurring to one-off clears recurrence fields
- Prevents orphaned recurrence data
- Ensures clean task state

## Component Usage Patterns

### 1. TaskModal Component

**Location:** `/apps/web/src/lib/components/project/TaskModal.svelte`

The modal uses callback props to delegate updates to the parent:

```svelte
<script lang="ts">
	export let onUpdate: ((updatedTask: Task) => void) | null = null;
	export let onDelete: ((taskId: string) => void) | null = null;

	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		const taskData = {
			title: titleValue.trim(),
			// ... other fields ...
			timeZone
		};

		if (isEditing && onUpdate) {
			onUpdate(taskData);
		} else if (!isEditing && onCreate) {
			onCreate(taskData);
		}

		onClose();
	}

	async function handleDelete(id: string): Promise<void> {
		if (onDelete) {
			try {
				await onDelete(taskId);
				onClose();
			} catch (error) {
				toastService.error('Failed to delete task');
			}
		}
	}
</script>
```

**Pattern:**

- Modal doesn't call APIs directly
- Delegates to parent via callbacks
- Parent handles optimistic updates
- Modal closes after triggering action

### 2. Project Page Component

**Location:** `/apps/web/src/routes/projects/[id]/+page.svelte` (lines 552-582)

The project page handles updates through the data service:

```svelte
<script lang="ts">
  async function handleTaskUpdated(task: any) {
    if (!dataService || !data.project?.id) return;

    try {
      await dataService.updateTask(task.id, task);

      // If task was added to calendar, force reload
      if (task.addTaskToCalendar || task.task_calendar_events?.length) {
        await dataService.loadTasks({ force: true });
      }

      // Success feedback handled by optimistic updates
    } catch (error) {
      toastService.error('Failed to update task');
      console.error('Error updating task:', error);
    }
  }

  async function handleTaskDeleted(taskId: string) {
    if (!dataService || !data.project?.id) return;

    try {
      await dataService.deleteTask(taskId);
      toastService.success('Task deleted successfully');
    } catch (error) {
      toastService.error('Failed to delete task');
      console.error('Error deleting task:', error);
    }
  }
</script>

<ProjectModals
  {project}
  onTaskUpdate={handleTaskUpdated}
  onTaskDelete={handleTaskDeleted}
  {/* ... other props ... */}
/>
```

**Pattern:**

- Component uses `ProjectDataService` wrapper
- Wraps in try/catch for error handling
- Shows toast notifications for errors (success handled by optimistic updates)
- Conditionally forces reload for calendar operations

## Special Cases and Edge Cases

### 1. Start Date Removal

**Behavior:**

- Setting `start_date` to `null`, `''`, or `undefined` removes the date
- Triggers calendar event deletion if task was scheduled
- Automatically removes task from phase (moves to backlog)
- Clears recurring task type (reverts to one-off)

**Code:**

```typescript
// In API endpoint
const isDateCleared =
	(newTaskData.start_date === null ||
		newTaskData.start_date === '' ||
		newTaskData.start_date === undefined) &&
	existingTask.start_date;

if (isDateCleared && hasCalendarEvents) {
	operations.push({
		type: 'delete_events',
		data: { events: existingTask.task_calendar_events, reason: 'date_cleared' }
	});
}

// In TaskModal
$: if (!startDateValue && taskTypeValue === 'recurring') {
	taskTypeValue = 'one_off';
	recurrencePatternValue = '';
	recurrenceEndsValue = '';
}
```

### 2. Priority Changes

**Behavior:**

- No special validation required
- Accepted values: `'low'`, `'medium'`, `'high'`
- Simple field update, no side effects

**Code:**

```typescript
await dataService.updateTask(taskId, { priority: 'high' });
```

### 3. Status Changes

**Automatic Behaviors:**

- `status: 'done'` → Sets `completed_at` timestamp
- `status !== 'done'` (after being done) → Clears `completed_at`
- Completed tasks remove calendar events
- Uncompleting a task can restore calendar events if `addTaskToCalendar` flag used

**Code:**

```typescript
// Completion
if (newTaskData.status === 'done' && existingTask.status !== 'done') {
	newTaskData.completed_at = new Date().toISOString();
}

// Uncompletion
else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
	newTaskData.completed_at = null;
}
```

### 4. Calendar Operations

**Automatic Triggers:**

- Task marked done → Remove from calendar
- Date cleared → Remove from calendar
- Date changed → Update calendar event
- Recurring pattern changed → Delete old, create new event
- `addTaskToCalendar` flag → Explicitly schedule task

**Special Handling:**

```typescript
// Individual additions wait for completion (ensures calendar events in response)
const isSingleCalendarAdd = updates.addTaskToCalendar && calendarPromises.length === 1;

if (isSingleCalendarAdd) {
	await Promise.allSettled(calendarPromises);
} else {
	// Bulk operations process in background
	Promise.allSettled(calendarPromises).catch(console.error);
}
```

### 5. Recurring Task Deletion

**Three Scopes:**

1. **`'this_only'`:** Deletes single occurrence, creates exception in series
2. **`'this_and_future'`:** Updates recurrence end date to stop before this instance
3. **`'all'`:** Soft deletes entire task (default behavior)

**Code:**

```typescript
if (task.task_type === 'recurring' && deletionScope !== 'all') {
	if (deletionScope === 'this_only' && instanceDate) {
		await supabase.from('recurring_task_instances').upsert({
			task_id: taskId,
			instance_date: instanceDate,
			status: 'deleted',
			deleted_at: new Date().toISOString(),
			user_id: user.id
		});
	} else if (deletionScope === 'this_and_future') {
		const newEndDate = instanceDate
			? new Date(new Date(instanceDate).getTime() - 24 * 60 * 60 * 1000)
					.toISOString()
					.split('T')[0]
			: null;

		if (newEndDate) {
			await supabase.from('tasks').update({ recurrence_ends: newEndDate }).eq('id', taskId);
		}
	}
}
```

## Error Handling and Rollback

### 1. Optimistic Update Rollback

When an API call fails, the store automatically restores the original state:

```typescript
private rollbackOptimisticUpdate(updateId: string) {
  const state = get(this.store);
  const update = state.optimisticUpdates.get(updateId);

  if (!update) return;

  this.store.update((state) => {
    let newState = { ...state };

    if (update.type === 'update' && update.originalData) {
      // Restore original task
      if (update.entity === 'task') {
        newState.tasks = state.tasks.map((t) =>
          t.id === update.originalData?.id ? update.originalData : t
        );
        // Also restore in phases
        newState.phases = state.phases.map((phase) => ({
          ...phase,
          tasks: phase.tasks
            ? phase.tasks.map((t) =>
                t.id === update.originalData?.id ? update.originalData : t
              )
            : []
        }));
      }
    } else if (update.type === 'delete' && update.originalData) {
      // Restore deleted task
      if (update.entity === 'task') {
        newState.tasks = [...state.tasks, update.originalData];
        // Also restore to appropriate phase
        const phaseId = (update.originalData as any).phase_id;
        if (phaseId) {
          newState.phases = state.phases.map((phase) => {
            if (phase.id === phaseId) {
              return {
                ...phase,
                tasks: [...(phase.tasks || []), update.originalData]
              };
            }
            return phase;
          });
        }
      }
    }

    // Remove from tracking
    const updates = new Map(state.optimisticUpdates);
    updates.delete(updateId);
    newState.optimisticUpdates = updates;

    return newState;
  });

  this.updateStats();
}
```

**Features:**

- Complete state restoration
- Updates both tasks array and phase-nested tasks
- Recalculates stats after rollback
- Removes tracking entry

### 2. Error Messages

**Component Level:**

```typescript
try {
	await dataService.updateTask(task.id, updates);
} catch (error) {
	toastService.error('Failed to update task');
	console.error('Error updating task:', error);
}
```

**API Level:**

```typescript
catch (error) {
  console.error('Error updating task:', error);
  return ApiResponse.internalError(error);
}
```

**Toast Notifications:**

- Success: Usually silent (optimistic update provides instant feedback)
- Error: Shows user-friendly message via `toastService.error()`
- Console: Logs detailed error for debugging

## Performance Optimizations

### 1. Immediate UI Updates

- Optimistic updates provide instant feedback
- No waiting for API response
- Perceived performance is excellent

### 2. Non-Blocking Calendar Operations

```typescript
// Task updates don't wait for calendar sync
await phasePromise; // Wait for phase assignment
// Calendar ops fire and forget (background)
if (!isSingleCalendarAdd) {
	Promise.allSettled(calendarPromises).catch(console.error);
}
```

### 3. Cache Management

```typescript
if (result.success && result.data) {
	// Invalidate related caches
	if (projectId) {
		this.cache.delete(`project:${projectId}`);
	}
	// Update store
	projectStoreV2.updateTask(result.data);
}
```

### 4. Debounced Stats Updates

```typescript
private updateStats() {
  // Clear existing timeout
  if (this.updateStatsTimeout) {
    clearTimeout(this.updateStatsTimeout);
  }

  // Debounce stats calculation
  this.updateStatsTimeout = setTimeout(() => {
    this.calculateAndSetStats();
    this.updateStatsTimeout = null;
  }, 50); // 50ms debounce
}
```

## Summary

### Task Update Flow

1. **Component** calls `handleTaskUpdated(task)`
2. **DataService** calls `projectStoreV2.optimisticUpdateTask()`
3. **Store** immediately updates UI, tracks original state
4. **Store** executes API call via callback
5. **API** validates, sanitizes, updates database
6. **API** handles calendar and phase operations
7. **Store** confirms update with server data
8. **Store** removes tracking entry
9. **OR** on error: **Store** rolls back to original state

### Task Delete Flow

1. **Component** calls `handleTaskDeleted(taskId)`
2. **DataService** calls `projectStoreV2.optimisticDeleteTask()`
3. **Store** immediately removes from UI, tracks original state
4. **Store** executes API call via callback
5. **API** validates ownership
6. **API** checks for active subtasks (prevents deletion)
7. **API** handles recurring deletion scope
8. **API** deletes calendar events
9. **API** soft deletes task (sets `deleted_at`)
10. **API** cleans up relationships (phases, brain dumps)
11. **Store** confirms deletion
12. **OR** on error: **Store** restores task to UI

### Key Constraints

| Constraint               | Rule                              | Enforcement    |
| ------------------------ | --------------------------------- | -------------- |
| **Task Title**           | Required                          | API validation |
| **Task Dates**           | Must be within project boundaries | API validation |
| **Recurring to One-off** | Auto-clears recurrence fields     | API logic      |
| **Completion Status**    | Auto-sets `completed_at`          | API logic      |
| **Date Removal**         | Removes from calendar and phases  | API logic      |
| **Active Subtasks**      | Prevents parent deletion          | API validation |
| **Calendar Events**      | Auto-deleted on task deletion     | API logic      |

### Best Practices

1. **Always use optimistic updates** for instant feedback
2. **Provide error handling** with toast notifications
3. **Use timezone parameter** for calendar operations
4. **Sanitize data** before API calls
5. **Handle rollbacks** gracefully
6. **Track updates** to prevent realtime conflicts
7. **Validate early** to fail fast
8. **Log errors** for debugging

## Code Examples for Common Operations

### Update Task Priority

```typescript
// In component
await dataService.updateTask(taskId, { priority: 'high' });
```

### Remove Task Start Date

```typescript
// In component
await dataService.updateTask(taskId, { start_date: null });
// This will:
// - Remove task from calendar
// - Move task to backlog
// - Clear recurring type if applicable
```

### Change Task Status

```typescript
// Mark as done
await dataService.updateTask(taskId, { status: 'done' });
// Auto-sets completed_at

// Mark as not done
await dataService.updateTask(taskId, { status: 'in_progress' });
// Auto-clears completed_at
```

### Delete Task with Error Handling

```typescript
try {
	await dataService.deleteTask(taskId);
	toastService.success('Task deleted');
} catch (error) {
	toastService.error('Failed to delete task');
	console.error('Error:', error);
}
```

### Update Multiple Fields

```typescript
await dataService.updateTask(taskId, {
	title: 'Updated Title',
	priority: 'high',
	status: 'in_progress',
	start_date: new Date().toISOString(),
	duration_minutes: 120
});
```

### Add Task to Calendar

```typescript
await dataService.updateTask(taskId, {
	addTaskToCalendar: true,
	timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
});
```

## Related Documentation

- **ProjectService:** `/apps/web/src/lib/services/projectService.ts`
- **ProjectStore:** `/apps/web/src/lib/stores/project.store.ts`
- **API Endpoint:** `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`
- **ProjectDataService:** `/apps/web/src/lib/services/projectData.service.ts`
- **TaskModal:** `/apps/web/src/lib/components/project/TaskModal.svelte`
- **Project Page:** `/apps/web/src/routes/projects/[id]/+page.svelte`

---

**Research completed:** 2025-10-11 17:25:38
