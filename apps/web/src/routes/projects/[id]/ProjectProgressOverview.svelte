<!-- apps/web/src/routes/projects/[id]/ProjectProgressOverview.svelte -->
<script lang="ts">
	import {
		CalendarRange,
		CheckCircle2,
		CircleAlert,
		Flag,
		ListChecks,
		TrendingUp
	} from '$lib/icons/lucide';
	import type { Milestone, Project, Risk } from '$lib/types/onto';
	import type { ProjectTasksCoverage } from '$lib/types/project-full-data';

	type TaskSegment = {
		key: 'not_started' | 'in_progress' | 'attention' | 'done';
		label: string;
		count: number;
		colorClass: string;
	};

	type TimelinePoint = {
		key: string;
		kind: 'project-start' | 'today' | 'project-target' | 'milestone';
		label: string;
		date: Date;
		state: string | null;
		milestoneId?: string;
	};

	interface Props {
		project: Project;
		tasksCoverage: ProjectTasksCoverage;
		milestones: Milestone[];
		risks: Risk[];
		onOpenTasks: () => void;
		onOpenMilestone: (milestoneId: string) => void;
	}

	let { project, tasksCoverage, milestones, risks, onOpenTasks, onOpenMilestone }: Props =
		$props();

	const snapshotMs = $derived.by(() => {
		const coverageTime = Date.parse(tasksCoverage.as_of);
		if (Number.isFinite(coverageTime)) return coverageTime;
		const projectTime = Date.parse(project.updated_at);
		return Number.isFinite(projectTime) ? projectTime : 0;
	});

	const taskTotal = $derived(tasksCoverage.total);
	const doneCount = $derived(tasksCoverage.buckets.done.total);
	const completionPercent = $derived(
		taskTotal > 0 ? Math.round((doneCount / taskTotal) * 100) : 0
	);
	const attentionTaskCount = $derived(
		tasksCoverage.buckets.overdue.total + tasksCoverage.buckets.blocked.total
	);

	const taskSegments = $derived.by<TaskSegment[]>(() => [
		{
			key: 'not_started',
			label: 'Not started',
			count: tasksCoverage.buckets.backlog.total + tasksCoverage.buckets.scheduled.total,
			colorClass: 'bg-muted-foreground/35'
		},
		{
			key: 'in_progress',
			label: 'In progress',
			count: tasksCoverage.buckets.in_progress.total,
			colorClass: 'bg-info'
		},
		{
			key: 'attention',
			label: 'Needs attention',
			count: tasksCoverage.buckets.overdue.total + tasksCoverage.buckets.blocked.total,
			colorClass: 'bg-warning'
		},
		{
			key: 'done',
			label: 'Done',
			count: tasksCoverage.buckets.done.total,
			colorClass: 'bg-success'
		}
	]);
	const visibleTaskSegments = $derived(taskSegments.filter((segment) => segment.count > 0));
	const openRisks = $derived(
		risks.filter(
			(risk) => !risk.deleted_at && !['mitigated', 'closed'].includes(risk.state_key)
		)
	);
	const highRiskCount = $derived(
		openRisks.filter((risk) => ['high', 'critical'].includes(risk.impact)).length
	);
	const missedMilestoneCount = $derived(
		milestones.filter((milestone) => {
			if (milestone.deleted_at) return false;
			const state = milestone.effective_state_key ?? milestone.state_key;
			if (state === 'missed') return true;
			if (state === 'completed' || !milestone.due_at) return false;
			const dueMs = Date.parse(milestone.due_at);
			return Number.isFinite(dueMs) && dueMs < snapshotMs;
		}).length
	);

	const trajectory = $derived.by(() => {
		if (project.state_key === 'completed' || (taskTotal > 0 && doneCount === taskTotal)) {
			return {
				label: 'Completed',
				detail: 'All tracked tasks are complete.',
				tone: 'success' as const
			};
		}

		const signalCount = attentionTaskCount + highRiskCount + missedMilestoneCount;
		if (signalCount > 0) {
			const details = [
				tasksCoverage.buckets.overdue.total > 0
					? `${tasksCoverage.buckets.overdue.total} overdue`
					: null,
				tasksCoverage.buckets.blocked.total > 0
					? `${tasksCoverage.buckets.blocked.total} blocked`
					: null,
				highRiskCount > 0
					? `${highRiskCount} high-impact ${highRiskCount === 1 ? 'risk' : 'risks'}`
					: null,
				missedMilestoneCount > 0
					? `${missedMilestoneCount} late ${missedMilestoneCount === 1 ? 'milestone' : 'milestones'}`
					: null
			].filter((detail): detail is string => Boolean(detail));

			return {
				label: 'Needs attention',
				detail: details.join(' · '),
				tone: 'attention' as const
			};
		}

		if (taskTotal === 0) {
			return {
				label: 'Planning',
				detail: 'No tasks are tracked yet.',
				tone: 'neutral' as const
			};
		}

		return {
			label: 'No blockers flagged',
			detail: `${tasksCoverage.buckets.in_progress.total} in progress · ${openRisks.length} open risks`,
			tone: 'clear' as const
		};
	});

	const timelinePoints = $derived.by<TimelinePoint[]>(() => {
		const points: TimelinePoint[] = [];

		function addProjectPoint(
			value: string | null | undefined,
			kind: 'project-start' | 'project-target',
			label: string
		) {
			if (!value) return;
			const date = new Date(value);
			if (!Number.isFinite(date.getTime())) return;
			points.push({ key: kind, kind, label, date, state: null });
		}

		addProjectPoint(project.start_at, 'project-start', 'Project start');
		points.push({
			key: 'today',
			kind: 'today',
			label: 'Today',
			date: new Date(snapshotMs),
			state: null
		});
		addProjectPoint(project.end_at, 'project-target', 'Project target');

		for (const milestone of milestones) {
			if (milestone.deleted_at || !milestone.due_at) continue;
			const date = new Date(milestone.due_at);
			if (!Number.isFinite(date.getTime())) continue;
			points.push({
				key: `milestone-${milestone.id}`,
				kind: 'milestone',
				label: milestone.title,
				date,
				state: milestone.effective_state_key ?? milestone.state_key,
				milestoneId: milestone.id
			});
		}

		points.sort((a, b) => a.date.getTime() - b.date.getTime());
		if (points.length <= 7) return points;

		const todayIndex = points.findIndex((point) => point.kind === 'today');
		const start = Math.max(0, Math.min(todayIndex - 2, points.length - 7));
		return points.slice(start, start + 7);
	});

	function formatDate(value: string | Date | null | undefined): string {
		if (!value) return 'Not set';
		const date = value instanceof Date ? value : new Date(value);
		if (!Number.isFinite(date.getTime())) return 'Not set';
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === new Date(snapshotMs).getFullYear() ? undefined : 'numeric'
		});
	}

	function timelineDotClass(point: TimelinePoint): string {
		if (point.kind === 'today') return 'timeline-dot-today';
		if (point.kind === 'project-start' || point.kind === 'project-target') {
			return 'timeline-dot-project';
		}
		if (point.state === 'completed') return 'timeline-dot-complete';
		if (point.state === 'missed' || point.date.getTime() < snapshotMs) {
			return 'timeline-dot-attention';
		}
		if (point.state === 'in_progress') return 'timeline-dot-active';
		return 'timeline-dot-upcoming';
	}

	function timelineState(point: TimelinePoint): string {
		if (point.kind === 'today') return 'Current position';
		if (point.kind === 'project-start') return 'Start';
		if (point.kind === 'project-target') return 'Target';
		if (point.state === 'completed') return 'Completed';
		if (point.state === 'missed' || point.date.getTime() < snapshotMs) return 'Late';
		if (point.state === 'in_progress') return 'In progress';
		return 'Upcoming';
	}
</script>

<section class="trajectory-surface" aria-labelledby="project-progress-title">
	<header class="trajectory-header">
		<div class="trajectory-status">
			<div
				class={[
					'trajectory-icon',
					trajectory.tone === 'success' && 'bg-success/10 text-success',
					trajectory.tone === 'attention' && 'bg-warning/10 text-warning',
					trajectory.tone === 'clear' && 'bg-info/10 text-info',
					trajectory.tone === 'neutral' && 'bg-muted text-muted-foreground'
				]}
			>
				{#if trajectory.tone === 'success'}
					<CheckCircle2 class="h-4 w-4" />
				{:else if trajectory.tone === 'attention'}
					<CircleAlert class="h-4 w-4" />
				{:else}
					<TrendingUp class="h-4 w-4" />
				{/if}
			</div>
			<div class="min-w-0">
				<h2 id="project-progress-title" class="text-base font-semibold">Progress</h2>
				<p class="trajectory-detail">
					<span class="font-semibold text-foreground">{trajectory.label}</span>
					<span aria-hidden="true"> · </span>
					{trajectory.detail}
				</p>
			</div>
		</div>
	</header>

	<div class="trajectory-grid">
		<button
			type="button"
			class="completion-summary pressable"
			aria-label={`Open Tasks. ${completionPercent}% complete, ${doneCount} of ${taskTotal} tasks.`}
			onclick={onOpenTasks}
		>
			<div
				class="completion-dial"
				style:--completion-angle={`${completionPercent * 3.6}deg`}
				aria-hidden="true"
			>
				<div class="completion-dial-center">
					<strong>{completionPercent}%</strong>
					<span>complete</span>
				</div>
			</div>
			<div class="min-w-0 text-left">
				<div class="flex items-center gap-2">
					<ListChecks class="h-4 w-4 shrink-0 text-success" />
					<p class="text-sm font-semibold">Task completion</p>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{doneCount} of {taskTotal} tracked tasks are done.
				</p>
				<span class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">
					Open Tasks
					<span aria-hidden="true">→</span>
				</span>
			</div>
		</button>

		<div class="task-mix" aria-label="Task distribution">
			<div class="flex items-end justify-between gap-3">
				<div>
					<p class="micro-label">TASK MIX</p>
					<p class="mt-1 text-sm font-semibold">Where the work sits</p>
				</div>
				<span class="text-2xs text-muted-foreground">{taskTotal} total</span>
			</div>

			<div
				class="task-mix-bar"
				role="img"
				aria-label={taskSegments
					.map((segment) => `${segment.label}: ${segment.count}`)
					.join(', ')}
			>
				{#if taskTotal === 0}
					<div class="h-full w-full bg-muted"></div>
				{:else}
					{#each visibleTaskSegments as segment (segment.key)}
						<div
							class={['task-segment', segment.colorClass]}
							style:flex-grow={segment.count}
							title={`${segment.label}: ${segment.count}`}
						></div>
					{/each}
				{/if}
			</div>

			<div class="task-legend">
				{#each visibleTaskSegments as segment (segment.key)}
					<div class="flex min-w-0 items-center gap-1.5">
						<span class={['h-2 w-2 shrink-0 rounded-full', segment.colorClass]}></span>
						<span class="truncate text-2xs text-muted-foreground">{segment.label}</span>
						<strong class="ml-auto text-2xs tabular-nums text-foreground">
							{segment.count}
						</strong>
					</div>
				{:else}
					<p class="col-span-full text-xs text-muted-foreground">No tasks yet</p>
				{/each}
			</div>
		</div>
	</div>

	<div class="timeline-section">
		<div class="flex flex-wrap items-end justify-between gap-2 px-1">
			<div class="flex min-w-0 items-center gap-2">
				<CalendarRange class="h-4 w-4 shrink-0 text-accent" />
				<div>
					<h3 class="text-sm font-semibold">Milestone timeline</h3>
					<p class="text-xs text-muted-foreground">
						Where today sits between commitments
					</p>
				</div>
			</div>
			<p class="text-2xs text-muted-foreground">
				{formatDate(project.start_at)} → {formatDate(project.end_at)}
			</p>
		</div>

		<div class="timeline-scroller" aria-label="Project milestone timeline">
			<div class="timeline-track">
				<div class="timeline-line" aria-hidden="true"></div>
				{#each timelinePoints as point (point.key)}
					{#if point.kind === 'milestone' && point.milestoneId}
						<button
							type="button"
							class="timeline-point timeline-button pressable"
							aria-label={`Open milestone ${point.label}, ${timelineState(point)}, ${formatDate(point.date)}`}
							onclick={() => onOpenMilestone(point.milestoneId!)}
						>
							<span class={['timeline-dot', timelineDotClass(point)]}>
								<Flag class="h-3 w-3" />
							</span>
							<span class="line-clamp-2 text-xs font-semibold text-foreground">
								{point.label}
							</span>
							<span class="text-2xs text-muted-foreground">
								{timelineState(point)} · {formatDate(point.date)}
							</span>
						</button>
					{:else}
						<div class="timeline-point">
							<span class={['timeline-dot', timelineDotClass(point)]}></span>
							<span class="line-clamp-2 text-xs font-semibold text-foreground">
								{point.label}
							</span>
							<span class="text-2xs text-muted-foreground">
								{timelineState(point)} · {formatDate(point.date)}
							</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</section>

<style>
	.trajectory-icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
	}

	.trajectory-surface {
		min-width: 0;
		border-bottom: 1px solid hsl(var(--border));
		padding: 0.25rem 0 1rem;
	}

	.trajectory-header {
		min-width: 0;
		padding: 0 0.25rem 0.75rem;
	}

	.trajectory-status {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.625rem;
	}

	.trajectory-detail {
		margin-top: 0.125rem;
		max-width: 48rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
		overflow-wrap: anywhere;
	}

	.trajectory-grid {
		display: grid;
		min-width: 0;
		gap: 0.75rem;
		padding-top: 0.75rem;
	}

	.completion-summary,
	.task-mix {
		min-width: 0;
		border-top: 1px solid hsl(var(--border) / 0.75);
		padding: 1rem 0.25rem 0;
	}

	.completion-summary {
		display: flex;
		min-height: 9rem;
		align-items: center;
		gap: 1rem;
		border-radius: 0.5rem;
		text-align: left;
	}

	.completion-summary:hover {
		background: hsl(var(--muted) / 0.35);
	}

	.completion-summary:focus-visible,
	.timeline-button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}

	.completion-dial {
		display: grid;
		height: 6.5rem;
		width: 6.5rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 9999px;
		background: conic-gradient(
			hsl(var(--success)) var(--completion-angle),
			hsl(var(--muted)) 0
		);
	}

	.completion-dial-center {
		display: flex;
		height: 4.9rem;
		width: 4.9rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: hsl(var(--background));
	}

	.completion-dial-center strong {
		font-size: 1.25rem;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
	}

	.completion-dial-center span {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.task-mix-bar {
		display: flex;
		height: 0.75rem;
		overflow: hidden;
		border-radius: 9999px;
		background: hsl(var(--muted));
		margin-top: 0.875rem;
	}

	.task-segment {
		min-width: 3px;
		flex-basis: 0;
		border-right: 1px solid hsl(var(--background) / 0.75);
	}

	.task-segment:last-child {
		border-right: 0;
	}

	.task-legend {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem 0.75rem;
		margin-top: 0.875rem;
	}

	.timeline-section {
		min-width: 0;
		border-top: 1px solid hsl(var(--border));
		margin-top: 1rem;
		padding-top: 1rem;
	}

	.timeline-scroller {
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		overscroll-behavior-inline: contain;
		padding: 0.75rem 0.25rem 0.25rem;
	}

	.timeline-track {
		position: relative;
		display: grid;
		min-width: 100%;
		grid-auto-flow: column;
		grid-auto-columns: minmax(8.75rem, 1fr);
	}

	.timeline-line {
		position: absolute;
		top: 1.05rem;
		left: 4.25rem;
		right: 4.25rem;
		height: 1px;
		background: hsl(var(--border-strong));
	}

	.timeline-point {
		position: relative;
		z-index: 1;
		display: flex;
		min-width: 0;
		min-height: 6rem;
		scroll-snap-align: start;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		border-radius: 0.5rem;
		padding: 0.25rem 0.5rem;
		text-align: center;
	}

	.timeline-button:hover {
		background: hsl(var(--muted) / 0.42);
	}

	.timeline-dot {
		display: flex;
		height: 1.65rem;
		width: 1.65rem;
		align-items: center;
		justify-content: center;
		border: 2px solid hsl(var(--background));
		border-radius: 9999px;
		box-shadow: 0 0 0 1px hsl(var(--border-strong));
	}

	.timeline-dot-today {
		background: hsl(var(--accent));
		box-shadow:
			0 0 0 2px hsl(var(--background)),
			0 0 0 4px hsl(var(--accent) / 0.4);
	}

	.timeline-dot-project {
		background: hsl(var(--foreground));
	}

	.timeline-dot-complete {
		background: hsl(var(--success));
		color: hsl(var(--success-foreground));
	}

	.timeline-dot-active {
		background: hsl(var(--info));
		color: hsl(var(--info-foreground));
	}

	.timeline-dot-attention {
		background: hsl(var(--warning));
		color: hsl(var(--warning-foreground));
	}

	.timeline-dot-upcoming {
		background: hsl(var(--card));
		color: hsl(var(--muted-foreground));
	}

	@media (min-width: 640px) {
		.trajectory-grid {
			grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.25fr);
			gap: 1.5rem;
		}

		.completion-summary,
		.task-mix {
			padding-inline: 0.75rem;
		}

		.task-legend {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.completion-summary,
		.timeline-button {
			transition: none;
		}
	}
</style>
