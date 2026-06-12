<!-- apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		LoaderCircle,
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

	let { notification }: { notification: ProjectSynthesisNotification } = $props();

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
			? 'text-success'
			: notification.status === 'error'
				? 'text-destructive'
				: 'text-info'
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
	{#snippet children()}
		<div class="px-4 sm:px-6 py-6">
			<div class="space-y-6">
				<!-- Overview -->
				<section class="rounded-xl border border-border bg-card p-6 shadow-ink/70">
					<div class="flex flex-wrap items-center gap-3">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10"
						>
							{#if notification.status === 'success'}
								<CheckCircle class={`h-6 w-6 ${statusIconClasses}`} />
							{:else if notification.status === 'error'}
								<AlertCircle class={`h-6 w-6 ${statusIconClasses}`} />
							{:else}
								<LoaderCircle class={`h-6 w-6 animate-spin ${statusIconClasses}`} />
							{/if}
						</div>
						<div class="flex-1 min-w-[200px] space-y-1">
							<h2 class="text-lg font-semibold text-foreground">
								{notification.status === 'success'
									? 'Synthesis Complete'
									: 'Analyzing Tasks'}
							</h2>
							<p class="text-sm text-muted-foreground">
								{notification.data.taskCount} task{notification.data.taskCount === 1
									? ''
									: 's'}
								analyzed
							</p>
						</div>

						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							{#if duration}
								<div class="flex items-center gap-2">
									<Clock class="h-4 w-4" />
									<span>{duration}</span>
								</div>
							{/if}
						</div>
					</div>

					{#if notification.status === 'error' && notification.data.error}
						<p class="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
							{notification.data.error}
						</p>
					{/if}
				</section>

				<!-- Configuration Summary -->
				<section class="rounded-xl border border-border bg-muted p-4/50">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">
						Configuration
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each notification.data.selectedModules as module}
							{@const meta = MODULE_METADATA[module]}
							<div
								class="flex items-center gap-2 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-xs font-medium"
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
				<section class="rounded-xl border border-border bg-card p-6 shadow-ink/70">
					<header class="mb-4 flex items-center justify-between">
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Progress
						</h3>
						{#if stepsProgress}
							<span class="text-xs text-muted-foreground">
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
												? 'border-success/30 bg-success/10 text-success'
												: step.status === 'processing'
													? 'border-info/30 bg-info/10 text-info'
													: step.status === 'error'
														? 'border-destructive/30 bg-destructive/10 text-destructive'
														: 'border-border bg-card text-muted-foreground'
										}`}
									>
										{#if step.status === 'completed'}
											<CheckCircle class="h-4 w-4" />
										{:else if step.status === 'processing'}
											<LoaderCircle class="h-4 w-4 animate-spin" />
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
													? 'text-foreground'
													: 'text-muted-foreground'
											}`}
										>
											{step.name}
										</p>
										{#if step.message}
											<p class="text-xs text-muted-foreground">
												{step.message}
											</p>
										{/if}
										{#if step.etaSeconds}
											<p class="text-xs text-muted-foreground">
												ETA ~{step.etaSeconds}s
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="text-sm text-muted-foreground">Tracking progress…</p>
					{/if}
				</section>

				<!-- Result summary -->
				{#if notification.status === 'success' && result}
					<!-- Insights Card -->
					<section
						class="rounded-xl border border-success/30 bg-success/10 p-6 shadow-ink"
					>
						<header class="mb-4 flex items-center gap-3 text-success">
							<Lightbulb class="h-5 w-5" />
							<h3 class="text-sm font-semibold uppercase tracking-wide">
								Key Insights
							</h3>
						</header>

						<div class="space-y-3 text-sm text-foreground">
							<p class="leading-relaxed">{result.insights}</p>
						</div>
					</section>

					<!-- Operations Summary -->
					<section class="rounded-xl border border-border bg-card p-6 shadow-ink/70">
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-foreground mb-4"
						>
							Operations Summary
						</h3>
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="text-center p-4 bg-info/10 rounded-lg">
								<div class="flex items-center justify-center gap-2 mb-2">
									<Edit2 class="h-5 w-5 text-info" />
									<div class="text-2xl font-bold text-info">
										{result.consolidationCount}
									</div>
								</div>
								<div class="text-xs text-muted-foreground">Consolidations</div>
							</div>
							<div class="text-center p-4 bg-success/10 rounded-lg">
								<div class="flex items-center justify-center gap-2 mb-2">
									<PlusCircle class="h-5 w-5 text-success" />
									<div class="text-2xl font-bold text-success">
										{result.newTasksCount}
									</div>
								</div>
								<div class="text-xs text-muted-foreground">New Tasks</div>
							</div>
							<div class="text-center p-4 bg-destructive/10 rounded-lg">
								<div class="flex items-center justify-center gap-2 mb-2">
									<MinusCircle class="h-5 w-5 text-destructive" />
									<div class="text-2xl font-bold text-destructive">
										{result.deletionsCount}
									</div>
								</div>
								<div class="text-xs text-muted-foreground">Deletions</div>
							</div>
						</div>
					</section>

					<!-- Task Comparison Preview -->
					{#if result.comparison && result.comparison.length > 0}
						<section class="rounded-xl border border-border bg-card p-6 shadow-ink/70">
							<h3
								class="text-sm font-semibold uppercase tracking-wide text-foreground mb-4"
							>
								Task Comparisons
								<span class="text-muted-foreground font-normal text-xs">
									(Showing first {Math.min(3, result.comparison.length)} of {result
										.comparison.length})
								</span>
							</h3>

							<div class="space-y-3">
								{#each result.comparison.slice(0, 3) as item}
									<div class="p-3 bg-muted/50 rounded-lg border border-border">
										<div class="flex items-start gap-2 mb-2">
											<span
												class={`px-2 py-0.5 rounded text-xs font-medium ${
													item.type === 'consolidated'
														? 'bg-info/10 text-info'
														: item.type === 'suggested'
															? 'bg-success/10 text-success'
															: 'bg-destructive/10 text-destructive'
												}`}
											>
												{item.type === 'consolidated'
													? 'Consolidated'
													: item.type === 'suggested'
														? 'New Task'
														: 'Deleted'}
											</span>
										</div>
										<p class="text-xs text-muted-foreground italic">
											{item.reasoning}
										</p>
									</div>
								{/each}
							</div>

							<p class="text-xs text-info mt-4">
								Click "Review Results" to see full analysis and edit operations
							</p>
						</section>
					{/if}
				{/if}
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<!-- Footer actions -->
		<div
			class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-border bg-muted/40"
		>
			<div class="text-xs text-muted-foreground">
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
	{/snippet}
</Modal>
