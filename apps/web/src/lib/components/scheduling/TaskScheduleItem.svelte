<!-- src/lib/components/scheduling/TaskScheduleItem.svelte -->
<script lang="ts">
	import { Clock, CheckCircle2, X, RotateCcw, AlertTriangle, Calendar } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { createEventDispatcher } from 'svelte';
	import {
		formatDateTime,
		formatDateTimeForInput,
		parseDateTimeFromInput,
		calculateDuration
	} from '$lib/utils/schedulingUtils';
	import type { ProposedTaskSchedule } from '$lib/utils/schedulingUtils';

	export let schedule: ProposedTaskSchedule;
	export let isEditing = false;
	export let compact = false;

	const dispatch = createEventDispatcher();

	// Local editing state
	let tempStart = '';
	let tempEnd = '';
	let editError = '';

	// Initialize editing values when entering edit mode
	$: if (isEditing && !tempStart && !tempEnd) {
		tempStart = formatDateTimeForInput(schedule.proposedStart);
		tempEnd = formatDateTimeForInput(schedule.proposedEnd);
		editError = '';
	}

	// Calculate duration for display
	$: duration = calculateDuration(schedule.proposedStart, schedule.proposedEnd);
	$: priorityClass = getPriorityClass(schedule.task?.priority);

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
		tempEnd = formatDateTimeForInput(schedule.proposedEnd);
		editError = '';
		isEditing = true;
		dispatch('editStart', { schedule });
	}

	function cancelEditing() {
		isEditing = false;
		tempStart = '';
		tempEnd = '';
		editError = '';
		dispatch('editCancel', { schedule });
	}

	function saveEdit() {
		if (!tempStart || !tempEnd) {
			editError = 'Both start and end times are required';
			return;
		}

		const newStart = parseDateTimeFromInput(tempStart);
		const newEnd = parseDateTimeFromInput(tempEnd);

		// Validate times
		if (newEnd <= newStart) {
			editError = 'End time must be after start time';
			return;
		}

		// Check if duration is reasonable (not more than 8 hours)
		const durationMinutes = calculateDuration(newStart, newEnd);
		if (durationMinutes > 480) {
			editError = 'Task duration cannot exceed 8 hours';
			return;
		}

		dispatch('editSave', {
			schedule,
			newStart,
			newEnd
		});

		isEditing = false;
		tempStart = '';
		tempEnd = '';
		editError = '';
	}

	function resetToOriginal() {
		if (schedule.originalStart && schedule.originalEnd) {
			tempStart = formatDateTimeForInput(schedule.originalStart);
			tempEnd = formatDateTimeForInput(schedule.originalEnd);
			editError = '';
			dispatch('reset', { schedule });
		}
	}
</script>

<div
	id="task-schedule-item-{schedule.task.id}"
	class="p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border {schedule.hasConflict
		? 'border-rose-200 dark:border-rose-700'
		: 'border-gray-200 dark:border-gray-700'} transition-all duration-200"
>
	{#if isEditing}
		<!-- Editing Mode -->
		<div class="space-y-3">
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

			<!-- Date/Time Inputs -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div>
					<label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
						Start Time
					</label>
					<TextInput
						type="datetime-local"
						bind:value={tempStart}
						class="text-sm"
						size="sm"
						error={editError && !tempStart}
					/>
				</div>
				<div>
					<label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
						End Time
					</label>
					<TextInput
						type="datetime-local"
						bind:value={tempEnd}
						class="text-sm"
						size="sm"
						error={editError && !tempEnd}
					/>
				</div>
			</div>

			{#if editError}
				<p class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
					<AlertTriangle class="w-3 h-3" />
					{editError}
				</p>
			{/if}

			<!-- Action Buttons -->
			<div class="flex items-center justify-between">
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
						title="Reset to original time"
					>
						<RotateCcw class="w-4 h-4" />
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Display Mode -->
		<div class="flex items-center justify-between">
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h4 class="font-medium text-gray-900 dark:text-white truncate">
						{schedule.task?.title || 'Untitled Task'}
					</h4>
					{#if schedule.task?.priority && !compact}
						<span class="px-2 py-0.5 text-xs rounded-full {priorityClass}">
							{schedule.task.priority}
						</span>
					{/if}
				</div>

				{#if compact}
					<div
						class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1"
					>
						<span class="flex items-center gap-1">
							<Calendar class="w-3 h-3" />
							{formatDateTime(schedule.proposedStart)}
						</span>
						<span>{duration} min</span>
					</div>
				{:else}
					<div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
						{formatDateTime(schedule.proposedStart)}
						<span class="text-xs ml-2">({duration} min)</span>
					</div>
				{/if}

				{#if schedule.hasConflict}
					<div
						class="text-sm text-rose-600 dark:text-rose-400 flex items-start gap-1 mt-1"
					>
						<AlertTriangle class="w-3 h-3 flex-shrink-0 mt-0.5" />
						<span class="truncate">{schedule.conflictReason}</span>
					</div>
				{/if}
			</div>

			<!-- {#if !compact} -->
			<div class="flex items-center gap-2 ml-3">
				<Button onclick={startEditing} variant="ghost" size="sm" title="Edit times">
					<Clock class="w-4 h-4" />
				</Button>
			</div>
			<!-- {/if} -->
		</div>
	{/if}
</div>
