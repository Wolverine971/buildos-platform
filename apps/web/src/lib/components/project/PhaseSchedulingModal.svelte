<!-- apps/web/src/lib/components/project/PhaseSchedulingModal.svelte -->
<!--
	Phase Scheduling Modal - Optimized Version

	Key improvements:
	- Fixed infinite loading loops
	- Better loading state management
	- Optimized reactive statements
	- Prevented concurrent data loading
	- Separated concerns for task updates
-->
<script lang="ts">
	import { Calendar, Loader2, X, ChevronDown } from 'lucide-svelte';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import ScheduleConflictAlert from '$lib/components/scheduling/ScheduleConflictAlert.svelte';
	import TaskScheduleItem from '$lib/components/scheduling/TaskScheduleItem.svelte';
	import { schedulingStore } from '$lib/stores/schedulingStore';
	import { toastService } from '$lib/stores/toast.store';
	import {
		formatDate,
		parseLocalDate,
		type ProposedTaskSchedule
	} from '$lib/utils/schedulingUtils';
	import {
		validatePhaseDateAgainstProject,
		type ProjectBoundaries
	} from '$lib/utils/dateValidation';
	import type { PhaseWithTasks } from '$lib/types/project-page.types';

	export let isOpen = false;
	export let phase: PhaseWithTasks;
	export let projectId: string;
	export let project: ProjectBoundaries;

	const dispatch = createEventDispatcher();

	// Store subscriptions
	let status: 'idle' | 'loading' | 'ready' | 'saving' | 'refreshing' | 'error' = 'idle';
	let error: string | null = null;
	let warnings: string[] = [];
	let proposedSchedules: ProposedTaskSchedule[] = [];
	let calendarEvents: any[] = [];
	let conflicts: any[] = [];
	let viewMode: 'day' | 'week' | 'month' = 'week';
	let currentDate = new Date();
	let editingTaskId: string | null = null;
	let phaseValidationWarning: string | null = null;
	let lastLoadedPhaseId: string | null = null;
	let workingHours = {
		work_start_time: '09:00',
		work_end_time: '17:00',
		working_days: [1, 2, 3, 4, 5],
		default_task_duration_minutes: 60,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
	};

	// New state for highlighting and mobile
	let highlightedTaskId: string | null = null;
	let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
	let calendarExpanded = false; // Mobile calendar toggle

	// Subscribe to store
	const unsubscribe = schedulingStore.subscribe((state) => {
		status = state.status;
		error = state.error;
		warnings = state.warnings;
		proposedSchedules = state.proposedSchedules;
		calendarEvents = state.calendarEvents;
		conflicts = state.conflicts;
		viewMode = state.viewMode;
		currentDate = state.currentDate;
		editingTaskId = state.editingTaskId;
		lastLoadedPhaseId = state.lastLoadedPhaseId;
		workingHours = state.workingHours;
	});

	// Validate phase dates against project
	$: if (phase && project) {
		const validation = validatePhaseDateAgainstProject(
			phase.start_date,
			phase.end_date,
			project
		);

		if (!validation.isValid) {
			phaseValidationWarning = `⚠️ Phase dates issue: ${validation.error}`;
		} else if (validation.warning) {
			phaseValidationWarning = `⚠️ ${validation.warning}`;
		} else {
			phaseValidationWarning = null;
		}
	}

	// Load data when modal opens
	$: if (isOpen && phase && phase.id !== lastLoadedPhaseId) {
		schedulingStore.initialize(phase, projectId, project);
	}

	// Handle calendar view events
	function handleEventClick(event: CustomEvent) {
		const { event: clickedEvent } = event.detail;

		if (clickedEvent.type === 'existing' && clickedEvent.htmlLink) {
			window.open(clickedEvent.htmlLink, '_blank');
		} else if (clickedEvent.type === 'proposed' && clickedEvent.schedule) {
			const taskId = clickedEvent.schedule.task.id;
			highlightAndScrollToTask(taskId);
		}
	}

	/**
	 * Highlight and scroll to a task in the list
	 */
	function highlightAndScrollToTask(taskId: string) {
		// Clear existing timeout
		if (highlightTimeout) {
			clearTimeout(highlightTimeout);
		}

		// Set highlighted task
		highlightedTaskId = taskId;

		// Scroll to task
		setTimeout(() => {
			const element = document.getElementById(`task-schedule-item-${taskId}`);
			if (element) {
				element.scrollIntoView({
					behavior: 'smooth',
					block: 'center'
				});
			}
		}, 100);

		// Clear highlight after 3 seconds
		highlightTimeout = setTimeout(() => {
			highlightedTaskId = null;
		}, 3000);
	}

	/**
	 * Handle clicking on conflict warning - highlight affected task
	 */
	function handleConflictClick(taskId: string) {
		highlightAndScrollToTask(taskId);
	}

	function handleDateChange(event: CustomEvent) {
		schedulingStore.setCurrentDate(event.detail.date);
		// Optionally reload calendar events for new date range
	}

	function handleViewModeChange(event: CustomEvent) {
		schedulingStore.setViewMode(event.detail.mode);
	}

	async function handleRefresh() {
		await schedulingStore.refreshCalendarEvents();
	}

	// Handle task schedule updates
	function handleTaskEditStart(event: CustomEvent) {
		const { schedule } = event.detail;
		schedulingStore.setEditingTask(schedule.task.id);
	}

	function handleTaskEditCancel(event: CustomEvent) {
		schedulingStore.setEditingTask(null);
	}

	function handleTaskEditSave(event: CustomEvent) {
		const { schedule, newStart, newEnd } = event.detail;
		schedulingStore.updateTaskSchedule(schedule.task.id, newStart, newEnd);
		schedulingStore.setEditingTask(null);
	}

	function handleTaskReset(event: CustomEvent) {
		const { schedule } = event.detail;
		if (schedule.originalStart && schedule.originalEnd) {
			schedulingStore.updateTaskSchedule(
				schedule.task.id,
				schedule.originalStart,
				schedule.originalEnd
			);
		}
	}

	// Save all schedules
	async function scheduleAllTasks() {
		if (phaseValidationWarning && phaseValidationWarning.includes('Phase dates issue')) {
			toastService.error(
				'Cannot schedule tasks: Phase dates are outside project boundaries.'
			);
			return;
		}

		const success = await schedulingStore.saveSchedules(projectId);

		if (success) {
			toastService.success(`Successfully scheduled ${proposedSchedules.length} tasks`);
			dispatch('scheduled', {
				phaseId: phase.id,
				projectId,
				taskCount: proposedSchedules.length,
				needsRefresh: true
			});
			handleClose();
		}
	}

	function handleClose() {
		dispatch('close');
		isOpen = false;
	}

	onDestroy(() => {
		unsubscribe();
		schedulingStore.reset();
	});

	// Check if can schedule
	$: canSchedule =
		status === 'ready' &&
		proposedSchedules.length > 0 &&
		!phaseValidationWarning?.includes('Phase dates issue');

	// Count conflicts
	$: conflictCount = proposedSchedules.filter((s) => s.hasConflict).length;
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	size="2xl"
	closeOnBackdrop={status !== 'saving'}
	closeOnEscape={status !== 'saving'}
	persistent={status === 'saving'}
>
	<!-- Custom Header -->
	<svelte:fragment slot="header">
		<div
			class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 gap-3"
		>
			<div class="flex items-center space-x-3 flex-1">
				<div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex-shrink-0">
					<Calendar
						class="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400"
					/>
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate"
					>
						Schedule Tasks for {phase.name}
					</h2>
					<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
						{formatDate(parseLocalDate(phase.start_date))} - {formatDate(
							parseLocalDate(phase.end_date)
						)}
					</p>
					{#if project && (project.start_date || project.end_date)}
						<p class="text-xs text-gray-500 dark:text-gray-500 mt-1">
							Project:
							{project.start_date
								? formatDate(parseLocalDate(project.start_date))
								: 'No start'} -
							{project.end_date
								? formatDate(parseLocalDate(project.end_date))
								: 'No end'}
						</p>
					{/if}
				</div>
			</div>
			<Button on:click={handleClose} variant="ghost" size="sm" icon={X} class="!p-1" />
		</div>

		<!-- Alerts -->
		<ScheduleConflictAlert
			{conflicts}
			{warnings}
			{phaseValidationWarning}
			onTaskClick={handleConflictClick}
		/>

		{#if error}
			<div
				class="px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-800"
			>
				<div class="flex items-start gap-2 text-sm text-rose-800 dark:text-rose-200">
					<span>{error}</span>
					{#if error.includes('Calendar not connected')}
						<a
							href="/profile?tab=calendar"
							class="text-primary-600 dark:text-primary-400 hover:underline ml-2"
						>
							Connect Calendar →
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</svelte:fragment>

	<!-- Main Content -->
	<div class="flex flex-col h-full max-h-[70vh]">
		{#if status === 'loading'}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="w-8 h-8 animate-spin text-gray-400 mr-3" />
				<span class="text-gray-500 dark:text-gray-400">Loading scheduling data...</span>
			</div>
		{:else if status === 'error' && !proposedSchedules.length}
			<div class="p-6 text-center">
				<p class="text-red-600 dark:text-red-400">
					{error || 'Failed to load scheduling data'}
				</p>
				<Button
					onclick={() => schedulingStore.initialize(phase, projectId, project)}
					variant="primary"
					size="sm"
					class="mt-4"
				>
					Retry
				</Button>
			</div>
		{:else}
			<!-- Desktop: Two-column layout -->
			<div class="hidden lg:grid lg:grid-cols-[2fr_3fr] gap-0 h-full">
				<!-- Left: Task List Panel -->
				<div class="border-r border-gray-200 dark:border-gray-700 flex flex-col">
					<div
						class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
					>
						<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
							Tasks to Schedule
						</h3>
						<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
							Click a task to edit its schedule
						</p>
					</div>

					<div
						id="task-list-panel"
						class="flex-1 overflow-y-auto p-4"
						role="list"
						aria-label="Tasks to schedule"
					>
						<div class="space-y-3">
							{#each proposedSchedules as schedule (schedule.task.id)}
								<div role="listitem">
									<TaskScheduleItem
										{schedule}
										isEditing={editingTaskId === schedule.task.id}
										isHighlighted={highlightedTaskId === schedule.task.id}
										compact={false}
										on:editStart={handleTaskEditStart}
										on:editCancel={handleTaskEditCancel}
										on:editSave={handleTaskEditSave}
										on:reset={handleTaskReset}
									/>
								</div>
							{/each}
						</div>
					</div>

					<div
						class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
					>
						<div class="text-xs text-gray-600 dark:text-gray-400">
							{proposedSchedules.length} task{proposedSchedules.length === 1 ? '' : 's'}
							{#if conflictCount > 0}
								•
								<span class="text-amber-600 dark:text-amber-400">
									{conflictCount} with warning{conflictCount === 1 ? '' : 's'}
								</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Right: Calendar Panel -->
				<div class="flex flex-col bg-white dark:bg-gray-900">
					<CalendarView
						{viewMode}
						{currentDate}
						events={calendarEvents}
						{proposedSchedules}
						{workingHours}
						loading={false}
						refreshing={status === 'refreshing'}
						phaseStart={phase.start_date}
						phaseEnd={phase.end_date}
						highlightedTaskId={highlightedTaskId}
						on:eventClick={handleEventClick}
						on:dateChange={handleDateChange}
						on:viewModeChange={handleViewModeChange}
						on:refresh={handleRefresh}
					/>
				</div>
			</div>

			<!-- Mobile: Vertical stack -->
			<div class="lg:hidden flex flex-col h-full">
				<!-- Collapsible Calendar -->
				<div class="border-b border-gray-200 dark:border-gray-700">
					<button
						onclick={() => (calendarExpanded = !calendarExpanded)}
						class="w-full p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
					>
						<span class="text-sm font-semibold text-gray-900 dark:text-white">
							<Calendar class="w-4 h-4 inline mr-2" />
							Calendar View
						</span>
						<ChevronDown
							class="w-5 h-5 transition-transform {calendarExpanded ? 'rotate-180' : ''}"
						/>
					</button>

					{#if calendarExpanded}
						<div class="h-96">
							<CalendarView
								{viewMode}
								{currentDate}
								events={calendarEvents}
								{proposedSchedules}
								{workingHours}
								loading={false}
								refreshing={status === 'refreshing'}
								phaseStart={phase.start_date}
								phaseEnd={phase.end_date}
								highlightedTaskId={highlightedTaskId}
								on:eventClick={handleEventClick}
								on:dateChange={handleDateChange}
								on:viewModeChange={handleViewModeChange}
								on:refresh={handleRefresh}
							/>
						</div>
					{/if}
				</div>

				<!-- Task List (always visible on mobile) -->
				<div class="flex-1 overflow-y-auto p-4">
					<div class="mb-3">
						<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
							Tasks to Schedule
						</h3>
						<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
							{proposedSchedules.length} task{proposedSchedules.length === 1 ? '' : 's'}
							{#if conflictCount > 0}
								•
								<span class="text-amber-600 dark:text-amber-400">
									{conflictCount} with warning{conflictCount === 1 ? '' : 's'}
								</span>
							{/if}
						</p>
					</div>

					<div class="space-y-2">
						{#each proposedSchedules as schedule (schedule.task.id)}
							<TaskScheduleItem
								{schedule}
								isEditing={editingTaskId === schedule.task.id}
								isHighlighted={highlightedTaskId === schedule.task.id}
								compact={true}
								on:editStart={handleTaskEditStart}
								on:editCancel={handleTaskEditCancel}
								on:editSave={handleTaskEditSave}
								on:reset={handleTaskReset}
							/>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<svelte:fragment slot="footer">
		<div
			class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 gap-3"
		>
			<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
				{#if proposedSchedules.length > 0}
					<span class="font-medium">{proposedSchedules.length}</span> tasks ready
					{#if conflictCount > 0}
						• <span class="text-amber-600 dark:text-amber-400">
							{conflictCount} conflict{conflictCount === 1 ? '' : 's'}
						</span>
					{/if}
				{:else}
					No tasks to schedule
				{/if}
			</div>
			<div class="flex gap-3 w-full sm:w-auto">
				<Button
					onclick={handleClose}
					disabled={status === 'saving'}
					variant="outline"
					size="md"
					class="flex-1 sm:flex-initial"
				>
					Cancel
				</Button>
				<Button
					onclick={scheduleAllTasks}
					disabled={!canSchedule || status === 'saving'}
					variant="primary"
					size="md"
					class="flex-1 sm:flex-initial min-w-[140px]"
				>
					{#if status === 'saving'}
						<Loader2 class="w-4 h-4 animate-spin mr-2" />
						Scheduling...
					{:else}
						<Calendar class="w-4 h-4 mr-2" />
						Schedule Tasks
					{/if}
				</Button>
			</div>
		</div>
	</svelte:fragment>
</Modal>
