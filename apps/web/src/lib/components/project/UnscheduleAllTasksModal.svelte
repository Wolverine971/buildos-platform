<!-- apps/web/src/lib/components/project/UnscheduleAllTasksModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { CalendarX, Calendar, AlertTriangle, Info, Loader2 } from 'lucide-svelte';

	import type { PhaseWithTasks } from '$lib/types/project-page.types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { projectStoreV2 } from '$lib/stores/project.store';

	export let isOpen = false;
	export let phases: PhaseWithTasks[] = [];
	export let scheduledTaskCount: number = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let scheduledTaskCountInPhases: number = 0;
	export let totalTasksInPhases: number = 0;
	export let projectId: string = '';
	export let allTasks: any[] = [];
	export let hasTasksWithDates: boolean = false;

	const dispatch = createEventDispatcher();

	// Options for unscheduling
	let clearDates = false; // Keep dates but remove calendar events
	let removeCalendarEvents = true; // Always remove calendar events
	let moveToBacklog = false; // Move tasks to backlog (remove from phases)

	// State
	let loading = false;
	let error: string | null = null;

	// Calculate affected tasks based on selected options
	$: affectedTasks = (() => {
		if (clearDates && !moveToBacklog) {
			// When clearing dates only, affect all tasks with dates (including backlog)
			return allTasks.filter((task) => task.start_date);
		} else if (moveToBacklog) {
			// When moving to backlog, only affect tasks in phases
			return phases.flatMap((phase) => phase.tasks || []);
		} else {
			// Default: tasks in phases with dates
			return phases.flatMap((phase) =>
				(phase.tasks || []).filter((task) => task.start_date || task.calendar_event_id)
			);
		}
	})();

	$: affectedPhaseCount = moveToBacklog
		? phases.filter((phase) => phase.tasks && phase.tasks.length > 0).length
		: phases.filter((phase) =>
				phase.tasks?.some((task) => task.start_date || task.calendar_event_id)
			).length;

	async function handleUnschedule() {
		if (loading) return;

		loading = true;
		error = null;

		try {
			// Use passed projectId or get from the first phase
			const currentProjectId = projectId || phases[0]?.project_id;
			if (!currentProjectId) {
				throw new Error('Project ID not found');
			}

			const response = await fetch(`/api/projects/${currentProjectId}/tasks/unschedule-all`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					clearDates,
					removeCalendarEvents,
					moveToBacklog
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to unschedule tasks');
			}

			// Update store with the unscheduled tasks
			if (result.data?.unscheduledTasks) {
				result.data.unscheduledTasks.forEach((task: any) => {
					// When moving to backlog, ensure phase_id is removed from tasks
					if (moveToBacklog) {
						task.phase_id = null;
					}
					projectStoreV2.updateTask(task);
				});
			}

			let message;
			if (moveToBacklog) {
				message = `Moved ${result.data?.totalUnscheduled || 0} task${result.data?.totalUnscheduled !== 1 ? 's' : ''} to backlog`;
			} else if (clearDates) {
				message = `Unscheduled ${result.data?.totalUnscheduled || 0} task${result.data?.totalUnscheduled !== 1 ? 's' : ''} and cleared dates`;
			} else {
				message = `Removed calendar events from ${result.data?.totalUnscheduled || 0} task${result.data?.totalUnscheduled !== 1 ? 's' : ''}`;
			}

			toastService.success(message);

			// Force reload phases and tasks to ensure UI is fully updated
			if (currentProjectId) {
				await projectStoreV2.loadPhases(currentProjectId, true); // Force reload
				await projectStoreV2.loadTasks(currentProjectId, true); // Force reload
			}

			// Dispatch event to notify parent components
			dispatch('tasksUnscheduled', {
				unscheduledCount: result.data?.totalUnscheduled || 0,
				clearDates
			});

			handleClose();
		} catch (err) {
			error = (err as Error).message;
			toastService.error(error);
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		dispatch('close');
	}
</script>

<Modal {isOpen} onClose={handleClose} size="md">
	{#snippet children()}
		<div
			slot="header"
			class="flex items-center justify-between p-4 sm:p-5 md:p-6 border-b border-gray-200 dark:border-gray-700"
		>
			<div class="flex items-center gap-2 sm:gap-2">
				<div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
					<CalendarX class="w-5 h-5 text-red-600 dark:text-red-400" />
				</div>
				<div class="min-w-0">
					<h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
						{totalTasksInPhases === 0 && hasTasksWithDates
							? 'Clear All Dates'
							: 'Unschedule All Tasks'}
					</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
						{#if clearDates && !moveToBacklog}
							{affectedTasks.length} task{affectedTasks.length !== 1 ? 's' : ''} will have
							dates cleared
						{:else if moveToBacklog}
							{affectedTasks.length} task{affectedTasks.length !== 1 ? 's' : ''} will be
							moved to backlog
						{:else}
							{scheduledTaskCount} scheduled task{scheduledTaskCount !== 1 ? 's' : ''}
							will be affected
						{/if}
					</p>
				</div>
			</div>
		</div>

		<div class="p-4 sm:p-5 md:p-6 space-y-6">
			{#if error}
				<div
					class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
				>
					<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
				</div>
			{/if}

			<!-- Warning -->
			<div
				class="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg"
			>
				<div class="flex gap-2">
					<AlertTriangle
						class="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-1"
					/>
					<div class="space-y-2">
						<p class="text-sm font-medium text-orange-800 dark:text-orange-200">
							{moveToBacklog
								? `This action will move ${affectedTasks.length} task${affectedTasks.length !== 1 ? 's' : ''} from ${affectedPhaseCount} phase${affectedPhaseCount !== 1 ? 's' : ''} to the backlog.`
								: `This action will affect ${scheduledTaskCount} task${scheduledTaskCount !== 1 ? 's' : ''} across ${affectedPhaseCount} phase${affectedPhaseCount !== 1 ? 's' : ''}.`}
						</p>
						<p class="text-sm text-orange-700 dark:text-orange-300">
							{moveToBacklog
								? 'All phase assignments will be removed and tasks will be unscheduled.'
								: 'All calendar events associated with these tasks will be removed.'}
						</p>
					</div>
				</div>
			</div>

			<!-- Options -->
			<div class="space-y-3">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Unschedule Options
				</h3>

				<label
					class="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors"
				>
					<input
						type="checkbox"
						bind:checked={clearDates}
						class="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
					/>
					<div class="flex-1">
						<p class="text-sm font-medium text-gray-900 dark:text-white">
							Clear task dates
						</p>
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Remove start and due dates from tasks (tasks will become unscheduled)
						</p>
					</div>
				</label>

				{#if totalTasksInPhases > 0}
					<label
						class="flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-colors {moveToBacklog
							? 'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40'
							: 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/70'}"
					>
						<input
							type="checkbox"
							bind:checked={moveToBacklog}
							class="mt-1 w-4 h-4 text-orange-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-orange-500"
						/>
						<div class="flex-1">
							<p
								class="text-sm font-medium {moveToBacklog
									? 'text-orange-900 dark:text-orange-100'
									: 'text-gray-900 dark:text-white'}"
							>
								Move all tasks to backlog
							</p>
							<p
								class="text-xs {moveToBacklog
									? 'text-orange-700 dark:text-orange-300'
									: 'text-gray-500 dark:text-gray-400'} mt-1"
							>
								Remove ALL tasks from their phases and move them to the project
								backlog. This will clear all phase assignments.
							</p>
						</div>
					</label>
				{/if}

				<div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-60">
					<div class="flex items-start gap-2">
						<input
							type="checkbox"
							checked={removeCalendarEvents}
							disabled
							class="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded"
						/>
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Remove calendar events
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Calendar events will always be removed (required)
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Info Box -->
			<div
				class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
			>
				<div class="flex gap-2">
					<Info class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
					<div class="text-sm text-blue-700 dark:text-blue-300">
						{#if moveToBacklog}
							Tasks will be moved to the backlog, removed from their phases, and all
							calendar events will be deleted.
							{#if clearDates}
								Task dates will also be cleared.
							{:else}
								Task dates will be preserved for future scheduling.
							{/if}
						{:else if clearDates}
							Tasks will be completely unscheduled. Both dates and calendar events
							will be removed.
						{:else}
							Tasks will keep their dates but calendar events will be removed. You can
							sync them back to calendar later.
						{/if}
					</div>
				</div>
			</div>

			<!-- Affected Tasks Preview -->
			{#if affectedTasks.length > 0}
				<div class="space-y-2">
					<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
						{moveToBacklog
							? `Tasks to be moved to backlog (${affectedTasks.length})`
							: `Tasks to be unscheduled (${affectedTasks.length})`}
					</h3>
					<div
						class="max-h-32 overflow-y-auto space-y-1 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
					>
						{#each affectedTasks.slice(0, 10) as task}
							<div class="flex items-center gap-2 text-xs">
								<Calendar class="w-3 h-3 text-gray-400" />
								<span class="text-gray-600 dark:text-gray-400 truncate">
									{task.title}
								</span>
							</div>
						{/each}
						{#if affectedTasks.length > 10}
							<p class="text-xs text-gray-500 dark:text-gray-400 pl-5">
								...and {affectedTasks.length - 10} more
							</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<div
			slot="footer"
			class="p-4 sm:p-5 md:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
		>
			<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 sm:justify-end">
				<Button
					onclick={handleClose}
					variant="outline"
					disabled={loading}
					class="w-full sm:w-auto"
				>
					Cancel
				</Button>
				<Button
					onclick={handleUnschedule}
					variant="danger"
					disabled={loading}
					{loading}
					class="w-full sm:w-auto"
				>
					{#if loading}
						Processing...
					{:else if totalTasksInPhases === 0 && hasTasksWithDates}
						Clear All Dates
					{:else}
						Unschedule All Tasks
					{/if}
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>
