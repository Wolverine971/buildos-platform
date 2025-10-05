<!-- apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Loader2, X, ChevronDown, AlertCircle } from 'lucide-svelte';
	import { notificationStore } from '$lib/stores/notification.store';
	import { restartCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';

	let { notification } = $props<{ notification: CalendarAnalysisNotification }>();
	const dispatch = createEventDispatcher();

	function handleClose() {
		notification?.actions?.dismiss?.();
		dispatch('close');
	}

	function handleMinimize() {
		notificationStore.minimize(notification.id);
		dispatch('minimize');
	}

	function handleRetry() {
		notification.actions.retry?.();
	}

	const suggestions = $derived(
		Array.isArray(notification.data.suggestions) ? notification.data.suggestions : []
	);

	const isProcessing = $derived(notification.status === 'processing');
	const isError = $derived(notification.status === 'error');
	const progressMessage = $derived(
		notification.progress?.message ?? 'Analyzing calendar events...'
	);

	function handleStartAnalysisFromModal({
		daysBack,
		daysForward
	}: {
		daysBack: number;
		daysForward: number;
	}) {
		return restartCalendarAnalysis(notification.id, { daysBack, daysForward });
	}
</script>

<!-- Single Modal wrapper for all states -->
<Modal
	isOpen={true}
	onClose={handleClose}
	title={isProcessing ? 'Analyzing calendar' : ''}
	size={isProcessing ? 'md' : 'xl'}
	showCloseButton={!isProcessing}
	closeOnBackdrop={false}
	closeOnEscape={true}
>
	{#if isProcessing}
		<!-- Processing State -->
		<div
			slot="header"
			class="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700"
		>
			<h2 class="text-xl font-bold text-gray-900 dark:text-white">Analyzing calendar</h2>
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					on:click={handleMinimize}
					aria-label="Minimize"
					icon={ChevronDown}
				></Button>
				<Button
					variant="ghost"
					on:click={handleClose}
					aria-label="Close notification"
					icon={X}
				></Button>
			</div>
		</div>

		<div class="flex flex-col items-center gap-4 px-6 py-8 text-center">
			<Loader2 class="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
			<p class="text-base text-gray-700 dark:text-gray-300">{progressMessage}</p>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				You can minimize this window and continue working. We'll keep the results in the
				notification tray when they're ready.
			</p>
		</div>
	{:else}
		<!-- Results State -->
		<!-- TODO: Extract CalendarAnalysisResults content to avoid nested Modal -->
		<!-- For now, render simple results summary -->
		<div class="px-6 py-6">
			{#if isError}
				<div class="text-center py-8">
					<AlertCircle class="w-16 h-16 text-red-600 dark:text-red-400 mx-auto mb-4" />
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
						Analysis Failed
					</h3>
					<p class="text-red-600 dark:text-red-400 mb-6">
						{notification.data.error ||
							'An error occurred while analyzing your calendar'}
					</p>
					<div class="flex gap-3 justify-center">
						<Button variant="primary" on:click={handleRetry}>Retry Analysis</Button>
						<Button variant="secondary" on:click={handleClose}>Close</Button>
					</div>
				</div>
			{:else if suggestions.length > 0}
				<div class="space-y-4">
					<div class="flex items-center justify-between mb-4">
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Found {suggestions.length} project suggestion{suggestions.length !==
								1
									? 's'
									: ''}
							</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
								Analysis of {notification.data.eventCount || 0} calendar events
							</p>
						</div>
					</div>

					<!-- Suggestions List (simplified) -->
					<div class="space-y-3 max-h-96 overflow-y-auto">
						{#each suggestions as suggestion}
							<div
								class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800"
							>
								<h4 class="font-medium text-gray-900 dark:text-white">
									{suggestion.suggested_name}
								</h4>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									{suggestion.suggested_description}
								</p>
								<div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
									<span>{suggestion.event_count || 0} events</span>
									{#if suggestion.confidence_score}
										<span
											>{Math.round(suggestion.confidence_score * 100)}%
											confidence</span
										>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<div
						class="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700"
					>
						<Button variant="secondary" on:click={handleClose}>Close</Button>
						<Button
							variant="primary"
							on:click={() => {
								// Navigate to full calendar analysis results
								window.location.href = '/profile?tab=calendar';
							}}
						>
							View Full Results
						</Button>
					</div>
				</div>
			{:else}
				<div class="text-center py-8">
					<p class="text-gray-600 dark:text-gray-400">
						No project suggestions found in your calendar
					</p>
					<Button variant="primary" on:click={handleClose} class="mt-4">Close</Button>
				</div>
			{/if}
		</div>
	{/if}
</Modal>
