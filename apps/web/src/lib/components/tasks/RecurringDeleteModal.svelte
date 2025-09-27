<!-- src/lib/components/tasks/RecurringDeleteModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, AlertTriangle, Calendar, RefreshCw } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RadioGroup from '$lib/components/ui/RadioGroup.svelte';
	import Radio from '$lib/components/ui/Radio.svelte';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';

	export let isOpen = false;
	export let task: TaskWithCalendarEvents | null = null;
	export let instanceDate: string | null = null;
	export let loading = false;

	const dispatch = createEventDispatcher();

	type DeletionScope = 'this_only' | 'this_and_future' | 'all';
	let selectedScope: DeletionScope = 'this_only';

	// Calculate upcoming instances for display
	$: upcomingInstances =
		task?.task_type === 'recurring' && task.start_date
			? recurrencePatternBuilder.calculateInstances(
					{
						pattern: { type: task.recurrence_pattern },
						startDate: task.start_date,
						endOption: task.recurrence_ends
							? { type: 'date', value: task.recurrence_ends }
							: { type: 'never' }
					},
					5
				)
			: [];

	// Count total instances (approximate for infinite series)
	$: instanceCount = getInstanceCount();

	function getInstanceCount(): number | string {
		if (!task || task.task_type !== 'recurring') return 0;

		if (!task.recurrence_ends) {
			return '∞'; // Infinite recurrence
		}

		// Calculate approximate count based on pattern
		const start = new Date(task.start_date || new Date());
		const end = new Date(task.recurrence_ends);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

		switch (task.recurrence_pattern) {
			case 'daily':
				return days;
			case 'weekdays':
				return Math.floor((days * 5) / 7);
			case 'weekly':
				return Math.floor(days / 7);
			case 'biweekly':
				return Math.floor(days / 14);
			case 'monthly':
				return Math.floor(days / 30);
			case 'quarterly':
				return Math.floor(days / 90);
			case 'yearly':
				return Math.floor(days / 365);
			default:
				return days;
		}
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getPatternLabel(pattern: string): string {
		const labels: Record<string, string> = {
			daily: 'Daily',
			weekdays: 'Weekdays',
			weekly: 'Weekly',
			biweekly: 'Every 2 weeks',
			monthly: 'Monthly',
			quarterly: 'Quarterly',
			yearly: 'Yearly'
		};
		return labels[pattern] || pattern;
	}

	function handleCancel() {
		selectedScope = 'this_only'; // Reset to default
		dispatch('cancel');
	}

	function handleConfirm() {
		if (!task) {
			console.error('Cannot confirm deletion - no task data');
			return;
		}

		dispatch('confirm', {
			scope: selectedScope,
			instanceDate: instanceDate
		});
	}

	// Message helpers
	$: deleteMessage = getDeleteMessage();

	function getDeleteMessage(): string {
		if (!task) return '';

		switch (selectedScope) {
			case 'this_only':
				return instanceDate
					? `Only the occurrence on ${formatDate(instanceDate)} will be deleted.`
					: 'Only this specific occurrence will be deleted. Future occurrences will remain.';

			case 'this_and_future':
				return instanceDate
					? `This occurrence and all future occurrences after ${formatDate(instanceDate)} will be deleted.`
					: 'This occurrence and all future occurrences will be deleted.';

			case 'all':
				return instanceCount === '∞'
					? `All occurrences of this ${getPatternLabel(task.recurrence_pattern || 'recurring').toLowerCase()} task will be deleted.`
					: `All ${instanceCount} occurrences of this ${getPatternLabel(task.recurrence_pattern || 'recurring').toLowerCase()} task will be deleted.`;

			default:
				return '';
		}
	}

	// Warning messages for edge cases
	$: warningMessage = getWarningMessage();

	function getWarningMessage(): string | null {
		if (!task) return null;

		// Check for completed instances
		const hasCompletedInstances = task.task_calendar_events?.some(
			(e) => e.sync_status === 'completed'
		);

		// Check for modified instances
		const hasModifiedInstances = task.task_calendar_events?.some(
			(e) => e.sync_status === 'modified'
		);

		if (selectedScope === 'all') {
			if (hasCompletedInstances) {
				return 'This will also remove the history of completed instances.';
			}
			if (hasModifiedInstances) {
				return 'Some instances have been modified. These changes will be lost.';
			}
		}

		if (selectedScope === 'this_and_future' && hasModifiedInstances) {
			return 'Some future instances have been modified. These changes will be lost.';
		}

		return null;
	}
</script>

<Modal {isOpen} onClose={handleCancel} size="md" title="">
	<div class="p-6">
		<!-- Header -->
		<div class="flex items-start justify-between mb-6">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
					<AlertTriangle class="w-5 h-5 text-rose-600 dark:text-rose-400" />
				</div>
				<div>
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
						Delete Recurring Task
					</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
						{task?.title || 'Recurring task'}
					</p>
				</div>
			</div>
			<Button
				onclick={handleCancel}
				variant="ghost"
				size="sm"
				icon={X}
				class="!p-1"
				disabled={loading}
			/>
		</div>

		<!-- Task Info -->
		{#if task}
			<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
				<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
					<RefreshCw class="w-4 h-4" />
					<span>
						{getPatternLabel(task.recurrence_pattern || 'recurring')} task
						{#if task.recurrence_ends}
							until {formatDate(task.recurrence_ends)}
						{:else}
							(no end date)
						{/if}
					</span>
				</div>

				{#if upcomingInstances.length > 0}
					<div class="mt-3">
						<p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
							Upcoming occurrences:
						</p>
						<div class="space-y-1">
							{#each upcomingInstances.slice(0, 3) as date}
								<div
									class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
								>
									<Calendar class="w-3 h-3" />
									<span>{formatDate(date)}</span>
								</div>
							{/each}
							{#if upcomingInstances.length > 3}
								<p class="text-xs text-gray-500 dark:text-gray-500 italic">
									...and {upcomingInstances.length - 3} more
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Deletion Options -->
		<div class="mb-6">
			<RadioGroup
				bind:value={selectedScope}
				name="deletion-scope"
				label="Choose which occurrences to delete:"
				orientation="vertical"
				size="md"
				disabled={loading}
			>
				<Radio
					value="this_only"
					checked={selectedScope === 'this_only'}
					label="This occurrence only"
					description="Keep all other scheduled occurrences"
				/>

				{#if instanceDate || task?.start_date}
					<Radio
						value="this_and_future"
						checked={selectedScope === 'this_and_future'}
						label="This and future occurrences"
						description="Delete from this date forward"
					/>
				{/if}

				<Radio
					value="all"
					checked={selectedScope === 'all'}
					label="All occurrences"
					description="Delete the entire recurring series"
				/>
			</RadioGroup>
		</div>

		<!-- Confirmation Message -->
		<div
			class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 mb-4"
		>
			<p class="text-sm text-primary-800 dark:text-primary-200">
				{deleteMessage}
			</p>
		</div>

		<!-- Warning Message -->
		{#if warningMessage}
			<div
				class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6"
			>
				<div class="flex gap-2">
					<AlertTriangle
						class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
					/>
					<p class="text-sm text-amber-800 dark:text-amber-200">
						{warningMessage}
					</p>
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex gap-3 justify-end">
			<Button onclick={handleCancel} variant="outline" disabled={loading}>Cancel</Button>
			<Button onclick={handleConfirm} variant="danger" disabled={loading} {loading}>
				{#if loading}
					Deleting...
				{:else}
					Delete {selectedScope === 'all'
						? 'All'
						: selectedScope === 'this_only'
							? 'This'
							: 'Future'}
				{/if}
			</Button>
		</div>
	</div>
</Modal>
