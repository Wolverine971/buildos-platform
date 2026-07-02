<!-- apps/web/src/lib/components/admin/ProjectActivityChart.svelte -->
<script lang="ts">
	type ProjectUsageMetric = {
		key: string;
		label: string;
		value: number;
		colorClass: string;
	};

	let { projects = [] }: { projects?: any[] } = $props();

	const metricConfig = [
		{ key: 'openTasks', label: 'Open', colorClass: 'bg-sky-500' },
		{ key: 'completedTasks', label: 'Done', colorClass: 'bg-emerald-500' },
		{ key: 'documents', label: 'Docs', colorClass: 'bg-amber-500' },
		{ key: 'goals', label: 'Goals', colorClass: 'bg-rose-500' },
		{ key: 'plans', label: 'Plans', colorClass: 'bg-cyan-500' },
		{ key: 'chats', label: 'Chats', colorClass: 'bg-zinc-500' }
	] as const;

	function numeric(value: unknown): number {
		return typeof value === 'number' && Number.isFinite(value) ? value : 0;
	}

	function formatRelativeDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function shortName(name: string): string {
		return name.length > 34 ? `${name.slice(0, 34).trim()}...` : name;
	}

	let chartData = $derived(
		projects
			.filter((project) => project.name)
			.map((project) => {
				const completedTasks = numeric(project.completed_task_count);
				const totalTasks = numeric(project.task_count);
				const openTasks = Math.max(
					project.open_task_count ?? totalTasks - completedTasks,
					0
				);
				const metrics: ProjectUsageMetric[] = [
					{
						key: 'openTasks',
						label: 'Open',
						value: openTasks,
						colorClass: 'bg-sky-500'
					},
					{
						key: 'completedTasks',
						label: 'Done',
						value: completedTasks,
						colorClass: 'bg-emerald-500'
					},
					{
						key: 'documents',
						label: 'Docs',
						value: numeric(project.document_count || project.notes_count),
						colorClass: 'bg-amber-500'
					},
					{
						key: 'goals',
						label: 'Goals',
						value: numeric(project.goal_count),
						colorClass: 'bg-rose-500'
					},
					{
						key: 'plans',
						label: 'Plans',
						value: numeric(project.plan_count),
						colorClass: 'bg-cyan-500'
					},
					{
						key: 'chats',
						label: 'Chats',
						value: numeric(project.chat_session_count),
						colorClass: 'bg-zinc-500'
					}
				];
				const totalSignal = metrics.reduce((sum, metric) => sum + metric.value, 0);
				const taskCompletion =
					totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

				return {
					id: project.id,
					name: shortName(project.name),
					fullName: project.name,
					status: project.status || 'unknown',
					lastActivityAt: project.last_activity_at,
					metrics,
					totalSignal,
					taskCompletion
				};
			})
			.filter((project) => project.totalSignal > 0)
			.sort((a, b) => b.totalSignal - a.totalSignal)
			.slice(0, 8)
	);

	let totals = $derived(
		chartData.reduce(
			(acc, project) => {
				acc.projects += 1;
				acc.signals += project.totalSignal;
				for (const metric of project.metrics) {
					acc.byKey[metric.key] = (acc.byKey[metric.key] || 0) + metric.value;
				}
				return acc;
			},
			{ projects: 0, signals: 0, byKey: {} as Record<string, number> }
		)
	);
</script>

{#if chartData.length}
	<div class="rounded-md border border-border bg-background overflow-hidden">
		<div class="grid grid-cols-2 sm:grid-cols-4 border-b border-border bg-muted/30">
			<div class="px-3 py-2">
				<div class="text-sm font-semibold text-foreground">{totals.projects}</div>
				<div class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
					Active Projects
				</div>
			</div>
			<div class="px-3 py-2 border-l border-border">
				<div class="text-sm font-semibold text-foreground">{totals.signals}</div>
				<div class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
					Total Signals
				</div>
			</div>
			<div class="px-3 py-2 border-l border-border">
				<div class="text-sm font-semibold text-sky-600">
					{totals.byKey.openTasks || 0}
				</div>
				<div class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
					Open Tasks
				</div>
			</div>
			<div class="px-3 py-2 border-l border-border">
				<div class="text-sm font-semibold text-rose-600">
					{totals.byKey.goals || 0}
				</div>
				<div class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Goals</div>
			</div>
		</div>

		<div class="p-3 space-y-3">
			<div class="flex flex-wrap gap-x-3 gap-y-1.5">
				{#each metricConfig as metric}
					<div class="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
						<span class="h-2 w-2 rounded-full {metric.colorClass}"></span>
						<span>{metric.label}</span>
					</div>
				{/each}
			</div>

			<div class="space-y-2">
				{#each chartData as project}
					<div
						class="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(180px,1.7fr)_auto] sm:items-center"
					>
						<div class="min-w-0">
							<p
								class="truncate text-xs font-medium text-foreground"
								title={project.fullName}
							>
								{project.name}
							</p>
							<p class="text-[0.6rem] text-muted-foreground">
								{formatRelativeDate(project.lastActivityAt)}
								{#if project.taskCompletion !== null}
									/ {project.taskCompletion}% tasks done
								{/if}
							</p>
						</div>

						<div
							class="flex h-3 min-w-0 overflow-hidden rounded-full bg-muted"
							aria-label={`${project.fullName} usage distribution`}
						>
							{#each project.metrics.filter((metric) => metric.value > 0) as metric}
								<div
									class="h-full min-w-[6px] transition-opacity hover:opacity-80 {metric.colorClass}"
									style="flex-grow: {metric.value}; flex-basis: 0;"
									title={`${project.fullName}: ${metric.value} ${metric.label}`}
								></div>
							{/each}
						</div>

						<div class="text-right text-[0.65rem] text-muted-foreground">
							{project.totalSignal} total
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<div
		class="flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background p-4 text-center"
	>
		<p class="text-sm font-medium text-foreground">No project usage yet</p>
		<p class="text-xs text-muted-foreground">
			Tasks, documents, goals, plans, and chats will appear here.
		</p>
	</div>
{/if}
