<!-- apps/web/src/lib/components/phases/BacklogTaskItem.svelte -->
<script lang="ts">
	import {
		CheckCircle2,
		Trash2,
		Calendar,
		Clock,
		Circle,
		RefreshCw,
		CalendarClock,
		CalendarCheck,
		CalendarX
	} from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { fade } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';

	export let task: TaskWithCalendarEvents;
	export let index = 0;

	const dispatch = createEventDispatcher();

	// Get task type/status
	function getTaskType(task: TaskWithCalendarEvents): string {
		if (task.status === 'done') return 'completed';
		if (task.deleted_at) return 'deleted';
		if (task.start_date && new Date(task.start_date) < new Date() && task.status !== 'done') {
			return 'overdue';
		}
		const hasCalendarEvent = task.task_calendar_events?.some(
			(e) => e.sync_status === 'synced' || e.sync_status === 'pending'
		);
		if (hasCalendarEvent) return 'scheduled';
		return 'active';
	}

	$: taskType = getTaskType(task);

	// Get icon component
	function getTaskIcon(type: string) {
		switch (type) {
			case 'completed':
				return CheckCircle2;
			case 'overdue':
				return Clock;
			case 'deleted':
				return Trash2;
			case 'scheduled':
				return Calendar;
			default:
				return Circle;
		}
	}

	$: TaskIcon = getTaskIcon(taskType);

	// Get icon color
	function getTaskIconColor(type: string): string {
		switch (type) {
			case 'completed':
				return 'text-green-500';
			case 'overdue':
				return 'text-red-600';
			case 'deleted':
				return 'text-gray-400';
			case 'scheduled':
				return 'text-blue-500';
			default:
				return 'text-gray-400';
		}
	}

	$: taskIconColor = getTaskIconColor(taskType);

	// Calendar sync status
	$: calendarStatus = (() => {
		if (!task.task_calendar_events || task.task_calendar_events.length === 0) {
			return 'not_scheduled';
		}
		const event = task.task_calendar_events[0];
		return event?.sync_status;
	})();

	// Get calendar icon
	function getCalendarIcon(status: string) {
		switch (status) {
			case 'synced':
				return CalendarCheck;
			case 'pending':
				return CalendarClock;
			case 'failed':
			case 'cancelled':
				return CalendarX;
			default:
				return null;
		}
	}

	$: CalendarIcon = getCalendarIcon(calendarStatus);

	$: calendarIconColor = (() => {
		switch (calendarStatus) {
			case 'synced':
				return 'text-green-500';
			case 'pending':
				return 'text-yellow-500';
			case 'failed':
			case 'cancelled':
				return 'text-red-500';
			default:
				return 'text-gray-400';
		}
	})();

	// Format date
	function formatDate(date: string | null): string {
		if (!date) return '';
		const d = new Date(date);
		const now = new Date();
		const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`;
		if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;

		// Format as MM/DD
		return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d
			.getDate()
			.toString()
			.padStart(2, '0')}`;
	}

	function handleEditTask() {
		dispatch('editTask', task);
	}

	function handleDeleteTask(e: Event) {
		e.stopPropagation();
		dispatch('deleteTask', {
			id: task.id,
			task: task,
			isRecurring: task.task_type === 'recurring'
		});
	}

	function handleDragStart(event: DragEvent) {
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('application/json', JSON.stringify(task));
			event.dataTransfer.setData('text/plain', task.title);
		}
		dispatch('dragStart', { event, task, phaseId: null });
	}
</script>

<div
	draggable="true"
	on:dragstart={handleDragStart}
	class="backlog-task-item group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg cursor-move hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 p-3"
	role="listitem"
	aria-label="Task: {task.title}"
	in:fade={{ duration: 200, delay: index * 20 }}
	out:fade={{ duration: 150 }}
>
	<div class="flex gap-2">
		<!-- Icon -->
		<div class="flex-shrink-0 mt-0.5">
			<TaskIcon class="w-4 h-4 {taskIconColor}" aria-label="{taskType} task" />
		</div>

		<!-- Content -->
		<div class="flex-1 min-w-0">
			<!-- Title - Allow wrapping -->
			<button
				on:click={handleEditTask}
				class="w-full text-left {task.status === 'done'
					? 'line-through text-gray-500 dark:text-gray-400'
					: 'text-gray-900 dark:text-white'} hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 focus:outline-none"
				aria-label="Edit task: {task.title}"
				type="button"
				title={task.title}
			>
				<span
					class="text-sm leading-snug block break-words"
					title={task.task_type === 'recurring'
						? `Recurring task - ${task.recurrence_pattern || 'repeating'}`
						: task.title}
				>
					{task.title}
					{#if task.task_type === 'recurring'}
						<RefreshCw
							class="inline-block w-3 h-3 ml-1 text-blue-500 dark:text-blue-400"
						/>
					{/if}
				</span>
			</button>

			<!-- Metadata Row -->
			{#if task.start_date || calendarStatus !== 'not_scheduled'}
				<div class="flex items-center gap-2 mt-1 flex-wrap">
					<!-- Calendar Status -->
					{#if CalendarIcon && calendarStatus !== 'not_scheduled'}
						<CalendarIcon class="w-3 h-3 {calendarIconColor}" aria-hidden="true" />
					{/if}

					<!-- Date -->
					{#if task.start_date}
						<span class="text-xs text-gray-500 dark:text-gray-400">
							{formatDate(task.start_date)}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Delete Button -->
		<div class="flex-shrink-0">
			<Button
				on:click={handleDeleteTask}
				variant="ghost"
				size="sm"
				icon={Trash2}
				class="opacity-0 group-hover:opacity-100 !p-1 !text-gray-400 hover:!text-red-600 dark:hover:!text-red-400 transition-opacity"
				aria-label="Delete task: {task.title}"
			/>
		</div>
	</div>
</div>

<style>
	.backlog-task-item {
		transition: all 0.2s ease;
		transform-origin: center;
	}

	.backlog-task-item:hover {
		transform: translateY(-1px);
	}

	.backlog-task-item:active {
		transform: scale(0.99);
	}

	@media (max-width: 640px) {
		.backlog-task-item:hover {
			transform: none;
		}
	}
</style>
