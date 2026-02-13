<!-- apps/web/src/lib/components/scheduling/PhaseScheduleCard.svelte -->
<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		AlertTriangle,
		CalendarDays,
		Clock,
		Info
	} from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import ScheduleConflictAlert from './ScheduleConflictAlert.svelte';
	import TaskScheduleItem from './TaskScheduleItem.svelte';
	import { formatDate, formatTaskTime, parseLocalDate } from '$lib/utils/schedulingUtils';
	import type { PhaseWithTasks } from '$lib/types/project-page.types';
	import type { ProposedTaskSchedule, ConflictInfo } from '$lib/utils/schedulingUtils';

	export let phase: PhaseWithTasks;
	export let scheduleData: {
		proposedSchedule: ProposedTaskSchedule[];
		conflicts: ConflictInfo[];
		calendarEvents: any[];
		unscheduledCount: number;
		scheduledCount: number;
	} | null = null;
	export let isExpanded = false;
	export let loading = false;

	const dispatch = createEventDispatcher();

	function toggleExpanded() {
		dispatch('toggle', { phaseId: phase.id, expanded: !isExpanded });
	}

	// Calculate statistics
	$: totalTasks = phase.tasks?.length || 0;
	$: tasksToSchedule = scheduleData?.unscheduledCount || 0;
	$: alreadyScheduled = scheduleData?.scheduledCount || 0;
	$: errorCount = scheduleData?.conflicts.filter((c) => c.severity === 'error').length || 0;
	$: warningCount = scheduleData?.conflicts.filter((c) => c.severity === 'warning').length || 0;
	$: hasIssues = errorCount > 0 || warningCount > 0;
</script>

<Card variant="default" class="overflow-hidden {hasIssues ? 'ring-2 ring-amber-500/20' : ''}">
	<!-- Phase Header (Always Visible) -->
	<button
		onclick={toggleExpanded}
		class="w-full px-4 py-3 bg-muted hover:bg-muted
			   transition-colors flex items-center justify-between"
		disabled={loading}
	>
		<div class="flex items-center gap-3">
			<!-- Expand/Collapse Icon -->
			<div class="flex items-center">
				{#if isExpanded}
					<ChevronUp class="w-5 h-5 text-muted-foreground" />
				{:else}
					<ChevronDown class="w-5 h-5 text-muted-foreground" />
				{/if}
			</div>

			<!-- Phase Info -->
			<div class="text-left">
				<h3 class="font-medium text-foreground">
					{phase.name}
				</h3>
				<p class="text-xs text-muted-foreground">
					{phase.start_date ? formatDate(parseLocalDate(phase.start_date)) : 'No start'} -
					{phase.end_date ? formatDate(parseLocalDate(phase.end_date)) : 'No end'}
				</p>
			</div>
		</div>

		<!-- Status Indicators -->
		<div class="flex items-center gap-4">
			{#if hasIssues}
				<div class="flex items-center gap-2">
					{#if errorCount > 0}
						<span
							class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
						>
							<AlertTriangle class="w-4 h-4" />
							{errorCount} error{errorCount === 1 ? '' : 's'}
						</span>
					{/if}
					{#if warningCount > 0}
						<span
							class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
						>
							<AlertTriangle class="w-4 h-4" />
							{warningCount} warning{warningCount === 1 ? '' : 's'}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Task Counts -->
			<div class="flex items-center gap-2">
				{#if tasksToSchedule > 0}
					<span
						class="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded-full"
					>
						{tasksToSchedule} to schedule
					</span>
				{/if}
				{#if alreadyScheduled > 0}
					<span class="px-2 py-1 bg-muted text-foreground text-xs rounded-full">
						{alreadyScheduled} scheduled
					</span>
				{/if}
				{#if totalTasks > 0 && tasksToSchedule === 0 && alreadyScheduled === totalTasks}
					<span
						class="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full"
					>
						All scheduled
					</span>
				{/if}
			</div>
		</div>
	</button>

	<!-- Phase Content (Expanded) -->
	{#if isExpanded && scheduleData}
		<CardBody padding="md" class="space-y-4 bg-card">
			<!-- Phase Conflicts/Warnings -->
			{#if scheduleData.conflicts.length > 0}
				<ScheduleConflictAlert conflicts={scheduleData.conflicts} compact={true} />
			{/if}

			<!-- Calendar Events in Phase -->
			{#if scheduleData.calendarEvents.length > 0}
				<div
					class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3"
				>
					<div class="flex items-start gap-2">
						<CalendarDays
							class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
						/>
						<div class="text-sm">
							<p class="font-medium text-blue-800 dark:text-blue-200">
								{scheduleData.calendarEvents.length} calendar event{scheduleData
									.calendarEvents.length === 1
									? ''
									: 's'} during this phase
							</p>
							{#if scheduleData.calendarEvents.length <= 3}
								<ul
									class="mt-1 text-xs text-blue-700 dark:text-blue-300 space-y-0.5"
								>
									{#each scheduleData.calendarEvents.slice(0, 3) as event}
										<li class="truncate">• {event.summary}</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Proposed Schedule -->
			{#if scheduleData.proposedSchedule.length > 0}
				<div>
					<h4 class="text-sm font-medium text-foreground mb-2">Proposed Schedule:</h4>
					<div class="space-y-2 max-h-64 overflow-y-auto">
						{#each scheduleData.proposedSchedule as item}
							<div
								class="flex items-center justify-between p-3 bg-muted
										border rounded-lg {item.hasConflict ? 'border-amber-300 dark:border-amber-700' : 'border-border'}"
							>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-sm text-foreground">
											{item.task.title}
										</span>
										{#if item.task.priority}
											<span
												class="px-2 py-0.5 text-xs rounded-full {item.task
													.priority === 'high'
													? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
													: item.task.priority === 'medium'
														? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
														: 'bg-muted text-foreground'}"
											>
												{item.task.priority}
											</span>
										{/if}
									</div>
									<div class="flex items-center gap-4 mt-1">
										<span class="text-xs text-muted-foreground">
											<Clock class="w-3 h-3 inline mr-1" />
											{formatTaskTime(item.proposedStart)} - {formatTaskTime(
												item.proposedEnd
											)}
										</span>
										<span class="text-xs text-muted-foreground">
											{item.duration_minutes} min
										</span>
									</div>
									{#if item.hasConflict}
										<p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
											⚠️ {item.conflictReason}
										</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if tasksToSchedule === 0}
				<div class="text-center py-4 text-muted-foreground">
					<p class="text-sm">All tasks in this phase are already scheduled</p>
				</div>
			{:else}
				<div class="text-center py-4 text-muted-foreground">
					<p class="text-sm">No schedule generated for this phase</p>
				</div>
			{/if}

			<!-- Phase Summary -->
			{#if scheduleData.proposedSchedule.length > 0}
				<div class="pt-3 border-t border-border">
					<div class="flex items-center justify-between text-xs text-muted-foreground">
						<span>
							<Info class="w-3 h-3 inline mr-1" />
							{scheduleData.proposedSchedule.length} task{scheduleData
								.proposedSchedule.length === 1
								? ''
								: 's'} will be scheduled
						</span>
						{#if scheduleData.proposedSchedule.some((s) => s.hasConflict)}
							<span class="text-amber-600 dark:text-amber-400">
								Some conflicts need attention
							</span>
						{/if}
					</div>
				</div>
			{/if}
		</CardBody>
	{:else if isExpanded && loading}
		<CardBody padding="md" class="text-center text-muted-foreground">
			<Clock class="w-6 h-6 animate-spin mx-auto mb-2" />
			<p class="text-sm">Loading schedule data...</p>
		</CardBody>
	{/if}
</Card>
