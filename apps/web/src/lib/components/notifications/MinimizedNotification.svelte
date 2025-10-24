<!-- apps/web/src/lib/components/notifications/MinimizedNotification.svelte -->
<svelte:options runes={true} />

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
	let PhaseGenerationMinimizedView = $state<any>(null);
	let ProjectSynthesisMinimizedView = $state<any>(null);
	let CalendarAnalysisMinimizedView = $state<any>(null);
	let TimeBlockMinimizedView = $state<any>(null);

	// Lazy load type-specific component
	async function loadTypeSpecificComponent() {
		try {
			switch (notification.type) {
				case 'brain-dump':
					if (!BrainDumpMinimizedView) {
						const module = await import(
							'./types/brain-dump/BrainDumpMinimizedView.svelte'
						);
						BrainDumpMinimizedView = module.default;
					}
					break;
				case 'phase-generation':
					if (!PhaseGenerationMinimizedView) {
						const module = await import(
							'./types/phase-generation/PhaseGenerationMinimizedView.svelte'
						);
						PhaseGenerationMinimizedView = module.default;
					}
					break;
				case 'project-synthesis':
					if (!ProjectSynthesisMinimizedView) {
						const module = await import(
							'./types/project-synthesis/ProjectSynthesisMinimizedView.svelte'
						);
						ProjectSynthesisMinimizedView = module.default;
					}
					break;
				case 'calendar-analysis':
					if (!CalendarAnalysisMinimizedView) {
						const module = await import(
							'./types/calendar-analysis/CalendarAnalysisMinimizedView.svelte'
						);
						CalendarAnalysisMinimizedView = module.default;
					}
					break;
				case 'time-block':
					if (!TimeBlockMinimizedView) {
						const module = await import(
							'./types/time-block/TimeBlockMinimizedView.svelte'
						);
						TimeBlockMinimizedView = module.default;
					}
					break;
				default:
					break;
			}
		} catch (error) {
			console.error('[MinimizedNotification] Failed to load type view:', error);
		}
	}

	// Auto-load component when notification type changes
	$effect(() => {
		void (async () => {
			try {
				await loadTypeSpecificComponent();
			} catch (error) {
				console.error(
					'[MinimizedNotification] Failed to load type-specific component:',
					error
				);
			}
		})();
	});

	// Resolve the type-specific component (if loaded)
	// FIX: Changed from $derived(() => { ... }) to $derived(expression)
	let typeSpecificComponent = $derived(
		notification.type === 'brain-dump'
			? BrainDumpMinimizedView
			: notification.type === 'phase-generation'
				? PhaseGenerationMinimizedView
				: notification.type === 'project-synthesis'
					? ProjectSynthesisMinimizedView
					: notification.type === 'calendar-analysis'
						? CalendarAnalysisMinimizedView
						: notification.type === 'time-block'
							? TimeBlockMinimizedView
							: null
	);

	// Get notification title based on type (fallback for generic view)
	// FIX: Simplified the $derived expression
	let title = $derived(
		notification.type === 'brain-dump'
			? notification.status === 'processing'
				? 'Processing brain dump'
				: notification.status === 'success'
					? 'Brain dump complete'
					: notification.status === 'error'
						? 'Brain dump failed'
						: 'Brain dump'
			: notification.type === 'phase-generation'
				? notification.status === 'processing'
					? `Generating phases for ${notification.data.projectName}`
					: notification.status === 'success'
						? 'Phases generated'
						: notification.status === 'error'
							? 'Phase generation failed'
							: 'Phase generation'
				: notification.type === 'project-synthesis'
					? notification.status === 'processing'
						? `Analyzing tasks for ${notification.data.projectName}`
						: notification.status === 'success'
							? 'Synthesis complete'
							: notification.status === 'error'
								? 'Synthesis failed'
								: 'Project synthesis'
					: notification.type === 'calendar-analysis'
						? notification.status === 'processing'
							? 'Analyzing calendar'
							: notification.status === 'success'
								? 'Calendar analyzed'
								: notification.status === 'error'
									? 'Calendar analysis failed'
									: 'Calendar analysis'
						: notification.type === 'time-block'
							? notification.status === 'processing'
								? 'Creating time block'
								: notification.status === 'success'
									? 'Time block ready'
									: notification.status === 'warning'
										? 'Time block created (no suggestions)'
										: 'Time block'
							: notification.type === 'generic'
								? notification.data.title
								: 'Processing'
	);

	// Get subtitle/progress message with type-safe handling across progress variants
	function resolveSubtitle() {
		if (notification.type === 'time-block') {
			const suggestionsState = notification.data.suggestionsState;
			if (notification.status === 'processing') {
				return suggestionsState?.progress ?? 'Generating AI suggestions...';
			}
			if (notification.status === 'success') {
				const suggestionCount = notification.data.suggestions?.length ?? 0;
				return suggestionCount > 0
					? `${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'} ready`
					: 'Time block ready';
			}
			if (notification.status === 'warning') {
				return 'AI suggestions unavailable';
			}
		}

		if (!notification.progress) {
			return '';
		}

		if (
			'message' in notification.progress &&
			typeof notification.progress.message === 'string' &&
			notification.progress.message
		) {
			return notification.progress.message;
		}

		if (notification.progress.type === 'steps') {
			const { steps, currentStep } = notification.progress;
			if (!Array.isArray(steps) || steps.length === 0) {
				return '';
			}
			const index = Math.min(currentStep, steps.length - 1);
			const activeStep = steps[index];
			return activeStep?.message || activeStep?.name || '';
		}

		return '';
	}

	let subtitle = $derived(resolveSubtitle());

	// Handle click to expand
	function handleClick() {
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
	aria-expanded={!notification.isMinimized}
>
	{#if typeSpecificComponent}
		<!-- Type-specific view (brain dump, phase generation, etc.) -->
		<svelte:component this={typeSpecificComponent} {notification} />
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
			{#if notification.progress?.type === 'percentage' && notification.progress.percentage !== undefined}
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
