<!-- apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpMinimizedView.svelte -->
<script lang="ts">
	/**
	 * Brain Dump Minimized View
	 *
	 * Displays brain dump notification in the minimized stack (bottom-right).
	 * Shows status, progress, and brief info about the brain dump operation.
	 *
	 * Part of Phase 2: Brain Dump Migration
	 * Extracted from BrainDumpProcessingNotification.svelte (lines 1678-1870)
	 */

	import { LoaderCircle, CheckCircle, AlertCircle, XCircle, Settings } from 'lucide-svelte';
	import type { BrainDumpNotification } from '$lib/types/notification.types';

	let { notification }: { notification: BrainDumpNotification } = $props();

	// Derive status info from notification state
	let statusInfo = $derived(
		(() => {
			const status = notification.status;
			const data = notification.data;
			const progress = notification.progress;

			// Processing state
			if (status === 'processing') {
				let subtitle = 'Analyzing content...';

				// Show streaming progress if available
				if (data.streamingState) {
					const contextDone = data.streamingState.contextStatus === 'completed';
					const tasksDone = data.streamingState.tasksStatus === 'completed';

					if (contextDone && tasksDone) {
						subtitle = 'Finalizing results...';
					} else if (contextDone) {
						subtitle = 'Extracting tasks...';
					} else if (data.streamingState.contextProgress) {
						subtitle = data.streamingState.contextProgress;
					} else if (data.streamingState.tasksProgress) {
						subtitle = data.streamingState.tasksProgress;
					}
				} else if (data.processingType === 'short') {
					subtitle = 'Processing quick update...';
				} else if (data.processingType === 'background') {
					subtitle = 'Processing in background...';
				}

				return {
					icon: 'processing',
					title: 'Processing brain dump',
					subtitle,
					color: 'purple'
				};
			}

			// Success state
			if (status === 'success') {
				// Check if operations were already executed (auto-accept)
				if (data.executionResult) {
					const successful = data.executionResult.successful?.length || 0;
					const failed = data.executionResult.failed?.length || 0;

					if (failed > 0) {
						return {
							icon: 'warning',
							title: 'Partial success',
							subtitle: `${successful} applied, ${failed} failed`,
							color: 'yellow'
						};
					}

					return {
						icon: 'completed',
						title: 'Operations applied',
						subtitle: `${successful} operation${successful !== 1 ? 's' : ''} successfully applied`,
						color: 'green'
					};
				}

				// Parse results ready for review
				if (data.parseResults) {
					const operationsCount = data.parseResults.operations?.length || 0;

					return {
						icon: 'completed',
						title: 'Brain dump processed',
						subtitle: `${operationsCount} operation${operationsCount !== 1 ? 's' : ''} ready`,
						color: 'green'
					};
				}

				return {
					icon: 'completed',
					title: 'Complete',
					subtitle: 'Ready to review',
					color: 'green'
				};
			}

			// Error state
			if (status === 'error') {
				return {
					icon: 'error',
					title: 'Processing failed',
					subtitle: progress.message || 'An error occurred',
					color: 'red'
				};
			}

			// Cancelled state
			if (status === 'cancelled') {
				return {
					icon: 'cancelled',
					title: 'Cancelled',
					subtitle: 'Processing was cancelled',
					color: 'gray'
				};
			}

			// Idle state
			return {
				icon: 'idle',
				title: 'Ready',
				subtitle: '',
				color: 'gray'
			};
		})()
	);

	// Show progress bar for processing
	let showProgressBar = $derived(notification.status === 'processing');

	// Show settings button for completed notifications with parse results
	let showSettings = $derived(
		notification.status === 'success' && notification.data.parseResults !== undefined
	);
</script>

<div class="relative">
	{#if showProgressBar}
		<!-- Progress bar for processing state -->
		<div class="absolute top-0 left-0 right-0 h-1 bg-muted rounded-t-lg">
			<div
				class="h-full bg-primary-600 dark:bg-primary-400 rounded-tl-lg transition-all duration-300"
				style="width: {notification.progress.percentage || 50}%"
			></div>
		</div>
	{/if}

	<div class="p-4 flex items-center justify-between pt-5">
		<div class="flex items-center gap-3 flex-1 min-w-0">
			<!-- Status Icon -->
			<div class="flex-shrink-0">
				{#if statusInfo.icon === 'processing'}
					<LoaderCircle
						class="w-5 h-5 text-primary-600 dark:text-primary-400 animate-spin"
					/>
				{:else if statusInfo.icon === 'completed'}
					<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
				{:else if statusInfo.icon === 'error'}
					<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
				{:else if statusInfo.icon === 'warning'}
					<AlertCircle class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
				{:else if statusInfo.icon === 'cancelled'}
					<XCircle class="w-5 h-5 text-muted-foreground" />
				{/if}
			</div>

			<!-- Title and Subtitle -->
			<div class="flex-1 min-w-0">
				<div class="text-sm font-medium text-foreground truncate">
					{statusInfo.title}
				</div>
				{#if statusInfo.subtitle}
					<div class="text-xs text-muted-foreground truncate">
						{statusInfo.subtitle}
					</div>
				{/if}
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex items-center gap-1 flex-shrink-0 ml-2">
			{#if showSettings}
				<button
					class="p-1 rounded hover:bg-muted transition-colors"
					title="Settings"
					onclick={(e) => {
						e.stopPropagation();
						// TODO: Open settings or expand to show options
					}}
				>
					<Settings class="w-4 h-4 text-muted-foreground" />
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Add subtle pulse animation for processing state */
	:global(.animate-pulse-subtle) {
		animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse-subtle {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}
</style>
