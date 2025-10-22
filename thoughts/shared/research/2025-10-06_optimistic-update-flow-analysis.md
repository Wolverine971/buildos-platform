---
title: 'Dashboard Optimistic Update Flow Analysis'
date: 2025-10-06
type: research
topic: dashboard-optimistic-updates
status: complete
tags:
    - optimistic-updates
    - race-conditions
    - dashboard
    - testing
    - state-management
files_analyzed:
    - apps/web/src/lib/services/dashboardData.service.ts
    - apps/web/src/lib/stores/dashboard.store.ts
    - apps/web/src/lib/services/dashboardData.service.test.ts
---

# Dashboard Optimistic Update Flow Analysis

## Executive Summary

The BuildOS dashboard implements a sophisticated optimistic update pattern to provide instant UI feedback while preventing race conditions. The key innovation is capturing task metadata (especially `project_id`) **BEFORE** applying optimistic updates, ensuring the API call can succeed even when the optimistic update moves the task between lists.

## 1. Optimistic Update Pattern

### Complete Flow: User Action → Optimistic Update → API Call → Confirm/Rollback

#### Example: Task Update Flow

```typescript
// FILE: dashboardData.service.ts (Lines 184-228)

async updateTask(taskId: string, updates: Partial<Task>, projectId?: string) {
  // STEP 1: Capture current state BEFORE optimistic update
  const currentState = dashboardStore.getState();           // Line 190
  const task = this.findTaskInAllLists(currentState, taskId); // Line 191

  // STEP 2: Determine project_id from task or parameter
  const taskProjectId = projectId || task?.project_id;      // Line 194

  // STEP 3: Validate we have project_id (critical for API call)
  if (!taskProjectId) {                                     // Line 196
    console.error(`Cannot update task: project_id not found`);
    return { success: false, message: '...' };              // Line 201-204
  }

  // STEP 4: Apply optimistic update to UI
  const optimisticUpdateId = dashboardStore.updateTask(taskId, updates); // Line 208

  // STEP 5: Make API call
  const result = await this.patch<Task>(
    `/projects/${taskProjectId}/tasks/${taskId}`,
    updates
  ); // Lines 210-213

  // STEP 6a: Success - Confirm optimistic update
  if (result.success && result.data) {
    dashboardStore.confirmOptimisticUpdate(optimisticUpdateId); // Line 217
    dashboardStore.updateTask(taskId, result.data?.task || result.data); // Line 219
    this.cache.invalidatePattern(/^dashboard:/); // Line 221
  }
  // STEP 6b: Failure - Rollback optimistic update
  else {
    dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId); // Line 224
  }

  return result;
}
```

### Methods Involved

#### DashboardDataService Methods

1. **`updateTask(taskId, updates, projectId?)`** (Lines 184-228)
    - Entry point for task updates
    - Captures project_id before optimistic update
    - Coordinates entire flow

2. **`deleteTask(taskId)`** (Lines 233-268)
    - Finds task to get project_id
    - Applies optimistic delete
    - Confirms or rolls back

3. **`createTask(projectId, task)`** (Lines 285-315)
    - Generates temp ID for optimistic create
    - Replaces temp task with real one on success
    - Rolls back on failure

4. **`completeTask(taskId)`** (Lines 273-280)
    - Convenience wrapper for updateTask with status='completed'

5. **`batchUpdateTasks(projectId, updates[])`** (Lines 334-360)
    - Applies multiple optimistic updates
    - Confirms all or rolls back all

6. **`findTaskInAllLists(state, taskId)`** (Lines 389-410)
    - Searches all task lists for a task
    - Checks `allTasks` first (optimization)
    - Falls back to date-based lists

#### DashboardStore Methods

1. **`updateTask(taskId, updates)`** (Lines 442-459)
    - Creates OptimisticUpdate object
    - Stores rollback data
    - Calls `applyOptimisticUpdate()`
    - Returns update ID for tracking

2. **`deleteTask(taskId)`** (Lines 483-499)
    - Finds task for rollback data
    - Creates 'delete' OptimisticUpdate
    - Calls `applyOptimisticUpdate()`

3. **`addTask(task)`** (Lines 502-512)
    - Creates 'create' OptimisticUpdate
    - Calls `applyOptimisticUpdate()`

4. **`applyOptimisticUpdate(update)`** (Lines 138-160)
    - Stores update in Map with unique ID
    - Routes to appropriate apply method

5. **`rollbackOptimisticUpdate(updateId)`** (Lines 365-390)
    - Retrieves rollback data
    - Applies inverse operation
    - Removes update from Map

6. **`confirmOptimisticUpdate(updateId)`** (Lines 392-398)
    - Simply removes update from Map
    - Server response is now source of truth

7. **`getState()`** (Lines 437-439)
    - Returns current store state
    - Used by service to find tasks

8. **`applyTaskUpdate(state, taskUpdate)`** (Lines 162-285)
    - Handles status='done' (removes from all lists)
    - Handles date changes (moves between lists)
    - Handles in-place updates

9. **`applyTaskCreate(state, task)`** (Lines 287-329)
    - Adds task to appropriate date-based lists
    - Updates stats

10. **`applyTaskDelete(state, taskId)`** (Lines 331-363)
    - Removes from all lists
    - Cleans up empty date buckets
    - Updates stats

### OptimisticUpdate Data Structure

```typescript
// FILE: dashboard.store.ts (Lines 45-51)

interface OptimisticUpdate {
	id: string; // UUID for tracking
	type: 'create' | 'update' | 'delete';
	timestamp: number; // Date.now()
	data: any; // The update being applied
	rollbackData?: any; // Original state for rollback
}
```

Stored in: `DashboardState.optimisticUpdates: Map<string, OptimisticUpdate>`

## 2. Race Condition Prevention

### The Problem: Task Movement Between Lists

When a task's `start_date` changes, the store immediately moves it between lists:

- `pastDueTasks`
- `todaysTasks`
- `tomorrowsTasks`
- `weeklyTasks`
- `weeklyTasksByDate[dateKey]`

**Race Condition:**

1. User changes task date from today → tomorrow
2. Optimistic update moves task from `todaysTasks` → `tomorrowsTasks`
3. Service tries to find task to get `project_id` for API call
4. Task is in a different list now - might not be found!
5. API call fails because we don't have `project_id`

### The Solution: Capture project_id BEFORE Optimistic Update

```typescript
// FILE: dashboardData.service.ts (Lines 189-206)

// Try to find the task BEFORE applying optimistic update to capture project_id
const currentState = dashboardStore.getState();
const task = this.findTaskInAllLists(currentState, taskId);

// Use provided projectId or try to get it from the found task
const taskProjectId = projectId || task?.project_id;

if (!taskProjectId) {
	console.error(
		`[DashboardDataService] Cannot update task ${taskId}: project_id not found.
     Task may have been removed from lists due to date change.`
	);
	// Don't apply optimistic update if we can't make the API call
	return {
		success: false,
		message: 'Task project information not available. Please refresh the dashboard.'
	};
}

// NOW apply optimistic update after we have project_id
const optimisticUpdateId = dashboardStore.updateTask(taskId, updates);
```

### Why This Works

1. **Snapshot before mutation**: `getState()` captures current state
2. **Search before move**: Find task in its current location
3. **Preserve metadata**: Extract `project_id` before task moves
4. **Validate before optimistic update**: Don't apply update if we can't make API call
5. **Fallback parameter**: Accept optional `projectId` parameter for edge cases

### Example Scenario: Date Change

```typescript
// Initial State:
todaysTasks: [{ id: 'task-1', project_id: 'proj-1', start_date: '2025-10-06' }];
tomorrowsTasks: [];

// User updates task date:
await dashboardService.updateTask('task-1', { start_date: '2025-10-07' });

// Flow:
// 1. getState() captures current state with task in todaysTasks
// 2. findTaskInAllLists() finds task and captures project_id='proj-1'
// 3. Optimistic update moves task:
//    todaysTasks: []
//    tomorrowsTasks: [{ id: 'task-1', project_id: 'proj-1', start_date: '2025-10-07' }]
// 4. API call uses captured project_id: PATCH /projects/proj-1/tasks/task-1
// 5. Success! Task is updated and confirmed in new list
```

### Edge Cases Handled

#### Case 1: Task Already Moved by Another Update

```typescript
// Task moved by concurrent update
const taskProjectId = projectId || task?.project_id;
// If task not found but projectId provided, use it
```

#### Case 2: Task Doesn't Exist

```typescript
if (!taskProjectId) {
	// Don't apply optimistic update - prevent phantom tasks
	return { success: false, message: '...' };
}
```

#### Case 3: API Failure

```typescript
if (!result.success) {
	// Rollback moves task back to original list
	dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
}
```

## 3. Store Methods Deep Dive

### updateTask() - The Orchestrator

```typescript
// FILE: dashboard.store.ts (Lines 442-459)

public updateTask(taskId: string, updates: Partial<TaskWithCalendarEvents>) {
  // Create optimistic update with unique ID
  const optimisticUpdate: OptimisticUpdate = {
    id: uuidv4(),                              // Unique tracking ID
    type: 'update',
    timestamp: Date.now(),
    data: { id: taskId, ...updates }          // What to apply
  };

  // Store current task state for rollback
  const currentState = this.getState();
  const currentTask = this.findTaskInState(currentState, taskId);
  if (currentTask) {
    optimisticUpdate.rollbackData = { ...currentTask }; // Deep copy for safety
  }

  this.applyOptimisticUpdate(optimisticUpdate);
  return optimisticUpdate.id; // Return for tracking by service
}
```

**Key Responsibilities:**

1. Generate unique ID for tracking
2. Capture current task state for rollback
3. Delegate to `applyOptimisticUpdate()`
4. Return ID for service to confirm/rollback

### deleteTask() - Soft Delete with Rollback

```typescript
// FILE: dashboard.store.ts (Lines 483-499)

public deleteTask(taskId: string) {
  const currentState = this.getState();
  const task = this.findTaskInState(currentState, taskId);

  if (!task) return null; // Task not found

  const optimisticUpdate: OptimisticUpdate = {
    id: uuidv4(),
    type: 'delete',
    timestamp: Date.now(),
    data: { id: taskId },
    rollbackData: task  // Store entire task for potential restore
  };

  this.applyOptimisticUpdate(optimisticUpdate);
  return optimisticUpdate.id;
}
```

**Key Feature:** Stores entire task in `rollbackData` for restoration if delete fails

### addTask() - Temporary ID Pattern

```typescript
// FILE: dashboard.store.ts (Lines 502-512)

public addTask(task: TaskWithCalendarEvents) {
  const optimisticUpdate: OptimisticUpdate = {
    id: uuidv4(),
    type: 'create',
    timestamp: Date.now(),
    data: task  // Task includes temporary ID from service
  };

  this.applyOptimisticUpdate(optimisticUpdate);
  return optimisticUpdate.id;
}
```

**Used With:**

```typescript
// FILE: dashboardData.service.ts (Lines 285-315)

async createTask(projectId: string, task: Partial<Task>) {
  const tempId = uuidv4();  // Generate temp ID
  const tempTask = { ...task, id: tempId, project_id: projectId };

  const optimisticUpdateId = dashboardStore.addTask(tempTask);

  const result = await this.post(`/projects/${projectId}/tasks`, task);

  if (result.success) {
    dashboardStore.deleteTask(tempId);        // Remove temp task
    dashboardStore.addTask(result.data);      // Add real task
    dashboardStore.confirmOptimisticUpdate(optimisticUpdateId);
  } else {
    dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
  }
}
```

### applyOptimisticUpdate() - The State Mutator

```typescript
// FILE: dashboard.store.ts (Lines 138-160)

public applyOptimisticUpdate(update: OptimisticUpdate) {
  this.store.update((state) => {
    const newState = { ...state };
    newState.optimisticUpdates.set(update.id, update); // Track update

    switch (update.type) {
      case 'update':
        this.applyTaskUpdate(newState, update.data);
        break;
      case 'create':
        this.applyTaskCreate(newState, update.data);
        break;
      case 'delete':
        this.applyTaskDelete(newState, update.data.id);
        break;
    }

    return newState;
  });
}
```

**State Mutation Strategy:**

1. Clone state object
2. Add update to tracking Map
3. Route to specific apply method
4. Return mutated state

### rollbackOptimisticUpdate() - Inverse Operations

```typescript
// FILE: dashboard.store.ts (Lines 365-390)

public rollbackOptimisticUpdate(updateId: string) {
  this.store.update((state) => {
    const update = state.optimisticUpdates.get(updateId);
    if (!update || !update.rollbackData) return state;

    const newState = { ...state };

    // Apply inverse operation
    switch (update.type) {
      case 'update':
        // Restore original task state
        this.applyTaskUpdate(newState, update.rollbackData);
        break;
      case 'create':
        // Delete the task we just created
        this.applyTaskDelete(newState, update.data.id);
        break;
      case 'delete':
        // Re-create the deleted task
        this.applyTaskCreate(newState, update.rollbackData);
        break;
    }

    newState.optimisticUpdates.delete(updateId); // Clean up
    return newState;
  });
}
```

**Inverse Operation Table:**

| Operation | Forward Action    | Rollback Action       |
| --------- | ----------------- | --------------------- |
| update    | Apply new values  | Apply original values |
| create    | Add to lists      | Remove from lists     |
| delete    | Remove from lists | Add to lists          |

### confirmOptimisticUpdate() - Cleanup

```typescript
// FILE: dashboard.store.ts (Lines 392-398)

public confirmOptimisticUpdate(updateId: string) {
  this.store.update((state) => {
    const newState = { ...state };
    newState.optimisticUpdates.delete(updateId); // Just remove tracking
    return newState;
  });
}
```

**Why Simple?** The optimistic update already applied the changes. Server confirmation means we keep them.

### getState() - Snapshot Provider

```typescript
// FILE: dashboard.store.ts (Lines 437-439)

public getState(): DashboardState {
  return get(this.store); // Svelte's get() for snapshot
}
```

**Used By Service To:**

1. Find tasks before updates
2. Validate task existence
3. Capture metadata (project_id)

## 4. Common Scenarios

### Scenario 1: Simple Task Update (No Date Change)

```typescript
// User clicks checkbox to complete task
await dashboardService.completeTask('task-123');

// Flow:
// 1. getState() finds task in todaysTasks
// 2. Captures project_id='proj-1'
// 3. Optimistic: task.status = 'done', removed from todaysTasks
// 4. API: PATCH /projects/proj-1/tasks/task-123 { status: 'done' }
// 5. Success: Confirm optimistic update
// 6. Result: Task stays removed (done tasks hidden)
```

**Lists Affected:**

- Removed from: All active lists
- Stats: `activeTasks -= 1`, `completedToday += 1`

### Scenario 2: Task Update with Date Change

```typescript
// User drags task from today to tomorrow
await dashboardService.updateTask('task-456', { start_date: '2025-10-07' });

// Flow:
// 1. getState() finds task in todaysTasks with start_date='2025-10-06'
// 2. Captures project_id='proj-2'
// 3. Optimistic: Task moved
//    - Removed from: todaysTasks, weeklyTasksByDate['2025-10-06']
//    - Added to: tomorrowsTasks, weeklyTasksByDate['2025-10-07']
// 4. API: PATCH /projects/proj-2/tasks/task-456 { start_date: '2025-10-07' }
// 5. Success: Confirm optimistic update
// 6. Result: Task stays in tomorrowsTasks
```

**Lists Affected:**

- Removed from: todaysTasks, weeklyTasksByDate['old-date']
- Added to: tomorrowsTasks, weeklyTasksByDate['new-date']
- weeklyTasks: Updated (if still within 7 days)

**Date Change Logic:**

```typescript
// FILE: dashboard.store.ts (Lines 199-268)

if (taskUpdate.start_date !== undefined) {
	// Remove from ALL date-based lists first
	// Find existing task to preserve data
	// Remove from lists
	// Create updated task
	// Add to appropriate list(s) based on new date
}
```

### Scenario 3: Task Deletion

```typescript
// User clicks delete button
await dashboardService.deleteTask('task-789');

// Flow:
// 1. getState() finds task in weeklyTasks
// 2. Captures project_id='proj-3'
// 3. Optimistic: Task removed from all lists
// 4. API: DELETE /projects/proj-3/tasks/task-789
// 5. Success: Confirm optimistic update
// 6. Result: Task permanently removed
```

**Rollback Scenario:**

```typescript
// If API fails (network error, permissions, etc.):
// 1. rollbackOptimisticUpdate() retrieves full task from rollbackData
// 2. applyTaskCreate() adds task back to appropriate lists
// 3. Task reappears in UI
```

### Scenario 4: Task Creation

```typescript
// User creates new task via quick-add
await dashboardService.createTask('proj-4', {
	name: 'New task',
	start_date: '2025-10-06'
});

// Flow:
// 1. Service generates tempId='temp-uuid-1'
// 2. Creates tempTask with tempId
// 3. Optimistic: Task added to todaysTasks with tempId
// 4. API: POST /projects/proj-4/tasks { name: 'New task', ... }
// 5. Success: Server returns real task with id='real-uuid-1'
// 6. Delete temp task (tempId)
// 7. Add real task (real-uuid-1)
// 8. Confirm optimistic update
```

**Why Temp ID?**

- UI needs an ID immediately for rendering
- Replace with server ID when available
- Prevents duplicate tasks

### Scenario 5: Batch Update

```typescript
// User marks multiple tasks as complete
await dashboardService.batchUpdateTasks('proj-5', [
	{ id: 'task-1', updates: { status: 'done' } },
	{ id: 'task-2', updates: { status: 'done' } },
	{ id: 'task-3', updates: { status: 'done' } }
]);

// Flow:
// 1. Apply ALL optimistic updates
// 2. Track all update IDs
// 3. Make single batch API call
// 4. Success: Confirm ALL updates
// 5. Failure: Rollback ALL updates (atomic operation)
```

**Atomic Behavior:**

```typescript
// FILE: dashboardData.service.ts (Lines 334-360)

if (result.success) {
	// Confirm ALL
	optimisticUpdateIds.forEach((id) => dashboardStore.confirmOptimisticUpdate(id));
} else {
	// Rollback ALL
	optimisticUpdateIds.forEach((id) => dashboardStore.rollbackOptimisticUpdate(id));
}
```

## 5. Edge Cases for Testing

### Edge Case 1: Concurrent Updates (Same Task)

```typescript
// Two updates to same task in quick succession
Promise.all([
	dashboardService.updateTask('task-1', { name: 'First update' }),
	dashboardService.updateTask('task-1', { status: 'done' })
]);

// Expected Behavior:
// - Both capture project_id successfully
// - Both apply optimistic updates (overwrites)
// - Both make API calls
// - Last API response wins
// - Both confirm (no rollback needed if both succeed)

// Tests Should Verify:
// - Order of getState() vs updateTask() for each
// - Both API calls use captured project_id
// - Final state reflects last update
```

### Edge Case 2: Update After Date Change (Task Moved)

```typescript
// Update 1: Change date (moves task)
await dashboardService.updateTask('task-1', { start_date: '2025-10-07' });

// Update 2: Update name (task now in different list)
await dashboardService.updateTask('task-1', { name: 'Updated name' });

// Expected Behavior:
// - Update 2 should find task in tomorrowsTasks (new location)
// - Should still capture project_id successfully
// - API call succeeds

// Tests Should Verify:
// - findTaskInAllLists searches ALL lists
// - project_id captured from new location
// - Update applies to task in new list
```

### Edge Case 3: Delete During Update

```typescript
// Update in progress
const updatePromise = dashboardService.updateTask('task-1', {
	name: 'Updated'
});

// Immediate delete (before update completes)
const deletePromise = dashboardService.deleteTask('task-1');

// Expected Behavior:
// - Both capture project_id
// - Update optimistic: task still visible with new name
// - Delete optimistic: task removed
// - Update API: might fail (task deleted)
// - Delete API: succeeds
// - Final: Task is deleted

// Tests Should Verify:
// - Both operations capture project_id before mutations
// - Delete rollback restores task if delete fails
// - Update rollback handles task not found
```

### Edge Case 4: Task Status = 'done' (Auto-removal)

```typescript
// Complete a task with calendar events
await dashboardService.updateTask('task-1', { status: 'done' });

// Expected Behavior:
// - Task removed from ALL lists (pastDue, today, tomorrow, weekly, weeklyByDate)
// - Stats updated: activeTasks--, completedToday++
// - Calendar events preserved (for history)

// Tests Should Verify:
// - Task not in any active list
// - Task data still accessible for rollback
// - Rollback restores task to original list(s)
```

### Edge Case 5: Task Not Found (Race with Deletion)

```typescript
// Task deleted by another device/tab
// Try to update it here
await dashboardService.updateTask('task-1', { name: 'Update' });

// Expected Behavior:
// - getState() returns null (task not found)
// - No project_id available
// - NO optimistic update applied
// - Returns error: "Task project information not available"

// Tests Should Verify:
// - updateTask NOT called on store
// - API NOT called (early return)
// - User gets helpful error message
// - No phantom updates in optimistic update map
```

### Edge Case 6: Project ID from Parameter (Override)

```typescript
// Task removed from lists, but we have project_id from elsewhere
await dashboardService.updateTask('task-1', { name: 'Update' }, 'proj-1');

// Expected Behavior:
// - getState() returns null (task not found)
// - Uses provided project_id='proj-1'
// - Optimistic update still applied
// - API call succeeds

// Tests Should Verify:
// - projectId parameter overrides task lookup
// - Optimistic update applied even if task not in lists
// - API uses provided project_id
```

### Edge Case 7: API Failure (Network Error)

```typescript
// Network error during API call
await dashboardService.updateTask('task-1', { status: 'done' });
// Network fails here

// Expected Behavior:
// - Optimistic update applied (task marked done, removed from lists)
// - API fails (network error)
// - Rollback triggered
// - Task restored to original list with original status
// - User sees error message

// Tests Should Verify:
// - Task visible again in original list
// - Original status restored
// - optimisticUpdates Map cleaned up
// - Error returned to caller
```

### Edge Case 8: Date Change to Invalid Range (Outside Weekly)

```typescript
// Change date to 10 days from now (outside weekly view)
await dashboardService.updateTask('task-1', { start_date: '2025-10-16' });

// Expected Behavior:
// - Task removed from all current lists
// - NOT added to weeklyTasks (outside 7-day range)
// - Still tracked in allTasks
// - API call succeeds

// Tests Should Verify:
// - Task in allTasks but not in date-specific lists
// - Task reappears in weekly when date approaches
// - Stats reflect task no longer in weekly view
```

### Edge Case 9: Create Task with Past Date

```typescript
// Create task with date in the past
await dashboardService.createTask('proj-1', {
	name: 'Overdue task',
	start_date: '2025-10-01' // 5 days ago
});

// Expected Behavior:
// - Task added to pastDueTasks
// - Also added to weeklyTasks (if within 7 days)
// - Stats: activeTasks++, upcomingDeadlines++

// Tests Should Verify:
// - Task in correct date bucket
// - Weekly view includes past due
// - Temp ID replaced with real ID
```

### Edge Case 10: Batch Update Partial Failure

```typescript
// Some tasks succeed, some fail
await dashboardService.batchUpdateTasks('proj-1', [
	{ id: 'task-1', updates: { status: 'done' } },
	{ id: 'task-2', updates: { status: 'done' } },
	{ id: 'invalid', updates: { status: 'done' } } // This will fail
]);

// Expected Behavior:
// - All optimistic updates applied
// - API returns partial success or full failure
// - ALL updates rolled back (atomic operation)
// - User notified of failure

// Tests Should Verify:
// - Either all succeed or all rollback
// - No partial state (some done, some not)
// - optimisticUpdates Map cleaned up
```

## 6. Methods Tests Need to Mock

### DashboardStore Methods

```typescript
// Core State Management
dashboardStore.getState(); // Returns current state
dashboardStore.updateState(updates); // Batch state update

// Task Operations (return optimistic update ID)
dashboardStore.updateTask(taskId, updates); // Apply task update
dashboardStore.deleteTask(taskId); // Remove task
dashboardStore.addTask(task); // Add new task
dashboardStore.completeTask(taskId); // Mark as done

// Optimistic Update Lifecycle
dashboardStore.applyOptimisticUpdate(update); // Apply update
dashboardStore.confirmOptimisticUpdate(id); // Confirm success
dashboardStore.rollbackOptimisticUpdate(id); // Rollback on failure

// Utility Methods
dashboardStore.setLoading(loading); // Loading state
dashboardStore.setError(error); // Error state
dashboardStore.setTimezone(timezone); // Timezone
dashboardStore.setCalendarStatus(status); // Calendar connection
dashboardStore.reset(); // Reset to initial state
dashboardStore.isInitialized(); // Check init status
```

### DashboardDataService Methods

```typescript
// Core API Operations (return ServiceResponse)
dashboardService.updateTask(taskId, updates, projectId?)
dashboardService.deleteTask(taskId)
dashboardService.createTask(projectId, task)
dashboardService.completeTask(taskId)
dashboardService.batchUpdateTasks(projectId, updates[])
dashboardService.refreshTask(projectId, taskId)

// Dashboard Data
dashboardService.loadDashboardData(timezone)

// Calendar
dashboardService.updateCalendarStatus(connected)

// Cache Management
dashboardService.clearCache()

// Internal (may need for testing)
dashboardService.findTaskInAllLists(state, taskId) // Private but important
```

### API Service Methods (Base Class)

```typescript
// HTTP Methods (inherited from ApiService)
this.get<T>(endpoint, params?)
this.post<T>(endpoint, data)
this.patch<T>(endpoint, data)
this.delete<T>(endpoint)
```

### Mock Return Types

```typescript
// ServiceResponse (all API methods)
interface ServiceResponse<T> {
	success: boolean;
	data?: T;
	message?: string;
	error?: any;
}

// OptimisticUpdate (store operations)
interface OptimisticUpdate {
	id: string; // UUID
	type: 'create' | 'update' | 'delete';
	timestamp: number;
	data: any;
	rollbackData?: any;
}

// DashboardState (getState return)
interface DashboardState {
	pastDueTasks: TaskWithCalendarEvents[];
	todaysTasks: TaskWithCalendarEvents[];
	tomorrowsTasks: TaskWithCalendarEvents[];
	weeklyTasks: TaskWithCalendarEvents[];
	weeklyTasksByDate: Record<string, TaskWithCalendarEvents[]>;
	allTasks: TaskWithCalendarEvents[];
	activeProjects: Project[];
	// ... other fields
	optimisticUpdates: Map<string, OptimisticUpdate>;
}
```

## 7. Testing Strategy Recommendations

### Unit Tests (dashboardData.service.test.ts)

**Current Coverage:**

- ✅ Order of operations (getState before updateTask)
- ✅ projectId capture before optimistic update
- ✅ Error when project_id not found
- ✅ projectId parameter override
- ✅ Task finding in different lists
- ✅ Rollback on API failure
- ✅ Date change scenario

**Missing Coverage:**

- ❌ Delete operation flow
- ❌ Create operation with temp ID
- ❌ Batch update (all succeed, all rollback)
- ❌ Complete task (convenience method)
- ❌ Status='done' auto-removal
- ❌ Date change to invalid range (outside weekly)
- ❌ Concurrent updates to same task
- ❌ Calendar status update

### Unit Tests (dashboard.store.test.ts) - NEW FILE NEEDED

**Recommended Coverage:**

```typescript
describe('DashboardStore - Optimistic Updates', () => {
	describe('updateTask', () => {
		it('should create optimistic update with rollback data');
		it('should return unique update ID');
		it('should handle status="done" (remove from lists)');
		it('should handle date changes (move between lists)');
		it('should handle in-place updates (no date change)');
		it('should update stats appropriately');
	});

	describe('deleteTask', () => {
		it('should create delete optimistic update');
		it('should store full task in rollbackData');
		it('should remove from all lists');
		it('should return null if task not found');
		it('should update stats (activeTasks--)');
	});

	describe('addTask', () => {
		it('should add task to appropriate date lists');
		it('should handle past due dates');
		it('should handle future dates');
		it('should handle dates outside weekly range');
		it('should update stats (activeTasks++)');
	});

	describe('applyOptimisticUpdate', () => {
		it('should add update to tracking Map');
		it('should route to correct apply method');
		it('should handle update type');
		it('should handle create type');
		it('should handle delete type');
	});

	describe('rollbackOptimisticUpdate', () => {
		it('should restore task on update rollback');
		it('should remove task on create rollback');
		it('should restore task on delete rollback');
		it('should clean up tracking Map');
		it('should handle missing rollbackData');
	});

	describe('confirmOptimisticUpdate', () => {
		it('should remove update from Map');
		it('should not modify task state');
	});

	describe('applyTaskUpdate', () => {
		it('should handle status changes');
		it('should move task between date lists');
		it('should update weeklyTasksByDate');
		it('should remove from all lists on status=done');
		it('should clean up empty date buckets');
	});

	describe('applyTaskCreate', () => {
		it('should add to pastDueTasks for past dates');
		it('should add to todaysTasks for today');
		it('should add to tomorrowsTasks for tomorrow');
		it('should add to weeklyTasks if within 7 days');
		it('should add to weeklyTasksByDate');
	});

	describe('applyTaskDelete', () => {
		it('should remove from all lists');
		it('should remove from weeklyTasksByDate');
		it('should clean up empty date buckets');
		it('should update activeTasks stat');
	});

	describe('findTaskInState', () => {
		it('should find task in pastDueTasks');
		it('should find task in todaysTasks');
		it('should find task in tomorrowsTasks');
		it('should find task in weeklyTasks');
		it('should handle duplicates across lists');
		it('should return null if not found');
	});
});
```

### Integration Tests (Optional)

```typescript
describe('Dashboard Optimistic Updates - Integration', () => {
	it('should update task end-to-end');
	it('should handle date change with API call');
	it('should rollback on network failure');
	it('should handle concurrent updates');
	it('should handle create with temp ID replacement');
	it('should handle batch updates atomically');
});
```

## 8. Key Findings Summary

### Architecture Strengths

1. **Snapshot Pattern**: Capturing state before mutations prevents race conditions
2. **UUID Tracking**: Each optimistic update has unique ID for precise rollback
3. **Rollback Data**: Stores original state for perfect restoration
4. **Atomic Batches**: All-or-nothing for batch operations
5. **Temp ID Pattern**: Smooth user experience for task creation
6. **Defensive Validation**: Checks project_id before API calls

### Potential Improvements

1. **Type Safety**: `findTaskInAllLists` uses `any` types (Lines 389-410)
2. **Rollback Validation**: No check if rollback data is stale
3. **Optimistic Update Expiry**: No timeout for hanging updates
4. **Duplicate Prevention**: Multiple rapid updates create multiple tracking entries
5. **Stats Synchronization**: Stats updated optimistically but not rolled back precisely

### Testing Priorities

**High Priority:**

1. ✅ Race condition prevention (covered)
2. ✅ Order of operations (covered)
3. ❌ Store mutation logic (needs coverage)
4. ❌ Date-based list management (needs coverage)
5. ❌ Rollback scenarios (partially covered)

**Medium Priority:**

1. ❌ Batch operations
2. ❌ Concurrent updates
3. ❌ Stats accuracy
4. ❌ Calendar integration

**Low Priority:**

1. Cache invalidation
2. Error message clarity
3. Performance under load

## 9. Code Quality Observations

### Well-Implemented Patterns

1. **Singleton Services**: `DashboardDataService.getInstance()`
2. **Type-Safe Responses**: `ServiceResponse<T>` generic
3. **Consistent Error Handling**: All methods return ServiceResponse
4. **Immutable Updates**: Svelte store updates use spread operators
5. **Detailed Logging**: Console logs for debugging

### Areas for Improvement

1. **Type Assertions**: Several `any` types in store methods
2. **Error Recovery**: Limited error context for users
3. **Race Condition Detection**: No warning for concurrent updates
4. **Memory Leaks**: optimisticUpdates Map could grow unbounded
5. **Testing Coverage**: Store logic has no unit tests

## 10. Conclusion

The dashboard optimistic update flow is **well-architected** with sophisticated race condition prevention. The key innovation—capturing metadata before applying optimistic updates—ensures API calls can succeed even when tasks move between lists.

**Critical Requirements for Tests:**

1. Mock `dashboardStore.getState()` to return tasks in specific lists
2. Mock `dashboardStore.updateTask()` to return optimistic update IDs
3. Mock `dashboardStore.confirmOptimisticUpdate()` and `rollbackOptimisticUpdate()`
4. Verify **order of operations**: getState → findTask → validate → optimistic update → API call → confirm/rollback
5. Test **edge cases**: concurrent updates, date changes, missing tasks, API failures

**Next Steps for Comprehensive Testing:**

1. Create `dashboard.store.test.ts` with full coverage
2. Add missing service tests (delete, create, batch)
3. Add integration tests for complete flows
4. Add stress tests for concurrent operations
5. Add snapshot tests for state mutations

---

**References:**

- Service Implementation: `/apps/web/src/lib/services/dashboardData.service.ts`
- Store Implementation: `/apps/web/src/lib/stores/dashboard.store.ts`
- Existing Tests: `/apps/web/src/lib/services/dashboardData.service.test.ts`
