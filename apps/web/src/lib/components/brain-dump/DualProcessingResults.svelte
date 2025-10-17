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
	import type {
		ProjectContextResult,
		TaskNoteExtractionResult,
		PreparatoryAnalysisResult
	} from '$lib/types/brain-dump';
	import type { StreamingMessage } from '$lib/types/sse-messages';
	import ProjectContextPreview from './ProjectContextPreview.svelte';
	import TasksNotesPreview from './TasksNotesPreview.svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { quintOut, backOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	export let analysisStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed' =
		'not_needed';
	export let contextStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed' =
		'pending';
	export let tasksStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';
	export let analysisResult: PreparatoryAnalysisResult | null = null;
	export let contextResult: ProjectContextResult | null = null;
	export let tasksResult: TaskNoteExtractionResult | null = null;
	export let retryStatus: { attempt: number; maxAttempts: number; processName: string } | null =
		null;
	export let isProcessing = false;
	export let inModal = false; // New prop to adjust layout when in modal
	export let isShortBraindump = false; // New prop for short braindump flow
	export let showContextPanel = false; // Controls whether to show context panel
	export let showAnalysisPanel = false; // Controls whether to show analysis panel

	// Progress indicators
	const analysisProgress = tweened(0, { duration: 300, easing: quintOut });
	const contextProgress = tweened(0, { duration: 300, easing: quintOut });
	const tasksProgress = tweened(0, { duration: 300, easing: quintOut });

	// Update progress based on status
	$: {
		if (analysisStatus === 'processing') analysisProgress.set(50);
		else if (analysisStatus === 'completed') analysisProgress.set(100);
		else if (analysisStatus === 'not_needed') analysisProgress.set(100);
		else if (analysisStatus === 'failed') analysisProgress.set(0);
		else analysisProgress.set(0);
	}

	$: {
		if (contextStatus === 'processing') contextProgress.set(50);
		else if (contextStatus === 'completed') contextProgress.set(100);
		else if (contextStatus === 'not_needed') contextProgress.set(100);
		else if (contextStatus === 'failed') contextProgress.set(0);
		else contextProgress.set(0);
	}

	$: {
		if (tasksStatus === 'processing') tasksProgress.set(50);
		else if (tasksStatus === 'completed') tasksProgress.set(100);
		else if (tasksStatus === 'failed') tasksProgress.set(0);
		else tasksProgress.set(0);
	}

	// Processing steps
	const getProcessingStep = (
		status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed'
	) => {
		switch (status) {
			case 'pending':
				return { text: 'Waiting to start', icon: '⏳' };
			case 'processing':
				return { text: 'Processing', icon: '⚡' };
			case 'completed':
				return { text: 'Complete', icon: '✨' };
			case 'failed':
				return { text: 'Failed', icon: '⚠️' };
			case 'not_needed':
				return { text: 'Not needed', icon: '✅' };
		}
	};

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

<div class="w-full {inModal ? '' : 'max-w-7xl mx-auto'}">
	<!-- Analysis Panel (shown for existing projects) -->
	{#if showAnalysisPanel && analysisStatus !== 'not_needed'}
		<div
			class="analysis-banner mb-4"
			transition:fly={{ y: -20, duration: 400, easing: quintOut }}
		>
			<div class="flex items-center gap-3">
				<div class="icon-wrapper icon-wrapper-analysis">
					<Sparkles class="w-4 h-4" />
				</div>
				<div class="flex-1">
					<div class="flex items-center justify-between">
						<h4 class="analysis-title">Preparatory Analysis</h4>
						<div class="status-icon-sm">
							{#if analysisStatus === 'processing'}
								<LoaderCircle class="w-4 h-4 animate-spin text-amber-500" />
							{:else if analysisStatus === 'completed'}
								<CircleCheck class="w-4 h-4 text-green-500" />
							{:else if analysisStatus === 'failed'}
								<XCircle class="w-4 h-4 text-red-500" />
							{/if}
						</div>
					</div>
					<div class="analysis-content">
						{#if analysisStatus === 'processing'}
							<p class="analysis-text">Analyzing content to optimize processing...</p>
						{:else if analysisStatus === 'completed' && analysisResult}
							<div class="analysis-result">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="classification-badge classification-{analysisResult.braindump_classification}"
									>
										{analysisResult.braindump_classification}
									</span>
									{#if analysisResult.relevant_task_ids.length > 0}
										<span class="analysis-stat">
											{analysisResult.relevant_task_ids.length} relevant task{analysisResult
												.relevant_task_ids.length === 1
												? ''
												: 's'}
										</span>
									{/if}
									{#if analysisResult.new_tasks_detected}
										<span class="analysis-stat">New tasks detected</span>
									{/if}
								</div>
								<p class="analysis-summary">{analysisResult.analysis_summary}</p>
							</div>
						{:else if analysisStatus === 'failed'}
							<p class="analysis-text text-amber-600 dark:text-amber-400">
								Analysis failed - proceeding with full processing
							</p>
						{/if}
					</div>
				</div>
			</div>
			<!-- Progress Bar for analysis -->
			<div class="progress-bar mt-2">
				<div
					class="progress-fill progress-fill-analysis"
					style="width: {$analysisProgress}%"
				></div>
			</div>
		</div>
	{/if}

	<!-- Main grid with mobile-first responsive design -->
	<div
		class="flex flex-col gap-4 {showContextPanel
			? 'sm:grid sm:grid-cols-2'
			: 'max-w-2xl mx-auto'} {inModal ? '' : 'min-h-[400px]'} md:gap-6"
	>
		<!-- Left side: Project Context (only shown when needed) -->
		{#if showContextPanel}
			<div
				class="processing-card"
				transition:fly={{ x: -20, duration: 400, easing: quintOut }}
			>
				<!-- Card Header with Progress -->
				<div class="card-header">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="icon-wrapper icon-wrapper-context">
								<Brain class="w-5 h-5" />
							</div>
							<div>
								<h3 class="card-title">Project Context</h3>
								<p class="card-subtitle">
									{#if isShortBraindump && contextStatus === 'pending'}
										Update required based on tasks
									{:else}
										{getProcessingStep(contextStatus).text}
									{/if}
								</p>
							</div>
						</div>
						<div class="status-icon">
							{#if contextStatus === 'processing'}
								<div transition:scale={{ duration: 200 }}>
									<LoaderCircle class="w-5 h-5 animate-spin text-blue-500" />
								</div>
							{:else if contextStatus === 'completed'}
								<div transition:scale={{ duration: 200, easing: backOut }}>
									<CircleCheck class="w-5 h-5 text-green-500" />
								</div>
							{:else if contextStatus === 'failed'}
								<div transition:scale={{ duration: 200 }}>
									<XCircle class="w-5 h-5 text-red-500" />
								</div>
							{/if}
						</div>
					</div>
					<!-- Progress Bar -->
					<div class="progress-bar">
						<div
							class="progress-fill progress-fill-context"
							style="width: {$contextProgress}%"
						></div>
					</div>
				</div>

				<!-- Card Content -->
				<div class="card-content">
					{#if contextStatus === 'pending'}
						<div class="empty-state" transition:fade={{ duration: 200 }}>
							<div class="pulse-dot"></div>
							<p>Preparing to analyze...</p>
						</div>
					{:else if contextStatus === 'processing'}
						{#if !contextResult}
							<div class="skeleton-container" transition:fade={{ duration: 200 }}>
								<div class="skeleton skeleton-title"></div>
								<div class="skeleton skeleton-text"></div>
								<div class="skeleton skeleton-text" style="width: 80%"></div>
								<div class="skeleton skeleton-tags">
									<div class="skeleton-tag"></div>
									<div class="skeleton-tag"></div>
									<div class="skeleton-tag"></div>
								</div>
							</div>
						{:else}
							<div transition:fade={{ duration: 300 }}>
								<ProjectContextPreview result={contextResult} />
							</div>
						{/if}
					{:else if contextStatus === 'completed' && contextResult}
						<div transition:fade={{ duration: 300 }}>
							<ProjectContextPreview result={contextResult} />
						</div>
					{:else if contextStatus === 'failed'}
						<div class="error-state" transition:fade={{ duration: 200 }}>
							<TriangleAlert class="w-5 h-5" />
							<p>Failed to process context</p>
							<span>You can still proceed with tasks</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Right side (or full width): Tasks & Notes -->
		<div
			class="processing-card"
			transition:fly={{ x: showContextPanel ? 20 : 0, duration: 400, easing: quintOut }}
		>
			<!-- Card Header with Progress -->
			<div class="card-header">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="icon-wrapper icon-wrapper-tasks">
							<FileText class="w-5 h-5" />
						</div>
						<div>
							<h3 class="card-title">Tasks & Notes</h3>
							<p class="card-subtitle">
								{getProcessingStep(tasksStatus).text}
							</p>
						</div>
					</div>
					<div class="status-icon">
						{#if tasksStatus === 'processing'}
							<div transition:scale={{ duration: 200 }}>
								<LoaderCircle class="w-5 h-5 animate-spin text-purple-500" />
							</div>
						{:else if tasksStatus === 'completed'}
							<div transition:scale={{ duration: 200, easing: backOut }}>
								<CircleCheck class="w-5 h-5 text-green-500" />
							</div>
						{:else if tasksStatus === 'failed'}
							<div transition:scale={{ duration: 200 }}>
								<XCircle class="w-5 h-5 text-red-500" />
							</div>
						{/if}
					</div>
				</div>
				<!-- Progress Bar -->
				<div class="progress-bar">
					<div
						class="progress-fill progress-fill-tasks"
						style="width: {$tasksProgress}%"
					></div>
				</div>
			</div>

			<!-- Card Content -->
			<div class="card-content">
				{#if tasksStatus === 'pending'}
					<div class="empty-state" transition:fade={{ duration: 200 }}>
						<div class="pulse-dot"></div>
						<p>Preparing to extract...</p>
					</div>
				{:else if tasksStatus === 'processing'}
					{#if !tasksResult || !tasksResult.tasks || !Array.isArray(tasksResult.tasks)}
						<div class="skeleton-container" transition:fade={{ duration: 200 }}>
							<!-- Task skeletons -->
							<div class="skeleton-task">
								<div class="skeleton skeleton-checkbox"></div>
								<div class="flex-1">
									<div class="skeleton skeleton-title" style="width: 60%"></div>
									<div class="skeleton skeleton-text" style="width: 90%"></div>
								</div>
							</div>
							<div class="skeleton-task">
								<div class="skeleton skeleton-checkbox"></div>
								<div class="flex-1">
									<div class="skeleton skeleton-title" style="width: 45%"></div>
									<div class="skeleton skeleton-text" style="width: 75%"></div>
								</div>
							</div>
							<div class="skeleton-task">
								<div class="skeleton skeleton-checkbox"></div>
								<div class="flex-1">
									<div class="skeleton skeleton-title" style="width: 70%"></div>
									<div class="skeleton skeleton-text" style="width: 85%"></div>
								</div>
							</div>
						</div>
					{:else}
						<div transition:fade={{ duration: 300 }}>
							<TasksNotesPreview result={tasksResult} />
						</div>
					{/if}
				{:else if tasksStatus === 'completed' && tasksResult}
					<div transition:fade={{ duration: 300 }}>
						<TasksNotesPreview result={tasksResult} />
					</div>
				{:else if tasksStatus === 'failed'}
					<div class="error-state" transition:fade={{ duration: 200 }}>
						<TriangleAlert class="w-5 h-5" />
						<p>Failed to extract items</p>
						<span>The retry mechanism will attempt to recover</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Context not needed indicator for short braindumps -->
	{#if isShortBraindump && contextStatus === 'not_needed' && tasksStatus === 'completed'}
		<div class="mt-4" transition:fade={{ duration: 300 }}>
			<div class="context-not-needed-indicator">
				<div class="flex items-center gap-2">
					<CircleCheck class="w-5 h-5 text-green-500" />
					<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
						No context update needed - tasks are self-contained
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Retry status indicator -->
	{#if retryStatus}
		<div class="mt-4" transition:fade={{ duration: 200 }}>
			<div class="retry-indicator">
				<LoaderCircle class="w-4 h-4 animate-spin text-amber-500" />
				<p>
					Retrying {retryStatus.processName}
					<span class="retry-attempt"
						>Attempt {retryStatus.attempt}/{retryStatus.maxAttempts}</span
					>
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Context not needed indicator */
	.context-not-needed-indicator {
		background: rgb(243 250 247);
		border: 1px solid rgb(134 239 172);
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.dark) .context-not-needed-indicator {
		background: rgb(22 30 26);
		border-color: rgb(34 80 50);
	}

	/* Apple-inspired card design */
	.processing-card {
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 1rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow:
			0 1px 3px 0 rgb(0 0 0 / 0.1),
			0 1px 2px -1px rgb(0 0 0 / 0.1);
		transition: box-shadow 0.3s ease;
	}

	:global(.dark) .processing-card {
		background: rgb(17 24 39);
		border-color: rgb(55 65 81);
		box-shadow:
			0 1px 3px 0 rgb(0 0 0 / 0.3),
			0 1px 2px -1px rgb(0 0 0 / 0.3);
	}

	.processing-card:hover {
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
	}

	:global(.dark) .processing-card:hover {
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.3),
			0 2px 4px -2px rgb(0 0 0 / 0.3);
	}

	/* Card Header with mobile-optimized padding */
	.card-header {
		padding: 1rem;
		border-bottom: 1px solid rgb(229 231 235);
		background: linear-gradient(to bottom, rgb(249 250 251), rgb(243 244 246));
	}

	/* Larger padding on bigger screens */
	@media (min-width: 640px) {
		.card-header {
			padding: 1.25rem;
		}
	}

	:global(.dark) .card-header {
		border-bottom-color: rgb(55 65 81);
		background: linear-gradient(to bottom, rgb(31 41 55), rgb(17 24 39));
	}

	.card-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgb(17 24 39);
		margin: 0;
	}

	:global(.dark) .card-title {
		color: rgb(243 244 246);
	}

	.card-subtitle {
		font-size: 0.75rem;
		color: rgb(107 114 128);
		margin: 0.125rem 0 0;
	}

	:global(.dark) .card-subtitle {
		color: rgb(156 163 175);
	}

	/* Icon Wrapper */
	.icon-wrapper {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--gradient-from), var(--gradient-to));
		color: white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.icon-wrapper-context {
		--gradient-from: rgb(59 130 246);
		--gradient-to: rgb(99 102 241);
	}

	.icon-wrapper-tasks {
		--gradient-from: rgb(168 85 247);
		--gradient-to: rgb(236 72 153);
	}

	/* Status Icon */
	.status-icon {
		display: flex;
		align-items: center;
	}

	/* Progress Bar */
	.progress-bar {
		height: 3px;
		background: rgb(229 231 235);
		position: relative;
		overflow: hidden;
	}

	:global(.dark) .progress-bar {
		background: rgb(55 65 81);
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease;
		background: linear-gradient(90deg, var(--fill-from), var(--fill-to));
		box-shadow: 0 0 10px var(--fill-glow);
	}

	.progress-fill-context {
		--fill-from: rgb(59 130 246);
		--fill-to: rgb(99 102 241);
		--fill-glow: rgba(59, 130, 246, 0.4);
	}

	.progress-fill-tasks {
		--fill-from: rgb(168 85 247);
		--fill-to: rgb(236 72 153);
		--fill-glow: rgba(168, 85, 247, 0.4);
	}

	/* Card Content with mobile-optimized height */
	.card-content {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
		/* Mobile: More generous height, Desktop: Original constraints */
		max-height: min(40vh, 20rem);
	}

	/* Increase content height on larger screens */
	@media (min-width: 640px) {
		.card-content {
			max-height: min(60vh, 24rem);
		}
	}

	/* For mobile in modal, ensure both cards are visible */
	@media (max-width: 639px) {
		.processing-card {
			/* Ensure cards don't take up full viewport on mobile */
			max-height: 35vh;
		}

		.card-content {
			/* More constrained on mobile to fit both cards */
			max-height: min(25vh, 16rem);
			padding: 1rem;
		}
	}

	/* Empty State with mobile optimization */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 8rem;
		gap: 0.75rem;
	}

	/* Larger on bigger screens */
	@media (min-width: 640px) {
		.empty-state {
			min-height: 10rem;
			gap: 1rem;
		}
	}

	.empty-state p {
		font-size: 0.875rem;
		color: rgb(107 114 128);
		margin: 0;
	}

	:global(.dark) .empty-state p {
		color: rgb(156 163 175);
	}

	/* Pulse Dot */
	.pulse-dot {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: rgb(156 163 175);
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Skeleton Loading */
	.skeleton-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.skeleton {
		background: linear-gradient(
			90deg,
			rgb(229 231 235) 0%,
			rgb(243 244 246) 50%,
			rgb(229 231 235) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
		border-radius: 0.375rem;
	}

	:global(.dark) .skeleton {
		background: linear-gradient(90deg, rgb(55 65 81) 0%, rgb(75 85 99) 50%, rgb(55 65 81) 100%);
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.skeleton-title {
		height: 1.25rem;
		width: 50%;
		margin-bottom: 0.5rem;
	}

	.skeleton-text {
		height: 0.875rem;
		margin-bottom: 0.375rem;
	}

	.skeleton-tags {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.skeleton-tag {
		height: 1.5rem;
		width: 4rem;
		border-radius: 9999px;
		background: rgb(229 231 235);
	}

	:global(.dark) .skeleton-tag {
		background: rgb(55 65 81);
	}

	.skeleton-task {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
	}

	:global(.dark) .skeleton-task {
		border-color: rgb(55 65 81);
	}

	.skeleton-checkbox {
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 0.25rem;
		background: rgb(229 231 235);
		flex-shrink: 0;
	}

	:global(.dark) .skeleton-checkbox {
		background: rgb(55 65 81);
	}

	/* Error State with mobile optimization */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 8rem;
		gap: 0.5rem;
		padding: 1.5rem;
		background: rgb(254 242 242);
		border: 1px solid rgb(254 226 226);
		border-radius: 0.75rem;
	}

	/* Larger on bigger screens */
	@media (min-width: 640px) {
		.error-state {
			min-height: 10rem;
			gap: 0.75rem;
			padding: 2rem;
		}
	}

	:global(.dark) .error-state {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.2);
	}

	.error-state svg {
		color: rgb(239 68 68);
	}

	.error-state p {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgb(185 28 28);
		margin: 0;
	}

	:global(.dark) .error-state p {
		color: rgb(252 165 165);
	}

	.error-state span {
		font-size: 0.75rem;
		color: rgb(153 27 27);
	}

	:global(.dark) .error-state span {
		color: rgb(254 202 202);
	}

	/* Retry Indicator */
	.retry-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: linear-gradient(135deg, rgb(254 243 199), rgb(254 240 138));
		border: 1px solid rgb(251 191 36);
		border-radius: 0.75rem;
		box-shadow: 0 2px 4px rgba(251, 191, 36, 0.1);
	}

	:global(.dark) .retry-indicator {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1));
		border-color: rgba(251, 191, 36, 0.3);
	}

	.retry-indicator p {
		font-size: 0.875rem;
		color: rgb(146 64 14);
		margin: 0;
		font-weight: 500;
	}

	:global(.dark) .retry-indicator p {
		color: rgb(254 215 170);
	}

	.retry-attempt {
		opacity: 0.8;
		margin-left: 0.5rem;
		font-weight: normal;
	}

	/* Enhanced glowing hammer with smooth transitions */
	.glowing-hammer {
		animation:
			pulse-glow 2s ease-in-out infinite,
			rotate-sway 3s ease-in-out infinite;
		display: inline-block; /* required for transforms */
		text-shadow: 0 0 0 currentColor;
		font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', 'Symbola', sans-serif;
		transition: filter var(--transition-normal) var(--ease-out);
	}

	/* Define light mode by default */
	.glowing-hammer {
		filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.8));
	}

	@media (prefers-color-scheme: dark) {
		.glowing-hammer {
			filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
			filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.8));
		}
		50% {
			transform: scale(1.05) rotate(0deg);
			filter: drop-shadow(0 0 16px rgba(0, 0, 0, 1)) drop-shadow(0 0 24px rgba(0, 0, 0, 0.6));
		}
	}

	/* Dark mode overrides within keyframes */
	@media (prefers-color-scheme: dark) {
		@keyframes pulse-glow {
			0%,
			100% {
				transform: scale(1) rotate(0deg);
				filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
			}
			50% {
				transform: scale(1.05) rotate(0deg);
				filter: drop-shadow(0 0 16px rgba(255, 255, 255, 1))
					drop-shadow(0 0 24px rgba(255, 255, 255, 0.6));
			}
		}
	}

	@keyframes rotate-sway {
		0%,
		100% {
			transform: rotate(-5deg);
		}
		50% {
			transform: rotate(5deg);
		}
	}

	/* Analysis Banner Styles */
	.analysis-banner {
		background: linear-gradient(135deg, rgb(254 252 232), rgb(254 249 195));
		border: 1px solid rgb(250 204 21);
		border-radius: 1rem;
		padding: 1rem 1.25rem;
		box-shadow: 0 2px 4px rgba(250, 204, 21, 0.1);
	}

	:global(.dark) .analysis-banner {
		background: linear-gradient(135deg, rgba(250, 204, 21, 0.1), rgba(245, 158, 11, 0.1));
		border-color: rgba(250, 204, 21, 0.3);
	}

	.icon-wrapper-analysis {
		--gradient-from: rgb(245 158 11);
		--gradient-to: rgb(251 146 60);
	}

	.analysis-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgb(120 53 15);
		margin: 0;
	}

	:global(.dark) .analysis-title {
		color: rgb(254 215 170);
	}

	.analysis-content {
		margin-top: 0.5rem;
	}

	.analysis-text {
		font-size: 0.8125rem;
		color: rgb(146 64 14);
		margin: 0;
	}

	:global(.dark) .analysis-text {
		color: rgb(254 215 170);
	}

	.analysis-result {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.classification-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.classification-strategic {
		background: rgb(219 234 254);
		color: rgb(30 58 138);
	}

	:global(.dark) .classification-strategic {
		background: rgba(59, 130, 246, 0.2);
		color: rgb(147 197 253);
	}

	.classification-tactical {
		background: rgb(233 213 255);
		color: rgb(88 28 135);
	}

	:global(.dark) .classification-tactical {
		background: rgba(168, 85, 247, 0.2);
		color: rgb(216 180 254);
	}

	.classification-mixed {
		background: rgb(254 240 138);
		color: rgb(120 53 15);
	}

	:global(.dark) .classification-mixed {
		background: rgba(250, 204, 21, 0.2);
		color: rgb(254 215 170);
	}

	.classification-status_update {
		background: rgb(209 250 229);
		color: rgb(6 78 59);
	}

	:global(.dark) .classification-status_update {
		background: rgba(52, 211, 153, 0.2);
		color: rgb(167 243 208);
	}

	.classification-unrelated {
		background: rgb(243 244 246);
		color: rgb(75 85 99);
	}

	:global(.dark) .classification-unrelated {
		background: rgba(107, 114, 128, 0.2);
		color: rgb(209 213 219);
	}

	.analysis-stat {
		font-size: 0.75rem;
		color: rgb(120 53 15);
		background: white;
		padding: 0.25rem 0.625rem;
		border-radius: 0.375rem;
		border: 1px solid rgb(253 224 71);
	}

	:global(.dark) .analysis-stat {
		color: rgb(254 215 170);
		background: rgba(0, 0, 0, 0.2);
		border-color: rgba(250, 204, 21, 0.3);
	}

	.analysis-summary {
		font-size: 0.8125rem;
		color: rgb(120 53 15);
		margin: 0;
		line-height: 1.5;
	}

	:global(.dark) .analysis-summary {
		color: rgb(253 224 71);
	}

	.status-icon-sm {
		display: flex;
		align-items: center;
	}

	.progress-fill-analysis {
		--fill-from: rgb(245 158 11);
		--fill-to: rgb(251 146 60);
		--fill-glow: rgba(245, 158, 11, 0.4);
	}
</style>
