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
	import { LoaderCircle, CircleCheck, AlertCircle } from '$lib/icons/lucide';
	import { agentRunDisplayTitle } from '$lib/services/agent-run-notification-data';
	import type { Notification } from '$lib/types/notification.types';

	// Props
	let { notification }: { notification: Notification } = $props();

	// Lazy-loaded type-specific components
	let ProjectSynthesisModalContent = $state<any>(null);
	let CalendarAnalysisModalContent = $state<any>(null);
	let TimeBlockModalContent = $state<any>(null);
	let AgentRunModalContent = $state<any>(null);

	// Lazy load type-specific component
	async function loadTypeSpecificComponent() {
		try {
			switch (notification.type) {
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
				case 'agent-run':
					if (!AgentRunModalContent) {
						const module = await import(
							'./types/agent-run/AgentRunModalContent.svelte'
						);
						AgentRunModalContent = module.default;
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
		notification.type === 'project-synthesis'
			? ProjectSynthesisModalContent
			: notification.type === 'calendar-analysis'
				? CalendarAnalysisModalContent
				: notification.type === 'time-block'
					? TimeBlockModalContent
					: notification.type === 'agent-run'
						? AgentRunModalContent
						: null
	);

	// Get modal title based on notification type (fallback for generic view)
	let modalTitle = $derived(
		notification.type === 'project-synthesis'
			? `Project Synthesis - ${notification.data.projectName}`
			: notification.type === 'calendar-analysis'
				? 'Calendar Analysis'
				: notification.type === 'generic'
					? notification.data.title
					: notification.type === 'agent-run'
						? agentRunDisplayTitle(
								notification.data.activityLabel,
								notification.data.targetLabel,
								notification.data.label
							)
						: notification.type === 'time-block'
							? 'Time Block Suggestions'
							: 'Processing'
	);
	let progressPercentage = $derived.by(() => {
		if (notification.progress?.type !== 'percentage') return 0;
		const percentage = notification.progress.percentage;
		return Number.isFinite(percentage) ? Math.round(Math.min(100, Math.max(0, percentage))) : 0;
	});

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
	<!-- Type-specific modal content - already has Modal wrapper -->
	{@const TypeSpecificComponent = typeSpecificComponent}
	<TypeSpecificComponent
		{notification}
		onminimize={handleMinimize}
		onclose={handleDismiss}
		oncancel={handleDismiss}
		onMinimize={handleMinimize}
		onClose={handleDismiss}
		onCancel={handleDismiss}
	/>
{:else}
	<!-- Generic fallback modal -->
	<Modal isOpen={true} onClose={handleClose} title={modalTitle} size="lg" showCloseButton={true}>
		{#snippet children()}
			<div class="px-3 sm:px-4 py-3 sm:py-4">
				<div class="space-y-4">
					{#if notification.status === 'processing'}
						<div class="text-center py-8">
							<LoaderCircle
								class="w-12 h-12 text-accent animate-spin motion-reduce:animate-none mx-auto mb-4"
								aria-hidden="true"
							/>
							<p class="text-muted-foreground" aria-live="polite">
								{notification.progress?.message || 'Processing...'}
							</p>

							<!-- Progress bar for percentage-based progress -->
							{#if notification.progress?.type === 'percentage' && notification.progress.percentage !== undefined}
								<div class="mt-4 max-w-md mx-auto">
									<div class="h-2 bg-muted rounded-full overflow-hidden">
										<div
											role="progressbar"
											aria-label="Progress"
											aria-valuemin="0"
											aria-valuemax="100"
											aria-valuenow={progressPercentage}
											class="h-full bg-accent transition-all duration-300 motion-reduce:transition-none"
											style="width: {progressPercentage}%"
										></div>
									</div>
									<p class="text-sm text-muted-foreground mt-2">
										{progressPercentage}%
									</p>
								</div>
							{/if}

							<!-- Step-based progress -->
							{#if notification.progress?.type === 'steps'}
								<div class="mt-6 space-y-2 max-w-md mx-auto">
									{#each notification.progress.steps as step (step.key ?? step)}
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
													<CircleCheck
														class="w-4 h-4 text-accent"
														aria-hidden="true"
													/>
												{:else if step.status === 'processing'}
													<LoaderCircle
														class="w-4 h-4 text-accent animate-spin motion-reduce:animate-none"
														aria-hidden="true"
													/>
												{:else if step.status === 'error'}
													<AlertCircle
														class="w-4 h-4 text-destructive"
														aria-hidden="true"
													/>
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
							<CircleCheck
								class="w-16 h-16 text-accent mx-auto mb-4"
								aria-hidden="true"
							/>
							<h3 class="text-lg font-semibold text-foreground mb-2">All set</h3>
							<p class="text-muted-foreground">
								{notification.type === 'calendar-analysis'
									? 'Calendar analyzed successfully'
									: notification.type === 'generic'
										? notification.data.message
										: 'Operation completed successfully'}
							</p>
						</div>
					{:else if notification.status === 'error'}
						<div class="text-center py-8">
							<AlertCircle
								class="w-16 h-16 text-destructive mx-auto mb-4"
								aria-hidden="true"
							/>
							<h3 class="text-lg font-semibold text-foreground mb-2">
								Something went wrong
							</h3>
							<p class="text-destructive">
								{notification.type === 'calendar-analysis'
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
