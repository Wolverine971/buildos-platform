<!-- apps/web/src/lib/components/admin/migration/RecentRuns.svelte -->
<!-- Displays recent migration run history with status badges -->
<script lang="ts">
	import { Play, Pause, CheckCircle, XCircle, Clock, RotateCcw, User } from 'lucide-svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export interface RecentRun {
		runId: string;
		status: string;
		startedAt: string;
		completedAt: string | null;
		projectsProcessed: number;
		projectsFailed: number;
		initiatedBy: string;
		initiatedByEmail: string;
	}

	export interface ActiveRun {
		runId: string;
		status: string;
		startedAt: string;
		projectsProcessed: number;
		lockedBy: string;
	}

	let {
		activeRun,
		recentRuns,
		onViewRun,
		onRetryRun,
		onPauseRun,
		onResumeRun
	}: {
		activeRun: ActiveRun | null;
		recentRuns: RecentRun[];
		onViewRun?: (runId: string) => void;
		onRetryRun?: (runId: string) => void;
		onPauseRun?: (runId: string) => void;
		onResumeRun?: (runId: string) => void;
	} = $props();

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	function formatDuration(startStr: string, endStr: string | null): string {
		if (!endStr) return 'In progress';
		const start = new Date(startStr);
		const end = new Date(endStr);
		const diffMs = end.getTime() - start.getTime();
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);

		if (diffSecs < 60) return `${diffSecs}s`;
		if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s`;
		return `${diffHours}h ${diffMins % 60}m`;
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'failed':
				return XCircle;
			case 'in_progress':
				return Play;
			case 'paused':
				return Pause;
			default:
				return Clock;
		}
	}

	function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'info' | 'default' {
		switch (status) {
			case 'completed':
				return 'success';
			case 'failed':
				return 'error';
			case 'in_progress':
				return 'warning';
			case 'paused':
				return 'info';
			default:
				return 'default';
		}
	}
</script>

<div class="space-y-4">
	<!-- Active Run Banner -->
	{#if activeRun}
		<div
			class="rounded-lg border-2 border-purple-500 bg-purple-50 p-4 dark:border-purple-400 dark:bg-purple-900/20"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500 text-white"
					>
						<Play class="h-5 w-5" />
					</div>
					<div>
						<p class="font-semibold text-purple-900 dark:text-purple-100">
							Migration In Progress
						</p>
						<p class="text-sm text-purple-700 dark:text-purple-300">
							{activeRun.projectsProcessed} projects processed
							<span class="text-purple-500">•</span>
							Started {formatDate(activeRun.startedAt)}
						</p>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<Badge size="sm" variant="warning">
						{activeRun.status.replace('_', ' ')}
					</Badge>
					{#if activeRun.status === 'in_progress' && onPauseRun}
						<Button
							variant="outline"
							size="sm"
							onclick={() => onPauseRun?.(activeRun.runId)}
						>
							<Pause class="h-3 w-3" />
							Pause
						</Button>
					{/if}
					{#if activeRun.status === 'paused' && onResumeRun}
						<Button
							variant="primary"
							size="sm"
							onclick={() => onResumeRun?.(activeRun.runId)}
						>
							<Play class="h-3 w-3" />
							Resume
						</Button>
					{/if}
				</div>
			</div>
			<p class="mt-2 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
				<User class="h-3 w-3" />
				Locked by {activeRun.lockedBy}
			</p>
		</div>
	{/if}

	<!-- Recent Runs List -->
	<div class="space-y-2">
		<h3 class="text-sm font-semibold text-foreground">Recent Runs</h3>

		{#if recentRuns.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">
				No migration runs recorded yet.
			</p>
		{:else}
			<div class="space-y-2">
				{#each recentRuns as run}
					{@const StatusIcon = getStatusIcon(run.status)}
					<div
						class="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted"
					>
						<div
							class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-full {run.status ===
									'completed'
										? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
										: run.status === 'failed'
											? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
											: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}"
								>
									<StatusIcon class="h-4 w-4" />
								</div>
								<div>
									<p class="font-medium text-foreground">
										{run.projectsProcessed} projects
										{#if run.projectsFailed > 0}
											<span class="text-rose-600 dark:text-rose-400">
												({run.projectsFailed} failed)
											</span>
										{/if}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatDate(run.startedAt)}
										{#if run.completedAt}
											<span class="text-muted-foreground">•</span>
											Duration: {formatDuration(
												run.startedAt,
												run.completedAt
											)}
										{/if}
									</p>
								</div>
							</div>

							<div class="flex items-center gap-2">
								<Badge size="sm" variant={getStatusColor(run.status)}>
									{run.status.replace('_', ' ')}
								</Badge>
								{#if run.status === 'failed' && onRetryRun}
									<Button
										variant="outline"
										size="sm"
										onclick={() => onRetryRun?.(run.runId)}
									>
										<RotateCcw class="h-3 w-3" />
										Retry
									</Button>
								{/if}
								{#if onViewRun}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => onViewRun?.(run.runId)}
									>
										View
									</Button>
								{/if}
							</div>
						</div>

						{#if run.initiatedByEmail}
							<p
								class="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
							>
								<User class="h-3 w-3" />
								{run.initiatedByEmail}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
