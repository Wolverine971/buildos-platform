---
date: 2025-09-24T12:00:00-08:00
researcher: Claude
git_commit: 0981be4cbf59baad804912c133e83a7fb7c3ebe4
branch: main
repository: build_os
topic: 'Loading State Issue with Empty Projects'
tags: [research, codebase, bug-investigation, loading-state, empty-projects]
status: complete
last_updated: 2025-09-24
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-09-24_loading-state-empty-projects-issue.md
---

# Research: Loading State Issue with Empty Projects

**Date**: 2025-09-24T12:00:00-08:00
**Researcher**: Claude
**Git Commit**: 0981be4cbf59baad804912c133e83a7fb7c3ebe4
**Branch**: main
**Repository**: build_os

## Research Question

Investigate why the project page gets stuck in a loading state when there are no tasks loaded. The component should properly load if there are no tasks and allow users to create tasks and phases.

## Summary

The loading state issue occurs because the `getHasExistingDataForTab()` function in `/src/routes/projects/[id]/+page.svelte` conflates "has data loaded" with "has data content". When a project has no tasks or phases, the function returns `false`, causing the skeleton loader to remain visible indefinitely even though data loading has completed successfully with empty arrays.

## Detailed Findings

### Root Cause: getHasExistingDataForTab Function

The problematic function at `src/routes/projects/[id]/+page.svelte:217-233`:

```typescript
function getHasExistingDataForTab(tab: string): boolean {
	switch (tab) {
		case 'overview':
			return phases.length > 0 || tasks.length > 0; // ← Problem!
		case 'tasks':
			return tasks.length > 0; // ← Problem!
		case 'notes':
			return notes.length > 0;
		case 'briefs':
			return briefs.length > 0;
		case 'synthesis':
			return synthesis !== null;
		default:
			return false;
	}
}
```

**Issue**: This function returns `false` for empty projects, even when data has been successfully loaded.

### shouldShowSkeleton Logic

The skeleton display logic at `src/routes/projects/[id]/+page.svelte:807-828`:

```typescript
let shouldShowSkeleton = $derived.by(() => {
	if (!storeInitialized) return true;
	if (!activeTab) return true;

	const hasData = getHasExistingDataForTab(activeTab);
	const isComponentLoading = loadingComponents[getComponentNameForTab(activeTab)] || false;
	const isComponentLoaded = isComponentLoadedForTab(activeTab);

	// Show skeleton if we don't have data OR if component is not ready
	return !hasData || isComponentLoading || !isComponentLoaded;
});
```

**Problem**: When `hasData` is `false` (empty project), the skeleton remains visible even after successful data loading.

### Data Loading Process

The initialization process correctly loads data at `src/routes/projects/[id]/+page.svelte:1018-1026`:

```typescript
await Promise.allSettled([
	dataService.loadPhases(),
	dataService.loadTasks(),
	dataService.loadNotes(),
	dataService.loadStats(),
	dataService.loadCalendarStatus()
]);
```

The store correctly handles empty arrays (`src/lib/stores/project.store.ts:212-213`):

```typescript
const tasksList = result.data?.tasks || result.tasks || [];
this.store.update((state) => ({
	...state,
	tasks: tasksList, // Empty array is valid
	loadingStates: { ...state.loadingStates, tasks: 'success' }
}));
```

### PhasesSection Component

The PhasesSection component properly handles empty states (`src/lib/components/project/PhasesSection.svelte:633-639`):

- Shows EmptyState component when no phases exist
- Provides "Create Phase" and "Generate Phases" buttons
- Safely handles empty task arrays with fallbacks

## Code References

- `src/routes/projects/[id]/+page.svelte:217-233` - Problematic getHasExistingDataForTab function
- `src/routes/projects/[id]/+page.svelte:807-828` - shouldShowSkeleton logic that relies on hasData
- `src/routes/projects/[id]/+page.svelte:1018-1026` - Data loading during initialization
- `src/lib/stores/project.store.ts:186-247` - loadTasks implementation that correctly handles empty arrays
- `src/lib/stores/project.store.ts:277-324` - loadPhases implementation with proper empty handling
- `src/lib/components/project/PhasesSection.svelte:633-639` - Proper empty state handling in component

## Architecture Insights

1. **Store Design**: The projectStoreV2 correctly distinguishes between loading states (`'idle'`, `'loading'`, `'success'`, `'error'`) and data content
2. **Component Safety**: All components handle empty arrays gracefully with proper fallbacks
3. **API Layer**: Endpoints return empty arrays (not null) when no data exists
4. **Loading State Manager**: Exists but isn't fully integrated with the skeleton logic

## Recommended Fix

Replace the `getHasExistingDataForTab()` function to check loading state instead of data content:

```typescript
function getHasExistingDataForTab(tab: string): boolean {
	switch (tab) {
		case 'overview':
			return loadingStates.phases === 'success' && loadingStates.tasks === 'success';
		case 'tasks':
			return loadingStates.tasks === 'success';
		case 'notes':
			return loadingStates.notes === 'success';
		case 'briefs':
			return loadingStates.briefs === 'success';
		case 'synthesis':
			return loadingStates.synthesis === 'success' || synthesis !== null;
		default:
			return false;
	}
}
```

This change will:

1. Show skeleton only during actual data loading
2. Hide skeleton once data is loaded (even if empty)
3. Allow users to interact with empty project UI
4. Enable task and phase creation in empty projects

## Impact Analysis

**Affected Scenarios**:

- New projects created via "Create Empty Project" flow
- Projects where all tasks have been deleted
- Projects in early planning stages without tasks yet

**User Experience**:

- Currently: Stuck loading state prevents interaction
- After fix: Proper empty states with action buttons visible

## Related Research

- Previous optimization work documented in `/docs/design/OPTIMIZATION_REPORT.md`
- Loading state management patterns in `/src/lib/utils/loadingStateManager.ts`
