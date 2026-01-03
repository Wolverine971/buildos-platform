<!-- apps/web/src/lib/components/project/RecurrenceUpdateModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { RefreshCw, Calendar, AlertTriangle, Info } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { format } from 'date-fns';
	import type { Task } from '$lib/types/project';
	import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';

	export let isOpen: boolean = false;
	export let task: Task | null = null;
	export let instanceDate: string | null = null;
	export let affectedInstances: number = 0;

	const dispatch = createEventDispatcher<{
		confirm: { scope: UpdateScope };
		cancel: void;
	}>();

	type UpdateScope = 'single' | 'future' | 'all';

	let selectedScope: UpdateScope = 'single';
	let showImpactDetails = false;

	// Calculate impact based on scope
	$: impactSummary = getImpactSummary(selectedScope);

	function getImpactSummary(scope: UpdateScope): string {
		if (!task || !instanceDate) return '';

		switch (scope) {
			case 'single':
				return `Only the occurrence on ${formatDate(instanceDate)} will be updated. This creates an exception in the series.`;
			case 'future':
				const futureCount = calculateFutureInstances();
				return `This and ${futureCount} future occurrences will be updated, starting from ${formatDate(instanceDate)}.`;
			case 'all':
				return `All ${affectedInstances || 'remaining'} occurrences in the series will be updated.`;
			default:
				return '';
		}
	}

	function calculateFutureInstances(): number {
		if (!task || !instanceDate) return 0;

		// This would normally calculate based on the recurrence pattern
		// For now, return a placeholder
		return Math.max(0, (affectedInstances || 10) - 1);
	}

	function formatDate(dateString: string): string {
		try {
			return format(new Date(dateString), 'EEE, MMM d, yyyy');
		} catch {
			return dateString;
		}
	}

	function handleConfirm() {
		dispatch('confirm', { scope: selectedScope });
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// Get recurrence pattern text
	function getRecurrencePattern(): string {
		if (!task?.recurrence_pattern) return 'recurring task';
		return recurrencePatternBuilder.getRecurrenceText({
			type: task.recurrence_pattern as any
		});
	}
</script>

<Modal {isOpen} title="Update Recurring Task" size="md" onClose={handleCancel}>
	{#snippet children()}
		<div class="px-4 sm:px-6 py-4">
			<!-- Task Information -->
			<div class="mb-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
				<div class="flex items-start space-x-3">
					<RefreshCw class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
					<div>
						<h3 class="font-medium text-gray-900 dark:text-white">
							{task?.title || 'Recurring Task'}
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
							This task repeats {getRecurrencePattern()}
						</p>
						{#if instanceDate}
							<p class="text-sm text-gray-500 dark:text-gray-500 mt-1">
								Editing occurrence on {formatDate(instanceDate)}
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Update Scope Options -->
			<div class="space-y-3">
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					How would you like to apply these changes?
				</h4>

				<!-- Single Instance -->
				<button
					type="button"
					onclick={() => (selectedScope = 'single')}
					class="w-full text-left p-4 rounded-lg border-2 transition-all {selectedScope ===
					'single'
						? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
						: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
				>
					<div class="flex items-start space-x-3">
						<div class="mt-1">
							<input
								type="radio"
								bind:group={selectedScope}
								value="single"
								class="text-blue-600 focus:ring-blue-500"
							/>
						</div>
						<div class="flex-1">
							<div class="flex items-center space-x-2">
								<Calendar class="w-4 h-4 text-gray-600 dark:text-gray-400" />
								<span class="font-medium text-gray-900 dark:text-white">
									Only this instance
								</span>
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
								Changes apply only to {instanceDate
									? formatDate(instanceDate)
									: 'this occurrence'}
							</p>
							{#if selectedScope === 'single'}
								<div
									class="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded flex items-start space-x-2"
								>
									<AlertTriangle
										class="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5"
									/>
									<p class="text-xs text-yellow-800 dark:text-yellow-200">
										This creates an exception in the recurring series
									</p>
								</div>
							{/if}
						</div>
					</div>
				</button>

				<!-- Future Instances -->
				<button
					type="button"
					onclick={() => (selectedScope = 'future')}
					class="w-full text-left p-4 rounded-lg border-2 transition-all {selectedScope ===
					'future'
						? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
						: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
				>
					<div class="flex items-start space-x-3">
						<div class="mt-1">
							<input
								type="radio"
								bind:group={selectedScope}
								value="future"
								class="text-blue-600 focus:ring-blue-500"
							/>
						</div>
						<div class="flex-1">
							<div class="flex items-center space-x-2">
								<Calendar class="w-4 h-4 text-gray-600 dark:text-gray-400" />
								<span class="font-medium text-gray-900 dark:text-white">
									This and future instances
								</span>
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
								Changes apply from {instanceDate
									? formatDate(instanceDate)
									: 'this occurrence'} onward
							</p>
							{#if selectedScope === 'future'}
								<div class="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
									<p class="text-xs text-blue-800 dark:text-blue-200">
										Affects {calculateFutureInstances()} future occurrences
									</p>
								</div>
							{/if}
						</div>
					</div>
				</button>

				<!-- All Instances -->
				<button
					type="button"
					onclick={() => (selectedScope = 'all')}
					class="w-full text-left p-4 rounded-lg border-2 transition-all {selectedScope ===
					'all'
						? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
						: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
				>
					<div class="flex items-start space-x-3">
						<div class="mt-1">
							<input
								type="radio"
								bind:group={selectedScope}
								value="all"
								class="text-blue-600 focus:ring-blue-500"
							/>
						</div>
						<div class="flex-1">
							<div class="flex items-center space-x-2">
								<RefreshCw class="w-4 h-4 text-gray-600 dark:text-gray-400" />
								<span class="font-medium text-gray-900 dark:text-white">
									All instances
								</span>
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
								Changes apply to entire series ({affectedInstances || 'all'} occurrences)
							</p>
							{#if selectedScope === 'all'}
								<div class="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
									<p class="text-xs text-blue-800 dark:text-blue-200">
										All occurrences will be updated, including past instances
									</p>
								</div>
							{/if}
						</div>
					</div>
				</button>
			</div>

			<!-- Impact Summary -->
			{#if impactSummary}
				<div
					class="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
				>
					<div class="flex items-start space-x-2">
						<Info class="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
						<div>
							<h5 class="text-sm font-medium text-blue-900 dark:text-blue-100">
								Impact Summary
							</h5>
							<p class="text-sm text-blue-800 dark:text-blue-200 mt-1">
								{impactSummary}
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<!-- Actions -->
		<div
			class="flex flex-col sm:flex-row gap-3 sm:justify-end px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		>
			<Button type="button" onclick={handleCancel} variant="ghost" size="md">Cancel</Button>
			<Button
				type="button"
				onclick={handleConfirm}
				variant="primary"
				size="md"
				icon={RefreshCw}
			>
				Update {selectedScope === 'single'
					? 'Instance'
					: selectedScope === 'future'
						? 'Future'
						: 'All'}
			</Button>
		</div>
	{/snippet}
</Modal>
