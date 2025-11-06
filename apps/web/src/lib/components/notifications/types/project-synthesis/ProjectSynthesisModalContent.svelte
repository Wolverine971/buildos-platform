<!-- apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisModalContent.svelte -->
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
		Sparkles,
		Lightbulb,
		RefreshCw,
		Target,
		PlusCircle,
		MinusCircle,
		Edit2
	} from 'lucide-svelte';
	import type {
		ProjectSynthesisNotification,
		StepsProgress
	} from '$lib/types/notification.types';
	import { createEventDispatcher } from 'svelte';

	let { notification } = $props<{
		notification: ProjectSynthesisNotification;
	}>();

	const dispatch = createEventDispatcher();

	// Module metadata
	const MODULE_METADATA: Record<string, { name: string; icon: any; shortLabel: string }> = {
		task_synthesis: {
			name: 'Task Synthesis',
			icon: Sparkles,
			shortLabel: 'Tasks'
		},
		project_analysis: {
			name: 'Project Analysis',
			icon: Target,
			shortLabel: 'Analysis'
		},
		completion_score: {
			name: 'Completion Score',
			icon: CheckCircle,
			shortLabel: 'Score'
		},
		thought_partner: {
			name: 'Thought Partner',
			icon: Lightbulb,
			shortLabel: 'Insights'
		}
	};

	const stepsProgress = $derived(
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null
	);

	const stepItems = $derived(stepsProgress?.steps ?? []);
	const totalSteps = $derived(stepsProgress?.totalSteps ?? 0);
	const completedSteps = $derived(
		stepsProgress ? stepsProgress.steps.filter((step) => step.status === 'completed').length : 0
	);

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
		notification?.actions?.dismiss?.();
		dispatch('close');
	}

	function handleRetry() {
		notification.actions.retry?.();
	}

	function handleReviewResults() {
		// Navigate to synthesis tab with results
		if (notification.actions.reviewResults) {
			notification.actions.reviewResults();
			handleClose();
		} else if (browser) {
			// Fallback: Force data invalidation to refresh synthesis data
			goto(`/projects/${notification.data.projectId}?tab=synthesis`, { invalidateAll: true });
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
	const showReviewResults = $derived(notification.status === 'success');
</script>

<Modal
	isOpen={true}
	size="xl"
	title="Project Synthesis — {notification.data.projectName}"
	onClose={handleClose}
	showCloseButton={true}
>
	<div class="px-4 sm:px-6 py-6">
		<div class="space-y-6">
			<!-- Overview -->
			<section
				class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
			>
				<div class="flex flex-wrap items-center gap-3">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40"
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
							{notification.status === 'success'
								? 'Synthesis Complete'
								: 'Analyzing Tasks'}
						</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							{notification.data.taskCount} task{notification.data.taskCount === 1
								? ''
								: 's'}
							analyzed
						</p>
					</div>

					<div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
				{/if}
			</section>

			<!-- Configuration Summary -->
			<section
				class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
			>
				<h3
					class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3"
				>
					Configuration
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each notification.data.selectedModules as module}
						{@const meta = MODULE_METADATA[module]}
						<div
							class="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-full text-xs font-medium"
						>
							{#if meta?.icon}
								{@const MetaIcon = meta.icon}
								{#if MetaIcon}
									<MetaIcon class="w-3.5 h-3.5" />
								{/if}
							{/if}
							<span>{meta?.name ?? module}</span>
						</div>
					{/each}
				</div>
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
										<p class="text-xs text-gray-400">ETA ~{step.etaSeconds}s</p>
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
			{#if notification.status === 'success' && result}
				<!-- Insights Card -->
				<section
					class="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm dark:border-green-800 dark:bg-green-900/20"
				>
					<header class="mb-4 flex items-center gap-3 text-green-700 dark:text-green-200">
						<Lightbulb class="h-5 w-5" />
						<h3 class="text-sm font-semibold uppercase tracking-wide">Key Insights</h3>
					</header>

					<div class="space-y-3 text-sm text-green-800 dark:text-green-100">
						<p class="leading-relaxed">{result.insights}</p>
					</div>
				</section>

				<!-- Operations Summary -->
				<section
					class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
				>
					<h3
						class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4"
					>
						Operations Summary
					</h3>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<div class="flex items-center justify-center gap-2 mb-2">
								<Edit2 class="h-5 w-5 text-blue-600 dark:text-blue-400" />
								<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
									{result.consolidationCount}
								</div>
							</div>
							<div class="text-xs text-gray-600 dark:text-gray-400">
								Consolidations
							</div>
						</div>
						<div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
							<div class="flex items-center justify-center gap-2 mb-2">
								<PlusCircle class="h-5 w-5 text-green-600 dark:text-green-400" />
								<div class="text-2xl font-bold text-green-600 dark:text-green-400">
									{result.newTasksCount}
								</div>
							</div>
							<div class="text-xs text-gray-600 dark:text-gray-400">New Tasks</div>
						</div>
						<div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<div class="flex items-center justify-center gap-2 mb-2">
								<MinusCircle class="h-5 w-5 text-red-600 dark:text-red-400" />
								<div class="text-2xl font-bold text-red-600 dark:text-red-400">
									{result.deletionsCount}
								</div>
							</div>
							<div class="text-xs text-gray-600 dark:text-gray-400">Deletions</div>
						</div>
					</div>
				</section>

				<!-- Task Comparison Preview -->
				{#if result.comparison && result.comparison.length > 0}
					<section
						class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
					>
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4"
						>
							Task Comparisons
							<span class="text-gray-400 font-normal text-xs">
								(Showing first {Math.min(3, result.comparison.length)} of {result
									.comparison.length})
							</span>
						</h3>

						<div class="space-y-3">
							{#each result.comparison.slice(0, 3) as item}
								<div
									class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
								>
									<div class="flex items-start gap-2 mb-2">
										<span
											class={`px-2 py-0.5 rounded text-xs font-medium ${
												item.type === 'consolidated'
													? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
													: item.type === 'suggested'
														? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
														: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
											}`}
										>
											{item.type === 'consolidated'
												? 'Consolidated'
												: item.type === 'suggested'
													? 'New Task'
													: 'Deleted'}
										</span>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-400 italic">
										{item.reasoning}
									</p>
								</div>
							{/each}
						</div>

						<p class="text-xs text-blue-600 dark:text-blue-400 mt-4">
							Click "Review Results" to see full analysis and edit operations
						</p>
					</section>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Footer actions -->
	<div
		slot="footer"
		class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
	>
		<div class="text-xs text-gray-500 dark:text-gray-400">
			{#if duration}
				Completed in {duration}
			{/if}
		</div>

		<div class="flex flex-col sm:flex-row sm:justify-end gap-2 w-full sm:w-auto">
			<Button variant="ghost" onclick={handleMinimize} class="w-full sm:w-auto">
				Minimize
			</Button>
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
			{#if showReviewResults}
				<Button
					variant="primary"
					onclick={handleReviewResults}
					icon={ExternalLink}
					class="w-full sm:w-auto"
				>
					Review Results
				</Button>
			{:else}
				<Button variant="primary" onclick={handleClose} class="w-full sm:w-auto">
					Close
				</Button>
			{/if}
		</div>
	</div>
</Modal>
