<!-- apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte -->
<script lang="ts">
	import {
		LoaderCircle,
		TriangleAlert,
		CircleCheck,
		XCircle,
		Brain,
		FileText,
		Sparkles
	} from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type {
		ProjectContextResult,
		TaskNoteExtractionResult,
		PreparatoryAnalysisResult
	} from '$lib/types/brain-dump';
	import type { StreamingMessage } from '$lib/types/sse-messages';
	import ProjectContextPreview from './ProjectContextPreview.svelte';
	import TasksNotesPreview from './TasksNotesPreview.svelte';
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	interface Props {
		analysisStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed';
		contextStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed';
		tasksStatus?: 'pending' | 'processing' | 'completed' | 'failed';
		analysisResult?: PreparatoryAnalysisResult | null;
		contextResult?: ProjectContextResult | null;
		tasksResult?: TaskNoteExtractionResult | null;
		retryStatus?: { attempt: number; maxAttempts: number; processName: string } | null;
		isProcessing?: boolean;
		inModal?: boolean;
		isShortBraindump?: boolean;
		showContextPanel?: boolean;
		showAnalysisPanel?: boolean;
	}

	let {
		analysisStatus = $bindable('not_needed'),
		contextStatus = $bindable('pending'),
		tasksStatus = $bindable('pending'),
		analysisResult = $bindable(null),
		contextResult = $bindable(null),
		tasksResult = $bindable(null),
		retryStatus = $bindable(null),
		isProcessing = $bindable(false),
		inModal = false,
		isShortBraindump = false,
		showContextPanel = $bindable(false),
		showAnalysisPanel = $bindable(false)
	}: Props = $props();

	// Progress indicators
	const analysisProgress = tweened(0, { duration: 300, easing: quintOut });
	const contextProgress = tweened(0, { duration: 300, easing: quintOut });
	const tasksProgress = tweened(0, { duration: 300, easing: quintOut });

	// Analysis phase messaging
	let analysisPhaseMessage: string = $state('Analyzing braindump...');
	let analysisPhaseIndex: number = $state(0);
	const analysisPhases: string[] = [
		'Analyzing braindump...',
		'Categorizing content...',
		'Extracting insights...',
		'Optimizing processing...'
	];

	type SharedStatus = 'pending' | 'processing' | 'completed' | 'failed';
	type ProcessStatus = SharedStatus | 'not_needed';
	type BadgeVariant = 'success' | 'warning' | 'error' | 'info';

	const STATUS_META: Record<
		ProcessStatus,
		{ label: string; description: string; badge: BadgeVariant }
	> = {
		pending: {
			label: 'Queued',
			description: 'Waiting to start',
			badge: 'info'
		},
		processing: {
			label: 'Processing',
			description: 'Running now',
			badge: 'info'
		},
		completed: {
			label: 'Ready',
			description: 'Latest insights available',
			badge: 'success'
		},
		failed: {
			label: 'Needs attention',
			description: 'We hit an issue',
			badge: 'error'
		},
		not_needed: {
			label: 'Skipped',
			description: 'Not required for this braindump',
			badge: 'warning'
		}
	};

	const STATUS_TONE: Record<ProcessStatus, string> = {
		pending: 'text-blue-600 dark:text-blue-300',
		processing: 'text-blue-600 dark:text-blue-300',
		completed: 'text-emerald-600 dark:text-emerald-300',
		failed: 'text-rose-600 dark:text-rose-300',
		not_needed: 'text-muted-foreground'
	};

	const PROGRESS_GRADIENTS = {
		analysis: 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500',
		context: 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500',
		tasks: 'bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500'
	} as const;

	const classificationThemes: Record<string, { label: string; classes: string }> = {
		strategic: {
			label: 'Strategic',
			classes:
				'bg-gradient-to-r from-blue-100/80 to-indigo-100/80 text-blue-700 dark:from-blue-900/40 dark:to-indigo-900/40 dark:text-blue-200'
		},
		tactical: {
			label: 'Tactical',
			classes:
				'bg-gradient-to-r from-purple-100/80 to-pink-100/80 text-purple-700 dark:from-purple-900/40 dark:to-pink-900/40 dark:text-purple-200'
		},
		mixed: {
			label: 'Mixed',
			classes:
				'bg-gradient-to-r from-cyan-100/80 to-blue-100/80 text-cyan-700 dark:from-cyan-900/40 dark:to-blue-900/40 dark:text-cyan-200'
		},
		status_update: {
			label: 'Status Update',
			classes:
				'bg-gradient-to-r from-emerald-100/80 to-lime-100/80 text-emerald-700 dark:from-emerald-900/40 dark:to-lime-900/40 dark:text-emerald-200'
		},
		unrelated: {
			label: 'Unrelated',
			classes: 'bg-slate-100/80 text-foreground/60 dark:text-muted-foreground'
		}
	};

	function formatLabel(value: string) {
		return value
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getStatusMeta(status: ProcessStatus) {
		return STATUS_META[status] ?? STATUS_META.pending;
	}

	function getStatusTone(status: ProcessStatus) {
		return STATUS_TONE[status] ?? STATUS_TONE.pending;
	}

	function getClassificationTheme(classification?: string | null) {
		if (!classification) {
			return {
				label: 'Uncategorized',
				classes: 'bg-card/70 text-foreground dark:bg-card/10 dark:text-muted-foreground'
			};
		}

		const theme = classificationThemes[classification];
		if (theme) {
			return theme;
		}

		return {
			label: formatLabel(classification),
			classes:
				'bg-gradient-to-r from-slate-100/80 to-slate-200/80 text-foreground dark:from-slate-800/40 dark:to-slate-700/40 dark:text-muted-foreground'
		};
	}

	// Animate through phases while processing
	$effect(() => {
		if (analysisStatus === 'processing') {
			const interval = setInterval(() => {
				analysisPhaseIndex = (analysisPhaseIndex + 1) % analysisPhases.length;
				const message = analysisPhases[analysisPhaseIndex];
				if (message) {
					analysisPhaseMessage = message;
				}
			}, 2000);
			return () => clearInterval(interval);
		}
	});

	// Track if analysis is prominent (processing or just completed)
	let isAnalysisProminent = $derived(analysisStatus === 'processing');
	let analysisClassificationTheme = $derived(
		getClassificationTheme(analysisResult?.braindump_classification ?? null)
	);

	// Update progress based on status
	$effect(() => {
		if (analysisStatus === 'processing') analysisProgress.set(50);
		else if (analysisStatus === 'completed') analysisProgress.set(100);
		else if (analysisStatus === 'not_needed') analysisProgress.set(100);
		else if (analysisStatus === 'failed') analysisProgress.set(0);
		else analysisProgress.set(0);
	});

	$effect(() => {
		if (contextStatus === 'processing') contextProgress.set(50);
		else if (contextStatus === 'completed') contextProgress.set(100);
		else if (contextStatus === 'not_needed') contextProgress.set(100);
		else if (contextStatus === 'failed') contextProgress.set(0);
		else contextProgress.set(0);
	});

	$effect(() => {
		if (tasksStatus === 'processing') tasksProgress.set(50);
		else if (tasksStatus === 'completed') tasksProgress.set(100);
		else if (tasksStatus === 'failed') tasksProgress.set(0);
		else tasksProgress.set(0);
	});
	// Update status based on incoming SSE messages
	export function handleStreamUpdate(status: StreamingMessage) {
		switch (status.type) {
			case 'analysis':
				// Handle analysis phase - ALWAYS show panel when analysis event received
				showAnalysisPanel = true;
				console.log('[DualProcessingResults] Analysis panel shown');
				if ('data' in status && status.data) {
					if (status.data.status) {
						analysisStatus = status.data.status;
						console.log('[DualProcessingResults] Analysis status:', status.data.status);
					}
					if ('result' in status.data && status.data.result) {
						analysisResult = status.data.result;
						console.log('[DualProcessingResults] Analysis result received:', {
							classification: status.data.result.braindump_classification,
							relevantTaskCount: status.data.result.relevant_task_ids?.length || 0
						});
					}
				}
				break;

			case 'status':
				isProcessing = true;
				// Reset results when starting new processing
				tasksResult = null;
				contextResult = null;
				analysisResult = null;
				console.log('[DualProcessingResults] Processing started, reset results');

				// Check if analysis is in the processes array - if so, show analysis panel early
				const processes = status.data?.processes as
					| ('analysis' | 'context' | 'tasks')[]
					| undefined;
				if (processes?.includes('analysis')) {
					showAnalysisPanel = true;
					analysisStatus = 'pending';
					console.log(
						'[DualProcessingResults] Analysis panel enabled (analysis in processes)'
					);
				}

				// Only update panel visibility if explicitly provided in the SSE message
				// The initial prop values should be used unless the server explicitly changes them
				if (status.data?.isDualProcessing) {
					// Regular dual processing - show both panels immediately
					showContextPanel = true;
					// Initialize both statuses to processing for dual
					if (contextStatus === 'pending') contextStatus = 'processing';
					if (tasksStatus === 'pending') tasksStatus = 'processing';
				} else if (status.data?.isShortBraindump) {
					// Short braindump - the initial prop should already be set correctly
					// Don't override showContextPanel here, let contextUpdateRequired handle it
				}
				break;

			case 'contextUpdateRequired':
				// Show or hide context panel based on whether update is needed
				if (status.data?.processes?.includes('context')) {
					// Context update IS needed
					showContextPanel = true;
					contextStatus = 'pending';
				} else if (isShortBraindump && !status.data?.processes?.includes('context')) {
					// Short braindump determined no context update needed
					// Keep context panel hidden and mark as not needed
					showContextPanel = false;
					contextStatus = 'not_needed';
				}
				break;

			case 'contextProgress':
				if ('data' in status && status.data) {
					if (status.data.status) {
						contextStatus = status.data.status;
					}
					if ('preview' in status.data && status.data.preview) {
						// Preview is now always in correct ProjectContextResult format
						contextResult = status.data.preview;
					}
				}
				break;

			case 'tasksProgress':
				if ('data' in status && status.data) {
					if (status.data.status) {
						tasksStatus = status.data.status;
						console.log(
							'[DualProcessingResults] Tasks status changed to:',
							status.data.status
						);
					}
					if ('preview' in status.data && status.data.preview) {
						console.log(
							'[DualProcessingResults] Tasks preview received:',
							status.data.preview
						);
						// Preview is now always in correct TaskNoteExtractionResult format
						tasksResult = status.data.preview;
						console.log('[DualProcessingResults] Direct tasks result:', tasksResult);
					}
				}
				break;

			case 'retry':
				if ('attempt' in status && 'maxAttempts' in status && 'processName' in status) {
					retryStatus = {
						attempt: status.attempt,
						maxAttempts: status.maxAttempts,
						processName: status.processName
					};
				}
				break;

			case 'complete':
				isProcessing = false;
				retryStatus = null;

				// Final results come through 'result' property
				if ('result' in status && status.result) {
					// Context and tasks results should already be set from streaming
					// but mark completion status if needed
					if (!contextResult && status.result.contextResult) {
						contextResult = status.result.contextResult;
					}

					// For short braindumps that didn't need context, ensure status stays as not_needed
					if (isShortBraindump && contextStatus === 'not_needed') {
						// Context wasn't needed, keep the not_needed status
						contextStatus = 'not_needed';
					}
				}
				break;

			case 'error':
				isProcessing = false;
				// Determine which process failed based on status
				if (contextStatus !== 'completed' && contextStatus !== 'not_needed')
					contextStatus = 'failed';
				if (tasksStatus !== 'completed') tasksStatus = 'failed';
				break;
		}
	}
</script>

<svg width="0" height="0" class="pointer-events-none absolute">
	<defs>
		<linearGradient id="analysisGradient" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" style="stop-color: rgb(37 99 235); stop-opacity: 1" />
			<stop offset="100%" style="stop-color: rgb(147 51 234); stop-opacity: 1" />
		</linearGradient>
	</defs>
</svg>

<div class={`w-full space-y-6 ${inModal ? '' : 'max-w-7xl mx-auto'}`}>
	{#if showAnalysisPanel && analysisStatus !== 'not_needed'}
		{#if isAnalysisProminent}
			<Card
				variant="elevated"
				padding="lg"
				class="relative overflow-hidden border border-blue-100/60 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 shadow-ink-strong dark:border-blue-900/40 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40"
			>
				<div class="absolute inset-0 opacity-60">
					<div
						class="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 blur-3xl dark:from-indigo-500/40 dark:to-purple-500/40"
					></div>
					<div
						class="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-gradient-to-br from-blue-200 to-cyan-200 blur-3xl dark:from-blue-500/30 dark:to-cyan-500/30"
					></div>
				</div>
				<div class="relative grid gap-8 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
					<div class="space-y-5">
						<div class="flex items-center gap-4">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-2xl bg-card/80 text-blue-600 shadow-ink-strong ring-1 ring-white/80 dark:bg-card/10 dark:text-blue-200 dark:ring-white/10"
							>
								<Sparkles class="h-6 w-6" />
							</div>
							<div class="space-y-1">
								<h2 class="text-2xl font-semibold text-foreground">
									Analyzing your braindump
								</h2>
								<p class="text-sm text-muted-foreground">
									We are calibrating context and extracting tasks in parallel.
								</p>
							</div>
						</div>
						<p class="text-base font-medium text-foreground">
							{analysisPhaseMessage}
						</p>
						<div class="grid gap-3 sm:grid-cols-3">
							<div class="status-tile">
								<div class="status-tile__header">
									<div class="status-tile__label">
										<Sparkles
											class="h-4 w-4 text-blue-500 dark:text-blue-300"
										/>
										<span>Analysis</span>
									</div>
									<Badge variant={getStatusMeta(analysisStatus).badge} size="sm">
										{getStatusMeta(analysisStatus).label}
									</Badge>
								</div>
								<div class="status-tile__progress">
									<div
										class={`status-tile__fill ${PROGRESS_GRADIENTS.analysis}`}
										style={`width: ${$analysisProgress}%;`}
									></div>
								</div>
							</div>
							{#if showContextPanel}
								<div class="status-tile">
									<div class="status-tile__header">
										<div class="status-tile__label">
											<Brain
												class="h-4 w-4 text-blue-500 dark:text-blue-300"
											/>
											<span>Context</span>
										</div>
										<Badge
											variant={getStatusMeta(contextStatus).badge}
											size="sm"
										>
											{getStatusMeta(contextStatus).label}
										</Badge>
									</div>
									<div class="status-tile__progress">
										<div
											class={`status-tile__fill ${PROGRESS_GRADIENTS.context}`}
											style={`width: ${$contextProgress}%;`}
										></div>
									</div>
								</div>
							{/if}
							<div class="status-tile">
								<div class="status-tile__header">
									<div class="status-tile__label">
										<FileText
											class="h-4 w-4 text-purple-500 dark:text-purple-300"
										/>
										<span>Tasks &amp; Notes</span>
									</div>
									<Badge variant={getStatusMeta(tasksStatus).badge} size="sm">
										{getStatusMeta(tasksStatus).label}
									</Badge>
								</div>
								<div class="status-tile__progress">
									<div
										class={`status-tile__fill ${PROGRESS_GRADIENTS.tasks}`}
										style={`width: ${$tasksProgress}%;`}
									></div>
								</div>
							</div>
						</div>
						{#if retryStatus}
							<div class="retry-banner">
								<span class="retry-dot"></span>
								<span class="font-medium">
									Retrying {retryStatus.processName} ({retryStatus.attempt}/{retryStatus.maxAttempts})
								</span>
								<span class="text-sm opacity-80"
									>We’ll keep going automatically.</span
								>
							</div>
						{/if}
					</div>
					<div class="flex flex-col items-center justify-center gap-4">
						<div class="analysis-progress-circle">
							<svg class="progress-ring" viewBox="0 0 44 44">
								<circle
									class="progress-ring-bg"
									cx="22"
									cy="22"
									r="20"
									fill="none"
									stroke-width="2"
								/>
								<circle
									class="progress-ring-fill"
									cx="22"
									cy="22"
									r="20"
									fill="none"
									stroke-width="2"
									style="stroke-dasharray: 125.6; stroke-dashoffset: {125.6 -
										(125.6 * $analysisProgress) / 100}"
								/>
							</svg>
							<span class="progress-text">{Math.round($analysisProgress)}%</span>
						</div>
						<p class="text-xs uppercase tracking-wide text-muted-foreground">
							Optimizing insights…
						</p>
						<div class="loading-dots">
							<span class="loading-dot" style="animation-delay: 0s"></span>
							<span class="loading-dot" style="animation-delay: 0.2s"></span>
							<span class="loading-dot" style="animation-delay: 0.4s"></span>
						</div>
					</div>
				</div>
			</Card>
		{:else}
			<div transition:fly={{ y: -12, duration: 400, easing: quintOut }}>
				<Card
					variant="elevated"
					padding="lg"
					class="relative overflow-hidden border border-blue-100/60 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 shadow-ink dark:border-blue-900/40 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40"
				>
					<div class="absolute inset-0 opacity-50">
						<div
							class="absolute -top-16 -right-12 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 blur-2xl dark:from-indigo-500/40 dark:to-purple-500/40"
						></div>
					</div>
					<div
						class="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
					>
						<div class="flex items-start gap-3">
							<div
								class={`status-icon-wrap ${analysisStatus === 'failed' ? 'status-icon-wrap--error' : ''}`}
							>
								{#if analysisStatus === 'completed'}
									<CircleCheck class="h-6 w-6" />
								{:else if analysisStatus === 'failed'}
									<XCircle class="h-6 w-6" />
								{/if}
							</div>
							<div class="space-y-2">
								<h3 class="text-xl font-semibold text-foreground">
									{analysisStatus === 'completed'
										? 'Analysis complete'
										: 'Analysis needs attention'}
								</h3>
								<p class={`text-sm ${getStatusTone(analysisStatus)}`}>
									{getStatusMeta(analysisStatus).description}
								</p>
								{#if analysisStatus === 'completed' && analysisResult}
									<p class="text-sm leading-relaxed text-foreground">
										{analysisResult.analysis_summary}
									</p>
								{:else if analysisStatus === 'failed'}
									<p class="text-sm leading-relaxed text-foreground">
										Analysis couldn't complete, but we'll continue with your
										data.
									</p>
								{/if}
							</div>
						</div>
						{#if analysisStatus === 'completed' && analysisResult}
							<div class="flex flex-wrap gap-2 md:max-w-sm">
								{#if analysisResult.braindump_classification}
									<span
										class={`classification-chip ${analysisClassificationTheme.classes}`}
									>
										{analysisClassificationTheme.label}
									</span>
								{/if}
								{#if analysisResult.relevant_task_ids.length > 0}
									<Badge variant="info" size="sm" class="shadow-ink">
										{analysisResult.relevant_task_ids.length} relevant task{analysisResult
											.relevant_task_ids.length === 1
											? ''
											: 's'}
									</Badge>
								{/if}
								{#if analysisResult.new_tasks_detected}
									<Badge variant="success" size="sm" class="shadow-ink">
										New tasks spotted
									</Badge>
								{/if}
							</div>
						{/if}
					</div>
				</Card>
			</div>
		{/if}
	{/if}

	<div
		class={`grid gap-4 md:gap-6 ${showContextPanel ? 'sm:grid-cols-2' : 'grid-cols-1'} ${inModal ? '' : 'min-h-[420px]'}`}
	>
		{#if showContextPanel}
			<div transition:fly={{ x: -12, duration: 350, easing: quintOut }}>
				<Card
					variant="elevated"
					padding="none"
					class="flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm/60/70"
				>
					<CardHeader
						variant="gradient"
						class="flex flex-wrap items-center justify-between gap-3 from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-ink-strong ring-1 ring-white/80 dark:ring-white/20"
							>
								<Brain class="h-5 w-5" />
							</div>
							<div class="space-y-1">
								<h3 class="text-base font-semibold text-foreground">
									Project Context
								</h3>
								<p class="text-xs font-medium text-muted-foreground">
									{#if isShortBraindump && contextStatus === 'pending'}
										Update required based on tasks
									{:else}
										{getStatusMeta(contextStatus).description}
									{/if}
								</p>
							</div>
						</div>
						<Badge variant={getStatusMeta(contextStatus).badge} size="sm">
							{getStatusMeta(contextStatus).label}
						</Badge>
					</CardHeader>
					<div class="px-4 pt-3">
						<div class="h-1.5 rounded-full bg-slate-200/80/70">
							<div
								class={`h-full rounded-full ${PROGRESS_GRADIENTS.context}`}
								style={`width: ${$contextProgress}%; transition: width 0.45s ease;`}
							></div>
						</div>
					</div>
					<CardBody
						padding="lg"
						class="flex flex-1 flex-col gap-4 bg-card/80 text-foreground/50 dark:text-muted-foreground"
					>
						{#if contextStatus === 'pending'}
							<div
								class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
							>
								<div class="flex items-center gap-2">
									<span
										class="inline-flex h-2 w-2 animate-ping rounded-full bg-blue-400"
									></span>
									<span>Preparing to analyze...</span>
								</div>
							</div>
						{:else if contextStatus === 'processing'}
							{#if !contextResult}
								<div class="space-y-3">
									<div
										class="h-4 w-2/3 animate-pulse rounded-md bg-slate-200/80/60"
									></div>
									<div
										class="h-3 w-full animate-pulse rounded-md bg-slate-200/70/60"
									></div>
									<div
										class="h-3 w-5/6 animate-pulse rounded-md bg-slate-200/70/60"
									></div>
									<div class="flex gap-2 pt-2">
										<div
											class="h-6 w-16 animate-pulse rounded-full bg-slate-200/70/60"
										></div>
										<div
											class="h-6 w-16 animate-pulse rounded-full bg-slate-200/70/60"
										></div>
										<div
											class="h-6 w-12 animate-pulse rounded-full bg-slate-200/70/60"
										></div>
									</div>
								</div>
							{:else}
								<div transition:fade={{ duration: 250 }}>
									<ProjectContextPreview result={contextResult} />
								</div>
							{/if}
						{:else if contextStatus === 'completed' && contextResult}
							<div transition:fade={{ duration: 250 }}>
								<ProjectContextPreview result={contextResult} />
							</div>
						{:else if contextStatus === 'failed'}
							<div class="error-state">
								<TriangleAlert class="h-5 w-5" />
								<p>Failed to process context</p>
								<span>You can still continue with tasks.</span>
							</div>
						{:else if contextStatus === 'not_needed'}
							<div
								class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
							>
								Context was already up to date — nothing to do.
							</div>
						{/if}
					</CardBody>
				</Card>
			</div>
		{/if}
		<div transition:fly={{ x: showContextPanel ? 12 : 0, duration: 350, easing: quintOut }}>
			<Card
				variant="elevated"
				padding="none"
				class={`flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm/60/70 ${showContextPanel ? '' : 'sm:col-span-full w-full max-w-2xl mx-auto'}`}
			>
				<CardHeader
					variant="gradient"
					class="flex flex-wrap items-center justify-between gap-3 from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-ink-strong ring-1 ring-white/80 dark:ring-white/20"
						>
							<FileText class="h-5 w-5" />
						</div>
						<div class="space-y-1">
							<h3 class="text-base font-semibold text-foreground">
								Tasks &amp; Notes
							</h3>
							<p class="text-xs font-medium text-muted-foreground">
								{getStatusMeta(tasksStatus).description}
							</p>
						</div>
					</div>
					<Badge variant={getStatusMeta(tasksStatus).badge} size="sm">
						{getStatusMeta(tasksStatus).label}
					</Badge>
				</CardHeader>
				<div class="px-4 pt-3">
					<div class="h-1.5 rounded-full bg-slate-200/80/70">
						<div
							class={`h-full rounded-full ${PROGRESS_GRADIENTS.tasks}`}
							style={`width: ${$tasksProgress}%; transition: width 0.45s ease;`}
						></div>
					</div>
				</div>
				<CardBody
					padding="lg"
					class="flex flex-1 flex-col gap-4 bg-card/80 text-foreground/50 dark:text-muted-foreground"
				>
					{#if tasksStatus === 'pending'}
						<div
							class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
						>
							<div class="flex items-center gap-2">
								<span
									class="inline-flex h-2 w-2 animate-ping rounded-full bg-purple-400"
								></span>
								<span>Waiting for analysis to begin...</span>
							</div>
						</div>
					{:else if tasksStatus === 'processing'}
						{#if !tasksResult}
							<div class="space-y-3">
								<div class="flex flex-col gap-3">
									<div class="skeleton-row"></div>
									<div class="skeleton-row"></div>
									<div class="skeleton-row-short"></div>
								</div>
								<div class="flex flex-wrap gap-2">
									<div class="skeleton-pill"></div>
									<div class="skeleton-pill"></div>
									<div class="skeleton-pill"></div>
								</div>
							</div>
						{:else}
							<div transition:fade={{ duration: 250 }}>
								<TasksNotesPreview result={tasksResult} />
							</div>
						{/if}
					{:else if tasksStatus === 'completed' && tasksResult}
						<div transition:fade={{ duration: 250 }}>
							<TasksNotesPreview result={tasksResult} />
						</div>
					{:else if tasksStatus === 'failed'}
						<div class="error-state">
							<TriangleAlert class="h-5 w-5" />
							<p>We couldn't extract tasks this time</p>
							<span>Try again or edit the braindump.</span>
						</div>
					{/if}
				</CardBody>
			</Card>
		</div>
	</div>
</div>

<style>
	.status-tile {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.25);
		backdrop-filter: blur(12px);
	}

	:global(.dark) .status-tile {
		background: rgba(15, 23, 42, 0.55);
		border-color: rgba(96, 165, 250, 0.25);
	}

	.status-tile__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.status-tile__label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: rgb(71 85 105);
	}

	:global(.dark) .status-tile__label {
		color: rgb(203 213 225);
	}

	.status-tile__progress {
		height: 0.4rem;
		border-radius: 9999px;
		background: rgba(148, 163, 184, 0.2);
		overflow: hidden;
	}

	:global(.dark) .status-tile__progress {
		background: rgba(30, 41, 59, 0.6);
	}

	.status-tile__fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 400ms ease;
	}

	.retry-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.9rem;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.3);
		font-size: 0.85rem;
		color: rgb(30 64 175);
	}

	:global(.dark) .retry-banner {
		background: rgba(37, 99, 235, 0.15);
		border-color: rgba(56, 189, 248, 0.25);
		color: rgb(191 219 254);
	}

	.retry-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: linear-gradient(135deg, rgb(37 99 235), rgb(147 51 234));
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
	}

	.analysis-progress-circle {
		position: relative;
		width: 7.5rem;
		height: 7.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.progress-ring {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.progress-ring-bg {
		stroke: rgba(96, 165, 250, 0.25);
	}

	:global(.dark) .progress-ring-bg {
		stroke: rgba(59, 130, 246, 0.3);
	}

	.progress-ring-fill {
		stroke: url(#analysisGradient);
		stroke-linecap: round;
		transition: stroke-dashoffset 0.35s ease;
		filter: drop-shadow(0 0 8px rgba(129, 140, 248, 0.35));
	}

	.progress-text {
		position: absolute;
		font-size: 1.25rem;
		font-weight: 600;
		color: rgb(30 41 59);
	}

	:global(.dark) .progress-text {
		color: rgb(226 232 240);
	}

	.loading-dots {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.loading-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 9999px;
		background: linear-gradient(135deg, rgb(37 99 235), rgb(147 51 234));
		animation: dualPulse 1.4s ease-in-out infinite;
		opacity: 0.7;
	}

	@keyframes dualPulse {
		0%,
		100% {
			transform: translateY(0) scale(0.95);
			opacity: 0.6;
		}

		50% {
			transform: translateY(-0.4rem) scale(1);
			opacity: 1;
		}
	}

	.status-icon-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.9);
		color: rgb(37 99 235);
		box-shadow:
			0 10px 20px -12px rgba(37, 99, 235, 0.6),
			inset 0 1px 0 rgba(255, 255, 255, 0.7);
	}

	.status-icon-wrap--error {
		color: rgb(225 29 72);
		box-shadow:
			0 10px 20px -12px rgba(225, 29, 72, 0.65),
			inset 0 1px 0 rgba(255, 255, 255, 0.7);
	}

	:global(.dark) .status-icon-wrap {
		background: rgba(15, 23, 42, 0.85);
		color: rgb(165 180 252);
	}

	:global(.dark) .status-icon-wrap--error {
		color: rgb(248 113 113);
	}

	.classification-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-align: center;
		padding: 1.5rem;
		border-radius: 1rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		color: rgb(220 38 38);
		min-height: 10rem;
	}

	.error-state span {
		font-size: 0.75rem;
		color: inherit;
		opacity: 0.8;
	}

	:global(.dark) .error-state {
		background: rgba(248, 113, 113, 0.12);
		border-color: rgba(248, 113, 113, 0.35);
		color: rgb(252 165 165);
	}

	.skeleton-row,
	.skeleton-row-short,
	.skeleton-pill {
		border-radius: 0.75rem;
		background: linear-gradient(
			90deg,
			rgba(226, 232, 240, 0.6) 0%,
			rgba(241, 245, 249, 0.9) 50%,
			rgba(226, 232, 240, 0.6) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}

	:global(.dark) .skeleton-row,
	:global(.dark) .skeleton-row-short,
	:global(.dark) .skeleton-pill {
		background: linear-gradient(
			90deg,
			rgba(30, 41, 59, 0.6) 0%,
			rgba(51, 65, 85, 0.9) 50%,
			rgba(30, 41, 59, 0.6) 100%
		);
	}

	.skeleton-row {
		height: 2.5rem;
	}

	.skeleton-row-short {
		height: 2rem;
		width: 80%;
	}

	.skeleton-pill {
		height: 1.75rem;
		width: 6rem;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}

		100% {
			background-position: -200% 0;
		}
	}
</style>
