<!-- apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import CalendarAnalysisResults from '$lib/components/calendar/CalendarAnalysisResults.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Loader2 } from 'lucide-svelte';
	import { notificationStore } from '$lib/stores/notification.store';
	import { restartCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';

	let { notification } = $props<{ notification: CalendarAnalysisNotification }>();
	const dispatch = createEventDispatcher();
	let isOpen = $state(true);

	function handleClose() {
		isOpen = false;
		notification.actions.dismiss?.();
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

{#if isProcessing}
	<Modal
		isOpen={true}
		onClose={handleMinimize}
		title="Analyzing calendar"
		size="md"
		showCloseButton={true}
	>
		<div class="flex flex-col items-center gap-4 px-6 py-8 text-center">
			<Loader2 class="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
			<p class="text-base text-gray-700 dark:text-gray-300">{progressMessage}</p>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				You can minimize this window and continue working. We\'ll keep the results in the
				notification tray when they\'re ready.
			</p>
		</div>
	</Modal>
{:else}
	<CalendarAnalysisResults
		bind:isOpen
		analysisId={notification.data.analysisId}
		{suggestions}
		autoStart={false}
		onStartAnalysis={handleStartAnalysisFromModal}
		onClose={handleClose}
		on:retry={handleRetry}
		on:minimize={handleMinimize}
	/>
{/if}
