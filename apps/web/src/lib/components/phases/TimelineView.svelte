<!-- src/lib/components/phases/TimelineView.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { untrack } from 'svelte';
	import BacklogSection from './BacklogSection.svelte';
	import RecurringTasksSection from './RecurringTasksSection.svelte';
	import PhaseCard from './PhaseCard.svelte';
	import CurrentTimeIndicator from '$lib/components/ui/CurrentTimeIndicator.svelte';
	import type { ProcessedPhase, TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { projectStoreV2 } from '$lib/stores/project.store';

	// FIXED: Migrate to Svelte 5 $props() pattern
	let {
		project,
		dragOverPhaseId = null,
		dragOverPhase = null,
		editingPhaseId = null,
		editingPhaseData = {},
		calendarConnected = false
	}: {
		project: { id: string; start_date: string | null; end_date: string | null };
		dragOverPhaseId?: string | null;
		dragOverPhase?: string | null;
		editingPhaseId?: string | null;
		editingPhaseData?: any;
		calendarConnected?: boolean;
	} = $props();

	// FIXED: Convert to Svelte 5 $derived patterns
	let storeState = $derived($projectStoreV2);
	let phases = $derived(storeState.phases || []);
	let tasks = $derived(storeState.tasks || []);

	// FIXED: Convert complex computations to $derived.by()
	let currentBacklogTasks = $derived.by(() => {
		const phasedTaskIds = new Set(
			phases.flatMap((p: any) => p.tasks?.map((t: any) => t.id) || [])
		);
		return (
			tasks?.filter(
				(t: any) =>
					!phasedTaskIds.has(t.id) &&
					t.status !== 'done' &&
					t.status !== 'completed' &&
					!t.deleted_at &&
					t.task_type !== 'recurring' // Exclude recurring from backlog
			) || []
		);
	});

	// Get recurring tasks for this project
	let recurringTasks = $derived.by(() => {
		return (
			tasks?.filter(
				(t: any) =>
					t.task_type === 'recurring' &&
					t.status !== 'done' &&
					t.status !== 'completed' &&
					!t.deleted_at
			) || []
		);
	});

	const dispatch = createEventDispatcher();

	// Track collapsed state for each phase - use array for reactivity in Svelte 5
	let collapsedPhaseIds = $state<string[]>([]);
	let previousPhaseIds = $state<string[]>([]);
	// Track which phases have been manually expanded by the user
	let manuallyExpandedPhaseIds = $state<string[]>([]);
	// Track which phases we've already auto-collapsed to prevent re-collapsing
	let autoCollapsedPhaseIds = $state<string[]>([]);

	function getPhaseProgress(phase: ProcessedPhase): number {
		if (phase.task_count === 0) return 0;
		return Math.round((phase.completed_tasks / phase.task_count) * 100);
	}

	function getPhaseStatus(phase: ProcessedPhase): 'upcoming' | 'active' | 'completed' {
		const now = new Date();
		const startDate = new Date(phase.start_date);
		const endDate = new Date(phase.end_date);

		if (now < startDate) return 'upcoming';
		if (now > endDate) return 'completed';
		return 'active';
	}

	function isPhaseComplete(phase: ProcessedPhase): boolean {
		return getPhaseProgress(phase) === 100;
	}

	function togglePhaseCollapse(phaseId: string) {
		const isCollapsed = collapsedPhaseIds.includes(phaseId);
		if (isCollapsed) {
			// Remove from collapsed
			collapsedPhaseIds = collapsedPhaseIds.filter((id) => id !== phaseId);
			// Mark as manually toggled (user expanded it)
			if (!manuallyExpandedPhaseIds.includes(phaseId)) {
				manuallyExpandedPhaseIds = [...manuallyExpandedPhaseIds, phaseId];
			}
		} else {
			// Add to collapsed
			collapsedPhaseIds = [...collapsedPhaseIds, phaseId];
			// Mark as manually toggled (user collapsed it)
			if (!manuallyExpandedPhaseIds.includes(phaseId)) {
				manuallyExpandedPhaseIds = [...manuallyExpandedPhaseIds, phaseId];
			}
		}
	}

	// Event handlers that pass through to parent
	function handleSchedulePhase(event: CustomEvent) {
		dispatch('schedulePhase', event.detail);
	}

	function handleEditPhase(event: CustomEvent) {
		dispatch('editPhase', event.detail);
	}

	function handleDeletePhase(event: CustomEvent) {
		dispatch('deletePhase', event.detail);
	}

	function handleSavePhase(event: CustomEvent) {
		dispatch('savePhase', event.detail);
	}

	function handleCancelPhaseEdit() {
		dispatch('cancelPhaseEdit');
	}

	function handleToggleCollapse(event: CustomEvent) {
		togglePhaseCollapse(event.detail);
	}

	// FIXED: Convert simple computed values to $derived
	let hasPhases = $derived(phases.length > 0);

	// Get global task filters from store
	let globalTaskFilters = $derived(
		storeState.globalTaskFilters || ['active', 'scheduled', 'overdue', 'recurring']
	);

	// Consolidated effect to handle all collapse state updates and prevent loops
	$effect(() => {
		const currentPhaseIds = phases.map((p) => p.id);

		// Read current state without tracking to prevent loops
		const currentCollapsed = untrack(() => collapsedPhaseIds);
		const currentManuallyExpanded = untrack(() => manuallyExpandedPhaseIds);
		const currentAutoCollapsed = untrack(() => autoCollapsedPhaseIds);
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
		let newAutoCollapsed = [...currentAutoCollapsed];
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
				!currentAutoCollapsed.includes(phase.id)
			) {
				// Only auto-expand if it wasn't auto-collapsed due to completion
				newCollapsed = newCollapsed.filter((id) => id !== phase.id);
				hasChanges = true;
			}

			// Auto-collapse completed phases
			if (isPhaseComplete(phase) && !currentAutoCollapsed.includes(phase.id)) {
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

	// Removed duplicate $effect blocks - logic consolidated above to prevent loops
</script>

<div class="timeline-container">
	<div class="timeline-content">
		<!-- Backlog Section (always show) -->
		<div class="mb-6">
			<BacklogSection
				backlogTasks={currentBacklogTasks}
				{dragOverPhase}
				projectId={project.id}
				on:taskDragStart={(e) => dispatch('taskDragStart', e.detail)}
				on:taskDragOver={(e) => dispatch('taskDragOver', e.detail)}
				on:taskDragLeave={(e) => dispatch('taskDragLeave', e.detail)}
				on:taskDrop={(e) => {
					dispatch('taskDrop', e.detail);
				}}
				on:editTask={(e) => dispatch('editTask', e.detail)}
				on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
				on:updateTask={(e) => dispatch('updateTask', e.detail)}
			/>
		</div>

		<!-- Recurring Tasks Section (show if there are recurring tasks) -->
		{#if recurringTasks.length > 0}
			<div class="mb-6">
				<RecurringTasksSection
					{recurringTasks}
					projectId={project.id}
					on:editTask={(e) => {
						dispatch('editTask', e.detail.task);
					}}
				/>
			</div>
		{/if}

		{#if hasPhases}
			{@const now = new Date()}
			<!-- Phase Cards -->
			<div class="space-y-3 sm:space-y-4">
				{#each phases as phase, index (phase.id)}
					{@const phaseStartDate = phase.start_date ? new Date(phase.start_date) : null}
					{@const phaseEndDate = phase.end_date ? new Date(phase.end_date) : null}
					{@const prevPhaseEndDate =
						index > 0 && phases[index - 1].end_date
							? new Date(phases[index - 1].end_date)
							: null}

					<!-- Show current time indicator between phases -->
					{#if index > 0 && prevPhaseEndDate && phaseStartDate}
						{#if prevPhaseEndDate <= now && phaseStartDate > now}
							<CurrentTimeIndicator label="Now" showTime={true} className="my-2" />
						{/if}
					{/if}

					<div>
						<PhaseCard
							{project}
							{phase}
							viewMode="timeline"
							isEditing={editingPhaseId === phase.id}
							editingData={editingPhaseData}
							dragOverPhase={dragOverPhaseId}
							{calendarConnected}
							isCollapsed={collapsedPhaseIds.includes(phase.id)}
							showCurrentDateLines={true}
							on:schedule={handleSchedulePhase}
							on:edit={handleEditPhase}
							on:delete={handleDeletePhase}
							on:save={handleSavePhase}
							on:cancelEdit={handleCancelPhaseEdit}
							on:toggleCollapse={handleToggleCollapse}
							on:taskDragStart={(e) => dispatch('taskDragStart', e.detail)}
							on:taskDragOver={(e) => dispatch('taskDragOver', e.detail)}
							on:taskDragLeave={(e) => dispatch('taskDragLeave', e.detail)}
							on:taskDrop={(e) => dispatch('taskDrop', e.detail)}
							on:editTask={(e) => dispatch('editTask', e.detail)}
							on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
							on:updateTask={(e) => dispatch('updateTask', e.detail)}
							on:createTask={(e) => dispatch('createTask', e.detail)}
						/>
					</div>
				{/each}

				<!-- Check if we should show indicator at the bottom (after all phases) -->
				{#if phases.length > 0 && phases[phases.length - 1].end_date}
					{@const lastPhaseEnd = new Date(phases[phases.length - 1].end_date)}
					{#if lastPhaseEnd <= now}
						{@const hasIndicatorInMiddle = phases.some((phase, i) => {
							if (i === 0) return false;
							const prevEnd = phases[i - 1].end_date
								? new Date(phases[i - 1].end_date)
								: null;
							const currStart = phase.start_date ? new Date(phase.start_date) : null;
							return prevEnd && currStart && prevEnd <= now && currStart > now;
						})}
						{@const firstPhaseStart = phases[0].start_date
							? new Date(phases[0].start_date)
							: null}
						{@const hasIndicatorAtTop = firstPhaseStart && firstPhaseStart > now}
						{#if !hasIndicatorInMiddle && !hasIndicatorAtTop}
							<CurrentTimeIndicator label="Now" showTime={true} className="my-2" />
						{/if}
					{/if}
				{/if}
			</div>
		{:else}
			<!-- Empty state -->
			<div class="text-center py-12 text-gray-500 dark:text-gray-400">
				<p class="text-lg mb-2">No phases to display</p>
				<p class="text-sm">Create phases to see the timeline view.</p>
			</div>
		{/if}
	</div>
</div>
