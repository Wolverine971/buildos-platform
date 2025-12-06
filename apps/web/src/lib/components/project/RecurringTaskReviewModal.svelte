<!-- apps/web/src/lib/components/project/RecurringTaskReviewModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Info, RefreshCw, Calendar, ChevronRight } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let isOpen = false;
	export let suggestions: RecurringTaskSuggestion[] = [];

	const dispatch = createEventDispatcher();

	interface RecurringTaskSuggestion {
		task_id: string;
		task_title: string;
		action: 'keep_as_is' | 'reschedule' | 'adjust_pattern';
		current_pattern?: string;
		suggested_pattern?: string;
		current_start_date?: string;
		suggested_start_date?: string;
		current_end_date?: string;
		suggested_end_date?: string;
		reason: string;
		phase_alignment?: number;
	}

	let acceptedSuggestions = new Set<string>();

	function toggleSuggestion(taskId: string) {
		if (acceptedSuggestions.has(taskId)) {
			acceptedSuggestions.delete(taskId);
		} else {
			acceptedSuggestions.add(taskId);
		}
		acceptedSuggestions = acceptedSuggestions; // Trigger reactivity
	}

	function selectAll() {
		acceptedSuggestions = new Set(suggestions.map((s) => s.task_id));
	}

	function deselectAll() {
		acceptedSuggestions = new Set();
	}

	function handleConfirm() {
		const accepted = [...acceptedSuggestions];
		dispatch('confirm', { accepted });
		closeModal();
	}

	function handleSkip() {
		dispatch('skip');
		closeModal();
	}

	function closeModal() {
		acceptedSuggestions = new Set();
		isOpen = false;
	}

	function formatDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Not set';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getPatternLabel(pattern: string | undefined): string {
		if (!pattern) return 'unknown';
		const labels: Record<string, string> = {
			daily: 'Daily',
			weekdays: 'Weekdays',
			weekly: 'Weekly',
			biweekly: 'Bi-weekly',
			monthly: 'Monthly',
			quarterly: 'Quarterly',
			yearly: 'Yearly'
		};
		return labels[pattern] || pattern;
	}

	function getActionLabel(action: string): string {
		const labels: Record<string, string> = {
			keep_as_is: 'No change',
			reschedule: 'Reschedule',
			adjust_pattern: 'Change pattern'
		};
		return labels[action] || action;
	}

	$: filteredSuggestions = suggestions.filter((s) => s.action !== 'keep_as_is');
	$: hasChanges = filteredSuggestions.length > 0;
</script>

{#if hasChanges}
	<Modal {isOpen} onClose={handleSkip} size="lg">
		{#snippet header()}
			<div class="p-4 sm:p-5 md:p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center gap-2 sm:gap-3">
					<RefreshCw
						class="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0"
					/>
					<div class="min-w-0">
						<h3
							class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white"
						>
							Review Recurring Task Suggestions
						</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
							The AI has suggested {filteredSuggestions.length} change{filteredSuggestions.length ===
							1
								? ''
								: 's'} to optimize recurring tasks
						</p>
					</div>
				</div>
			</div>
		{/snippet}

		{#snippet children()}
			<!-- Info Banner -->
			<div
				class="px-4 sm:px-5 md:px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800"
			>
				<div class="flex items-start gap-2">
					<Info class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
					<p class="text-sm text-blue-700 dark:text-blue-300">
						These suggestions aim to align recurring tasks with phase boundaries for
						better workflow. You can accept or reject each suggestion individually.
					</p>
				</div>
			</div>

			<!-- Selection Controls -->
			<div
				class="px-4 sm:px-5 md:px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between gap-4">
					<span class="text-sm text-gray-600 dark:text-gray-400">
						{acceptedSuggestions.size} of {filteredSuggestions.length} selected
					</span>
					<div class="flex gap-2">
						<Button
							onclick={selectAll}
							class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
						>
							Select all
						</Button>
						<span class="text-gray-400">•</span>
						<Button
							onclick={deselectAll}
							class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
						>
							Deselect all
						</Button>
					</div>
				</div>
			</div>

			<!-- Suggestions List -->
			<div class="p-4 sm:p-5 md:p-6 overflow-y-auto max-h-[calc(90vh-300px)]">
				<div class="space-y-4">
					{#each filteredSuggestions as suggestion}
						<div
							class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors {acceptedSuggestions.has(
								suggestion.task_id
							)
								? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
								: ''}"
						>
							<div class="flex items-start gap-4">
								<!-- Checkbox -->
								<input
									type="checkbox"
									checked={acceptedSuggestions.has(suggestion.task_id)}
									onchange={() => toggleSuggestion(suggestion.task_id)}
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>

								<!-- Content -->
								<div class="flex-1">
									<!-- Task Title -->
									<div class="flex items-center gap-2 mb-2">
										<h4 class="font-medium text-gray-900 dark:text-white">
											{suggestion.task_title}
										</h4>
										<span
											class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
										>
											{getActionLabel(suggestion.action)}
										</span>
									</div>

									<!-- Changes -->
									<div class="grid grid-cols-2 gap-4 mb-4">
										<!-- Current State -->
										<div>
											<h5
												class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
											>
												Current
											</h5>
											<div
												class="text-sm text-gray-700 dark:text-gray-300 space-y-1"
											>
												<div class="flex items-center gap-2">
													<Calendar class="w-3 h-3 text-gray-400" />
													<span
														>{getPatternLabel(
															suggestion.current_pattern
														)}</span
													>
												</div>
												<div
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													Starts: {formatDate(
														suggestion.current_start_date
													)}
												</div>
												{#if suggestion.current_end_date}
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Ends: {formatDate(
															suggestion.current_end_date
														)}
													</div>
												{/if}
											</div>
										</div>

										<!-- Suggested State -->
										<div>
											<h5
												class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
											>
												Suggested
											</h5>
											<div
												class="text-sm text-gray-700 dark:text-gray-300 space-y-1"
											>
												<div class="flex items-center gap-2">
													<Calendar class="w-3 h-3 text-primary-400" />
													<span
														class="text-primary-600 dark:text-primary-400"
													>
														{getPatternLabel(
															suggestion.suggested_pattern ||
																suggestion.current_pattern
														)}
													</span>
												</div>
												<div
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													Starts: {formatDate(
														suggestion.suggested_start_date
													)}
												</div>
												{#if suggestion.suggested_end_date}
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Ends: {formatDate(
															suggestion.suggested_end_date
														)}
													</div>
												{/if}
											</div>
										</div>
									</div>

									<!-- Reason -->
									<div class="bg-gray-50 dark:bg-gray-900 rounded p-2">
										<h5
											class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
										>
											Reason
										</h5>
										<p class="text-sm text-gray-700 dark:text-gray-300">
											{suggestion.reason}
										</p>
										{#if suggestion.phase_alignment}
											<p
												class="text-xs text-gray-500 dark:text-gray-400 mt-1"
											>
												Aligns with Phase {suggestion.phase_alignment}
											</p>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/snippet}

		{#snippet footer()}
			<div
				class="p-4 sm:p-5 md:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
			>
				<div
					class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
				>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Changes will be applied after phases are generated
					</p>
					<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
						<Button variant="secondary" onclick={handleSkip} class="w-full sm:w-auto"
							>Skip All Changes</Button
						>
						<Button
							variant="primary"
							onclick={handleConfirm}
							disabled={acceptedSuggestions.size === 0}
							class="w-full sm:w-auto"
						>
							Apply Selected Changes ({acceptedSuggestions.size})
						</Button>
					</div>
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}
