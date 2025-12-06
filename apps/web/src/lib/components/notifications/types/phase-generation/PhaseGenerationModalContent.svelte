<!-- apps/web/src/lib/components/notifications/types/phase-generation/PhaseGenerationModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		Loader2,
		CheckCircle,
		AlertCircle,
		ChevronRight,
		ExternalLink,
		Clock,
		Layers,
		NotebookPen,
		RefreshCw
	} from 'lucide-svelte';
	import type { PhaseGenerationNotification, StepsProgress } from '$lib/types/notification.types';
	import { createEventDispatcher } from 'svelte';

	let { notification } = $props<{
		notification: PhaseGenerationNotification;
	}>();

	const dispatch = createEventDispatcher();

	const STRATEGY_LABELS: Record<
		PhaseGenerationNotification['data']['strategy'],
		{ title: string; description: string }
	> = {
		'phases-only': {
			title: 'Organize tasks into phases',
			description: 'Create a workable phase structure without scheduling'
		},
		'schedule-in-phases': {
			title: 'Schedule inside phases',
			description: 'Balance workload and set timelines within each phase'
		},
		'calendar-optimized': {
			title: 'Optimize around calendar',
			description: 'Schedule across the calendar while respecting existing events'
		}
	};

	// FIX: Changed from $derived(() => expression) to $derived(expression)
	let stepsProgress = $derived(
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null
	);

	// FIX: Changed from $derived(() => expression) to $derived(expression)
	let stepItems = $derived(stepsProgress?.steps ?? []);

	let totalSteps = $derived(stepsProgress?.totalSteps ?? 0);

	let completedSteps = $derived(
		stepsProgress ? stepsProgress.steps.filter((step) => step.status === 'completed').length : 0
	);

	// Fix TypeScript error by properly typing strategy
	const strategy = notification.data.strategy as PhaseGenerationNotification['data']['strategy'];
	const strategyMeta = STRATEGY_LABELS[strategy];
	const result = $derived(notification.data.result ?? null);

	function formatDuration(ms?: number): string | null {
		if (!ms || Number.isNaN(ms)) return null;
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remaining = seconds % 60;
		return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
	}

	function handleMinimize() {
		dispatch('minimize');
	}

	function handleClose() {
		// Clean up notification actions before closing
		notification?.actions?.dismiss?.();
		dispatch('close');
	}

	function handleRetry() {
		notification.actions.retry?.();
	}

	function handleViewProject() {
		// Navigate to project
		if (notification.actions.viewProject) {
			// viewProject action already minimizes the notification (which closes the modal)
			notification.actions.viewProject();
			handleClose();
		} else if (browser) {
			// Fallback: Force data invalidation to refresh project data even if already on the page
			goto(`/projects/${notification.data.projectId}`, { invalidateAll: true });
			// Close the modal after navigation (only needed in fallback path)
			handleClose();
		}
	}

	const duration = $derived(
		notification.data.telemetry?.durationMs
			? formatDuration(notification.data.telemetry.durationMs)
			: null
	);

	const statusIconClasses = $derived(
		notification.status === 'success'
			? 'text-green-600 dark:text-green-400'
			: notification.status === 'error'
				? 'text-red-600 dark:text-red-400'
				: 'text-blue-600 dark:text-blue-400'
	);

	const showRetry = $derived(notification.status === 'error');
	const showViewProject = $derived(notification.status === 'success');
</script>

<Modal
	isOpen={true}
	size="xl"
	title={`Phase generation — ${notification.data.projectName}`}
	onClose={handleClose}
	showCloseButton={true}
>
	{#snippet children()}
		<div class="px-4 sm:px-6 py-6">
			<div class="space-y-6">
				<!-- Overview -->
				<section
					class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
				>
					<div class="flex flex-wrap items-center gap-3">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40"
						>
							{#if notification.status === 'success'}
								<CheckCircle class={`h-6 w-6 ${statusIconClasses}`} />
							{:else if notification.status === 'error'}
								<AlertCircle class={`h-6 w-6 ${statusIconClasses}`} />
							{:else}
								<Loader2 class={`h-6 w-6 animate-spin ${statusIconClasses}`} />
							{/if}
						</div>
						<div class="flex-1 min-w-[200px] space-y-1">
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
								{notification.data.isRegeneration
									? 'Regenerating phases'
									: 'Generating phases'}
							</h2>
							{#if strategyMeta}
								<p class="text-sm text-gray-500 dark:text-gray-400">
									{strategyMeta.title}
								</p>
							{/if}
						</div>

						<div
							class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400"
						>
							<div class="flex items-center gap-2">
								<Layers class="h-4 w-4" />
								<span>{notification.data.taskCount} tasks</span>
							</div>
							{#if duration}
								<div class="flex items-center gap-2">
									<Clock class="h-4 w-4" />
									<span>{duration}</span>
								</div>
							{/if}
						</div>
					</div>

					{#if notification.status === 'error' && notification.data.error}
						<p
							class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200"
						>
							{notification.data.error}
						</p>
					{:else if notification.status === 'success' && notification.data.requestPayload?.user_instructions}
						<p
							class="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/40 dark:text-slate-300"
						>
							Custom instructions applied: {notification.data.requestPayload
								.user_instructions}
						</p>
					{/if}
				</section>

				<!-- Progress timeline -->
				<section
					class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
				>
					<header class="mb-4 flex items-center justify-between">
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
						>
							Progress
						</h3>
						{#if stepsProgress}
							<span class="text-xs text-gray-400">
								{completedSteps}/{totalSteps} steps complete
							</span>
						{/if}
					</header>

					{#if stepsProgress}
						<ol class="space-y-3">
							{#each stepItems as step (step.key ?? step.name)}
								<li class="flex items-start gap-3">
									<div
										class={`flex h-8 w-8 items-center justify-center rounded-full border ${
											step.status === 'completed'
												? 'border-green-200 bg-green-50 text-green-600 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
												: step.status === 'processing'
													? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300'
													: step.status === 'error'
														? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
														: 'border-gray-200 bg-white text-gray-400 dark:border-gray-800 dark:bg-gray-900'
										}`}
									>
										{#if step.status === 'completed'}
											<CheckCircle class="h-4 w-4" />
										{:else if step.status === 'processing'}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else if step.status === 'error'}
											<AlertCircle class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
									</div>
									<div class="flex-1 space-y-1">
										<p
											class={`text-sm font-medium ${
												step.status === 'processing'
													? 'text-gray-900 dark:text-white'
													: 'text-gray-600 dark:text-gray-300'
											}`}
										>
											{step.name}
										</p>
										{#if step.message}
											<p class="text-xs text-gray-500 dark:text-gray-400">
												{step.message}
											</p>
										{/if}
										{#if step.etaSeconds}
											<p class="text-xs text-gray-400">
												ETA ~{step.etaSeconds}s
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="text-sm text-gray-500 dark:text-gray-400">Tracking progress…</p>
					{/if}
				</section>

				<!-- Result summary -->
				{#if notification.status === 'success'}
					<section
						class="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm dark:border-green-800 dark:bg-green-900/20"
					>
						<header
							class="mb-4 flex items-center gap-3 text-green-700 dark:text-green-200"
						>
							<CheckCircle class="h-5 w-5" />
							<h3 class="text-sm font-semibold uppercase tracking-wide">
								Changes applied
							</h3>
						</header>

						<div class="space-y-3 text-sm text-green-800 dark:text-green-100">
							<p>
								Successfully processed {notification.data.taskCount}
								task{notification.data.taskCount === 1 ? '' : 's'} across
								{result?.phases?.length ?? 0} phases.
							</p>

							{#if result?.calendarEventCount}
								<p>
									Updated {result.calendarEventCount} calendar event{result.calendarEventCount ===
									1
										? ''
										: 's'} to match the new schedule.
								</p>
							{/if}

							{#if result?.summaryMarkdown}
								<div
									class="rounded-md bg-white/80 p-3 text-sm text-green-700 shadow-inner dark:bg-green-950/40 dark:text-green-100"
								>
									<h4
										class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-200"
									>
										<NotebookPen class="h-4 w-4" />
										Summary
									</h4>
									<div class="prose prose-sm text-green-700 dark:prose-invert">
										{@html result.summaryMarkdown}
									</div>
								</div>
							{/if}
						</div>
					</section>
				{/if}
			</div>
		</div>

		<!-- Footer actions -->
		<div
			slot="footer"
			class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
		>
			<div
				class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 w-full sm:w-auto"
			>
				<span class="uppercase tracking-wide">Filters</span>
				{#each notification.data.selectedStatuses as status (status)}
					<span
						class="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
					>
						{status.replace(/_/g, ' ')}
					</span>
				{/each}
			</div>

			<div class="flex flex-col sm:flex-row sm:justify-end gap-2 w-full sm:w-auto">
				<Button variant="ghost" onclick={handleMinimize} class="w-full sm:w-auto"
					>Minimize</Button
				>
				{#if showRetry}
					<Button
						variant="secondary"
						onclick={handleRetry}
						icon={RefreshCw}
						class="w-full sm:w-auto"
					>
						Retry
					</Button>
				{/if}
				{#if showViewProject}
					<Button
						variant="primary"
						onclick={handleViewProject}
						icon={ExternalLink}
						class="w-full sm:w-auto"
					>
						Review changes
					</Button>
				{:else}
					<Button variant="primary" onclick={handleClose} class="w-full sm:w-auto">
						Close
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	:global(.dark) .prose-invert a {
		color: #a5b4fc;
	}
</style>
