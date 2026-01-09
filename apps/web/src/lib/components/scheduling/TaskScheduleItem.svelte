<!-- apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte -->
<script lang="ts">
	import {
		Clock,
		CheckCircle2,
		X,
		RotateCcw,
		AlertTriangle,
		Calendar,
		ChevronRight
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { createEventDispatcher } from 'svelte';
	import { addMinutes } from 'date-fns';
	import {
		formatDateTime,
		formatDateTimeForInput,
		parseDateTimeFromInput,
		calculateDuration,
		formatTime
	} from '$lib/utils/schedulingUtils';
	import type { ProposedTaskSchedule } from '$lib/utils/schedulingUtils';

	export let schedule: ProposedTaskSchedule;
	export let isEditing = false;
	export let isHighlighted = false;

	export let compact = false;

	const dispatch = createEventDispatcher();

	// Local editing state
	let tempStart = '';
	let tempDuration = 60;
	let editError = '';

	// Initialize editing values when entering edit mode
	$: if (isEditing && !tempStart) {
		tempStart = formatDateTimeForInput(schedule.proposedStart);
		tempDuration = calculateDuration(schedule.proposedStart, schedule.proposedEnd);
		editError = '';
	}

	// Calculate duration for display
	$: duration = calculateDuration(schedule.proposedStart, schedule.proposedEnd);
	$: priorityClass = getPriorityClass(schedule.task?.priority);

	/**
	 * Calculate end time display based on start + duration
	 */
	function calculateEndTime(start: string, durationMinutes: number): string {
		if (!start || !durationMinutes) return 'N/A';

		try {
			const startDate = parseDateTimeFromInput(start);
			const endDate = addMinutes(startDate, durationMinutes);
			return formatTime(endDate);
		} catch {
			return 'Invalid';
		}
	}

	function getPriorityClass(priority?: string) {
		if (!priority) return '';
		switch (priority) {
			case 'high':
				return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
			case 'medium':
				return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
			case 'low':
				return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
			default:
				return '';
		}
	}

	function startEditing() {
		tempStart = formatDateTimeForInput(schedule.proposedStart);
		tempDuration = calculateDuration(schedule.proposedStart, schedule.proposedEnd);
		editError = '';
		dispatch('editStart', { schedule });
	}

	function cancelEditing() {
		tempStart = '';
		tempDuration = 60;
		editError = '';
		dispatch('editCancel', { schedule });
	}

	function saveEdit() {
		if (!tempStart || !tempDuration || tempDuration <= 0) {
			editError = 'Start time and duration are required';
			return;
		}

		const newStart = parseDateTimeFromInput(tempStart);
		const newEnd = addMinutes(newStart, tempDuration);

		// Validate duration (max 8 hours)
		if (tempDuration > 480) {
			editError = 'Task duration cannot exceed 8 hours';
			return;
		}

		// Minimum duration 15 minutes
		if (tempDuration < 15) {
			editError = 'Task duration must be at least 15 minutes';
			return;
		}

		dispatch('editSave', {
			schedule,
			newStart,
			newEnd
		});

		tempStart = '';
		tempDuration = 60;
		editError = '';
	}

	function resetToOriginal() {
		if (schedule.originalStart && schedule.originalEnd) {
			tempStart = formatDateTimeForInput(schedule.originalStart);
			tempDuration = calculateDuration(schedule.originalStart, schedule.originalEnd);
			editError = '';
			dispatch('reset', { schedule });
		}
	}
</script>

<div
	id="task-schedule-item-{schedule.task.id}"
	class="rounded-lg border transition-all duration-200
         {isHighlighted
		? 'border-primary-500 ring-2 ring-primary-500 ring-opacity-50 bg-primary-50 dark:bg-primary-900/20'
		: schedule.hasConflict
			? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
			: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}"
>
	{#if isEditing}
		{@const baseId = schedule.task?.id ?? schedule.id ?? 'task'}
		{@const startInputId = `${baseId}-start-datetime`.replace(/[^a-z0-9-]/gi, '-')}
		{@const durationInputId = `${baseId}-duration-minutes`.replace(/[^a-z0-9-]/gi, '-')}

		<!-- Editing Mode (Expanded) -->
		<div class="p-4 space-y-4">
			<div class="flex items-center justify-between">
				<h4 class="font-medium text-gray-900 dark:text-white">
					{schedule.task?.title || 'Untitled Task'}
				</h4>
				{#if schedule.task?.priority}
					<span class="px-2 py-0.5 text-xs rounded-full {priorityClass}">
						{schedule.task.priority}
					</span>
				{/if}
			</div>

			<!-- Simplified Date Inputs: Start Date + Duration -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label
						for={startInputId}
						class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
					>
						Start Date & Time
					</label>
					<TextInput
						id={startInputId}
						type="datetime-local"
						bind:value={tempStart}
						class="text-sm"
						size="sm"
						error={editError && !tempStart}
					/>
				</div>

				<div>
					<label
						for={durationInputId}
						class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
					>
						Duration (minutes)
					</label>
					<TextInput
						id={durationInputId}
						type="number"
						bind:value={tempDuration}
						min="15"
						max="480"
						step="15"
						class="text-sm"
						size="sm"
						error={editError && (!tempDuration || tempDuration <= 0)}
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						End: {calculateEndTime(tempStart, tempDuration)}
					</p>
				</div>
			</div>

			{#if editError}
				<p class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
					<AlertTriangle class="w-3 h-3" />
					{editError}
				</p>
			{/if}

			<!-- Action Buttons -->
			<div
				class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center gap-2">
					<Button
						onclick={saveEdit}
						variant="ghost"
						size="sm"
						class="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
					>
						<CheckCircle2 class="w-4 h-4 mr-1" />
						Save
					</Button>
					<Button onclick={cancelEditing} variant="ghost" size="sm">
						<X class="w-4 h-4 mr-1" />
						Cancel
					</Button>
				</div>
				{#if schedule.originalStart && schedule.originalEnd}
					<Button
						onclick={resetToOriginal}
						variant="ghost"
						size="sm"
						title="Reset to AI-suggested time"
					>
						<RotateCcw class="w-4 h-4 mr-1" />
						Reset
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Collapsed Mode (Clickable) -->
		<button
			onclick={startEditing}
			class="w-full text-left p-3 sm:p-4 hover:bg-gray-100 dark:hover:bg-gray-700
             transition-colors rounded-lg focus:outline-none focus:ring-2
             focus:ring-primary-500 focus:ring-offset-2"
			aria-label="Edit schedule for {schedule.task?.title || 'Untitled Task'}"
			aria-expanded={isEditing}
			aria-current={isHighlighted}
		>
			<div class="flex items-start justify-between">
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<h4 class="font-medium text-gray-900 dark:text-white truncate">
							{schedule.task?.title || 'Untitled Task'}
						</h4>
						{#if schedule.task?.priority}
							<span class="px-2 py-0.5 text-xs rounded-full {priorityClass}">
								{schedule.task.priority}
							</span>
						{/if}
					</div>

					<div
						class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1.5"
					>
						<span class="flex items-center gap-1">
							<Calendar class="w-3 h-3" />
							{formatDateTime(schedule.proposedStart)}
						</span>
						<span class="flex items-center gap-1">
							<Clock class="w-3 h-3" />
							{duration} min
						</span>
					</div>

					{#if schedule.hasConflict}
						<div
							class="flex items-start gap-1 mt-1.5 text-sm text-amber-700 dark:text-amber-300"
						>
							<AlertTriangle class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
							<span>{schedule.conflictReason}</span>
						</div>
					{/if}
				</div>

				<!-- Expand indicator -->
				<div class="ml-3 flex-shrink-0">
					<ChevronRight class="w-5 h-5 text-gray-400" />
				</div>
			</div>
		</button>
	{/if}
</div>
