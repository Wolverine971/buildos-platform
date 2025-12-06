<!-- apps/web/src/lib/components/project/RescheduleOverdueTasksModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Clock, Info, Shuffle } from 'lucide-svelte';

	import type { TaskWithCalendarEvents, PhaseWithTasks } from '$lib/types/project-page.types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { projectStoreV2 } from '$lib/stores/project.store';

	export let isOpen = false;
	export let projectId: string;
	export let overdueTasks: TaskWithCalendarEvents[] = [];
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let phases: PhaseWithTasks[] = [];
	export let calendarConnected = false;

	const dispatch = createEventDispatcher();

	// Rescheduling options
	let shiftExisting = true; // Shift existing tasks to make room
	let targetStartDate = getNextWorkday(); // Default to next workday

	// State
	let loading = false;
	let error: string | null = null;

	// Get next workday as default start date
	function getNextWorkday() {
		const date = new Date();
		date.setDate(date.getDate() + 1);
		// Skip weekends
		while (date.getDay() === 0 || date.getDay() === 6) {
			date.setDate(date.getDate() + 1);
		}
		return date.toISOString().split('T')[0];
	}

	// Format date for display - ensure consistent timezone handling
	function formatDate(dateStr: string) {
		// Parse the date string as a local date (not UTC)
		// This ensures the date displayed matches what the user selected
		const [year, month, day] = dateStr.split('-').map(Number);
		const date = new Date(year, month - 1, day);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
		});
	}

	// Calculate how overdue tasks are
	function getDaysOverdue(task: TaskWithCalendarEvents) {
		if (!task.start_date) return 0;
		const now = new Date();
		const taskDate = new Date(task.start_date);
		const diffTime = now.getTime() - taskDate.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return diffDays;
	}

	async function handleReschedule() {
		if (loading) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/tasks/reschedule-overdue`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					taskIds: overdueTasks.map((t) => t.id),
					shiftExisting,
					targetStartDate,
					useCalendar: calendarConnected,
					useTimeSlotFinder: true // Always use intelligent time slot finding
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to reschedule tasks');
			}

			// Update store with the rescheduled tasks
			if (result.data?.rescheduledTasks) {
				result.data.rescheduledTasks.forEach((task: any) => {
					projectStoreV2.updateTask(task);
				});
			}

			// Update shifted tasks if any
			if (result.data?.shiftedTasks) {
				result.data.shiftedTasks.forEach((task: any) => {
					projectStoreV2.updateTask(task);
				});
			}

			const message =
				shiftExisting && result.data?.shiftedTasks?.length > 0
					? `Rescheduled ${result.data.rescheduledTasks.length} overdue tasks and shifted ${result.data.shiftedTasks.length} existing tasks`
					: `Rescheduled ${result.data.rescheduledTasks.length} overdue tasks`;

			toastService.success(message);
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

	// Group overdue tasks by how overdue they are
	$: overdueGroups = (() => {
		const groups = {
			recent: [] as TaskWithCalendarEvents[], // 1-3 days
			moderate: [] as TaskWithCalendarEvents[], // 4-7 days
			old: [] as TaskWithCalendarEvents[] // 8+ days
		};

		overdueTasks.forEach((task) => {
			const days = getDaysOverdue(task);
			if (days <= 3) groups.recent.push(task);
			else if (days <= 7) groups.moderate.push(task);
			else groups.old.push(task);
		});

		return groups;
	})();
</script>

<Modal {isOpen} onClose={handleClose} size="lg">
	{#snippet children()}
		<div
			slot="header"
			class="flex items-center justify-between p-4 sm:p-5 md:p-6 border-b border-gray-200 dark:border-gray-700"
		>
			<div class="flex items-center gap-2 sm:gap-2">
				<div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex-shrink-0">
					<Clock class="w-5 h-5 text-orange-600 dark:text-orange-400" />
				</div>
				<div class="min-w-0">
					<h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
						Reschedule Overdue Tasks
					</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
						{overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''} to reschedule
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

			<!-- Overdue Tasks Summary -->
			<div class="space-y-3">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Overdue Tasks Summary
				</h3>

				<div class="grid grid-cols-3 gap-2">
					{#if overdueGroups.recent.length > 0}
						<div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
							<p class="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
								{overdueGroups.recent.length}
							</p>
							<p class="text-xs text-yellow-600 dark:text-yellow-400">
								1-3 days overdue
							</p>
						</div>
					{/if}

					{#if overdueGroups.moderate.length > 0}
						<div class="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
							<p class="text-2xl font-bold text-orange-700 dark:text-orange-300">
								{overdueGroups.moderate.length}
							</p>
							<p class="text-xs text-orange-600 dark:text-orange-400">
								4-7 days overdue
							</p>
						</div>
					{/if}

					{#if overdueGroups.old.length > 0}
						<div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<p class="text-2xl font-bold text-red-700 dark:text-red-300">
								{overdueGroups.old.length}
							</p>
							<p class="text-xs text-red-600 dark:text-red-400">8+ days overdue</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Rescheduling Options -->
			<div class="space-y-3">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Rescheduling Options
				</h3>

				<!-- Target Start Date -->
				<div class="space-y-2">
					<label for="target-date" class="text-sm text-gray-600 dark:text-gray-400">
						Start rescheduling from
					</label>
					<input
						id="target-date"
						type="date"
						bind:value={targetStartDate}
						min={new Date().toISOString().split('T')[0]}
						class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<!-- Shift Existing Tasks Option -->
				<label
					class="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors"
				>
					<input
						type="checkbox"
						bind:checked={shiftExisting}
						class="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
					/>
					<div class="flex-1">
						<div class="flex items-center gap-2">
							<Shuffle class="w-4 h-4 text-gray-600 dark:text-gray-400" />
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Shift existing tasks
							</p>
						</div>
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							{#if shiftExisting}
								Existing scheduled tasks will be pushed forward to make room for
								overdue tasks
							{:else}
								Overdue tasks will be fitted around existing scheduled tasks
							{/if}
						</p>
					</div>
				</label>
			</div>

			<!-- Task List Preview -->
			<div class="space-y-2">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Tasks to reschedule
				</h3>
				<div
					class="max-h-40 overflow-y-auto space-y-1 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
				>
					{#each overdueTasks.slice(0, 10) as task}
						<div class="flex items-center justify-between py-1">
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<Clock class="w-3 h-3 text-orange-500 flex-shrink-0" />
								<span class="text-sm text-gray-700 dark:text-gray-300 truncate">
									{task.title}
								</span>
							</div>
							<span
								class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2"
							>
								{getDaysOverdue(task)}d overdue
							</span>
						</div>
					{/each}
					{#if overdueTasks.length > 10}
						<p class="text-xs text-gray-500 dark:text-gray-400 pt-1">
							...and {overdueTasks.length - 10} more
						</p>
					{/if}
				</div>
			</div>

			<!-- Info Box -->
			<div
				class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
			>
				<div class="flex gap-2">
					<Info class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
					<div class="text-sm text-blue-700 dark:text-blue-300">
						{#if calendarConnected}
							Tasks will be intelligently rescheduled around your existing calendar
							events starting from {formatDate(targetStartDate)}.
						{:else}
							Tasks will be rescheduled starting from {formatDate(targetStartDate)}.
							Connect your calendar for intelligent scheduling around existing events.
						{/if}
					</div>
				</div>
			</div>
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
					onclick={handleReschedule}
					variant="primary"
					disabled={loading || overdueTasks.length === 0}
					{loading}
					class="w-full sm:w-auto"
				>
					{loading
						? 'Rescheduling...'
						: `Reschedule ${overdueTasks.length} Task${overdueTasks.length !== 1 ? 's' : ''}`}
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>
