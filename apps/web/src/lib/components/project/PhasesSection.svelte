<!-- src/lib/components/project/PhasesSection.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { AlertCircle } from 'lucide-svelte';
	import { onDestroy, createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { modalStore } from '$lib/stores/modal.store';
	import { ProjectService } from '$lib/services/projectService';
	import { toastService } from '$lib/stores/toast.store';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	// Eagerly loaded components (always used)
	import PhasesActionsSection from '$lib/components/phases/PhasesActionsSection.svelte';
	import EmptyState from '$lib/components/phases/EmptyState.svelte';
	import PhaseSkeleton from '$lib/components/phases/PhaseSkeleton.svelte';
	import TaskFilterBar from '$lib/components/phases/TaskFilterBar.svelte';
	import TaskFilterDropdown from '$lib/components/phases/TaskFilterDropdown.svelte';

	// Lazy loaded components - use $state for reactivity
	let PhaseGenerationLoadingOverlay = $state<any>(null);
	let KanbanView = $state<any>(null);
	let TimelineView = $state<any>(null);
	let PhaseForm = $state<any>(null);

	// Component loading states - must be reactive in Svelte 5
	let loadingComponents = $state<Record<string, boolean>>({});

	// Lazy load component function
	async function loadComponent(name: string) {
		if (loadingComponents[name]) return;
		// Trigger reactivity by reassigning the whole object
		loadingComponents = { ...loadingComponents, [name]: true };

		try {
			switch (name) {
				case 'PhaseGenerationLoadingOverlay':
					PhaseGenerationLoadingOverlay = (
						await import('$lib/components/project/PhaseGenerationLoadingOverlay.svelte')
					).default;
					break;
				case 'KanbanView':
					KanbanView = (await import('$lib/components/phases/KanbanView.svelte')).default;
					break;
				case 'TimelineView':
					TimelineView = (await import('$lib/components/phases/TimelineView.svelte'))
						.default;
					break;
				case 'PhaseForm':
					PhaseForm = (await import('$lib/components/phases/PhaseForm.svelte')).default;
					break;
			}
		} catch (error) {
			console.error(`Failed to load ${name}:`, error);
			toastService.error(`Failed to load ${name}`);
		} finally {
			// Trigger reactivity by reassigning the whole object
			loadingComponents = { ...loadingComponents, [name]: false };
		}
	}

	// Props - only callbacks and configuration (following the standard pattern)
	let {
		calendarConnected = false,
		onEditTask,
		onCreateTask
	}: {
		calendarConnected?: boolean;
		onEditTask: (task: TaskWithCalendarEvents) => void;
		onCreateTask: (phaseId?: string) => void;
	} = $props();

	const dispatch = createEventDispatcher();
	const projectService = ProjectService.getInstance();

	// FIXED: Use direct $derived instead of manual subscription to prevent loops
	let storeState = $derived($projectStoreV2);

	// Get data from v2 store (including project) using Svelte 5 runes
	let project = $derived(storeState.project);
	let phases = $derived(storeState.phases || []);
	let tasks = $derived(storeState.tasks || []);
	// Define TaskFilter type locally
	type TaskFilter = 'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring';

	let globalTaskFilters = $derived<TaskFilter[]>(
		(storeState.globalTaskFilters || [
			'active',
			'scheduled',
			'overdue',
			'recurring'
		]) as TaskFilter[]
	);
	let phaseTaskFilters = $derived(storeState.phaseTaskFilters || {});

	// Calculate backlog tasks (tasks not in any phase) using Svelte 5 runes
	// Use IIFE to get the value directly
	let currentBacklogTasks = $derived(
		(() => {
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
		})()
	);

	let taskStats = $derived(
		storeState.stats || {
			total: 0,
			completed: 0,
			active: 0,
			inProgress: 0,
			blocked: 0
		}
	);

	// Task type helper

	function getTaskType(task: any) {
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

	// Count tasks by filter using Svelte 5 runes
	// Use IIFE to get the value directly, not a function
	let taskCountsByFilter = $derived(
		(() => {
			const counts: Record<TaskFilter, number> = {
				active: 0,
				scheduled: 0,
				deleted: 0,
				completed: 0,
				overdue: 0,
				recurring: 0
			};

			// Count tasks in phases
			phases.forEach((phase: any) => {
				phase.tasks?.forEach((task: any) => {
					const type = getTaskType(task) as TaskFilter;
					counts[type]++;
				});
			});

			// Count backlog tasks
			currentBacklogTasks.forEach((task: any) => {
				const type = getTaskType(task) as TaskFilter;
				counts[type]++;
			});

			return counts;
		})()
	);

	// Core UI state
	let loading = $state(false);
	let generating = $state(false);
	let error = $state<string | null>(null);
	let viewMode = $state<'kanban' | 'timeline'>('timeline');
	let innerWidth = $state(640); // Default to Tailwind's sm: breakpoint

	// Phase editing state
	let editingPhaseId = $state<string | null>(null);
	let editingPhaseData = $state({
		name: '',
		description: '',
		start_date: '',
		end_date: ''
	});

	// Phase creation state
	let creatingPhase = $state(false);
	let newPhaseData = $state({
		name: '',
		description: '',
		start_date: '',
		end_date: ''
	});

	// Drag and drop state
	let dragState = $state({
		draggedTask: null as TaskWithCalendarEvents | null,
		draggedFromPhase: null as string | null,
		dragOverPhase: null as string | null,
		dragOverPhaseId: null as string | null,
		isDragging: false
	});

	let hasScheduledTasks = $derived(
		phases.some((phase: any) => phase.tasks && phase.tasks.some((task: any) => task.start_date))
	);

	// Use task counts from store - already calculated correctly
	// currentTaskCounts is now the actual value, not a function
	let currentTaskCounts = $derived(taskCountsByFilter);

	let hasProjectDates = $derived(!!(project?.start_date || project?.end_date));

	// FIXED: Simple derived values without state mutation
	let hasPhases = $derived(phases.length > 0);
	let canGenerate = $derived(hasProjectDates && !generating);

	let isMobile = $derived(innerWidth < 640); // Align with Tailwind's sm: breakpoint

	// Preload components based on conditions using Svelte 5 effects
	$effect(() => {
		if (generating && !PhaseGenerationLoadingOverlay) {
			loadComponent('PhaseGenerationLoadingOverlay');
		}
	});

	$effect(() => {
		if (hasPhases && viewMode === 'kanban' && !KanbanView) {
			loadComponent('KanbanView');
		}
	});

	$effect(() => {
		if (hasPhases && viewMode === 'timeline' && !TimelineView) {
			loadComponent('TimelineView');
		}
	});

	$effect(() => {
		if (creatingPhase && !PhaseForm) {
			loadComponent('PhaseForm');
		}
	});

	// Filters are already arrays in v2 store

	// Filter handlers
	function handleGlobalFilterToggle(event: CustomEvent) {
		const filter = event.detail;
		const currentFilters = globalTaskFilters;

		if (currentFilters.includes(filter)) {
			// Remove filter
			const newFilters = currentFilters.filter((f: string) => f !== filter);
			projectStoreV2.updateStoreState({ globalTaskFilters: newFilters });
		} else {
			// Add filter
			projectStoreV2.updateStoreState({ globalTaskFilters: [...currentFilters, filter] });
		}
	}

	function handleGlobalSelectAll() {
		projectStoreV2.updateStoreState({
			globalTaskFilters: [
				'active',
				'scheduled',
				'deleted',
				'completed',
				'overdue',
				'recurring'
			]
		});
	}

	function handleGlobalFilterChange(event: CustomEvent) {
		projectStoreV2.updateStoreState({ globalTaskFilters: event.detail });
	}

	// Actions handlers
	function handleEditDates() {
		modalStore.open('projectDates');
	}

	function handleAddTask() {
		onCreateTask();
	}

	function handleAddPhase() {
		startCreatingPhase();
	}

	function handleToggleView(newViewMode: 'kanban' | 'timeline') {
		viewMode = newViewMode;
	}

	// Phase generation
	async function handleGeneratePhases() {
		modalStore.open('phaseGenerationConfirmation', {
			projectId: project.id,
			projectStartDate: project?.start_date,
			projectEndDate: project?.end_date,
			existingPhases: phases,
			isRegeneration: hasPhases
		});
	}

	// Phase scheduling handler
	async function handleSchedulePhase(phase: any) {
		modalStore.open('scheduling', phase);
	}

	// Handle scheduling all phases - opens the Schedule All Phases modal
	async function handleScheduleAllPhases() {
		// Find ALL phases with unscheduled tasks
		const phasesWithUnscheduledTasks = phases.filter(
			(phase: any) =>
				phase.tasks &&
				phase.tasks.length > 0 &&
				phase.tasks.some((task: any) => !task.start_date || !task.calendar_event_id)
		);

		if (phasesWithUnscheduledTasks.length === 0) {
			toastService.info('All tasks are already scheduled');
			return;
		}

		// Open the Schedule All Phases modal
		modalStore.open('scheduleAllPhases', {
			phases: phasesWithUnscheduledTasks,
			projectId: project.id,
			project,
			calendarConnected
		});
	}

	async function handleUnscheduleAllPhases() {
		// Calculate total tasks in all phases (for move to backlog option)
		const totalTasksInPhases = phases.reduce((total: any, phase: any) => {
			return total + (phase.tasks?.length || 0);
		}, 0);

		// Calculate scheduled tasks count in phases
		const scheduledTaskCountInPhases = phases.reduce((total: any, phase: any) => {
			return total + (phase.tasks?.filter((task: any) => task.start_date)?.length || 0);
		}, 0);

		// Calculate total scheduled tasks including backlog
		const allScheduledTasks = tasks.filter((task: any) => task.start_date);
		const scheduledTaskCount = allScheduledTasks.length;

		modalStore.open('unscheduleConfirmation', {
			phases,
			projectId: project.id,
			scheduledTaskCount,
			scheduledTaskCountInPhases,
			totalTasksInPhases,
			allTasks: tasks, // Pass all tasks for clearing dates
			hasTasksWithDates: scheduledTaskCount > 0
		});
	}

	async function handleAssignBacklogTasks() {
		if (currentBacklogTasks.length === 0) {
			toastService.info('No backlog tasks to assign');
			return;
		}
		modalStore.open('assignBacklogTasks', {
			projectId: project.id,
			backlogTasks: currentBacklogTasks,
			phases,
			calendarConnected
		});
	}

	async function handleRescheduleOverdueTasks() {
		// Calculate overdue tasks
		const now = new Date();

		const overdueTasks = [
			...phases.flatMap((p: any) => p.tasks || []),
			...currentBacklogTasks
		]?.filter((task: any) => {
			if (task.status === 'done' || task.status === 'completed' || task.deleted_at)
				return false;
			if (!task.start_date) return false;
			return new Date(task.start_date) < now;
		});

		if (overdueTasks.length === 0) {
			toastService.info('No overdue tasks found');
			return;
		}

		modalStore.open('rescheduleOverdueTasks', {
			projectId: project.id,
			overdueTasks,
			phases,
			calendarConnected
		});
	}

	// Drag and drop handlers
	function handleTaskDragStart(detail: any) {
		dragState = {
			draggedTask: detail.task,
			draggedFromPhase: detail.phaseId,
			dragOverPhase: null,
			dragOverPhaseId: null,
			isDragging: true
		};
	}

	function handleTaskDragOver(detail: any) {
		if (!dragState.draggedTask) return;
		dragState.dragOverPhase = detail.phaseId;
		dragState.dragOverPhaseId = detail.phaseId;
	}

	function handleTaskDragLeave() {
		dragState.dragOverPhase = null;
		dragState.dragOverPhaseId = null;
	}

	async function handleTaskDrop(detail: any) {
		const { draggedTask, draggedFromPhase } = dragState;

		if (!draggedTask || draggedFromPhase === detail.phaseId) {
			resetDragState();
			return;
		}

		resetDragState();

		// Move task to new phase
		const result = await projectService.moveTaskToPhase(
			draggedTask.id,
			detail.phaseId,
			project.id
		);

		if (result.success) {
			dispatch('phaseUpdated');
		}
	}

	function resetDragState() {
		dragState = {
			draggedTask: null,
			draggedFromPhase: null,
			dragOverPhase: null,
			dragOverPhaseId: null,
			isDragging: false
		};
	}

	// Phase CRUD operations
	function startCreatingPhase() {
		creatingPhase = true;
		newPhaseData = {
			name: '',
			description: '',
			start_date: '',
			end_date: ''
		};
	}

	function cancelPhaseCreation() {
		creatingPhase = false;
	}

	async function createPhase(event: CustomEvent) {
		const phaseData = event.detail;
		creatingPhase = false;

		try {
			const response = await fetch(`/api/projects/${project.id}/phases`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(phaseData)
			});

			const result = await response.json();
			if (response.ok && result?.data?.phase) {
				// Update store directly instead of dispatching event
				projectStoreV2.addPhase(result?.data?.phase);
				toastService.success('Phase created successfully');
			} else {
				throw new Error(result.error || 'Failed to create phase');
			}
		} catch (err) {
			toastService.error((err as any)?.message || 'Failed to create phase');
			creatingPhase = true;
		}
	}

	function startEditingPhase(phase: any) {
		editingPhaseId = phase.id;
		editingPhaseData = {
			name: phase.name,
			description: phase.description || '',
			start_date: phase.start_date?.split('T')[0] || '',
			end_date: phase.end_date?.split('T')[0] || ''
		};
	}

	function cancelPhaseEdit() {
		editingPhaseId = null;
	}

	async function savePhaseChanges(phaseId: string) {
		try {
			// Find the current phase for optimistic update
			const currentPhase = phases.find((p: any) => p.id === phaseId);
			if (!currentPhase) return;

			// Optimistic update
			const optimisticPhase = {
				...currentPhase,
				...editingPhaseData,
				updated_at: new Date().toISOString()
			};
			projectStoreV2.updatePhase(optimisticPhase);
			cancelPhaseEdit();

			// Make API call
			const response = await fetch(`/api/projects/${project.id}/phases/${phaseId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editingPhaseData)
			});

			const result = await response.json();

			if (response.ok && result?.data?.phase) {
				// Update with server response
				projectStoreV2.updatePhase(result.data.phase);
				toastService.success('Phase updated successfully');
			} else {
				// Rollback on error
				projectStoreV2.updatePhase(currentPhase);
				editingPhaseId = phaseId;
				throw new Error(result.error || 'Failed to update phase');
			}
		} catch (err) {
			toastService.error((err as any)?.message || 'Failed to update phase');
		}
	}

	// Task handlers
	function handleCreateTaskForPhase(phaseId: string) {
		onCreateTask(phaseId);
	}

	async function handleTaskUpdate(task: TaskWithCalendarEvents) {
		// Just emit the event - parent will handle store update
		dispatch('taskUpdated', task);
	}

	function handleTaskDelete(taskId: string) {
		modalStore.open('deletePhaseTask', taskId);
	}

	// Set generating state from parent
	export function setGenerating(value: boolean) {
		generating = value;
	}

	// Cleanup
	function cleanup() {
		resetDragState();
	}

	onDestroy(cleanup);
</script>

<svelte:window bind:innerWidth on:beforeunload={cleanup} />

<div class="space-y-4 sm:space-y-6 phases-section {dragState.isDragging ? 'dragging' : ''}">
	<!-- Header -->
	<header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
		<h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
			Project Phases
		</h2>
	</header>

	{#if hasPhases}
		<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-3">
			<!-- Actions Section -->
			<PhasesActionsSection
				{viewMode}
				{hasPhases}
				{canGenerate}
				{generating}
				{isMobile}
				{phases}
				{calendarConnected}
				on:editDates={handleEditDates}
				on:addTask={handleAddTask}
				on:addPhase={handleAddPhase}
				on:toggleView={(e) => handleToggleView(e.detail)}
				on:generatePhases={handleGeneratePhases}
				on:regeneratePhases={handleGeneratePhases}
				on:scheduleAllPhases={handleScheduleAllPhases}
				on:unscheduleAllPhases={handleUnscheduleAllPhases}
				on:assignBacklogTasks={handleAssignBacklogTasks}
				on:rescheduleOverdueTasks={handleRescheduleOverdueTasks}
			/>

			<!-- Task Filters - Only show if there are phases -->
			{#if Object.values(currentTaskCounts).some((count) => count > 0)}
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Filter tasks across all phases
				</h3>

				<!-- Conditional rendering for responsive filter components -->
				{#if !isMobile}
					<TaskFilterBar
						activeFilters={globalTaskFilters}
						taskCounts={currentTaskCounts}
						on:toggle={handleGlobalFilterToggle}
						on:selectAll={handleGlobalSelectAll}
					/>
				{:else}
					<TaskFilterDropdown
						activeFilters={globalTaskFilters}
						taskCounts={currentTaskCounts}
						on:change={handleGlobalFilterChange}
					/>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 sm:p-4">
			<div class="flex flex-col sm:flex-row gap-3">
				<AlertCircle class="h-5 w-5 text-red-400 flex-shrink-0" />
				<div class="flex-1">
					<p class="text-sm text-red-800 dark:text-red-200">{error}</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	{#if loading}
		<PhaseSkeleton count={3} showBacklog={true} />
	{:else if !hasPhases && !creatingPhase}
		<EmptyState
			{hasProjectDates}
			{generating}
			on:createPhase={startCreatingPhase}
			on:generatePhases={handleGeneratePhases}
		/>
	{:else}
		<!-- Phase Creation Form -->
		{#if creatingPhase}
			{#if loadingComponents['PhaseForm']}
				<div class="flex items-center justify-center p-8">
					<div class="text-sm text-gray-500">Loading form...</div>
				</div>
			{:else if PhaseForm}
				<PhaseForm
					isCreating={true}
					bind:formData={newPhaseData}
					{project}
					on:submit={createPhase}
					on:cancel={cancelPhaseCreation}
					on:error={(e) => toastService.error(e.detail)}
				/>
			{/if}
		{/if}

		<!-- Main View Content -->
		{#if viewMode === 'kanban'}
			{#if hasPhases}
				{#if loadingComponents['KanbanView']}
					<div class="flex items-center justify-center p-8">
						<div class="text-sm text-gray-500">Loading kanban view...</div>
					</div>
				{:else if KanbanView}
					<KanbanView
						{project}
						dragOverPhase={dragState.dragOverPhase}
						dragOverPhaseId={dragState.dragOverPhaseId}
						{editingPhaseId}
						{editingPhaseData}
						{calendarConnected}
						on:addPhase={startCreatingPhase}
						on:taskDragStart={(e) => handleTaskDragStart(e.detail)}
						on:taskDragOver={(e) => handleTaskDragOver(e.detail)}
						on:taskDragLeave={handleTaskDragLeave}
						on:taskDrop={(e) => handleTaskDrop(e.detail)}
						on:schedulePhase={(e) => handleSchedulePhase(e.detail)}
						on:editPhase={(e) => startEditingPhase(e.detail)}
						on:deletePhase={(e) => modalStore.open('deletePhase', e.detail)}
						on:savePhase={(e) => savePhaseChanges(e.detail)}
						on:cancelPhaseEdit={cancelPhaseEdit}
						on:editTask={(e) => onEditTask(e.detail)}
						on:deleteTask={(e) => handleTaskDelete(e.detail)}
						on:updateTask={(e) => handleTaskUpdate(e.detail)}
						on:createTask={(e) => handleCreateTaskForPhase(e.detail)}
					/>
				{/if}
			{:else}
				<!-- Show empty state for Kanban if no phases -->
				<div class="text-center py-12 text-gray-500 dark:text-gray-400">
					<p class="text-lg mb-2">No phases to display</p>
					<p class="text-sm">Create phases to see the kanban view.</p>
				</div>
			{/if}
		{:else}
			<!-- Timeline view always shows (includes backlog) -->
			{#if loadingComponents['TimelineView']}
				<div class="flex items-center justify-center p-8">
					<div class="text-sm text-gray-500">Loading timeline view...</div>
				</div>
			{:else if TimelineView}
				<TimelineView
					{project}
					dragOverPhaseId={dragState.dragOverPhaseId}
					dragOverPhase={dragState.dragOverPhase}
					{editingPhaseId}
					{editingPhaseData}
					{calendarConnected}
					on:schedulePhase={(e) => handleSchedulePhase(e.detail)}
					on:editPhase={(e) => startEditingPhase(e.detail)}
					on:deletePhase={(e) => modalStore.open('deletePhase', e.detail)}
					on:savePhase={(e) => savePhaseChanges(e.detail)}
					on:cancelPhaseEdit={cancelPhaseEdit}
					on:editTask={(e) => onEditTask(e.detail)}
					on:deleteTask={(e) => handleTaskDelete(e.detail)}
					on:updateTask={(e) => handleTaskUpdate(e.detail)}
					on:taskDragStart={(e) => handleTaskDragStart(e.detail)}
					on:taskDragOver={(e) => handleTaskDragOver(e.detail)}
					on:taskDragLeave={handleTaskDragLeave}
					on:taskDrop={(e) => handleTaskDrop(e.detail)}
					on:createTask={(e) => handleCreateTaskForPhase(e.detail)}
				/>
			{/if}
		{/if}
	{/if}

	{#if generating}
		{#if loadingComponents['PhaseGenerationLoadingOverlay']}
			<!-- Fallback loading state -->
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-0">
				<div class="bg-white dark:bg-gray-800 p-6 rounded-lg">
					<div class="text-sm text-gray-500">Loading...</div>
				</div>
			</div>
		{:else if PhaseGenerationLoadingOverlay}
			<PhaseGenerationLoadingOverlay isVisible={generating} isRegeneration={hasPhases} />
		{/if}
	{/if}
</div>

<style>
	.phases-section {
		min-height: 40px;
		/* position: relative; */
	}

	.phases-section.dragging {
		user-select: none;
		-webkit-user-select: none;
	}
</style>
