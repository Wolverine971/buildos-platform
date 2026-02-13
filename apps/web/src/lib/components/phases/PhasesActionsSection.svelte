<!-- apps/web/src/lib/components/phases/PhasesActionsSection.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Plus,
		Sparkles,
		RefreshCw,
		MoreVertical,
		Calendar,
		CalendarX,
		ChevronDown,
		Inbox,
		Clock
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ViewToggle from '$lib/components/phases/ViewToggle.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { projectStoreV2 } from '$lib/stores/project.store';

	interface PaseActionProps {
		viewMode?: 'kanban' | 'timeline';
		hasPhases?: boolean;
		canGenerate?: boolean;
		generating?: boolean;
		isMobile?: boolean;
		phases?: any[];
		calendarConnected?: boolean;
	}

	let {
		viewMode = 'timeline',
		hasPhases = false,
		canGenerate = false,
		generating = false,
		isMobile = false,
		phases = [],
		calendarConnected = false
	}: PaseActionProps = $props();

	const dispatch = createEventDispatcher();

	let dropdownOpen = $state(false);
	let dropdownElement = $state<HTMLDivElement | undefined>(undefined);
	let phaseActionsDropdownOpen = $state(false);
	let phaseActionsDropdownElement = $state<HTMLDivElement | undefined>(undefined);

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
		phaseActionsDropdownOpen = false;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	function togglePhaseActionsDropdown() {
		phaseActionsDropdownOpen = !phaseActionsDropdownOpen;
		dropdownOpen = false;
	}

	function closePhaseActionsDropdown() {
		phaseActionsDropdownOpen = false;
	}

	function handleAction(action: string) {
		closeDropdown();
		closePhaseActionsDropdown();
		dispatch(action);
	}

	function handleScheduleAllPhases() {
		closeDropdown();
		closePhaseActionsDropdown();
		// Open the modal for scheduling all phases
		dispatch('scheduleAllPhases');
	}

	function handleUnscheduleAllPhases() {
		closeDropdown();
		closePhaseActionsDropdown();
		dispatch('unscheduleAllPhases');
	}

	function handleAssignBacklogTasks() {
		closeDropdown();
		closePhaseActionsDropdown();
		dispatch('assignBacklogTasks');
	}

	function handleRescheduleOverdueTasks() {
		closeDropdown();
		closePhaseActionsDropdown();
		dispatch('rescheduleOverdueTasks');
	}

	// Close dropdown on escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (dropdownOpen) closeDropdown();
			if (phaseActionsDropdownOpen) closePhaseActionsDropdown();
		}
	}

	// FIXED: Use direct store derivation instead of manual subscription
	let storeState = $derived($projectStoreV2);
	let tasks = $derived(storeState?.tasks || []);

	// Task type memoization cache for performance
	const taskTypeCache = new Map<string, string>();

	// Helper function to get task type with memoization
	function getTaskTypeMemoized(task: any): string {
		const cacheKey = `${task.id}-${task.status}-${task.start_date}-${task.deleted_at}`;

		if (taskTypeCache.has(cacheKey)) {
			return taskTypeCache.get(cacheKey)!;
		}

		let taskType: string;
		if (task.status === 'done' || task.status === 'completed') {
			taskType = 'completed';
		} else if (task.deleted_at) {
			taskType = 'deleted';
		} else if (
			task.start_date &&
			new Date(task.start_date) < new Date() &&
			task.status !== 'done'
		) {
			taskType = 'overdue';
		} else {
			taskType = 'active';
		}

		taskTypeCache.set(cacheKey, taskType);

		// LRU cleanup to prevent memory leaks
		if (taskTypeCache.size > 50) {
			const firstKey = taskTypeCache.keys().next().value;
			taskTypeCache.delete(firstKey);
		}

		return taskType;
	}

	// Calculate backlog tasks (tasks not in any phase) using Svelte 5 runes
	function computeBacklogTasks() {
		const phasedTaskIds = new Set(
			phases.flatMap((p: any) => p.tasks?.map((t: any) => t.id) || [])
		);
		return tasks.filter(
			(t: any) =>
				!phasedTaskIds.has(t.id) &&
				t.status !== 'done' &&
				t.status !== 'completed' &&
				!t.deleted_at
		);
	}

	let backlogTasks = $derived(computeBacklogTasks());

	// Calculate overdue tasks using memoized task type using Svelte 5 runes
	function computeOverdueTasks() {
		const allTasks = [...phases.flatMap((p: any) => p.tasks || []), ...backlogTasks];
		return allTasks.filter((task: any) => getTaskTypeMemoized(task) === 'overdue');
	}

	let overdueTasks = $derived(computeOverdueTasks());

	// Computed properties using Svelte 5 runes
	let canSchedule = $derived(
		hasPhases &&
			calendarConnected &&
			phases.some((phase) => phase.tasks && phase.tasks.length > 0)
	);
	let hasUnscheduledTasks = $derived(
		phases.some(
			(phase) =>
				phase.tasks &&
				phase.tasks.some((task) => !task.start_date || !task.calendar_event_id)
		)
	);
	let hasScheduledTasks = $derived(
		phases.some((phase) => phase.tasks && phase.tasks.some((task) => task.start_date))
	);
	let hasTasksInPhases = $derived(phases.some((phase) => phase.tasks && phase.tasks.length > 0));
	let hasBacklogTasks = $derived(backlogTasks.length > 0);
	let hasOverdueTasks = $derived(overdueTasks.length > 0);

	// Check if ANY tasks in the project have dates (for showing clear dates option) using Svelte 5 runes
	let hasAnyTasksWithDates = $derived(tasks.some((task: any) => task.start_date));

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeydown);
		taskTypeCache.clear(); // Cleanup cache to prevent memory leaks
	});
</script>

<!-- Project Dates Display -->
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
	<!-- Actions Section -->
	<div class="flex items-center gap-2 justify-between w-full">
		<!-- View Toggle - Always visible -->
		{#if hasPhases}
			<ViewToggle {viewMode} on:toggle={(e) => dispatch('toggleView', e.detail)} />
		{/if}

		<!-- Desktop: Show all action buttons -->
		{#if !isMobile}
			<div class="flex items-center gap-2">
				<Button
					onclick={() => handleAction('addTask')}
					variant="outline"
					size="md"
					icon={Plus}
					aria-label="Add new task"
				>
					Add Task
				</Button>

				<!-- Phase Actions Dropdown -->
				<div class="relative" use:clickOutside={closePhaseActionsDropdown}>
					<Button
						onclick={togglePhaseActionsDropdown}
						variant="outline"
						size="md"
						aria-label="Phase actions"
						aria-expanded={phaseActionsDropdownOpen}
						aria-haspopup="true"
					>
						Phase Actions
						<ChevronDown class="w-4 h-4 ml-1" />
					</Button>

					{#if phaseActionsDropdownOpen}
						<div
							bind:this={phaseActionsDropdownElement}
							class="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-ink-strong border border-border py-1 z-50"
							role="menu"
							aria-orientation="vertical"
						>
							<!-- Add/Generate Phase Section -->
							<button
								onclick={() => handleAction('addPhase')}
								class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
								role="menuitem"
							>
								<Plus class="w-4 h-4" />
								Add Phase
							</button>

							{#if hasPhases}
								<button
									onclick={() => handleAction('regeneratePhases')}
									disabled={!canGenerate}
									class="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 {!canGenerate
										? 'text-muted-foreground cursor-not-allowed'
										: 'text-foreground'}"
									role="menuitem"
								>
									<RefreshCw class="w-4 h-4 {generating ? 'animate-spin' : ''}" />
									{generating ? 'Regenerating...' : 'Regenerate Phases'}
								</button>
							{:else}
								<button
									onclick={() => handleAction('generatePhases')}
									disabled={!canGenerate}
									class="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 {!canGenerate
										? 'text-muted-foreground cursor-not-allowed'
										: 'text-blue-600 dark:text-blue-400 font-medium'}"
									role="menuitem"
								>
									<Sparkles class="w-4 h-4" />
									Generate Phases
								</button>
							{/if}

							<!-- Divider if there are more actions -->
							{#if hasBacklogTasks || (canSchedule && hasUnscheduledTasks) || hasTasksInPhases || hasOverdueTasks}
								<div
									class="border-t border-border my-1"
								></div>
							{/if}

							<!-- Task Management Section -->
							{#if hasBacklogTasks}
								<button
									onclick={handleAssignBacklogTasks}
									class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
									role="menuitem"
								>
									<Inbox class="w-4 h-4" />
									Assign Backlog Tasks ({backlogTasks.length})
								</button>
							{/if}

							{#if canSchedule && hasUnscheduledTasks}
								<button
									onclick={handleScheduleAllPhases}
									class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
									role="menuitem"
								>
									<Calendar class="w-4 h-4" />
									Schedule All Tasks
								</button>
							{/if}

							{#if hasTasksInPhases || hasAnyTasksWithDates}
								<button
									onclick={handleUnscheduleAllPhases}
									class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
									role="menuitem"
								>
									<CalendarX class="w-4 h-4" />
									{#if hasAnyTasksWithDates && !hasTasksInPhases}
										Clear All Dates
									{:else if hasAnyTasksWithDates}
										Unschedule / Clear Dates / Move to Backlog
									{:else}
										Unschedule / Move to Backlog
									{/if}
								</button>
							{/if}

							{#if hasOverdueTasks}
								<button
									onclick={handleRescheduleOverdueTasks}
									class="w-full text-left px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-2"
									role="menuitem"
								>
									<Clock class="w-4 h-4" />
									Reschedule Overdue ({overdueTasks.length})
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Mobile: Actions dropdown -->
			<div class="relative" use:clickOutside={closeDropdown}>
				<Button
					onclick={toggleDropdown}
					variant="outline"
					size="md"
					icon={MoreVertical}
					aria-label="More actions"
					aria-expanded={dropdownOpen}
					aria-haspopup="true"
				>
					Actions
				</Button>

				{#if dropdownOpen}
					<div
						bind:this={dropdownElement}
						class="absolute right-0 mt-2 w-48 bg-card rounded-lg shadow-ink-strong border border-border py-1 z-50"
						role="menu"
						aria-orientation="vertical"
					>
						<Button
							onclick={() => handleAction('addTask')}
							class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
							role="menuitem"
						>
							<Plus class="w-4 h-4" />
							Add Task
						</Button>

						<Button
							onclick={() => handleAction('addPhase')}
							class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
							role="menuitem"
						>
							<Plus class="w-4 h-4" />
							Add Phase
						</Button>

						{#if hasBacklogTasks || hasTasksInPhases || hasOverdueTasks || (canSchedule && hasUnscheduledTasks)}
							<div class="border-t border-border my-1"></div>

							{#if hasBacklogTasks}
								<button
									onclick={handleAssignBacklogTasks}
									class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
									role="menuitem"
								>
									<Inbox class="w-4 h-4" />
									Assign Backlog ({backlogTasks.length})
								</button>
							{/if}

							{#if canSchedule && hasUnscheduledTasks}
								<button
									onclick={handleScheduleAllPhases}
									class="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
									role="menuitem"
								>
									<Calendar class="w-4 h-4" />
									Schedule All
								</button>
							{/if}

							{#if hasTasksInPhases || hasAnyTasksWithDates}
								<button
									onclick={handleUnscheduleAllPhases}
									class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
									role="menuitem"
								>
									<CalendarX class="w-4 h-4" />
									{#if hasAnyTasksWithDates && !hasTasksInPhases}
										Clear Dates
									{:else if hasAnyTasksWithDates}
										Unschedule / Clear
									{:else}
										Unschedule / Backlog
									{/if}
								</button>
							{/if}

							{#if hasOverdueTasks}
								<button
									onclick={handleRescheduleOverdueTasks}
									class="w-full text-left px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-2"
									role="menuitem"
								>
									<Clock class="w-4 h-4" />
									Reschedule Overdue ({overdueTasks.length})
								</button>
							{/if}
						{/if}

						<div class="border-t border-border my-1"></div>

						{#if hasPhases}
							<button
								onclick={() => handleAction('regeneratePhases')}
								disabled={!canGenerate}
								class="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 {!canGenerate
									? 'text-muted-foreground cursor-not-allowed'
									: 'text-foreground'}"
								role="menuitem"
							>
								<RefreshCw class="w-4 h-4" />
								Regenerate Phases
							</button>
						{:else}
							<button
								onclick={() => handleAction('generatePhases')}
								disabled={!canGenerate}
								class="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 {!canGenerate
									? 'text-muted-foreground cursor-not-allowed'
									: 'text-blue-600 dark:text-blue-400 font-medium'}"
								role="menuitem"
							>
								<Sparkles class="w-4 h-4" />
								Generate Phases
							</button>
						{/if}

						{#if !calendarConnected && hasPhases}
							<div class="border-t border-border my-1"></div>
							<div class="px-4 py-2 text-xs text-muted-foreground">
								Connect calendar to enable scheduling
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
