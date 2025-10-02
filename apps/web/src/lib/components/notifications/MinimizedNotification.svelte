<!-- apps/web/src/lib/components/notifications/MinimizedNotification.svelte -->
<script lang="ts">
	/**
	 * Minimized Notification Card
	 *
	 * Generic minimized view for any notification type.
	 * - Shows status icon, title, and progress
	 * - Clickable to expand
	 * - Keyboard accessible
	 * - Delegates to type-specific views when available
	 */

	import { Loader2, CheckCircle, AlertCircle, XCircle, ChevronUp } from 'lucide-svelte';
	import { notificationStore } from '$lib/stores/notification.store';
	import type { Notification } from '$lib/types/notification.types';

	// Props
	let { notification }: { notification: Notification } = $props();

	// Lazy-loaded type-specific components
	let BrainDumpMinimizedView = $state<any>(null);

	// Component loading state
	let componentLoaded = $state(false);

	// Lazy load type-specific component
	async function loadTypeSpecificComponent() {
		if (notification.type === 'brain-dump' && !BrainDumpMinimizedView) {
			try {
				const module = await import('./types/brain-dump/BrainDumpMinimizedView.svelte');
				BrainDumpMinimizedView = module.default;
				componentLoaded = true;
			} catch (error) {
				console.error(
					'[MinimizedNotification] Failed to load BrainDumpMinimizedView:',
					error
				);
			}
		}
	}

	// Auto-load component when notification type changes
	$effect(() => {
		if (notification.type === 'brain-dump' && !componentLoaded) {
			loadTypeSpecificComponent();
		}
	});

	// Check if we should use type-specific view
	let useTypeSpecificView = $derived(
		notification.type === 'brain-dump' && BrainDumpMinimizedView !== null
	);

	// Get notification title based on type (fallback for generic view)
	let title = $derived(
		(() => {
			switch (notification.type) {
				case 'brain-dump':
					if (notification.status === 'processing') return 'Processing brain dump';
					if (notification.status === 'success') return 'Brain dump complete';
					if (notification.status === 'error') return 'Brain dump failed';
					return 'Brain dump';
				case 'phase-generation':
					if (notification.status === 'processing')
						return `Generating phases for ${notification.data.projectName}`;
					if (notification.status === 'success') return 'Phases generated';
					if (notification.status === 'error') return 'Phase generation failed';
					return 'Phase generation';
				case 'calendar-analysis':
					if (notification.status === 'processing') return 'Analyzing calendar';
					if (notification.status === 'success') return 'Calendar analyzed';
					if (notification.status === 'error') return 'Calendar analysis failed';
					return 'Calendar analysis';
				default:
					if (notification.type === 'generic') {
						return notification.data.title;
					}
					return 'Processing';
			}
		})()
	);

	// Get subtitle/progress message
	let subtitle = $derived(notification.progress?.message || '');

	// Handle click to expand
	function handleClick() {
		console.log('[MinimizedNotification] Click - expanding:', notification.id);
		notificationStore.expand(notification.id);
	}

	// Handle keyboard interaction
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700
         cursor-pointer hover:shadow-xl transition-all duration-200 min-w-[320px] max-w-[400px]
         pointer-events-auto
         {notification.status === 'success'
		? 'ring-2 ring-green-500/50'
		: notification.status === 'error'
			? 'ring-2 ring-red-500/50'
			: ''}"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label="Expand {notification.type} notification"
	aria-expanded="false"
>
	{#if useTypeSpecificView}
		<!-- Type-specific view (brain dump, etc.) -->
		<svelte:component this={BrainDumpMinimizedView} {notification} />
	{:else}
		<!-- Generic fallback view -->
		<div class="p-4">
			<div class="flex items-center gap-3">
				<!-- Status Icon -->
				<div class="flex-shrink-0">
					{#if notification.status === 'processing'}
						<Loader2 class="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
					{:else if notification.status === 'success'}
						<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
					{:else if notification.status === 'error'}
						<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
					{:else if notification.status === 'cancelled'}
						<XCircle class="w-5 h-5 text-gray-600 dark:text-gray-400" />
					{/if}
				</div>

				<!-- Content -->
				<div class="flex-1 min-w-0">
					<div class="text-sm font-medium text-gray-900 dark:text-white truncate">
						{title}
					</div>
					{#if subtitle}
						<div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
							{subtitle}
						</div>
					{/if}
				</div>

				<!-- Expand Icon -->
				<div class="flex-shrink-0">
					<ChevronUp class="w-4 h-4 text-gray-400 dark:text-gray-500" />
				</div>
			</div>

			<!-- Progress bar (if percentage-based) -->
			{#if notification.progress.type === 'percentage' && notification.progress.percentage !== undefined}
				<div class="mt-3 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
					<div
						class="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
						style="width: {notification.progress.percentage}%"
					></div>
				</div>
			{/if}
		</div>
	{/if}
</div>
