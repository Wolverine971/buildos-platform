---
date: 2025-10-24T17:00:00-00:00
researcher: Claude
git_commit: 1bebb2bec11c519c9bdbb310d3091cd7ee48f7a2
branch: main
repository: buildos-platform
topic: 'Timeblock Display Issue: Desktop vs Mobile Discrepancy'
tags: [research, codebase, timeblocks, dashboard, mobile, reactivity, svelte5]
status: complete
last_updated: 2025-10-24
last_updated_by: Claude
path: thoughts/shared/research/2025-10-24_17-00-00_timeblock-display-issue-analysis.md
---

# Research: Timeblock Display Issue Analysis

**Date**: 2025-10-24T17:00:00-00:00
**Researcher**: Claude
**Git Commit**: 1bebb2bec11c519c9bdbb310d3091cd7ee48f7a2
**Branch**: main
**Repository**: buildos-platform

## Research Question

Why are timeblocks for tomorrow showing up on the desktop view but not on mobile? And how are tasks and timeblocks being prefiltered differently?

## Summary

Found **two critical bugs** causing timeblock display inconsistencies between desktop and mobile views:

1. **Bug #1**: `MobileTaskTabs.svelte` uses outdated task-to-timeblock matching logic that compares midnight UTC dates with specific times, causing tasks to fail matching with their timeblocks
2. **Bug #2**: Desktop `TimeBlocksCard` components use incomplete `#key` blocks that only watch tasks, not timeblocks, preventing re-renders when timeblocks load

The fix in `TimeBlocksCard.svelte` (lines 78-90) addressed this for desktop, but `MobileTaskTabs.svelte` still has the old broken logic.

## Detailed Findings

### Component Architecture

**Desktop View** (apps/web/src/lib/components/dashboard/Dashboard.svelte:889-928):

- Uses separate `TimeBlocksCard` components for Past Due, Today, and Tomorrow
- Each card receives `{timeBlocks}` prop
- Cards are wrapped in `{#key}` blocks that only watch task arrays

**Mobile View** (apps/web/src/lib/components/dashboard/Dashboard.svelte:872-886):

- Uses single `MobileTaskTabs` component with tab switching
- Receives `{timeBlocks}` prop
- Wrapped in `{#key [pastDueTasks, todaysTasks, tomorrowsTasks, timeBlocks]}` block

### Bug #1: Task-to-Timeblock Matching Logic

#### Working Implementation (TimeBlocksCard.svelte:78-90)

```javascript
// CRITICAL FIX: Compare dates only, not times!
// task.start_date is just a date (e.g., "2025-10-25"), becomes midnight UTC
// Comparing with time block (e.g., "09:00") fails because midnight < 09:00
const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
const blockStartDate = new Date(
	blockStart.getFullYear(),
	blockStart.getMonth(),
	blockStart.getDate()
);
const blockEndDate = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate());
const isWithinDateRange = taskDateOnly >= blockStartDate && taskDateOnly <= blockEndDate;
const isWithinTimeRange = isWithinDateRange; // Use date range instead of time range
```

**Why this works**:

- Tasks have `start_date` as date-only strings (e.g., "2025-10-25")
- When parsed, these become midnight UTC: "2025-10-25T00:00:00Z"
- Timeblocks have `start_time` with specific times: "2025-10-25T09:00:00Z"
- Direct comparison `"2025-10-25T00:00:00Z" >= "2025-10-25T09:00:00Z"` = **FALSE** ❌
- Solution: Extract date components only, ignore time portions

#### Broken Implementation (MobileTaskTabs.svelte:105-117)

```javascript
const matchingTasks = activeTasks.filter((task) => {
	if (!task.start_date) return false;
	const taskDate = new Date(task.start_date);

	const isWithinTimeRange = taskDate >= blockStart && taskDate <= blockEnd; // BUG!
	const isMatchingProject = block.block_type === 'build' || task.project_id === block.project_id;

	return isWithinTimeRange && isMatchingProject && !taskAssignedToBlock.has(task.id);
});
```

**Why this breaks**:

- Compares full timestamps including time portions
- Task at midnight (00:00) will always be less than a timeblock at 09:00
- Result: Tasks won't be grouped with their timeblocks on mobile

### Bug #2: Reactivity Key Blocks

#### Desktop Key Blocks (Dashboard.svelte:892-927)

```javascript
{#key pastDueTasks}  <!-- Only watches pastDueTasks -->
    <TimeBlocksCard title="Past Due" tasks={pastDueTasks} ... />
{/key}

{#key todaysTasks}  <!-- Only watches todaysTasks -->
    <TimeBlocksCard title="Today" tasks={todaysTasks} {timeBlocks} ... />
{/key}

{#key tomorrowsTasks}  <!-- Only watches tomorrowsTasks -->
    <TimeBlocksCard title="Tomorrow" tasks={tomorrowsTasks} {timeBlocks} ... />
{/key}
```

**Problem**:

- If `timeBlocks` loads **after** initial render, components won't re-render
- Svelte 5 `$derived` should theoretically be reactive, but `#key` blocks can interfere
- The `#key` block forces a component recreation only when the keyed values change

#### Mobile Key Block (Dashboard.svelte:874-885)

```javascript
{#key [pastDueTasks, todaysTasks, tomorrowsTasks, timeBlocks]}  <!-- Correct! -->
    <MobileTaskTabs
        {pastDueTasks}
        {todaysTasks}
        {tomorrowsTasks}
        {timeBlocks}
        ...
    />
{/key}
```

**This is correct**: Includes all dependencies including `timeBlocks`

### Timeblock Filtering Logic

Both components use identical filtering:

**TimeBlocksCard.svelte:56-61**:

```javascript
if (title.includes('Today')) {
	filteredBlocks = timeBlocks.filter((block) => isDateToday(block.start_time));
} else if (title.includes('Tomorrow')) {
	filteredBlocks = timeBlocks.filter((block) => isDateTomorrow(block.start_time));
}
```

**MobileTaskTabs.svelte:88-96**:

```javascript
if (activeTab === 1) {
	// Today tab
	filteredBlocks = timeBlocks.filter((block) => isDateToday(block.start_time));
} else if (activeTab === 2) {
	// Tomorrow tab
	filteredBlocks = timeBlocks.filter((block) => isDateTomorrow(block.start_time));
}
```

Both use the same date utilities (apps/web/src/lib/utils/date-utils.ts:573-607):

- `isDateToday()`: Converts to user timezone, compares year/month/day
- `isDateTomorrow()`: Uses `addDays(startOfDay(todayInTz), 1)` for timezone-safe comparison

**Filtering is correct in both components**.

### Timeblock Loading Sequence

apps/web/src/lib/components/dashboard/Dashboard.svelte:277-298:

```javascript
onMount(async () => {
	// Initialize store with existing data if available
	if (initialData) {
		initializeStore(initialData);
	} else {
		await dashboardDataService.loadDashboardData(timezone);
	}

	// Load time blocks for Today and Tomorrow
	await loadTimeBlocks(); // ← Loads AFTER initial render!

	setupLazyLoading();
});
```

**Timeline**:

1. Component mounts with `initialData` (tasks loaded)
2. Desktop cards render with empty `timeBlocks = []`
3. `loadTimeBlocks()` fetches timeblock data
4. `timeBlocks` prop updates
5. **Desktop**: No re-render (key doesn't include timeBlocks) ❌
6. **Mobile**: Re-renders (key includes timeBlocks) ✅

But Svelte 5 `$derived` should update automatically... unless the `#key` block prevents it.

## Code References

- `apps/web/src/lib/components/dashboard/Dashboard.svelte:423-453` - loadTimeBlocks() function
- `apps/web/src/lib/components/dashboard/Dashboard.svelte:874-885` - Mobile view rendering
- `apps/web/src/lib/components/dashboard/Dashboard.svelte:889-928` - Desktop view rendering
- `apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte:82-131` - groupedContent logic
- `apps/web/src/lib/components/dashboard/TimeBlocksCard.svelte:51-103` - groupedContent logic with fix
- `apps/web/src/lib/utils/date-utils.ts:573-607` - isDateToday() and isDateTomorrow() functions

## Architecture Insights

### Svelte 5 Runes Reactivity

Both components use `$derived.by()` for computed values:

```javascript
const groupedContent = $derived.by(() => {
	// Filtering and grouping logic
});
```

**Expected behavior**: Should automatically update when any dependencies (`timeBlocks`, `tasks`, `activeTab`) change.

**Actual behavior with #key blocks**: The `#key` block can prevent reactivity if it doesn't include all dependencies.

### Date Comparison Patterns

**Pattern to avoid**:

```javascript
const taskDate = new Date(task.start_date);  // "2025-10-25T00:00:00Z"
const blockStart = new Date(block.start_time); // "2025-10-25T09:00:00Z"
if (taskDate >= blockStart) { ... }  // FALSE! ❌
```

**Correct pattern**:

```javascript
const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
const blockDateOnly = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate());
if (taskDateOnly >= blockDateOnly) { ... }  // TRUE! ✅
```

## Required Fixes

### Fix #1: Update MobileTaskTabs.svelte Task Matching Logic

**File**: apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte:105-117

**Change**:

```javascript
// OLD (broken):
const isWithinTimeRange = taskDate >= blockStart && taskDate <= blockEnd;

// NEW (fixed):
const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
const blockStartDate = new Date(
	blockStart.getFullYear(),
	blockStart.getMonth(),
	blockStart.getDate()
);
const blockEndDate = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate());
const isWithinDateRange = taskDateOnly >= blockStartDate && taskDateOnly <= blockEndDate;
const isWithinTimeRange = isWithinDateRange;
```

### Fix #2: Update Dashboard.svelte Key Blocks

**File**: apps/web/src/lib/components/dashboard/Dashboard.svelte:889-928

**Change**: Add `timeBlocks` to all TimeBlocksCard #key blocks:

```javascript
// OLD:
{#key todaysTasks}
{#key tomorrowsTasks}

// NEW:
{#key [todaysTasks, timeBlocks]}
{#key [tomorrowsTasks, timeBlocks]}
```

Note: Past Due doesn't need timeBlocks since it doesn't display them.

## Open Questions

1. **Performance**: Do the #key blocks cause unnecessary re-renders when tasks change but timeblocks don't?
    - Possible optimization: Use separate derived values for task-only updates vs timeblock updates

2. **Timezone handling**: Are timeblock start_time values correctly converted to user timezone?
    - Current code relies on `isDateToday()` and `isDateTomorrow()` which handle timezones
    - Should be fine, but worth monitoring in different timezones

3. **Why didn't Svelte 5 reactivity catch this?**
    - The `$derived` should update automatically when props change
    - But the `#key` block forces component destruction/recreation based on the key value
    - This appears to override the normal prop reactivity

## Testing Checklist

After applying fixes:

- [ ] Desktop "Today" tab shows today's timeblocks
- [ ] Desktop "Tomorrow" tab shows tomorrow's timeblocks
- [ ] Mobile "Today" tab shows today's timeblocks
- [ ] Mobile "Tomorrow" tab shows tomorrow's timeblocks
- [ ] Tasks are correctly grouped under their timeblocks (not loose)
- [ ] Timeblocks without matching tasks still display
- [ ] Test with timeblocks that have start times at different hours (morning, afternoon, evening)
- [ ] Test timezone edge cases (user in different timezone than UTC)
