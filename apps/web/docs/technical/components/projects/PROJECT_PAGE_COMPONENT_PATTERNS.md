<!-- apps/web/docs/technical/components/projects/PROJECT_PAGE_COMPONENT_PATTERNS.md -->

# Project Page Component Patterns & Data Flow Guidelines

## Overview

This document defines the standard patterns for component development in the `/projects/[slug]` page ecosystem of Build OS. It specifically covers data flow, state management, and component communication patterns for all components used in the project management interface. All components within the project page context should follow these guidelines to ensure consistency, maintainability, and optimal performance.

## Core Principles

### 1. Single Source of Truth

- **All application data lives in stores** (primarily `projectStoreV2`)
- Components are views that react to store changes
- No data duplication between props and store

### 2. Clear Separation of Concerns

- **Store**: Manages all application state and data
- **Services**: Handle API calls and business logic
- **Components**: Present UI and handle user interactions
- **Props**: Only for callbacks and component-specific configuration

## Data Flow Pattern

### ✅ Standard Pattern (REQUIRED)

```svelte
<script lang="ts">
	import { projectStoreV2 } from '$lib/stores/project.store';
	import type { SomeType } from '$lib/types';

	// Props - ONLY callbacks and configuration
	export let onAction: (item: SomeType) => void;
	export let config: { someOption: boolean } = { someOption: false };

	// Get data from store
	$: storeState = $projectStoreV2;
	$: data = storeState.data || [];
	$: otherData = storeState.otherData;

	// Local UI state only (not business data)
	let isExpanded = false;
	let selectedItemId: string | null = null;
</script>
```

### ❌ Anti-Pattern (AVOID)

```svelte
<script lang="ts">
	// DON'T pass data through props if it's available in store
	export let tasks: Task[]; // ❌ Wrong
	export let project: Project; // ❌ Wrong

	// DON'T duplicate store data in local state
	let localTasks = tasks; // ❌ Wrong

	// DON'T manually subscribe to stores
	let unsubscribe: any;
	$: if (browser) {
		unsubscribe = store.subscribe((s) => {
			// ❌ Wrong
			state = s;
		});
	}
</script>
```

## Component Categories

### 1. Container Components (Page-level)

Components like `/routes/projects/[slug]/+page.svelte`

**Responsibilities:**

- Initialize stores and services
- Handle routing and navigation
- Orchestrate child components
- Manage lazy loading

**Pattern:**

```svelte
<script>
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { ProjectDataService } from '$lib/services/projectData.service';

	// Initialize services
	$: if (data.project?.id && browser) {
		dataService = new ProjectDataService(data.project.id);
	}

	// Initialize store with server data
	$: if (browser && data.project) {
		projectStoreV2.initialize(data.project, data.projectCalendar);
	}

	// Use Svelte's reactive store syntax
	$: state = browser ? $projectStoreV2 : {};
</script>
```

### 2. Feature Components

Components like `TasksList`, `PhasesSection`, `NotesSection`

**Responsibilities:**

- Display feature-specific UI
- Handle feature-specific interactions
- Get data from store
- Emit events or call callbacks

**Pattern:**

```svelte
<script>
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Props - only callbacks
	export let onEditTask: (task: Task) => void;
	export let onCreateTask: () => void;

	// Get data from store
	$: storeState = $projectStoreV2;
	$: tasks = storeState.tasks || [];
	$: phases = storeState.phases || [];

	// Feature-specific logic
	function handleTaskClick(task: Task) {
		onEditTask(task);
	}
</script>
```

### 3. Presentation Components

Pure UI components like `Button`, `Card`, `LoadingSkeleton`

**Responsibilities:**

- Pure presentation
- No store connections
- All data via props
- Emit DOM events

**Pattern:**

```svelte
<script>
	// All data through props (these don't connect to stores)
	export let title: string;
	export let variant: 'primary' | 'secondary' = 'primary';
	export let disabled = false;

	// Local UI state only
	let isHovered = false;
</script>
```

## Props Usage Guidelines

### ✅ Valid Props

1. **Callbacks/Event Handlers**

    ```svelte
    export let onEdit: (item: Item) => void;
    export let onDelete: (id: string) => Promise<boolean>;
    ```

2. **Component Configuration**

    ```svelte
    export let variant: 'compact' | 'full' = 'full'; export let showHeader = true; export let
    maxItems = 10;
    ```

3. **External Dependencies**

    ```svelte
    export let calendarConnected: boolean = false; export let innerWidth: number;
    ```

4. **UI State from Parent**
    ```svelte
    export let isLoading = false; export let error: string | null = null;
    ```

### ❌ Invalid Props

1. **Data Available in Store**

    ```svelte
    export let tasks: Task[]; // ❌ Get from store instead export let project: Project; // ❌ Get
    from store instead
    ```

2. **Computed Values**
    ```svelte
    export let completedTaskCount: number; // ❌ Compute from store data
    ```

## Event Handling Patterns

### Standard Callback Pattern (RECOMMENDED)

```svelte
<script>
	export let onTaskCreate: (task: Task) => void;
	export let onTaskUpdate: (task: Task) => Promise<void>;

	async function handleUpdate(task: Task) {
		try {
			await onTaskUpdate(task);
			// Handle success
		} catch (error) {
			// Handle error
		}
	}
</script>
```

### Custom Events (ONLY when needed)

Use custom events only when:

- Multiple handlers might be attached
- Event bubbling is needed
- Component doesn't know its parent

```svelte
<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		update: Task;
		delete: string;
	}>();

	function handleUpdate(task: Task) {
		dispatch('update', task);
	}
</script>
```

## Store Subscription Patterns

### ✅ Correct: Reactive Store Subscription

```svelte
<script>
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Automatic subscription with cleanup
	$: storeState = $projectStoreV2;
	$: tasks = storeState.tasks || [];
</script>
```

### ❌ Wrong: Manual Subscription

```svelte
<script>
	import { onDestroy } from 'svelte';

	let unsubscribe: any;

	// DON'T do this - creates memory leaks
	$: if (browser) {
		unsubscribe = projectStoreV2.subscribe((s) => {
			state = s;
		});
	}

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});
</script>
```

## Performance Optimizations

### 1. Avoid Expensive Reactive Computations

```svelte
<script>
	// ❌ Wrong - runs on every store change
	$: {
		expensiveResult = expensiveFunction();
	}

	// ✅ Correct - only runs when dependencies change
	$: expensiveResult = (() => {
		if (!dependency1 || !dependency2) return defaultValue;

		// Track specific dependencies
		const key = {
			dep1: dependency1.id,
			dep2: dependency2.value
		};

		return expensiveFunction();
	})();
</script>
```

### 2. Preserve Component State

```svelte
<!-- ❌ Wrong - destroys component on tab change -->
{#key activeTab}
	<div>
		{#if activeTab === 'tasks'}
			<TasksList />
		{/if}
	</div>
{/key}

<!-- ✅ Correct - preserves component state -->
<div class:hidden={activeTab !== 'tasks'}>
	{#if activeTab === 'tasks'}
		<TasksList />
	{/if}
</div>
```

## Service Integration

### Using Services in Components

```svelte
<script>
	import { ProjectService } from '$lib/services/projectService';
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Get singleton instance
	const projectService = ProjectService.getInstance();

	// Use store methods for optimistic updates
	async function handleTaskCreate(task: Task) {
		// Store handles optimistic update and rollback
		await projectStoreV2.optimisticCreateTask(task, async () => {
			return await projectService.createTask(task, projectId);
		});
	}
</script>
```

## Component Checklist

When creating or updating a component, ensure:

- [ ] **Data from store**: All business data comes from stores
- [ ] **Props for config**: Props only for callbacks and configuration
- [ ] **No prop drilling**: Don't pass data through multiple levels
- [ ] **Reactive subscriptions**: Use `$store` syntax, not manual subscriptions
- [ ] **Optimistic updates**: Use store methods for immediate UI feedback
- [ ] **Error handling**: Consistent error handling with toastService
- [ ] **Loading states**: Use store loading states, not local
- [ ] **Memory management**: No manual subscriptions without cleanup
- [ ] **Performance**: Avoid expensive reactive computations
- [ ] **State preservation**: Don't destroy components unnecessarily

## Migration Guide

### Converting Components to Standard Pattern

1. **Remove data props**

    ```diff
    - export let tasks: Task[];
    - export let project: Project;
    ```

2. **Add store subscription**

    ```diff
    + import { projectStoreV2 } from '$lib/stores/project.store';
    +
    + $: storeState = $projectStoreV2;
    + $: tasks = storeState.tasks || [];
    + $: project = storeState.project;
    ```

3. **Keep only callbacks and config**

    ```diff
    export let onTaskEdit: (task: Task) => void;
    export let showCompleted = true;
    ```

4. **Update parent component**
    ```diff
    - <TasksList {tasks} {project} onEdit={handleEdit} />
    + <TasksList onEdit={handleEdit} />
    ```

## Examples

### Complete Component Example

```svelte
<!-- TasksList.svelte -->
<script lang="ts">
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { toastService } from '$lib/stores/toast.store';
	import type { Task } from '$lib/types/project';

	// Props - only callbacks and configuration
	export let onCreateTask: () => void;
	export let onEditTask: (task: Task) => void;
	export let onDeleteTask: (id: string) => Promise<void>;
	export let showFilters = true;

	// Get data from store
	$: storeState = $projectStoreV2;
	$: tasks = storeState.tasks || [];
	$: loadingStates = storeState.loadingStates || {};

	// Derived data
	$: activeTasks = tasks.filter((t) => !t.deleted_at && t.status !== 'done');
	$: isLoading = loadingStates.tasks === 'loading';

	// Local UI state only
	let selectedTaskId: string | null = null;
	let filterMenuOpen = false;

	// Handlers
	async function handleDelete(taskId: string) {
		try {
			await onDeleteTask(taskId);
			toastService.success('Task deleted');
		} catch (error) {
			toastService.error('Failed to delete task');
		}
	}
</script>

<div class="task-list">
	{#if isLoading}
		<LoadingSkeleton />
	{:else if activeTasks.length === 0}
		<EmptyState onAction={onCreateTask} />
	{:else}
		{#each activeTasks as task (task.id)}
			<TaskCard
				{task}
				selected={task.id === selectedTaskId}
				on:click={() => onEditTask(task)}
				on:delete={() => handleDelete(task.id)}
			/>
		{/each}
	{/if}
</div>
```

## Enforcement

- Code reviews should check for these patterns
- New components must follow these guidelines
- Existing components should be migrated when modified
- Use ESLint rules where possible to enforce patterns

## Related Documentation

- [Modal Standards](./MODAL_STANDARDS.md)
- [Service Architecture](./SERVICE_ARCHITECTURE.md)
- [Store Management](./STORE_MANAGEMENT.md)
- [Performance Guidelines](./PERFORMANCE.md)
