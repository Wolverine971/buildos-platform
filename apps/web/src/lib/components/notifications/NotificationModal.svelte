<!-- apps/web/src/lib/components/notifications/NotificationModal.svelte -->
<script lang="ts">
	/**
	 * Notification Modal
	 *
	 * Expanded modal view for a notification.
	 * - Shows full details and progress
	 * - Type-specific content via lazy-loaded components
	 * - Closeable with minimize button or ESC key
	 */

	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { notificationStore } from '$lib/stores/notification.store';
	import { LoaderCircle, CircleCheck, AlertCircle, XCircle } from 'lucide-svelte';
	import type { Notification } from '$lib/types/notification.types';

	// Props
	let { notification }: { notification: Notification } = $props();

	// Lazy-loaded type-specific components
	let BrainDumpModalContent = $state<any>(null);
	let ProjectSynthesisModalContent = $state<any>(null);
	let CalendarAnalysisModalContent = $state<any>(null);
	let TimeBlockModalContent = $state<any>(null);

	// Lazy load type-specific component
	async function loadTypeSpecificComponent() {
		try {
			switch (notification.type) {
				case 'brain-dump':
					if (!BrainDumpModalContent) {
						const module = await import(
							'./types/brain-dump/BrainDumpModalContent.svelte'
						);
						BrainDumpModalContent = module.default;
					}
					break;
				case 'project-synthesis':
					if (!ProjectSynthesisModalContent) {
						const module = await import(
							'./types/project-synthesis/ProjectSynthesisModalContent.svelte'
						);
						ProjectSynthesisModalContent = module.default;
					}
					break;
				case 'calendar-analysis':
					if (!CalendarAnalysisModalContent) {
						const module = await import(
							'./types/calendar-analysis/CalendarAnalysisModalContent.svelte'
						);
						CalendarAnalysisModalContent = module.default;
					}
					break;
				case 'time-block':
					if (!TimeBlockModalContent) {
						const module = await import(
							'./types/time-block/TimeBlockModalContent.svelte'
						);
						TimeBlockModalContent = module.default;
					}
					break;
				default:
					break;
			}
		} catch (error) {
			console.error('[NotificationModal] Failed to load type modal content:', error);
		}
	}

	// Auto-load component when notification type changes
	$effect(() => {
		void (async () => {
			try {
				await loadTypeSpecificComponent();
			} catch (error) {
				console.error('[NotificationModal] Failed to load type-specific component:', error);
			}
		})();
	});

	// Resolve the type-specific component (if loaded)
	let typeSpecificComponent = $derived(
		notification.type === 'brain-dump'
			? BrainDumpModalContent
			: notification.type === 'project-synthesis'
				? ProjectSynthesisModalContent
				: notification.type === 'calendar-analysis'
					? CalendarAnalysisModalContent
					: notification.type === 'time-block'
						? TimeBlockModalContent
						: null
	);

	// Get modal title based on notification type (fallback for generic view)
	let modalTitle = $derived(
		notification.type === 'brain-dump'
			? 'Brain Dump Processing'
			: notification.type === 'project-synthesis'
				? `Project Synthesis - ${notification.data.projectName}`
				: notification.type === 'calendar-analysis'
					? 'Calendar Analysis'
					: notification.type === 'generic'
						? notification.data.title
						: notification.type === 'time-block'
							? 'Time Block Suggestions'
							: 'Processing'
	);

	// Handle minimize (for ongoing processing)
	function handleMinimize() {
		if (!notification?.id) {
			console.warn('[NotificationModal] handleMinimize called without notification id');
			return;
		}
		notificationStore.minimize(notification.id);
	}

	// Handle dismiss (remove notification completely)
	function handleDismiss() {
		const targetId = notification?.id;
		if (!targetId) {
			console.warn('[NotificationModal] handleDismiss called without notification id');
			return;
		}
		notificationStore.remove(targetId);
	}

	// Smart close handler - minimizes if processing, dismisses if done
	function handleClose() {
		if (notification.status === 'processing') {
			handleMinimize();
		} else {
			handleDismiss();
		}
	}
</script>

{#if typeSpecificComponent}
	<!-- Type-specific modal content (e.g., BrainDumpModalContent) - already has Modal wrapper -->
	{@const TypeSpecificComponent = typeSpecificComponent}
	<TypeSpecificComponent
		{notification}
		on:minimize={handleMinimize}
		on:close={handleDismiss}
		on:cancel={handleDismiss}
	/>
{:else}
	<!-- Generic fallback modal -->
	<Modal
		isOpen={true}
		onClose={handleMinimize}
		title={modalTitle}
		size="lg"
		showCloseButton={true}
	>
		{#snippet children()}
			<div class="px-3 sm:px-4 py-3 sm:py-4">
				<div class="space-y-4">
					{#if notification.status === 'processing'}
						<div class="text-center py-8">
							<LoaderCircle class="w-12 h-12 text-accent animate-spin mx-auto mb-4" />
							<p class="text-muted-foreground">
								{notification.progress?.message || 'Processing...'}
							</p>

							<!-- Progress bar for percentage-based progress -->
							{#if notification.progress?.type === 'percentage' && notification.progress.percentage !== undefined}
								<div class="mt-4 max-w-md mx-auto">
									<div class="h-2 bg-muted rounded-full overflow-hidden">
										<div
											class="h-full bg-accent transition-all duration-300"
											style="width: {notification.progress.percentage}%"
										></div>
									</div>
									<p class="text-sm text-muted-foreground mt-2">
										{notification.progress.percentage}%
									</p>
								</div>
							{/if}

							<!-- Step-based progress -->
							{#if notification.progress?.type === 'steps'}
								<div class="mt-6 space-y-2 max-w-md mx-auto">
									{#each notification.progress.steps as step, index}
										<div class="flex items-center gap-3">
											<div
												class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
												{step.status === 'completed'
													? 'bg-accent/10'
													: step.status === 'processing'
														? 'bg-accent/10'
														: step.status === 'error'
															? 'bg-destructive/10'
															: 'bg-muted'}"
											>
												{#if step.status === 'completed'}
													<CircleCheck class="w-4 h-4 text-accent" />
												{:else if step.status === 'processing'}
													<LoaderCircle
														class="w-4 h-4 text-accent animate-spin"
													/>
												{:else if step.status === 'error'}
													<AlertCircle class="w-4 h-4 text-destructive" />
												{:else}
													<div
														class="w-2 h-2 bg-muted-foreground rounded-full"
													></div>
												{/if}
											</div>
											<span
												class="text-sm
												{step.status === 'processing' ? 'text-foreground font-medium' : 'text-muted-foreground'}"
											>
												{step.name}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{:else if notification.status === 'success'}
						<div class="text-center py-8">
							<CircleCheck class="w-16 h-16 text-accent mx-auto mb-4" />
							<h3 class="text-lg font-semibold text-foreground mb-2">Success!</h3>
							<p class="text-muted-foreground">
								{notification.type === 'brain-dump'
									? 'Brain dump processed successfully'
									: notification.type === 'calendar-analysis'
										? 'Calendar analyzed successfully'
										: notification.type === 'generic'
											? notification.data.message
											: 'Operation completed successfully'}
							</p>
						</div>
					{:else if notification.status === 'error'}
						<div class="text-center py-8">
							<AlertCircle class="w-16 h-16 text-destructive mx-auto mb-4" />
							<h3 class="text-lg font-semibold text-foreground mb-2">Error</h3>
							<p class="text-destructive">
								{notification.type === 'brain-dump'
									? notification.data?.error || 'Brain dump processing failed'
									: notification.type === 'calendar-analysis'
										? notification.data?.error || 'Calendar analysis failed'
										: notification.type === 'generic'
											? notification.data?.error || 'An error occurred'
											: 'An error occurred'}
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
		{#snippet footer()}
			{#if notification.status === 'success' || notification.status === 'error'}
				<div
					class="flex items-center justify-end gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
				>
					{#if notification.status === 'success' && notification.actions?.view}
						<Button onclick={notification.actions.view} variant="primary" size="md">
							View Results
						</Button>
					{/if}
					{#if notification.status === 'error' && notification.actions?.retry}
						<Button onclick={notification.actions.retry} variant="primary" size="md">
							Retry
						</Button>
					{/if}
					<Button onclick={handleDismiss} variant="outline" size="md">Dismiss</Button>
				</div>
			{/if}
		{/snippet}
	</Modal>
{/if}
