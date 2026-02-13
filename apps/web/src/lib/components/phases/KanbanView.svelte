<!-- apps/web/src/lib/components/phases/KanbanView.svelte -->
<script lang="ts">
	import { createEventDispatcher, onDestroy, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { LayoutGrid } from 'lucide-svelte';
	import BacklogSection from './BacklogSection.svelte';
	import RecurringTasksSection from './RecurringTasksSection.svelte';
	import PhaseCard from './PhaseCard.svelte';
	import { projectStoreV2 } from '$lib/stores/project.store';

	let {
		project,
		dragOverPhase = null,
		dragOverPhaseId = null,
		editingPhaseId = null,
		editingPhaseData = {},
		calendarConnected = false,
		loading = false
	}: {
		project: { id: string; start_date: string | null; end_date: string | null };
		dragOverPhase?: string | null;
		dragOverPhaseId?: string | null;
		editingPhaseId?: string | null;
		editingPhaseData?: any;
		calendarConnected?: boolean;
		loading?: boolean;
	} = $props();

	const dispatch = createEventDispatcher();

	// FIXED: Use direct store derivation instead of manual subscription
	let storeState = $derived($projectStoreV2);
	let phases = $derived(storeState.phases || []);
	let tasks = $derived(storeState.tasks || []);

	// Remove debug logging that causes unnecessary re-runs

	// Track collapsed state for each phase - use array for reactivity in Svelte 5
	// Initialize with completed phases collapsed by default
	let collapsedPhaseIds = $state<string[]>([]);
	let previousPhaseIds = $state<string[]>([]);
	// Track which phases have been manually expanded by the user
	let manuallyExpandedPhaseIds = $state<string[]>([]);
	// Track which phases we've already auto-collapsed to prevent re-collapsing
	let autoCollapsedPhaseIds = $state<string[]>([]);
	// Track if we've initialized collapsed state for the first time
	let initializedCollapsedState = $state(false);

	// Calculate backlog tasks (tasks not in any phase) using Svelte 5 runes
	let currentBacklogTasks = $derived.by(() => {
		const phasedTaskIds = new Set(
			phases.flatMap((p: any) => p.tasks?.map((t: any) => t.id) || [])
		);
		return tasks.filter(
			(t: any) =>
				!phasedTaskIds.has(t.id) &&
				t.status !== 'done' &&
				t.status !== 'completed' &&
				!t.deleted_at &&
				t.task_type !== 'recurring' // Exclude recurring from backlog
		);
	});

	// Get recurring tasks for this project using Svelte 5 runes
	let recurringTasks = $derived(
		tasks?.filter(
			(t: any) =>
				t.task_type === 'recurring' &&
				t.status !== 'done' &&
				t.status !== 'completed' &&
				!t.deleted_at
		) || []
	);

	let hasPhases = $derived(Array.isArray(phases) && phases.length > 0);

	// Get statistics for the current view using Svelte 5 runes
	let totalTasks = $derived(phases.reduce((sum, phase) => sum + phase.task_count, 0));
	let completedTasks = $derived(phases.reduce((sum, phase) => sum + phase.completed_tasks, 0));
	let overallProgress = $derived(
		totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
	);

	// Helper functions for phase status
	function getPhaseProgress(phase: any): number {
		if (phase.task_count === 0) return 100;
		return Math.round((phase.completed_tasks / phase.task_count) * 100);
	}

	function isPhaseComplete(phase: any): boolean {
		return getPhaseProgress(phase) === 100;
	}

	// Collapse/expand functionality
	function togglePhaseCollapse(phaseId: string) {
		const isCollapsed = collapsedPhaseIds.includes(phaseId);
		if (isCollapsed) {
			// Remove from collapsed
			collapsedPhaseIds = collapsedPhaseIds.filter((id) => id !== phaseId);
			// Mark as manually expanded to prevent auto-collapse
			if (!manuallyExpandedPhaseIds.includes(phaseId)) {
				manuallyExpandedPhaseIds = [...manuallyExpandedPhaseIds, phaseId];
			}
		} else {
			// Add to collapsed
			collapsedPhaseIds = [...collapsedPhaseIds, phaseId];
			// Remove from manually expanded since user collapsed it
			manuallyExpandedPhaseIds = manuallyExpandedPhaseIds.filter((id) => id !== phaseId);
		}
	}

	function handleToggleCollapse(event: CustomEvent) {
		togglePhaseCollapse(event.detail);
	}

	// Get global task filters from store using Svelte 5 runes
	let globalTaskFilters = $derived(
		storeState.globalTaskFilters || ['active', 'scheduled', 'overdue', 'recurring']
	);

	// Helper function to get task type (same logic as used elsewhere)
	function getTaskType(task: any): string {
		// Check recurring first so recurring tasks can also be categorized as overdue, scheduled, etc.
		if (task.task_type === 'recurring') return 'recurring';
		if (task.status === 'done' || task.status === 'completed') return 'completed';
		if (task.deleted_at) return 'deleted';
		if (task.start_date && new Date(task.start_date) < new Date() && task.status !== 'done') {
			return 'overdue';
		}
		const hasCalendarEvent = task.task_calendar_events?.some(
			(e: any) => e.sync_status === 'synced' || e.sync_status === 'pending'
		);
		return hasCalendarEvent ? 'scheduled' : 'active';
	}

	// Check if phase has tasks matching current filters
	function phaseHasMatchingTasks(phase: any): boolean {
		if (!phase.tasks || phase.tasks.length === 0) return false;
		return phase.tasks.some((task: any) => {
			const taskType = getTaskType(task);
			return globalTaskFilters.includes(taskType);
		});
	}

	// Initialize collapsed state on first load to collapse completed phases by default
	$effect(() => {
		// Only run once when phases first load
		if (!initializedCollapsedState && phases.length > 0) {
			const completedPhaseIds = phases
				.filter((phase) => isPhaseComplete(phase))
				.map((phase) => phase.id);

			if (completedPhaseIds.length > 0) {
				collapsedPhaseIds = completedPhaseIds;
				autoCollapsedPhaseIds = completedPhaseIds;
			}

			initializedCollapsedState = true;
		}
	});

	// Consolidated effect to handle all collapse state updates and prevent loops
	$effect(() => {
		const currentPhaseIds = phases.map((p) => p.id);

		// Read current state without tracking to prevent loops
		const currentCollapsed = untrack(() => collapsedPhaseIds);
		const currentManuallyExpanded = untrack(() => manuallyExpandedPhaseIds);
		const prevIds = untrack(() => previousPhaseIds);

		// Check for significant phase changes (regeneration)
		const hasSignificantChange =
			prevIds.length !== currentPhaseIds.length ||
			!prevIds.every((id) => currentPhaseIds.includes(id)) ||
			!currentPhaseIds.every((id) => prevIds.includes(id));

		if (hasSignificantChange && prevIds.length > 0) {
			// Clear all state on regeneration
			collapsedPhaseIds = [];
			manuallyExpandedPhaseIds = [];
			autoCollapsedPhaseIds = [];
			previousPhaseIds = currentPhaseIds;
			// Reset initialization flag so completed phases get collapsed again
			initializedCollapsedState = false;
			return; // Exit early to prevent further processing
		}

		// Only update if phases actually changed
		if (JSON.stringify(prevIds) !== JSON.stringify(currentPhaseIds)) {
			previousPhaseIds = currentPhaseIds;
		}

		// Skip auto-collapse logic if no phases
		if (prevIds.length === 0) return;

		// Process auto-collapse/expand logic
		let newCollapsed = [...currentCollapsed];
		let newAutoCollapsed = [...(untrack(() => autoCollapsedPhaseIds) || [])];
		let hasChanges = false;

		phases.forEach((phase) => {
			// Skip if manually toggled
			if (currentManuallyExpanded.includes(phase.id)) return;

			// Check task filters
			const hasMatchingTasks = phaseHasMatchingTasks(phase);
			const isCurrentlyCollapsed = currentCollapsed.includes(phase.id);

			// Auto-collapse/expand based on filters
			if (!hasMatchingTasks && !isCurrentlyCollapsed) {
				if (!newCollapsed.includes(phase.id)) {
					newCollapsed.push(phase.id);
					hasChanges = true;
				}
			} else if (
				hasMatchingTasks &&
				isCurrentlyCollapsed &&
				!newAutoCollapsed.includes(phase.id)
			) {
				// Only auto-expand if it wasn't auto-collapsed due to completion
				newCollapsed = newCollapsed.filter((id) => id !== phase.id);
				hasChanges = true;
			}

			// Auto-collapse completed phases
			if (isPhaseComplete(phase) && !newAutoCollapsed.includes(phase.id)) {
				if (!newCollapsed.includes(phase.id)) {
					newCollapsed.push(phase.id);
				}
				newAutoCollapsed.push(phase.id);
				hasChanges = true;
			}
		});

		// Only update if there were actual changes
		if (hasChanges) {
			collapsedPhaseIds = newCollapsed;
			autoCollapsedPhaseIds = newAutoCollapsed;
		}
	});

	// Cleanup memory on component destroy to prevent memory leaks
	onDestroy(() => {
		collapsedPhaseIds = [];
		manuallyExpandedPhaseIds = [];
		autoCollapsedPhaseIds = [];
	});
</script>

<div class="space-y-4 sm:space-y-6" role="main" aria-label="Kanban board view">
	<!-- Header with stats -->
	{#if hasPhases}
		<header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2">
					<LayoutGrid class="w-5 h-5 text-muted-foreground" aria-hidden="true" />
					<h2 class="text-lg font-semibold text-foreground">Kanban Board</h2>
				</div>

				<!-- Stats -->
				<div class="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
					<span>{phases.length} phases</span>
					<span>•</span>
					<span>{completedTasks}/{totalTasks} tasks</span>
					<span>•</span>
					<span>{overallProgress}% complete</span>
				</div>
			</div>
		</header>

		<!-- Mobile stats -->
		<div
			class="sm:hidden flex items-center justify-center gap-4 text-sm text-muted-foreground bg-muted rounded-lg py-2"
		>
			<span>{phases.length} phases</span>
			<span>•</span>
			<span>{completedTasks}/{totalTasks} tasks</span>
			<span>•</span>
			<span>{overallProgress}% complete</span>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-12" aria-live="polite">
			<div class="text-center">
				<div
					class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"
				></div>
				<p class="text-sm text-muted-foreground">Loading phases...</p>
			</div>
		</div>
	{:else}
		<!-- Backlog Section -->
		<section aria-label="Task backlog">
			<BacklogSection
				backlogTasks={currentBacklogTasks}
				{dragOverPhase}
				projectId={project.id}
				on:taskDragStart={(e) => dispatch('taskDragStart', e.detail)}
				on:taskDragOver={(e) => dispatch('taskDragOver', e.detail)}
				on:taskDragLeave={(e) => dispatch('taskDragLeave', e.detail)}
				on:taskDrop={(e) => dispatch('taskDrop', e.detail)}
				on:editTask={(e) => dispatch('editTask', e.detail)}
				on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
				on:updateTask={(e) => dispatch('updateTask', e.detail)}
			/>
		</section>

		<!-- Recurring Tasks Section (show if there are recurring tasks) -->
		{#if recurringTasks.length > 0}
			<section aria-label="Recurring tasks">
				<RecurringTasksSection
					{recurringTasks}
					projectId={project.id}
					on:editTask={(e) => dispatch('editTask', e.detail)}
				/>
			</section>
		{/if}

		<!-- Phases Grid -->
		{#if hasPhases}
			<section aria-label="Project phases" class="relative">
				<div class="kanban-container">
					<div class="kanban-grid" role="group" aria-label="Phase cards">
						{#each phases as phase (phase.id)}
							<div
								animate:flip={{ duration: 300 }}
								in:fade={{ duration: 200, delay: 50 }}
								out:fade={{ duration: 200 }}
								class="kanban-column transition-all duration-200 {dragOverPhaseId ===
								phase.id
									? 'ring-2 ring-purple-500 ring-opacity-50 scale-[1.02] shadow-ink-strong'
									: ''}"
								role="article"
								aria-labelledby="phase-{phase.id}-title"
							>
								<PhaseCard
									{phase}
									{project}
									viewMode="kanban"
									isEditing={editingPhaseId === phase.id}
									editingData={editingPhaseData}
									dragOverPhase={dragOverPhaseId}
									{calendarConnected}
									isCollapsed={collapsedPhaseIds.includes(phase.id)}
									showCurrentDateLines={true}
									on:toggleCollapse={handleToggleCollapse}
									on:taskDragStart={(e) => dispatch('taskDragStart', e.detail)}
									on:taskDragOver={(e) => dispatch('taskDragOver', e.detail)}
									on:taskDragLeave={(e) => dispatch('taskDragLeave', e.detail)}
									on:taskDrop={(e) => dispatch('taskDrop', e.detail)}
									on:schedule={(e) => dispatch('schedulePhase', e.detail)}
									on:edit={(e) => dispatch('editPhase', e.detail)}
									on:delete={(e) => dispatch('deletePhase', e.detail)}
									on:save={(e) => dispatch('savePhase', e.detail)}
									on:cancelEdit={() => dispatch('cancelPhaseEdit')}
									on:editTask={(e) => dispatch('editTask', e.detail)}
									on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
									on:updateTask={(e) => dispatch('updateTask', e.detail)}
									on:createTask={(e) => dispatch('createTask', e.detail)}
								/>
							</div>
						{/each}
					</div>
				</div>
			</section>
		{:else}
			<!-- Empty state -->
			<div class="text-center py-12" role="status">
				<div class="text-muted-foreground mb-4">
					<LayoutGrid class="w-12 h-12 mx-auto opacity-50" aria-hidden="true" />
				</div>
				<h3 class="text-lg font-medium text-foreground mb-2">No phases to display</h3>
				<p class="text-sm text-muted-foreground mb-6">
					Create your first phase to start organizing your project tasks.
				</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Kanban container - handles overall layout */
	.kanban-container {
		width: 100%;
	}

	/* Mobile: Horizontal scroll layout */
	.kanban-grid {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		overflow-y: visible;
		padding-bottom: 0.5rem;
		/* Smooth scrolling on mobile */
		scroll-behavior: smooth;
		/* Hide scrollbar on webkit browsers while keeping functionality */
		scrollbar-width: thin;
	}

	.kanban-grid::-webkit-scrollbar {
		height: 6px;
	}

	.kanban-grid::-webkit-scrollbar-track {
		background: transparent;
	}

	.kanban-grid::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	.kanban-grid::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.7);
	}

	/* Individual phase columns */
	.kanban-column {
		flex: 0 0 280px; /* Fixed width, no grow/shrink on mobile */
		max-width: 280px;
		/* Fixed height for consistent card sizes on mobile */
		height: 65vh;
		min-height: 480px;
		max-height: 600px;
	}

	/* Ensure PhaseCard content fills available height */
	.kanban-column :global(.phase-card) {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.kanban-column :global(.phase-header) {
		flex-shrink: 0; /* Header keeps its natural size */
	}

	.kanban-column :global(.phase-tasks) {
		flex: 1; /* Tasks section expands to fill remaining space */
		overflow-y: auto;
		max-height: none; /* Remove the max-height restriction on mobile */
	}

	/* Tablet and Desktop: Grid layout with wrapping */
	@media (min-width: 768px) {
		.kanban-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
			gap: 1.5rem;
			overflow: visible;
			padding-bottom: 0;
		}

		.kanban-column {
			flex: none;
			max-width: none;
			/* Remove fixed height on larger screens to allow natural sizing */
			height: auto;
			min-height: auto;
			max-height: none;
		}

		.kanban-column :global(.phase-card) {
			height: auto;
			display: block; /* Reset to normal block layout */
		}

		.kanban-column :global(.phase-header) {
			flex-shrink: unset;
		}

		.kanban-column :global(.phase-tasks) {
			flex: unset;
			overflow-y: auto;
			max-height: 16rem; /* Restore the sm:max-h-64 on larger screens */
		}
	}

	/* Large desktop: Increase minimum column width */
	@media (min-width: 1024px) {
		.kanban-grid {
			grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
			gap: 2rem;
		}
	}

	/* Extra large screens: Limit maximum columns */
	@media (min-width: 1536px) {
		.kanban-grid {
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		}
	}
</style>
