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
				class="flex justify-between items-center px-3 py-2 border-b border-border bg-muted/50"
			>
				<h2 class="text-sm font-semibold text-foreground">Analyzing Calendar</h2>
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
			<div class="flex flex-col items-center gap-3 px-4 py-6 text-center tx tx-grain tx-weak">
				<LoaderCircle class="h-8 w-8 animate-spin text-accent" />
				<p class="text-sm text-foreground">{progressMessage}</p>
				<p class="text-sm text-muted-foreground">
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
				class="flex justify-between items-center px-3 py-2 border-b border-border bg-muted/50"
			>
				<h2 class="text-sm font-semibold text-foreground">Calendar Analysis Results</h2>
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
