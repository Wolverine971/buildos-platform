<!-- src/lib/components/project/ProjectTimelineCompact.svelte -->
<script lang="ts">
	import { format } from 'date-fns/format';
	import type { Phase, Task } from '$lib/types/project';
	import type { ProcessedPhase } from '$lib/types/project-page.types';

	// Props
	let {
		phases = [],
		tasks = [],
		project
	}: {
		phases: ProcessedPhase[];
		tasks: Task[];
		project: any;
	} = $props();

	// Phase-to-task mapping
	let phaseTaskMap = $state(new Map<string, string>());

	$effect(() => {
		phaseTaskMap.clear();
		if (phases && phases.length > 0) {
			for (const phase of phases) {
				if (phase.tasks && phase.tasks.length > 0) {
					for (const task of phase.tasks) {
						phaseTaskMap.set(task.id, phase.id);
					}
				}
			}
		}
	});

	// Timeline calculations
	function getTimelineBounds(): { start: Date; end: Date } | null {
		const parseDate = (dateStr: string | null | undefined): Date | null => {
			if (!dateStr) return null;
			try {
				if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
					return new Date(dateStr + 'T12:00:00');
				}
				const date = new Date(dateStr);
				return isNaN(date.getTime()) ? null : date;
			} catch {
				return null;
			}
		};

		let start: Date | null = null;
		let end: Date | null = null;
		let dateSource = '';

		// First try project dates
		if (project?.start_date && project?.end_date) {
			const projectStart = parseDate(project.start_date);
			const projectEnd = parseDate(project.end_date);
			if (projectStart && projectEnd) {
				start = projectStart;
				end = projectEnd;
				dateSource = 'project';
			}
		}

		// Then try phase dates
		if (!start || !end) {
			if (phases.length > 0) {
				const dates = phases
					.flatMap((p) => [parseDate(p.start_date), parseDate(p.end_date)])
					.filter((d): d is Date => d !== null);

				if (dates.length > 0) {
					start = new Date(Math.min(...dates.map((d) => d.getTime())));
					end = new Date(Math.max(...dates.map((d) => d.getTime())));
					dateSource = 'phases';
				}
			}
		}

		// Finally, use task dates as fallback
		if (!start || !end) {
			const taskDates = tasks
				.flatMap((t) => [
					parseDate(t.start_date),
					parseDate(t.completed_at),
					parseDate(t.deleted_at),
					parseDate(t.created_at)
				])
				.filter((d): d is Date => d !== null);

			if (taskDates.length > 0) {
				start = new Date(Math.min(...taskDates.map((d) => d.getTime())));
				end = new Date(Math.max(...taskDates.map((d) => d.getTime())));
				dateSource = 'tasks';

				// Add padding when using task dates
				if (start.getTime() === end.getTime()) {
					// Single date, add padding on both sides
					start = new Date(start);
					end = new Date(end);
					start.setDate(start.getDate() - 14);
					end.setDate(end.getDate() + 14);
				} else {
					// Multiple dates, add smaller padding
					start = new Date(start);
					end = new Date(end);
					start.setDate(start.getDate() - 7);
					end.setDate(end.getDate() + 7);
				}
			}
		}

		return start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
			? { start, end }
			: null;
	}

	// Diagnose why timeline can't be shown
	function getTimelineIssue(): { message: string; suggestion: string } | null {
		// No tasks at all
		if (!tasks || tasks.length === 0) {
			return {
				message: 'No tasks to display',
				suggestion: 'Add tasks to your project to see the timeline'
			};
		}

		// Check for any dates
		const hasProjectDates = project?.start_date || project?.end_date;
		const hasPhaseDates = phases.some((p) => p.start_date || p.end_date);
		const hasTaskDates = tasks.some(
			(t) => t.start_date || t.completed_at || t.deleted_at || t.created_at
		);

		if (!hasProjectDates && !hasPhaseDates && !hasTaskDates) {
			return {
				message: 'No dates found',
				suggestion:
					'Add start/end dates to your project, or schedule some tasks to see the timeline'
			};
		}

		// Has dates but they're invalid
		const bounds = getTimelineBounds();
		if (!bounds) {
			return {
				message: 'Unable to calculate timeline',
				suggestion: 'Check that your project and task dates are valid'
			};
		}

		return null;
	}

	function getTaskDotColor(task: Task): string {
		const now = new Date();

		if (task.deleted_at) return 'bg-red-600';
		if (task.status === 'done') return 'bg-blue-500';
		if (task.status === 'in_progress') return 'bg-yellow-500';
		if (task.status === 'blocked') return 'bg-orange-500';

		if (task.start_date) {
			const startDate = new Date(task.start_date + 'T00:00:00');
			if (startDate < now) return 'bg-red-500';
			if (startDate >= now) return 'bg-green-500';
		}

		return 'bg-gray-400';
	}

	function calculateTaskDots() {
		if (!tasks || tasks.length === 0) return [];

		const bounds = getTimelineBounds();
		if (!bounds) return [];

		const totalDuration = bounds.end.getTime() - bounds.start.getTime();
		if (totalDuration <= 0) return [];

		const dots: any[] = [];
		const parseDate = (dateStr: string): Date => {
			if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
				return new Date(dateStr + 'T12:00:00');
			}
			return new Date(dateStr);
		};

		for (const task of tasks) {
			if (!task.title || task.title.trim() === '') continue;

			let taskDate: Date;

			if (task.deleted_at) {
				taskDate = parseDate(task.deleted_at);
			} else if (task.status === 'done' && task.completed_at) {
				taskDate = parseDate(task.completed_at);
			} else if (task.start_date) {
				taskDate = parseDate(task.start_date);
			} else if (task.status === 'backlog' && phaseTaskMap.has(task.id)) {
				const phaseId = phaseTaskMap.get(task.id);
				const phase = phases.find((p) => p.id === phaseId);
				taskDate = phase && phase.start_date ? parseDate(phase.start_date) : bounds.start;
			} else {
				taskDate = bounds.start;
			}

			const position = Math.max(
				0,
				Math.min(100, ((taskDate.getTime() - bounds.start.getTime()) / totalDuration) * 100)
			);

			dots.push({
				id: task.id,
				position,
				color: getTaskDotColor(task),
				title: task.title,
				status: task.status
			});
		}

		return dots;
	}

	function getPhaseColor(index: number): string {
		const colors = [
			'bg-indigo-500',
			'bg-purple-500',
			'bg-teal-500',
			'bg-orange-500',
			'bg-cyan-500'
		];
		return colors[index % colors.length];
	}

	// Computed values
	let timelineBounds = $derived(getTimelineBounds());
	let taskDots = $derived(calculateTaskDots());
	let currentPos = $derived.by(() => {
		const bounds = getTimelineBounds();
		if (!bounds) return -1;
		const now = new Date();
		const totalDuration = bounds.end.getTime() - bounds.start.getTime();
		return Math.max(
			0,
			Math.min(100, ((now.getTime() - bounds.start.getTime()) / totalDuration) * 100)
		);
	});

	// Generate month markers
	function generateMonthMarkers() {
		if (!timelineBounds) return [];

		const markers = [];
		const start = new Date(
			timelineBounds.start.getFullYear(),
			timelineBounds.start.getMonth(),
			1
		);
		const totalDuration = timelineBounds.end.getTime() - timelineBounds.start.getTime();

		let current = new Date(start);
		while (current <= timelineBounds.end) {
			const position =
				((current.getTime() - timelineBounds.start.getTime()) / totalDuration) * 100;

			if (position >= 0 && position <= 100) {
				markers.push({
					position,
					label: format(current, 'MMM')
				});
			}

			current.setMonth(current.getMonth() + 1);
		}

		return markers;
	}

	let monthMarkers = $derived(generateMonthMarkers());

	// Calculate dynamic legend based on existing task types
	let taskDotLegend = $derived.by(() => {
		if (!tasks || tasks.length === 0) return [];

		const now = new Date();
		const presentTypes = new Set<string>();

		// Check what types of tasks exist
		for (const task of tasks) {
			if (task.deleted_at) {
				presentTypes.add('deleted');
			} else if (task.status === 'done') {
				presentTypes.add('done');
			} else if (task.status === 'in_progress') {
				presentTypes.add('in_progress');
			} else if (task.status === 'blocked') {
				presentTypes.add('blocked');
			} else if (task.start_date) {
				const startDate = new Date(task.start_date + 'T00:00:00');
				if (startDate < now) {
					presentTypes.add('overdue');
				} else {
					presentTypes.add('scheduled');
				}
			} else {
				presentTypes.add('backlog');
			}
		}

		// Define legend items
		const allLegendItems = [
			{ type: 'done', label: 'Done', bgClass: 'bg-blue-500' },
			{ type: 'scheduled', label: 'Scheduled', bgClass: 'bg-green-500' },
			{ type: 'in_progress', label: 'In Progress', bgClass: 'bg-yellow-500' },
			{ type: 'blocked', label: 'Blocked', bgClass: 'bg-orange-500' },
			{ type: 'overdue', label: 'Overdue', bgClass: 'bg-red-500' },
			{ type: 'deleted', label: 'Deleted', bgClass: 'bg-red-600' },
			{ type: 'backlog', label: 'Backlog', bgClass: 'bg-gray-400' }
		];

		// Return only items for types present in tasks
		return allLegendItems.filter((item) => presentTypes.has(item.type));
	});

	function scrollToTask(taskId: string) {
		const element = document.getElementById(`task-${taskId}`);
		if (element) {
			element.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
			element.classList.add('highlight-task');
			setTimeout(() => {
				element?.classList.remove('highlight-task');
			}, 2000);
		}
	}

	function scrollToPhase(phaseId: string) {
		const element = document.getElementById(`phase-card-${phaseId}`);
		if (element) {
			element.scrollIntoView({
				behavior: 'smooth',
				block: 'start'
			});
		}
	}
</script>

{#if timelineBounds}
	<div class="timeline-compact">
		<!-- Timeline header -->
		<div class="timeline-header">
			<span class="timeline-date">
				{format(timelineBounds.start, 'MMM d, yyyy')}
			</span>
			<span class="timeline-label">Timeline</span>
			<span class="timeline-date">
				{format(timelineBounds.end, 'MMM d, yyyy')}
			</span>
		</div>

		<!-- Scrollable timeline container -->
		<div class="timeline-scroll">
			<div class="timeline-container">
				<!-- Month markers -->
				{#each monthMarkers as marker}
					<div class="month-marker" style="left: {marker.position}%">
						<div class="month-tick"></div>
						<div class="month-label">{marker.label}</div>
					</div>
				{/each}

				<!-- Task dots layer -->
				{#if taskDots.length > 0}
					<div class="dots-layer">
						<div class="dots-line"></div>
						{#each taskDots as dot (dot.id)}
							<button
								class="task-dot {dot.color}"
								style="left: {dot.position}%"
								on:click={() => scrollToTask(dot.id)}
								title="{dot.title} ({dot.status})"
								aria-label="Task: {dot.title}"
							></button>
						{/each}
					</div>
				{/if}

				<!-- Phases layer -->
				{#if phases.length > 0}
					<div class="phases-layer">
						{#each phases as phase, index}
							{@const bounds = getTimelineBounds()}
							{@const totalDuration = bounds
								? bounds.end.getTime() - bounds.start.getTime()
								: 0}
							{@const startPos = bounds
								? Math.max(
										0,
										((new Date(phase.start_date).getTime() -
											bounds.start.getTime()) /
											totalDuration) *
											100
									)
								: 0}
							{@const endPos = bounds
								? Math.min(
										100,
										((new Date(phase.end_date).getTime() -
											bounds.start.getTime()) /
											totalDuration) *
											100
									)
								: 100}
							{@const progress =
								phase.task_count > 0
									? Math.round((phase.completed_tasks / phase.task_count) * 100)
									: 0}

							<button
								class="phase-bar {getPhaseColor(index)}"
								style="left: {startPos}%; width: {Math.max(endPos - startPos, 5)}%"
								on:click={() => scrollToPhase(phase.id)}
								title="{phase.name} ({progress}% complete)"
							>
								<span class="phase-name">{phase.name}</span>
								{#if progress > 0}
									<div class="phase-progress" style="width: {progress}%"></div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}

				<!-- Today marker -->
				{#if currentPos >= 0 && currentPos <= 100}
					<div class="today-marker" style="left: {currentPos}%">
						<span class="today-label">Today</span>
						<div class="today-line"></div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Dynamic Legend -->
		<div class="timeline-legend">
			{#if taskDotLegend.length > 0}
				{#each taskDotLegend as item}
					<div class="legend-item">
						<span class="legend-dot {item.bgClass}"></span>
						<span>{item.label}</span>
					</div>
				{/each}
			{:else}
				<!-- Fallback static legend -->
				<div class="legend-item">
					<span class="legend-dot bg-blue-500"></span>
					<span>Done</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot bg-green-500"></span>
					<span>Scheduled</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot bg-yellow-500"></span>
					<span>In Progress</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot bg-gray-400"></span>
					<span>Backlog</span>
				</div>
			{/if}
		</div>
	</div>
{:else}
	{@const issue = getTimelineIssue()}
	<div class="timeline-empty">
		<div class="timeline-empty-content">
			{#if issue}
				<div class="timeline-empty-message">
					<svg
						class="timeline-empty-icon"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="text-xs font-medium text-gray-600 dark:text-gray-400"
						>{issue.message}</span
					>
				</div>
				<p class="text-xs text-gray-500 dark:text-gray-500 mt-1">{issue.suggestion}</p>
			{:else}
				<span class="text-xs text-gray-400">Timeline unavailable</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.timeline-compact {
		position: relative;
	}

	.timeline-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.timeline-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(107 114 128);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.dark) .timeline-label {
		color: rgb(156 163 175);
	}

	.timeline-date {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgb(17 24 39);
	}

	:global(.dark) .timeline-date {
		color: rgb(255 255 255);
	}

	.timeline-scroll {
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: rgb(209 213 219) transparent;
		margin: 0 -12px;
		padding: 0 12px;
	}

	.timeline-container {
		position: relative;
		min-width: 600px;
		height: 120px;
	}

	.month-marker {
		position: absolute;
		top: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.month-tick {
		width: 1px;
		height: 4px;
		background: rgb(209 213 219);
	}

	:global(.dark) .month-tick {
		background: rgb(75 85 99);
	}

	.month-label {
		font-size: 0.625rem;
		color: rgb(156 163 175);
		margin-top: 2px;
		transform: translateX(-50%);
	}

	.dots-layer {
		position: absolute;
		top: 20px;
		left: 0;
		right: 0;
		height: 30px;
	}

	.dots-line {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 1px;
		background: rgb(229 231 235);
		transform: translateY(-50%);
	}

	:global(.dark) .dots-line {
		background: rgb(55 65 81);
	}

	.task-dot {
		position: absolute;
		top: 50%;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		cursor: pointer;
		border: 2px solid white;
		transition: all 0.2s ease;
		z-index: 1;
	}

	:global(.dark) .task-dot {
		border-color: rgb(17 24 39);
	}

	.task-dot:hover {
		transform: translate(-50%, -50%) scale(1.5);
		z-index: 2;
	}

	.phases-layer {
		position: absolute;
		top: 60px;
		left: 0;
		right: 0;
		height: 30px;
	}

	.phase-bar {
		position: absolute;
		height: 24px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 0 8px;
	}

	.phase-bar:hover {
		transform: scaleY(1.1);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.phase-name {
		font-size: 0.625rem;
		font-weight: 600;
		color: white;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		z-index: 1;
		position: relative;
	}

	.phase-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 2px;
		background: rgba(255, 255, 255, 0.4);
	}

	.today-marker {
		position: absolute;
		top: 0;
		height: 100%;
		z-index: 3;
	}

	.today-label {
		position: absolute;
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.625rem;
		font-weight: 600;
		color: rgb(239 68 68);
		background: white;
		padding: 0 4px;
		border-radius: 4px;
		border: 1px solid rgb(254 202 202);
		white-space: nowrap;
	}

	:global(.dark) .today-label {
		background: rgb(17 24 39);
		border-color: rgb(127 29 29);
		color: rgb(248 113 113);
	}

	.today-line {
		width: 2px;
		height: 100%;
		background: rgb(239 68 68);
	}

	.timeline-legend {
		display: flex;
		gap: 1rem;
		margin-top: 0.75rem;
		font-size: 0.625rem;
		color: rgb(107 114 128);
	}

	:global(.dark) .timeline-legend {
		color: rgb(156 163 175);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.legend-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.timeline-empty {
		padding: 1rem;
		text-align: center;
		background: rgba(249, 250, 251, 0.5);
		border: 1px dashed rgba(229, 231, 235, 0.5);
		border-radius: 8px;
	}

	:global(.dark) .timeline-empty {
		background: rgba(31, 41, 55, 0.5);
		border-color: rgba(75, 85, 99, 0.5);
	}

	.timeline-empty-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
	}

	.timeline-empty-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.timeline-empty-icon {
		width: 1rem;
		height: 1rem;
		color: rgb(156 163 175);
	}

	:global(.dark) .timeline-empty-icon {
		color: rgb(107 114 128);
	}

	/* Custom scrollbar */
	.timeline-scroll::-webkit-scrollbar {
		height: 4px;
	}

	.timeline-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.timeline-scroll::-webkit-scrollbar-thumb {
		background-color: rgb(209 213 219);
		border-radius: 2px;
	}

	:global(.dark) .timeline-scroll::-webkit-scrollbar-thumb {
		background-color: rgb(75 85 99);
	}

	/* Highlight animation */
	:global(.highlight-task) {
		animation: highlight 2s ease-out;
	}

	@keyframes highlight {
		0% {
			background-color: rgb(251 191 36 / 0.3);
			box-shadow: 0 0 0 4px rgb(251 191 36 / 0.2);
		}
		100% {
			background-color: transparent;
			box-shadow: none;
		}
	}
</style>
