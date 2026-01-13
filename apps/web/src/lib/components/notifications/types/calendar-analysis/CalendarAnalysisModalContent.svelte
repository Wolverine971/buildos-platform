<!-- apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { LoaderCircle, X, ChevronDown } from 'lucide-svelte';
	import { notificationStore } from '$lib/stores/notification.store';
	import CalendarAnalysisResults from '$lib/components/calendar/CalendarAnalysisResults.svelte';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';

	let { notification }: { notification: CalendarAnalysisNotification } = $props();
	const dispatch = createEventDispatcher();

	function handleClose() {
		notification?.actions?.dismiss?.();
		dispatch('close');
	}

	function handleMinimize() {
		if (!notification?.id) {
			console.warn(
				'[CalendarAnalysisModalContent] handleMinimize called without notification id'
			);
			return;
		}
		notificationStore.minimize(notification.id);
		dispatch('minimize');
	}

	const isProcessing = $derived(notification.status === 'processing');
	const progressMessage = $derived(
		notification.progress?.message ?? 'Analyzing calendar events...'
	);

	// Prepare data for CalendarAnalysisResults component
	const suggestions = $derived(
		Array.isArray(notification.data.suggestions) ? notification.data.suggestions : []
	);
	const errorMessage = $derived(notification.data.error ?? null);
</script>

{#if isProcessing}
	<!-- Processing State: Simple loading modal -->
	<Modal
		isOpen={true}
		onClose={handleClose}
		title=""
		size="md"
		showCloseButton={false}
		closeOnBackdrop={true}
		closeOnEscape={true}
	>
		{#snippet header()}
			<!-- Custom header with minimize button -->
			<div
				class="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
			>
				<h2 class="text-xl font-bold text-gray-900 dark:text-white">Analyzing Calendar</h2>
				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={handleMinimize}
						aria-label="Minimize"
						icon={ChevronDown}
					></Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={handleClose}
						aria-label="Close notification"
						icon={X}
					></Button>
				</div>
			</div>
		{/snippet}

		{#snippet children()}
			<div class="flex flex-col items-center gap-4 px-6 py-8 text-center">
				<LoaderCircle class="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
				<p class="text-base text-gray-700 dark:text-gray-300">{progressMessage}</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					You can minimize this window and continue working. We'll keep the results in the
					notification tray when they're ready.
				</p>
			</div>
		{/snippet}
	</Modal>
{:else}
	<!-- Results State: Full CalendarAnalysisResults in embedded mode -->
	<Modal
		isOpen={true}
		onClose={handleClose}
		title=""
		size="xl"
		showCloseButton={false}
		closeOnBackdrop={true}
		closeOnEscape={true}
	>
		{#snippet header()}
			<!-- Custom header with minimize button -->
			<div
				class="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
			>
				<h2 class="text-xl font-bold text-gray-900 dark:text-white">
					Calendar Analysis Results
				</h2>
				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={handleMinimize}
						aria-label="Minimize"
						icon={ChevronDown}
					></Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={handleClose}
						aria-label="Close notification"
						icon={X}
					></Button>
				</div>
			</div>
		{/snippet}

		{#snippet children()}
			<!-- Embedded CalendarAnalysisResults without its own Modal wrapper -->
			<CalendarAnalysisResults
				isOpen={true}
				analysisId={notification.data.analysisId}
				{suggestions}
				autoStart={false}
				onClose={handleClose}
				{errorMessage}
				embedded={true}
			/>
		{/snippet}
	</Modal>
{/if}
