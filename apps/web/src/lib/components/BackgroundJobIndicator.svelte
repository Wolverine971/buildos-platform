<!-- apps/web/src/lib/components/BackgroundJobIndicator.svelte -->
<script lang="ts">
	import { fly, scale } from 'svelte/transition';
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		X,
		ChevronUp,
		ChevronDown,
		ArrowRight,
		RefreshCw
	} from 'lucide-svelte';
	import {
		activeBackgroundJobs,
		processingJobs,
		completedJobs,
		failedJobs
	} from '$lib/stores/backgroundJobs';
	import { backgroundBrainDumpService } from '$lib/services/braindump-background.service';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';

	let isExpanded = false;
	let showIndicator = true;
	let navigatedProjects = new Set<string>();

	// Computed values
	$: hasActiveJobs = $activeBackgroundJobs.length > 0;
	$: recentCompletedJobs = $completedJobs.filter((job) => {
		const isRecent = Date.now() - (job.endTime || job.startTime) < 30000; // 30 seconds
		const hasProjectId = job.result?.projectId;
		// Hide if user has navigated to this project
		const notNavigated = !hasProjectId || !navigatedProjects.has(job.result.projectId);
		return isRecent && notNavigated;
	});
	$: hasRecentCompletedJobs = recentCompletedJobs.length > 0;
	$: recentFailedJobs = $failedJobs.filter((job) => {
		const isRecent = Date.now() - (job.endTime || job.startTime) < 60000; // 1 minute
		return isRecent;
	});
	$: hasRecentFailedJobs = recentFailedJobs.length > 0;

	$: shouldShowIndicator =
		showIndicator && (hasActiveJobs || hasRecentCompletedJobs || hasRecentFailedJobs);

	// Auto-hide indicator when user navigates to a completed project
	$: if ($page.params.id) {
		const currentProjectId = $page.params.id;
		// Check if this is a project from a completed job
		const matchingJob = $completedJobs.find(
			(job) => job.result?.projectId === currentProjectId
		);
		if (matchingJob) {
			navigatedProjects.add(currentProjectId);
			// Auto-collapse if expanded and this was the only completed job
			if (
				isExpanded &&
				recentCompletedJobs.length === 1 &&
				!hasActiveJobs &&
				!hasRecentFailedJobs
			) {
				isExpanded = false;
			}
		}
	}

	$: if (hasRecentCompletedJobs) {
		console.log(hasRecentCompletedJobs);
		console.log(recentCompletedJobs);
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function hideIndicator() {
		showIndicator = false;
		// Re-show after 5 seconds if there are still active jobs
		setTimeout(() => {
			if (hasActiveJobs) {
				showIndicator = true;
			}
		}, 5000);
	}

	function formatDuration(startTime: number, endTime?: number): string {
		const duration = Math.floor(((endTime || Date.now()) - startTime) / 1000);
		if (duration < 60) {
			return `${duration}s`;
		}
		const minutes = Math.floor(duration / 60);
		const seconds = duration % 60;
		return `${minutes}m ${seconds}s`;
	}

	function handleViewProject(projectId?: string) {
		if (projectId) {
			// Mark as navigated before navigation
			navigatedProjects.add(projectId);
			goto(`/projects/${projectId}`);
		}
	}

	function handleRetry(jobId: string) {
		backgroundBrainDumpService.retryJob(jobId);
	}
</script>

{#if shouldShowIndicator}
	<div class="fixed bottom-4 right-4 z-50 max-w-md" transition:fly={{ y: 100, duration: 300 }}>
		<!-- Collapsed View -->
		{#if !isExpanded}
			<div
				class="group bg-card shadow-ink-strong rounded-xl border border-border backdrop-blur-sm hover:shadow-3xl hover:scale-105 hover:border-border transition-all duration-200 cursor-pointer"
				transition:scale={{ duration: 200, start: 0.95 }}
			>
				<Button
					onclick={hasRecentCompletedJobs && recentCompletedJobs[0]?.result?.projectId
						? () => handleViewProject(recentCompletedJobs[0].result?.projectId)
						: toggleExpanded}
					class="w-full p-4 flex items-center justify-between rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
					variant="ghost"
					btnType="container"
					size="md"
				>
					<div class="flex items-center gap-3">
						{#if $processingJobs.length > 0}
							<div class="relative">
								<LoaderCircle
									class="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400"
								/>
								<div
									class="absolute inset-0 bg-purple-600 dark:bg-purple-400 opacity-20 blur-xl animate-pulse"
								></div>
							</div>
							<div>
								<span
									class="text-sm font-semibold text-foreground"
								>
									Processing brain dump
								</span>
								<span class="block text-xs text-muted-foreground">
									Analyzing content...
								</span>
							</div>
						{:else if hasRecentCompletedJobs}
							<div class="relative">
								<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
								<div
									class="absolute inset-0 bg-green-600 dark:bg-green-400 opacity-20 blur-xl animate-pulse"
								></div>
							</div>
							<div>
								<span
									class="text-sm font-semibold text-foreground"
								>
									Brain dump completed
								</span>
								{#if recentCompletedJobs[0]?.result?.projectId}
									<span
										class="block text-xs text-green-600 dark:text-green-400 font-semibold group-hover:underline flex items-center gap-1"
									>
										Click to view project
										<ArrowRight
											class="w-3 h-3 group-hover:translate-x-0.5 transition-transform"
										/>
									</span>
								{/if}
							</div>
						{:else if hasRecentFailedJobs}
							<div class="relative">
								<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
								<div
									class="absolute inset-0 bg-red-600 dark:bg-red-400 opacity-20 blur-xl animate-pulse"
								></div>
							</div>
							<div>
								<span
									class="text-sm font-semibold text-foreground"
								>
									Processing failed
								</span>
								<span
									class="block text-xs text-red-600 dark:text-red-400 group-hover:underline"
								>
									Click to retry
								</span>
							</div>
						{/if}
					</div>

					<div class="flex items-center gap-2">
						{#if $activeBackgroundJobs.length > 1}
							<span
								class="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full font-medium"
							>
								{$activeBackgroundJobs.length} active
							</span>
						{/if}
						<div
							class="p-1 rounded-lg bg-muted group-hover:bg-muted dark:group-hover:bg-gray-600 transition-colors"
						>
							<ChevronUp
								class="w-4 h-4 text-muted-foreground group-hover:text-foreground dark:group-hover:text-muted-foreground transition-colors"
							/>
						</div>
					</div>
				</Button>
			</div>
		{/if}

		<!-- Expanded View -->
		{#if isExpanded}
			<div
				class="bg-card shadow-ink-strong rounded-xl border border-border overflow-hidden backdrop-blur-sm"
				transition:scale={{ duration: 200, start: 0.95 }}
			>
				<!-- Header -->
				<div
					class="p-4 border-b border-border bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"
				>
					<div class="flex items-center justify-between">
						<h3
							class="text-sm font-semibold text-foreground flex items-center gap-2"
						>
							<span
								class="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-pulse"
							></span>
							Background Processing
						</h3>
						<div class="flex items-center gap-1">
							<Button
								onclick={hideIndicator}
								class="p-1.5 min-h-0 min-w-0 hover:bg-muted rounded-lg transition-all duration-200 hover:shadow-ink"
								variant="ghost"
								size="sm"
								btnType="container"
								aria-label="Hide indicator"
							>
								<X
									class="w-4 h-4 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground"
								/>
							</Button>
							<Button
								onclick={toggleExpanded}
								class="p-1.5 min-h-0 min-w-0 hover:bg-muted rounded-lg transition-all duration-200 hover:shadow-ink"
								variant="ghost"
								size="sm"
								btnType="container"
								aria-label="Collapse"
							>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground"
								/>
							</Button>
						</div>
					</div>
				</div>

				<!-- Jobs List -->
				<div
					class="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
				>
					<!-- Active Jobs -->
					{#each $activeBackgroundJobs as job (job.id)}
						<div
							class="p-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
						>
							<div class="flex items-start gap-3">
								<div class="relative">
									<LoaderCircle
										class="w-4 h-4 mt-0.5 animate-spin text-purple-600 dark:text-purple-400 flex-shrink-0"
									/>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground">
										{job.status === 'processing' ? 'Processing' : 'Queued'}
									</p>
									<p
										class="text-xs text-muted-foreground mt-1 truncate"
									>
										{job.projectId
											? 'Updating existing project'
											: 'Creating new project'}
									</p>
									<div class="flex items-center gap-2 mt-1">
										<span class="text-xs text-muted-foreground">
											{formatDuration(job.startTime)}
										</span>
										<div
											class="flex-1 h-1 bg-muted rounded-full overflow-hidden"
										>
											<div
												class="h-full bg-purple-600 dark:bg-purple-400 animate-pulse"
												style="width: 60%"
											></div>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/each}

					<!-- Recent Completed Jobs -->
					{#each recentCompletedJobs as job (job.id)}
						<div
							class="p-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors bg-green-50/50 dark:bg-green-900/10"
						>
							<div class="flex items-start gap-3">
								<div class="relative">
									<CheckCircle
										class="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0"
									/>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground">
										Completed successfully
									</p>
									{#if job.result?.operationCount}
										<p class="text-xs text-muted-foreground mt-1">
											{job.result.operationCount} operations applied
										</p>
									{/if}
									{#if job.result?.projectId}
										<Button
											onclick={() => handleViewProject(job.result?.projectId)}
											class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-900/70 rounded-lg transition-all duration-200 group min-h-0 min-w-0"
											variant="ghost"
											size="sm"
											btnType="container"
										>
											<span>View Project</span>
											<ArrowRight
												class="w-3 h-3 group-hover:translate-x-0.5 transition-transform"
											/>
										</Button>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					<!-- Recent Failed Jobs -->
					{#each recentFailedJobs as job (job.id)}
						<div
							class="p-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors bg-red-50/50 dark:bg-red-900/10"
						>
							<div class="flex items-start gap-3">
								<div class="relative">
									<AlertCircle
										class="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 flex-shrink-0"
									/>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground">
										Processing failed
									</p>
									<p
										class="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2"
									>
										{job.error || 'An unexpected error occurred'}
									</p>
									<Button
										onclick={() => handleRetry(job.id)}
										class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900/70 rounded-lg transition-all duration-200 group min-h-0 min-w-0"
										variant="ghost"
										size="sm"
										btnType="container"
									>
										<RefreshCw
											class="w-3 h-3 group-hover:rotate-180 transition-transform duration-500"
										/>
										<span>Retry</span>
									</Button>
								</div>
							</div>
						</div>
					{/each}
					<!-- Empty state -->
					{#if $activeBackgroundJobs.length === 0 && recentCompletedJobs.length === 0 && recentFailedJobs.length === 0}
						<div class="p-8 text-center">
							<p class="text-sm text-muted-foreground">
								No background jobs at the moment
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Custom scrollbar styles */
	.scrollbar-thin {
		scrollbar-width: thin;
	}

	.scrollbar-thin::-webkit-scrollbar {
		width: 6px;
	}

	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}

	.scrollbar-thin::-webkit-scrollbar-thumb {
		background-color: rgb(209 213 219);
		border-radius: 3px;
	}

	:global(.dark) .scrollbar-thin::-webkit-scrollbar-thumb {
		background-color: rgb(75 85 99);
	}

	/* Line clamp utility */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
