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
	import { notificationStore } from '$lib/stores/notification.store';
	import { LoaderCircle, CheckCircle, AlertCircle, XCircle } from 'lucide-svelte';
	import type { Notification } from '$lib/types/notification.types';

	// Props
	let { notification }: { notification: Notification } = $props();

	// Lazy-loaded type-specific components
	let BrainDumpModalContent = $state<any>(null);
	let PhaseGenerationModalContent = $state<any>(null);
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
				case 'phase-generation':
					if (!PhaseGenerationModalContent) {
						const module = await import(
							'./types/phase-generation/PhaseGenerationModalContent.svelte'
						);
						PhaseGenerationModalContent = module.default;
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
	// FIX: Changed from $derived(() => { ... }) to $derived(expression)
	let typeSpecificComponent = $derived(
		notification.type === 'brain-dump'
			? BrainDumpModalContent
			: notification.type === 'phase-generation'
				? PhaseGenerationModalContent
				: notification.type === 'project-synthesis'
					? ProjectSynthesisModalContent
					: notification.type === 'calendar-analysis'
						? CalendarAnalysisModalContent
						: notification.type === 'time-block'
							? TimeBlockModalContent
							: null
	);

	// Get modal title based on notification type (fallback for generic view)
	// FIX: Simplified the $derived expression
	let modalTitle = $derived(
		notification.type === 'brain-dump'
			? 'Brain Dump Processing'
			: notification.type === 'phase-generation'
				? `Phase Generation - ${notification.data.projectName}`
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
		{#snippet header()}
			<div class="flex items-center gap-3 px-6 py-4 border-b">
				<!-- Status Icon -->
				{#if notification.status === 'processing'}
					<LoaderCircle class="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
				{:else if notification.status === 'success'}
					<CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
				{:else if notification.status === 'error'}
					<AlertCircle class="w-6 h-6 text-red-600 dark:text-red-400" />
				{:else if notification.status === 'cancelled'}
					<XCircle class="w-6 h-6 text-muted-foreground" />
				{/if}

				<!-- Title -->
				<div class="flex-1">
					<h2 class="text-xl font-bold text-foreground">
						{modalTitle}
					</h2>
					{#if notification.progress?.message}
						<p class="text-sm text-muted-foreground mt-0.5">
							{notification.progress.message}
						</p>
					{/if}
				</div>
			</div>
		{/snippet}

		<!-- Content area -->
		<div class="px-6 py-5">
			<!-- Placeholder content - will be replaced with type-specific components -->
			<div class="space-y-4">
				{#if notification.status === 'processing'}
					<div class="text-center py-8">
						<LoaderCircle
							class="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4"
						/>
						<p class="text-muted-foreground">
							{notification.progress?.message || 'Processing...'}
						</p>

						<!-- Progress bar for percentage-based progress -->
						{#if notification.progress?.type === 'percentage' && notification.progress.percentage !== undefined}
							<div class="mt-4 max-w-md mx-auto">
								<div class="h-2 bg-muted rounded-full overflow-hidden">
									<div
										class="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
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
												? 'bg-green-100 dark:bg-green-900'
												: step.status === 'processing'
													? 'bg-blue-100 dark:bg-blue-900'
													: step.status === 'error'
														? 'bg-red-100 dark:bg-red-900'
														: 'bg-muted'}"
										>
											{#if step.status === 'completed'}
												<CheckCircle
													class="w-4 h-4 text-green-600 dark:text-green-400"
												/>
											{:else if step.status === 'processing'}
												<LoaderCircle
													class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin"
												/>
											{:else if step.status === 'error'}
												<AlertCircle
													class="w-4 h-4 text-red-600 dark:text-red-400"
												/>
											{:else}
												<div class="w-2 h-2 bg-gray-400 rounded-full"></div>
											{/if}
										</div>
										<span
											class="text-sm
                         {step.status === 'processing'
												? 'text-foreground font-medium'
												: 'text-muted-foreground'}"
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
						<CheckCircle
							class="w-16 h-16 text-green-600 dark:text-green-400 mx-auto mb-4"
						/>
						<h3 class="text-lg font-semibold text-foreground mb-2">Success!</h3>
						<p class="text-muted-foreground">
							{notification.type === 'brain-dump'
								? 'Brain dump processed successfully'
								: notification.type === 'phase-generation'
									? 'Phases generated successfully'
									: notification.type === 'calendar-analysis'
										? 'Calendar analyzed successfully'
										: notification.type === 'generic'
											? notification.data.message
											: 'Operation completed successfully'}
						</p>

						<!-- Action buttons -->
						<div class="mt-6 flex gap-3 justify-center">
							{#if notification.actions?.view}
								<button
									onclick={notification.actions.view}
									class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
								>
									View Results
								</button>
							{/if}
							<button
								onclick={handleDismiss}
								class="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors"
							>
								Dismiss
							</button>
						</div>
					</div>
				{:else if notification.status === 'error'}
					<div class="text-center py-8">
						<AlertCircle
							class="w-16 h-16 text-red-600 dark:text-red-400 mx-auto mb-4"
						/>
						<h3 class="text-lg font-semibold text-foreground mb-2">Error</h3>
						<p class="text-red-600 dark:text-red-400">
							{notification.type === 'brain-dump'
								? notification.data?.error || 'Brain dump processing failed'
								: notification.type === 'phase-generation'
									? notification.data?.error || 'Phase generation failed'
									: notification.type === 'calendar-analysis'
										? notification.data?.error || 'Calendar analysis failed'
										: notification.type === 'generic'
											? notification.data?.error || 'An error occurred'
											: 'An error occurred'}
						</p>

						<!-- Action buttons -->
						<div class="mt-6 flex gap-3 justify-center">
							{#if notification.actions?.retry}
								<button
									onclick={notification.actions.retry}
									class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
								>
									Retry
								</button>
							{/if}
							<button
								onclick={handleDismiss}
								class="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors"
							>
								Dismiss
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</Modal>
{/if}
