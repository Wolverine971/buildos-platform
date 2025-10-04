---
date: 2025-10-03T22:00:00-04:00
researcher: Claude Code
git_commit: 804149a327d20e64b02e9fc12b77e117a3fa2f53
branch: main
repository: buildos-platform
topic: "Phase Scheduling Modal - Continuous Loading State Bug"
tags: [research, codebase, bug-analysis, scheduling, loading-state, race-condition]
status: complete
last_updated: 2025-10-03
last_updated_by: Claude Code
---

# Research: Phase Scheduling Modal - Continuous Loading State Bug

**Date**: 2025-10-03T22:00:00-04:00
**Researcher**: Claude Code
**Git Commit**: 804149a327d20e64b02e9fc12b77e117a3fa2f53
**Branch**: main
**Repository**: buildos-platform

## Research Question

Why does the project page get stuck in a continuous loading state after scheduling tasks in a phase and confirming the reschedule?

## Summary

The continuous loading state is caused by a **race condition between two separate loading state management systems** that get out of sync after task scheduling completes. When the user clicks "Schedule Tasks":

1. The modal successfully saves schedules and dispatches a 'scheduled' event
2. The parent page (`+page.svelte`) receives the event and triggers a refresh of tasks and phases
3. **The refresh operation sets loading states in `projectStoreV2.loadingStates`**
4. **But the skeleton display logic also checks `loadingStateManager.tabStates`**
5. If these two systems disagree on loading state, the page appears stuck in loading

Additionally, there's a **potential null preferences bug** in `task-time-slot-finder.ts` (recently fixed in uncommitted changes) that could cause the scheduling API to fail silently, leading to incomplete state updates.

## Detailed Findings

### 1. The Scheduling Flow (Happy Path)

#### Step 1: User Clicks "Schedule Tasks"

**File**: `apps/web/src/lib/components/project/PhaseSchedulingModal.svelte:148-169`

```typescript
async function scheduleAllTasks() {
  if (phaseValidationWarning && phaseValidationWarning.includes('Phase dates issue')) {
    toastService.error('Cannot schedule tasks: Phase dates are outside project boundaries.');
    return;
  }

  const success = await schedulingStore.saveSchedules(projectId);

  if (success) {
    toastService.success(`Successfully scheduled ${proposedSchedules.length} tasks`);
    dispatch('scheduled', {
      phaseId: phase.id,
      projectId,
      taskCount: proposedSchedules.length,
      needsRefresh: true  // ← CRITICAL: Triggers parent refresh
    });
    handleClose();
  }
}
```

#### Step 2: schedulingStore.saveSchedules() Executes

**File**: `apps/web/src/lib/stores/schedulingStore.ts:272-324`

```typescript
async saveSchedules(projectId: string): Promise<boolean> {
  const state = get({ subscribe });

  if (!state.phase || state.proposedSchedules.length === 0) {
    return false;
  }

  update((s) => ({ ...s, status: 'saving', error: null }));

  try {
    const scheduleData = state.proposedSchedules.map((s) => ({
      taskId: s.task.id,
      start_date: s.proposedStart.toISOString(),
      duration_minutes: s.duration_minutes
    }));

    const response = await fetch(
      `/api/projects/${projectId}/phases/${state.phase.id}/schedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: false,
          schedule: scheduleData,
          timeZone: state.timeZone
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to schedule tasks');
    }

    const result = await response.json();

    update((s) => ({
      ...s,
      status: 'ready',
      isDirty: false,
      warnings: result.warnings || []
    }));

    return true;  // ← SUCCESS: Returns to modal
  } catch (error: any) {
    update((s) => ({
      ...s,
      status: 'error',
      error: error.message || 'Failed to save schedules'
    }));
    return false;
  }
}
```

#### Step 3: API Endpoint Processes Schedule

**File**: `apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`

The endpoint:
1. Validates schedule data
2. **Uses `TaskTimeSlotFinder` to verify/optimize time slots** (Line 874-875)
3. Updates each task in the database with new `start_date` and `duration_minutes`
4. Creates/updates Google Calendar events for each task
5. Returns success response with warnings

**Critical Code** (Lines 341-354):
```typescript
// Get user calendar preferences
const { data: preferences } = await supabase
  .from('user_calendar_preferences')
  .select('*')
  .eq('user_id', user.id)
  .single();

const userPreferences = preferences || {
  work_start_time: '09:00:00',
  work_end_time: '17:00:00',
  working_days: [1, 2, 3, 4, 5],
  default_task_duration_minutes: 60,
  exclude_holidays: true,
  timeZone: timeZone || 'America/New_York'
};
```

**BUG POTENTIAL**: If `preferences` is null, fallback is used. But `TaskTimeSlotFinder` fetches preferences independently and may not have the same null-safety (see Section 3).

#### Step 4: Parent Page Receives 'scheduled' Event

**File**: `apps/web/src/routes/projects/[id]/+page.svelte:608-642`

```typescript
async function handleTasksScheduled(event: CustomEvent) {
  const { successfulTasks, failedTasks, totalTasks, needsRefresh } = event.detail;

  // Show success message
  if (successfulTasks && successfulTasks.length > 0) {
    const successCount = successfulTasks.length;
    const failureCount = failedTasks ? failedTasks.length : 0;

    if (failureCount > 0) {
      toastService.warning(
        `Scheduled ${successCount} of ${totalTasks} tasks. ${failureCount} failed.`
      );
    } else {
      toastService.success(`Successfully scheduled ${successCount} tasks`);
    }
  }

  // Force reload of tasks and phases to ensure UI is fully synced
  if (needsRefresh && dataService && data.project?.id) {
    try {
      // Set loading state while refreshing
      projectStoreV2.setLoadingState('tasks', 'loading');  // ← LOADING STATE SET

      // Reload tasks with calendar events
      await dataService.loadTasks({ force: true });
      // Reload phases to update phase-level task counts and statuses
      await dataService.loadPhases({ force: true });

      projectStoreV2.setLoadingState('tasks', 'idle');  // ← LOADING STATE CLEARED
    } catch (error) {
      console.error('Error refreshing data after scheduling:', error);
      projectStoreV2.setLoadingState('tasks', 'error');
    }
  }
}
```

**THIS IS WHERE THE BUG OCCURS** ↓

### 2. The Loading State Management Conflict

The project page uses **TWO SEPARATE loading state systems** that must stay in sync:

#### System 1: projectStoreV2.loadingStates

**File**: `apps/web/src/lib/stores/project.store.ts`

```typescript
interface ProjectStoreState {
  loadingStates: {
    project: LoadingState;
    tasks: LoadingState;
    notes: LoadingState;
    phases: LoadingState;
    briefs: LoadingState;
    synthesis: LoadingState;
    stats: LoadingState;
    calendar: LoadingState;
  };
  // ... other state
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'refreshing';
```

**Updated by**:
- `projectStoreV2.setLoadingState(key, state)`
- `projectStoreV2.loadTasks()` sets `loadingStates.tasks = 'loading'` → `'success'`
- `projectStoreV2.loadPhases()` sets `loadingStates.phases = 'loading'` → `'success'`

#### System 2: loadingStateManager.tabStates

**File**: `apps/web/src/lib/utils/loadingStateManager.ts`

```typescript
class LoadingStateManager {
  private tabStates: Map<string, TabLoadingState> = new Map();

  setDataLoading(tab: string, state: 'idle' | 'loading' | 'success' | 'error', hasExistingData: boolean) {
    // Updates tabStates for the given tab
  }

  setComponentLoading(tab: string, loading: boolean) {
    // Updates component loading state
  }
}
```

**Updated by**:
- `loadingStateManager.setDataLoading('overview', 'success', true)` (Line 1245)
- `loadingStateManager.setDataLoading('tasks', 'success', true)` (Line 1246)
- Called during initial page load

#### The Conflict: Skeleton Display Logic

**File**: `apps/web/src/routes/projects/[id]/+page.svelte:916-938`

```typescript
let shouldShowSkeleton = $derived.by(() => {
  try {
    // Always show skeleton until store is initialized
    if (!storeInitialized) return true;

    if (!activeTab) return true;

    // Check if data has been loaded (success state) for the current tab
    // This now properly handles empty projects by checking loading state, not content
    const hasData = getHasExistingDataForTab(activeTab);  // ← CHECKS STORE

    // Check if component is loading or not loaded
    const isComponentLoading = loadingComponents[getComponentNameForTab(activeTab)] || false;
    const isComponentLoaded = isComponentLoadedForTab(activeTab);

    // Show skeleton if data hasn't loaded OR if component is not ready
    return !hasData || isComponentLoading || !isComponentLoaded;
  } catch (error) {
    console.error('[Page] Error accessing shouldShowSkeleton:', error);
    return true; // Default to showing skeleton on error
  }
});
```

**The getHasExistingDataForTab() function** (Lines 336-355):

```typescript
function getHasExistingDataForTab(tab: string): boolean {
  // Check if data has been loaded (regardless of whether it's empty)
  // This ensures skeleton only shows during actual loading, not for empty projects
  switch (tab) {
    case 'overview':
      return loadingStates.phases === 'success' && loadingStates.tasks === 'success';  // ← CHECKS STORE
    case 'tasks':
      return loadingStates.tasks === 'success';
    case 'notes':
      return loadingStates.notes === 'success';
    case 'briefs':
      return loadingStates.briefs === 'success';
    case 'synthesis':
      // Synthesis is special - check both loading state and content
      return loadingStates.synthesis === 'success' || synthesis !== null;
    default:
      return false;
  }
}
```

**THE BUG**:

1. After scheduling, `handleTasksScheduled()` sets `projectStoreV2.setLoadingState('tasks', 'loading')`
2. It then calls `dataService.loadTasks({ force: true })`
3. **`loadTasks()` internally updates `loadingStates.tasks` from `'loading'` → `'success'`**
4. **BUT**: If the load fails or is interrupted, state could be stuck at `'loading'`
5. **The skeleton logic checks `loadingStates.tasks === 'success'`** to decide if data is ready
6. **If state is stuck at `'loading'`, `hasData = false`, so skeleton stays visible forever**

### 3. The TaskTimeSlotFinder Null Preferences Bug

**File**: `apps/web/src/lib/services/task-time-slot-finder.ts:41-77`

**Current Code (with recent uncommitted fix)**:

```typescript
async scheduleTasks(tasksToSchedule: Task[], userId: string): Promise<Task[]> {
  const { data: userCalendarPreferences, error: userCalendarPreferencesError } =
    await this.supabase
      .from('user_calendar_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

  if (userCalendarPreferencesError) {
    console.error(userCalendarPreferencesError);
    console.log('no calendar preferences');
  }

  // Provide default preferences if none exist (don't auto-create in DB)
  const preferences = userCalendarPreferences || {
    user_id: userId,
    id: '',
    timezone: 'America/New_York',
    work_start_time: '09:00:00',
    work_end_time: '17:00:00',
    working_days: [1, 2, 3, 4, 5],
    default_task_duration_minutes: 60,
    min_task_duration_minutes: 30,
    max_task_duration_minutes: 240,
    exclude_holidays: true,
    holiday_country_code: 'US',
    prefer_morning_for_important_tasks: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (userCalendarPreferencesError) {
    console.warn('No calendar preferences found for user, using defaults:', {
      userId,
      errorCode: userCalendarPreferencesError.code
    });
  }

  // ... rest of scheduling logic
}
```

**CRITICAL OBSERVATION**:

The file `task-time-slot-finder.ts` shows as **modified in git status** (uncommitted changes). The default preferences fallback (lines 54-77) appears to be a **recent bug fix** to handle the case where `userCalendarPreferences` is null.

**Before this fix**, if a user had no calendar preferences:
1. `userCalendarPreferences` would be `null`
2. Code might have crashed or behaved unpredictably
3. API endpoint might return partial success
4. Modal might dispatch 'scheduled' event even though scheduling failed
5. Parent page tries to refresh, but tasks weren't actually updated correctly
6. **Loading state gets stuck because expected data never arrives**

### 4. The Promise.allSettled Masking Issue

**File**: `apps/web/src/routes/projects/[id]/+page.svelte:1229-1247`

During initial page load:

```typescript
// FIXED: Load all essential data eagerly on project init
await Promise.allSettled([
  dataService.loadPhases(),
  dataService.loadTasks(),
  dataService.loadNotes(),
  dataService.loadStats(),
  dataService.loadCalendarStatus()
]);

// FIXED: Load overview component AFTER data is loaded and await it
await loadComponent('PhasesSection', 'overview');

// Mark all tabs as having data loaded
loadingStateManager.setDataLoading('overview', 'success', true);  // ← UNCONDITIONAL
loadingStateManager.setDataLoading('tasks', 'success', true);
loadingStateManager.setDataLoading('notes', 'success', true);
```

**THE ISSUE**:

`Promise.allSettled()` **never rejects** - it resolves even if all promises fail. The code then **unconditionally** marks data as loaded (`'success'`).

However, if `dataService.loadTasks()` actually failed:
- `projectStoreV2.loadingStates.tasks` would be `'error'` or stuck at `'loading'`
- `loadingStateManager` thinks it's `'success'`
- Skeleton logic checks `loadingStates.tasks === 'success'` (from store)
- **Mismatch: Manager says ready, store says not ready → skeleton never hides**

### 5. Race Condition Timeline

Here's the exact sequence that causes the bug:

```
T0: User clicks "Schedule Tasks"
    ↓
T1: schedulingStore.saveSchedules() called
    ↓
T2: API endpoint processes, updates DB, creates calendar events
    ↓
T3: API endpoint calls TaskTimeSlotFinder.scheduleTasks(userId)
    ↓
T4: TaskTimeSlotFinder fetches user_calendar_preferences
    ↓
T5a (Before fix): preferences is null → code crashes or returns wrong data
T5b (After fix): preferences is null → uses defaults, continues successfully
    ↓
T6: API returns success response (might be partial if T5a)
    ↓
T7: schedulingStore.saveSchedules() returns true
    ↓
T8: Modal dispatches 'scheduled' event with needsRefresh: true
    ↓
T9: handleTasksScheduled() receives event
    ↓
T10: projectStoreV2.setLoadingState('tasks', 'loading')  ← STORE STATE CHANGES
    ↓
T11: dataService.loadTasks({ force: true }) called
    ↓
T12: projectStoreV2.loadTasks() fetches /api/projects/:id/tasks
    ↓
T13a (Success path): Response OK → loadingStates.tasks = 'success'
T13b (Failure path): Response fails → loadingStates.tasks = 'error'
T13c (Timeout path): No response → loadingStates.tasks stuck at 'loading' ← BUG
    ↓
T14: shouldShowSkeleton checks getHasExistingDataForTab('overview')
    ↓
T15: getHasExistingDataForTab returns loadingStates.tasks === 'success'
    ↓
T16a (T13a): hasData = true → skeleton hides ✓
T16b (T13b): hasData = false → skeleton shows with error message ✓
T16c (T13c): hasData = false → skeleton shows FOREVER ✗ BUG
```

**The T13c path (timeout/stuck loading) is the continuous loading bug.**

## Code References

### Key Files

- `apps/web/src/lib/components/project/PhaseSchedulingModal.svelte:148-169` - scheduleAllTasks() function
- `apps/web/src/lib/stores/schedulingStore.ts:272-324` - saveSchedules() implementation
- `apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - Schedule API endpoint
- `apps/web/src/lib/services/task-time-slot-finder.ts:41-77` - Null preferences handling (recent fix)
- `apps/web/src/routes/projects/[id]/+page.svelte:608-642` - handleTasksScheduled() event handler
- `apps/web/src/routes/projects/[id]/+page.svelte:336-355` - getHasExistingDataForTab() logic
- `apps/web/src/routes/projects/[id]/+page.svelte:916-938` - shouldShowSkeleton derived state
- `apps/web/src/lib/stores/project.store.ts:186-247` - loadTasks() implementation
- `apps/web/src/lib/stores/project.store.ts:277-324` - loadPhases() implementation
- `apps/web/src/lib/utils/loadingStateManager.ts` - Secondary loading state system

### Modified Files (Git Status)

```
M apps/web/src/lib/services/task-time-slot-finder.ts
M apps/web/src/routes/projects/[id]/+page.svelte
M apps/web/src/routes/projects/[id]/tasks/[taskId]/+page.svelte
```

## Architecture Insights

### Dual Loading State System

The project page architecture uses **two independent loading state tracking systems**:

1. **Primary (Store-based)**: `projectStoreV2.loadingStates` - Updated by data fetch operations
2. **Secondary (Manager-based)**: `loadingStateManager.tabStates` - Updated during initialization

**WHY THIS EXISTS**:
- Manager tracks component loading vs data loading separately
- Store tracks actual data fetch lifecycle
- Intended for fine-grained loading UX (show skeleton only during real loading, not for empty data)

**WHY IT'S PROBLEMATIC**:
- Two sources of truth that can desync
- Skeleton logic checks store states, but manager also sets states
- No synchronization mechanism between them
- Updates during refresh only touch store, not manager

### TaskTimeSlotFinder Service Architecture

**Design Pattern**: Smart scheduler with fallback preferences

```
User Preferences (DB)
  ↓
TaskTimeSlotFinder.scheduleTasks(tasks, userId)
  ↓
Fetch user_calendar_preferences
  ↓
If null → Use hardcoded defaults (work hours, days, timezone)
  ↓
Group tasks by day
  ↓
For each day:
  - Check working day
  - Get existing tasks from DB
  - Find available time slots
  - Schedule or bump to next day
  ↓
Return tasks with updated start_date
```

**Critical Design Flaw**: The service **refetches** preferences even though the API endpoint already fetched them. This duplication creates:
- Extra DB queries
- Potential for inconsistent defaults if not both updated
- Risk of null handling bugs in either location

## Potential Fixes

### Fix 1: Consolidate to Single Loading State System (Recommended)

**Problem**: Two loading state systems that can desync

**Solution**: Use only `projectStoreV2.loadingStates` and remove `loadingStateManager` from the equation.

**Code Change** (`apps/web/src/routes/projects/[id]/+page.svelte`):

```typescript
// REMOVE loadingStateManager calls during init
// DELETE lines 1245-1247:
// loadingStateManager.setDataLoading('overview', 'success', true);
// loadingStateManager.setDataLoading('tasks', 'success', true);
// loadingStateManager.setDataLoading('notes', 'success', true);

// Keep only store-based loading state management
```

### Fix 2: Check Promise.allSettled Results

**Problem**: Failed loads are marked as successful

**Solution**: Inspect results and only mark successful loads

**Code Change** (`apps/web/src/routes/projects/[id]/+page.svelte:1229-1247`):

```typescript
const results = await Promise.allSettled([
  dataService.loadPhases(),
  dataService.loadTasks(),
  dataService.loadNotes(),
  dataService.loadStats(),
  dataService.loadCalendarStatus()
]);

// Check which operations succeeded
const loadTasksResult = results[1];  // loadTasks() is index 1
const loadPhasesResult = results[0]; // loadPhases() is index 0

// Only mark as loaded if actually successful
if (loadPhasesResult.status === 'fulfilled' && loadTasksResult.status === 'fulfilled') {
  console.log('[Page] Essential data loaded successfully');
} else {
  console.error('[Page] Some data failed to load:', {
    phases: loadPhasesResult.status,
    tasks: loadTasksResult.status
  });
  // Don't mark as success - let store states reflect reality
}

// Load component regardless (for error display)
await loadComponent('PhasesSection', 'overview');
```

### Fix 3: Add Timeout/Retry Logic

**Problem**: Loading can get stuck indefinitely

**Solution**: Add timeout and retry mechanism

**Code Change** (`apps/web/src/lib/stores/project.store.ts:186-247`):

```typescript
async loadTasks(projectId: string, force = false): Promise<void> {
  // ... existing code ...

  this.updateLoadingState('tasks', 'loading');

  try {
    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(`/api/projects/${projectId}/tasks`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Failed to fetch tasks');

    // ... rest of existing code ...
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[Store] Task loading timed out after 10s');
      this.setError('tasks', 'Loading timed out - please retry');
    } else {
      console.error('[Store] Error loading tasks:', error);
      this.setError('tasks', error instanceof Error ? error.message : 'Failed to load tasks');
    }
  }
}
```

### Fix 4: Ensure TaskTimeSlotFinder Null-Safety is Complete

**Problem**: Null preferences might still cause issues despite recent fix

**Solution**: Verify the uncommitted changes are correct and commit them

**Action Items**:
1. Review uncommitted changes to `task-time-slot-finder.ts`
2. Add tests for null preferences case
3. Commit the fix
4. Consider passing preferences from API endpoint instead of refetching

### Fix 5: Add Loading State Debug Panel (Development Only)

**Problem**: Hard to diagnose loading state issues

**Solution**: Add dev-only UI showing current loading states

**Code Change** (`apps/web/src/routes/projects/[id]/+page.svelte`):

```typescript
{#if import.meta.env.DEV}
  <div class="fixed bottom-4 right-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg text-xs">
    <div class="font-bold mb-2">Loading States Debug</div>
    <div>Store States:</div>
    <pre>{JSON.stringify(loadingStates, null, 2)}</pre>
    <div class="mt-2">Should Show Skeleton: {shouldShowSkeleton}</div>
    <div>Store Initialized: {storeInitialized}</div>
    <div>Active Tab: {activeTab}</div>
    <div>Has Data: {getHasExistingDataForTab(activeTab)}</div>
  </div>
{/if}
```

## Open Questions

1. **Why are there two loading state systems?** Is `loadingStateManager` actually being used for anything critical, or can it be safely removed?

2. **What's the full scope of the task-time-slot-finder.ts uncommitted changes?** Should these be committed as a separate bug fix?

3. **Are there other places in the codebase with similar dual-state issues?** Should we audit all pages for this pattern?

4. **Should TaskTimeSlotFinder receive preferences as a parameter** instead of fetching them? This would eliminate the duplicate query and ensure consistency.

5. **Is there a timeout on the fetch calls?** If network is slow, could requests hang indefinitely?

## Recommended Next Steps

1. **Immediate Fix**: Commit the `task-time-slot-finder.ts` null preferences fix
2. **Short-term**: Add timeout/retry logic to `projectStoreV2.loadTasks()` and `loadPhases()`
3. **Medium-term**: Consolidate to single loading state system (remove `loadingStateManager`)
4. **Long-term**: Refactor to avoid duplicate preferences fetching in API endpoint and TaskTimeSlotFinder

## Related Research

This investigation revealed architectural patterns that may affect other parts of the application:

- Dual state management systems (store + manager)
- Promise.allSettled masking failures
- Null safety in service layer
- Svelte 5 $derived reactive dependency chains

Consider auditing other pages for similar issues.
