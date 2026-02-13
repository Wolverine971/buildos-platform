<!-- apps/web/src/lib/components/phases/TaskItem.svelte -->
<script lang="ts">
	import {
		GripVertical,
		CircleCheck,
		Trash2,
		CalendarClock,
		CalendarCheck,
		CalendarX,
		TriangleAlert,
		Save,
		X,
		Calendar,
		Clock,
		Circle,
		RefreshCw
	} from 'lucide-svelte';

	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import { format } from 'date-fns';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatDateTimeForDisplay } from '$utils/date-utils';
	import type { PhaseWithTasks, TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { parseApiResponse } from '$utils/api-client-helpers';
	import { fade } from 'svelte/transition';
	import { formatDeletionDate } from '$lib/utils/soft-delete.utils';

	let {
		task,
		phase = null,
		showGrip = true,
		index = 0,
		viewMode = 'timeline'
	}: {
		task: TaskWithCalendarEvents;
		phase?: PhaseWithTasks | null;
		showGrip?: boolean;
		index?: number;
		viewMode?: 'timeline' | 'kanban';
	} = $props();

	// Memoization cache for task type calculations
	const taskTypeCache = new Map<string, string>();
	const taskIconCache = new Map<string, any>();

	// Track if task has actually changed to prevent unnecessary re-renders using Svelte 5 pattern
	let prevTask = $state(task);
	let taskHasChanged = $derived(
		prevTask.id !== task.id ||
			prevTask.title !== task.title ||
			prevTask.status !== task.status ||
			prevTask.start_date !== task.start_date ||
			prevTask.deleted_at !== task.deleted_at ||
			prevTask.task_calendar_events?.length !== task.task_calendar_events?.length
	);

	// Update prevTask when task changes
	$effect(() => {
		prevTask = task;
	});

	const dispatch = createEventDispatcher();

	// Date editing state
	let editingDate = $state(false);
	let tempDateTime = $state('');
	let dateEditError = $state<string | null>(null);

	// Drag state
	let isDragging = $state(false);

	// Simplified date conversion helper functions (from TaskModal)
	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';

		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';

			// Format for HTML datetime-local input
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;

		try {
			// The datetime-local input gives us a value in local time
			// Just create a date directly from it
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;

			// Convert to ISO string for storage (UTC)
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
			return null;
		}
	}

	function isTaskOutsidePhase(
		task: TaskWithCalendarEvents,
		phase: PhaseWithTasks | null
	): boolean {
		if (!phase || !task.start_date) return false;

		const phaseStart = new Date(phase.start_date);
		const phaseEnd = new Date(phase.end_date);
		const taskStart = new Date(task.start_date);

		return taskStart < phaseStart || taskStart > phaseEnd;
	}

	// Memoized task type calculation
	function getTaskTypeMemoized(
		task: TaskWithCalendarEvents
	): 'completed' | 'overdue' | 'deleted' | 'scheduled' | 'active' {
		// Create cache key based on task properties that affect type
		const cacheKey = `${task.id}-${task.status}-${task.start_date}-${task.deleted_at}-${task.task_calendar_events?.length || 0}`;

		// Check cache first
		if (taskTypeCache.has(cacheKey)) {
			return taskTypeCache.get(cacheKey) as any;
		}

		// Calculate task type
		let taskType: 'completed' | 'overdue' | 'deleted' | 'scheduled' | 'active';

		if (task.status === 'done') {
			taskType = 'completed';
		} else if (task.deleted_at) {
			taskType = 'deleted';
		} else if (
			task.start_date &&
			new Date(task.start_date) < new Date() &&
			task.status !== 'done'
		) {
			taskType = 'overdue';
		} else {
			const hasCalendarEvent = task.task_calendar_events?.some(
				(e) => e.sync_status === 'synced' || e.sync_status === 'pending'
			);
			taskType = hasCalendarEvent ? 'scheduled' : 'active';
		}

		// Cache the result (keep cache small)
		if (taskTypeCache.size > 50) {
			const firstKey = taskTypeCache.keys().next().value;
			taskTypeCache.delete(firstKey);
		}
		taskTypeCache.set(cacheKey, taskType);

		return taskType;
	}

	// Get task type/status for icon display (legacy wrapper)
	function getTaskType(task: TaskWithCalendarEvents) {
		return getTaskTypeMemoized(task);
	}

	// Memoized icon calculation
	function getTaskIconMemoized(type: string) {
		if (taskIconCache.has(type)) {
			return taskIconCache.get(type);
		}

		let icon;
		switch (type) {
			case 'completed':
				icon = CircleCheck;
				break;
			case 'overdue':
				icon = Clock;
				break;
			case 'deleted':
				icon = Trash2;
				break;
			case 'scheduled':
				icon = Calendar;
				break;
			default:
				icon = Circle;
		}

		taskIconCache.set(type, icon);
		return icon;
	}

	// Get icon and color based on task type (legacy wrapper)
	function getTaskIcon(type: string) {
		return getTaskIconMemoized(type);
	}

	function getTaskIconColor(type: string): string {
		switch (type) {
			case 'completed':
				return 'text-green-500';
			case 'overdue':
				return 'text-red-600';
			case 'deleted':
				return 'text-red-600';
			case 'scheduled':
				return 'text-blue-600';
			default:
				return 'text-muted-foreground';
		}
	}

	// Calendar status functions
	function getTaskCalendarStatus(
		task: TaskWithCalendarEvents
	): 'not_scheduled' | 'scheduled_no_calendar' | 'scheduled_on_calendar' {
		if (!task.start_date) return 'not_scheduled';
		if (!task.task_calendar_events || task.task_calendar_events.length === 0)
			return 'scheduled_no_calendar';
		return 'scheduled_on_calendar';
	}

	function getCalendarIcon(status: string) {
		switch (status) {
			case 'scheduled_no_calendar':
				return CalendarX;
			case 'scheduled_on_calendar':
				return CalendarCheck;
			default:
				return CalendarClock;
		}
	}

	function getCalendarIconColor(status: string): string {
		switch (status) {
			case 'scheduled_no_calendar':
				return 'text-red-500';
			case 'scheduled_on_calendar':
				return 'text-green-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getCalendarStatusLabel(status: string): string {
		switch (status) {
			case 'scheduled_no_calendar':
				return 'Scheduled but not on calendar';
			case 'scheduled_on_calendar':
				return 'Scheduled and on calendar';
			default:
				return 'Not scheduled';
		}
	}

	// Convert reactive statements to Svelte 5 runes
	let taskType = $derived(getTaskType(task));
	let TaskIcon = $derived(getTaskIcon(taskType));
	let taskIconColor = $derived(getTaskIconColor(taskType));
	let calendarStatus = $derived(getTaskCalendarStatus(task));
	let CalendarIcon = $derived(getCalendarIcon(calendarStatus));
	let calendarIconColor = $derived(getCalendarIconColor(calendarStatus));
	let calendarStatusLabel = $derived(getCalendarStatusLabel(calendarStatus));

	function startEditingDate(event: Event) {
		event.stopPropagation();
		editingDate = true;
		tempDateTime = formatDateTimeForInput(task.start_date);
		dateEditError = null;
	}

	function cancelDateEdit(event: Event) {
		event.stopPropagation();
		editingDate = false;
		tempDateTime = '';
		dateEditError = null;
	}

	async function saveDate(event: Event) {
		event.stopPropagation();

		// Validate date
		if (tempDateTime) {
			const selectedDate = new Date(tempDateTime);
			const now = new Date();

			if (selectedDate < now) {
				dateEditError = 'Cannot schedule tasks in the past';
				return;
			}
		}

		// Check if date is outside phase dates (warning only)
		if (phase && tempDateTime) {
			const selectedDate = new Date(tempDateTime);
			const phaseStart = new Date(phase.start_date);
			const phaseEnd = new Date(phase.end_date);

			if (selectedDate < phaseStart || selectedDate > phaseEnd) {
				const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric'
				});

				if (
					!confirm(
						`This date is outside the phase dates (${shortDateFormatter.format(
							phaseStart
						)} - ${shortDateFormatter.format(phaseEnd)}). Continue anyway?`
					)
				) {
					return;
				}
			}
		}

		// Parse the datetime and create updated task
		const newStartDate = parseDateTimeFromInput(tempDateTime);
		const updatedTask = { ...task, start_date: newStartDate };

		const response = await fetch(`/api/projects/${task.project_id}/tasks/${task.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updatedTask)
		});

		const result = await parseApiResponse(response);

		if (result.success) {
			// Dispatch the updateTask event with the full updated task
			dispatch('updateTask', updatedTask);

			// Reset editing state
			editingDate = false;
			tempDateTime = '';
			dateEditError = null;
		}
	}

	// UPDATED DRAG AND DROP HANDLERS
	function handleDragStart(event: DragEvent) {
		// Set dragging state for visual feedback
		isDragging = true;

		// CRITICAL: Set the data being dragged using dataTransfer
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';

			// Pass the complete task data as JSON
			const taskData = {
				// Include all necessary task properties
				...task,
				// Override with specific values
				phase_id: (task as any).phase_id || phase?.id || null
			};

			event.dataTransfer.setData('application/json', JSON.stringify(taskData));

			// Also set plain text for compatibility
			event.dataTransfer.setData('text/plain', task.title);

			// Optional: Set drag image (can be customized)
			// const dragImage = new Image();
			// dragImage.src = 'path/to/drag-image.png';
			// event.dataTransfer.setDragImage(dragImage, 0, 0);
		}

		// Dispatch event for parent components to handle state
		dispatch('dragStart', {
			event,
			task,
			phaseId: phase?.id || null
		});
	}

	function handleDragEnd(event: DragEvent) {
		// Reset dragging state
		isDragging = false;

		// Clean up any visual states
		dispatch('dragEnd', { event });
	}

	function handleEditTask() {
		dispatch('editTask', task);
	}

	function handleDeleteTask(e: Event) {
		e.stopPropagation();
		// Pass the entire task so parent can check if it's recurring
		dispatch('deleteTask', {
			id: task.id,
			task: task,
			isRecurring: task.task_type === 'recurring'
		});
	}

	// Cleanup caches on component destroy to prevent memory leaks
	onDestroy(() => {
		taskTypeCache.clear();
		taskIconCache.clear();
	});
</script>

<div
	id="phase-task-{task.id}"
	draggable="true"
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	class="task-item group bg-card border border-border rounded-lg cursor-move hover:shadow-ink hover:bg-muted {isDragging
		? 'dragging opacity-50'
		: ''}"
	role="listitem"
	aria-label="Task: {task.title}"
	in:fade={{ duration: 200, delay: index * 20 }}
	out:fade={{ duration: 150 }}
>
	<!-- Mobile Layout: Always vertical -->
	<div class="block sm:hidden p-3">
		<div class="flex gap-3">
			<!-- Task Type Icon (minimal space) -->
			<div class="flex-shrink-0">
				<TaskIcon class="w-5 h-5 {taskIconColor}" aria-label="{taskType} task" />
			</div>

			<!-- Content Column -->
			<div class="flex-1 min-w-0">
				<!-- Title Row -->
				<button
					onclick={handleEditTask}
					class="w-full text-left {task.status === 'done'
						? 'line-through text-muted-foreground'
						: 'text-foreground'} hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 focus:outline-none"
					aria-label="Edit task: {task.title}"
					type="button"
				>
					<span class="text-sm leading-tight truncate block">
						{task.title}
						{#if task.task_type === 'recurring'}
							<RefreshCw
								class="inline-block w-3.5 h-3.5 ml-1 text-blue-500 dark:text-blue-400"
								title="Recurring task - {task.recurrence_pattern || 'repeating'}"
							/>
						{/if}
					</span>
				</button>

				{#if task.deleted_at}
					<div class="text-xs text-red-500 mt-1">
						Deleted {formatDeletionDate(task.deleted_at)}
					</div>
				{/if}

				<!-- Actions Row -->
				<div class="flex items-center gap-2 mt-1">
					<!-- Calendar Status -->
					{#if calendarStatus !== 'not_scheduled'}
						<div
							class="flex items-center gap-1"
							title={calendarStatusLabel}
							aria-label={calendarStatusLabel}
						>
							<CalendarIcon
								class="w-3.5 h-3.5 {calendarIconColor}"
								aria-hidden="true"
							/>
						</div>
					{/if}

					<!-- Date -->
					{#if task.start_date}
						<div class="flex items-center gap-1 text-xs text-muted-foreground">
							{#if isTaskOutsidePhase(task, phase)}
								<TriangleAlert
									class="w-3.5 h-3.5 text-yellow-500"
									aria-label="Warning: Task is outside phase dates"
								/>
							{/if}

							<!-- Stable container for date editing to prevent layout shift -->
							<div
								class="date-edit-container min-h-[3rem] flex flex-col justify-center"
							>
								{#if editingDate}
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<TextInput
												id="mobile-datetime-{task.id}"
												type="datetime-local"
												bind:value={tempDateTime}
												onclick={(e) => e.stopPropagation()}
												class="text-xs {dateEditError
													? 'border-red-500'
													: ''}"
												size="sm"
												aria-describedby={dateEditError
													? `mobile-date-error-${task.id}`
													: undefined}
											/>
											<Button
												onclick={saveDate}
												variant="ghost"
												size="sm"
												icon={Save}
												class="!p-1 !min-h-0 flex-shrink-0"
												aria-label="Save date"
											/>
											<Button
												onclick={cancelDateEdit}
												variant="ghost"
												size="sm"
												icon={X}
												class="!p-1 !min-h-0 flex-shrink-0"
												aria-label="Cancel"
											/>
										</div>
										{#if dateEditError}
											<span
												id="mobile-date-error-{task.id}"
												class="text-xs text-red-500"
												role="alert"
											>
												{dateEditError}
											</span>
										{/if}
									</div>
								{:else}
									<Button
										onclick={startEditingDate}
										variant="ghost"
										size="sm"
										class="!text-xs !p-0 !min-h-0 hover:!text-blue-600 dark:hover:!text-blue-400 justify-start"
										aria-label="Edit start date: {formatDateTimeForDisplay(
											task.start_date
										)}"
									>
										{formatDateTimeForDisplay(task.start_date)}
									</Button>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Recent Activity -->
					<RecentActivityIndicator
						createdAt={task.created_at}
						updatedAt={task.updated_at}
						size="xs"
					/>

					<!-- Delete Button -->
					<Button
						onclick={handleDeleteTask}
						variant="ghost"
						size="sm"
						icon={Trash2}
						class="!p-1 !text-muted-foreground hover:!text-red-600 dark:hover:!text-red-400 !min-h-0 ml-auto"
						aria-label="Delete task: {task.title}"
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- Desktop Layout: Conditional based on view mode -->
	{#if viewMode === 'kanban'}
		<!-- Kanban Desktop Layout: Vertical stacking like mobile but optimized for desktop -->
		<div class="hidden sm:block p-3">
			<div class="flex gap-2">
				<!-- Drag Handle and Icon -->
				<div class="flex flex-col items-center gap-1 flex-shrink-0">
					{#if showGrip}
						<GripVertical
							class="w-4 h-4 text-muted-foreground drag-handle"
							aria-hidden="true"
						/>
					{/if}
					<TaskIcon class="w-4 h-4 {taskIconColor}" aria-label="{taskType} task" />
				</div>

				<!-- Content Column -->
				<div class="flex-1 min-w-0">
					<!-- Title Row - Full width, clear and unobscured -->
					<div class="flex items-start justify-between gap-2 mb-2">
						<Button
							onclick={handleEditTask}
							class="flex-1 text-left {task.status === 'done'
								? 'line-through text-muted-foreground'
								: 'text-foreground'} hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 focus:outline-none"
							aria-label="Edit task: {task.title}"
							type="button"
						>
							<span class="text-sm leading-tight block break-words">
								{task.title}
								{#if task.task_type === 'recurring'}
									<RefreshCw
										class="inline-block w-3.5 h-3.5 ml-1 text-blue-500 dark:text-blue-400"
										title="Recurring task - {task.recurrence_pattern ||
											'repeating'}"
									/>
								{/if}
							</span>
						</Button>

						{#if task.deleted_at}
							<div class="text-xs text-red-500">
								Deleted {formatDeletionDate(task.deleted_at)}
							</div>
						{/if}

						<!-- Delete Button -->
						<Button
							onclick={handleDeleteTask}
							variant="ghost"
							size="sm"
							icon={Trash2}
							class="opacity-0 group-hover:opacity-100 !p-1 !text-muted-foreground hover:!text-red-600 dark:hover:!text-red-400 transition-opacity flex-shrink-0"
							aria-label="Delete task: {task.title}"
						/>
					</div>

					<!-- Metadata Row - Below title -->
					<div class="flex items-center gap-2 flex-wrap">
						<!-- Recent Activity -->
						<RecentActivityIndicator
							createdAt={task.created_at}
							updatedAt={task.updated_at}
							size="xs"
						/>

						<!-- Calendar Status -->
						{#if calendarStatus !== 'not_scheduled'}
							<div
								class="flex items-center gap-1"
								title={calendarStatusLabel}
								aria-label={calendarStatusLabel}
							>
								<CalendarIcon
									class="w-3.5 h-3.5 {calendarIconColor}"
									aria-hidden="true"
								/>
							</div>
						{/if}

						<!-- Date -->
						{#if task.start_date}
							<div class="flex items-center gap-1 text-xs text-muted-foreground">
								{#if isTaskOutsidePhase(task, phase)}
									<TriangleAlert
										class="w-3.5 h-3.5 text-yellow-500"
										aria-label="Warning: Task is outside phase dates"
									/>
								{/if}

								<!-- Stable container for date editing to prevent layout shift -->
								<div
									class="date-edit-container min-h-[3rem] flex flex-col justify-center"
								>
									{#if editingDate}
										<div class="flex flex-col gap-1">
											<div class="flex items-center gap-1">
												<TextInput
													id="kanban-datetime-{task.id}"
													type="datetime-local"
													bind:value={tempDateTime}
													onclick={(e) => e.stopPropagation()}
													class="text-xs {dateEditError
														? 'border-red-500'
														: ''}"
													size="sm"
													aria-describedby={dateEditError
														? `kanban-date-error-${task.id}`
														: undefined}
												/>
												<Button
													onclick={saveDate}
													variant="ghost"
													size="sm"
													icon={Save}
													class="!p-1 !min-h-0 flex-shrink-0"
													aria-label="Save date"
												/>
												<Button
													onclick={cancelDateEdit}
													variant="ghost"
													size="sm"
													icon={X}
													class="!p-1 !min-h-0 flex-shrink-0"
													aria-label="Cancel"
												/>
											</div>
											{#if dateEditError}
												<span
													id="kanban-date-error-{task.id}"
													class="text-xs text-red-500"
													role="alert"
												>
													{dateEditError}
												</span>
											{/if}
										</div>
									{:else}
										<Button
											onclick={startEditingDate}
											variant="ghost"
											size="sm"
											class="!text-xs !p-0 !min-h-0 hover:!text-blue-600 dark:hover:!text-blue-400"
											aria-label="Edit start date: {formatDateTimeForDisplay(
												task.start_date
											)}"
										>
											{formatDateTimeForDisplay(task.start_date)}
										</Button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Timeline Desktop Layout: Original single row -->
		<div class="hidden sm:flex items-center p-3 min-h-[52px] gap-3">
			<!-- Drag Handle -->
			{#if showGrip}
				<GripVertical
					class="w-4 h-4 text-muted-foreground flex-shrink-0 drag-handle"
					aria-hidden="true"
				/>
			{/if}

			<!-- Task Type Icon -->
			<div class="flex-shrink-0">
				<TaskIcon class="w-4 h-4 {taskIconColor}" aria-label="{taskType} task" />
			</div>

			<!-- Title -->
			<button
				onclick={handleEditTask}
				class="flex-1 text-left {task.status === 'done'
					? 'line-through text-muted-foreground'
					: 'text-foreground'} hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 focus:outline-none truncate"
				aria-label="Edit task: {task.title}"
				type="button"
			>
				{task.title}
				{#if task.task_type === 'recurring'}
					<RefreshCw
						class="inline-block w-3.5 h-3.5 ml-1 text-blue-500 dark:text-blue-400"
						title="Recurring task - {task.recurrence_pattern || 'repeating'}"
					/>
				{/if}
			</button>

			<!-- Recent Activity -->
			<div class="flex-shrink-0">
				<RecentActivityIndicator
					createdAt={task.created_at}
					updatedAt={task.updated_at}
					size="xs"
				/>
			</div>

			<!-- Calendar Status -->
			{#if calendarStatus !== 'not_scheduled'}
				<div
					class="flex-shrink-0"
					title={calendarStatusLabel}
					aria-label={calendarStatusLabel}
				>
					<CalendarIcon class="w-4 h-4 {calendarIconColor}" aria-hidden="true" />
				</div>
			{/if}

			<!-- Date -->
			{#if task.start_date}
				<div class="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
					{#if isTaskOutsidePhase(task, phase)}
						<TriangleAlert
							class="w-4 h-4 text-yellow-500"
							aria-label="Warning: Task is outside phase dates"
						/>
					{/if}

					<!-- Stable container for date editing to prevent layout shift -->
					<div class="date-edit-container min-h-[3rem] flex flex-col justify-center">
						{#if editingDate}
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-1">
									<TextInput
										id="desktop-datetime-{task.id}"
										type="datetime-local"
										bind:value={tempDateTime}
										onclick={(e) => e.stopPropagation()}
										class="text-xs w-40 {dateEditError ? 'border-red-500' : ''}"
										size="sm"
										aria-describedby={dateEditError
											? `desktop-date-error-${task.id}`
											: undefined}
									/>
									<Button
										onclick={saveDate}
										variant="ghost"
										size="sm"
										icon={Save}
										class="!p-1 !min-h-0 flex-shrink-0"
										aria-label="Save date"
									/>
									<Button
										onclick={cancelDateEdit}
										variant="ghost"
										size="sm"
										icon={X}
										class="!p-1 !min-h-0 flex-shrink-0"
										aria-label="Cancel"
									/>
								</div>
								{#if dateEditError}
									<span
										id="desktop-date-error-{task.id}"
										class="text-xs text-red-500"
										role="alert"
									>
										{dateEditError}
									</span>
								{/if}
							</div>
						{:else}
							<Button
								onclick={startEditingDate}
								variant="ghost"
								size="sm"
								class="!text-xs !p-1 !min-h-0 hover:!text-blue-600 dark:hover:!text-blue-400 w-20 text-left"
								aria-label="Edit start date: {formatDateTimeForDisplay(
									task.start_date
								)}"
							>
								{formatDateTimeForDisplay(task.start_date)}
							</Button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Delete Button -->
			<Button
				onclick={handleDeleteTask}
				variant="ghost"
				size="sm"
				icon={Trash2}
				class="opacity-0 group-hover:opacity-100 !p-1.5 !text-muted-foreground hover:!text-red-600 dark:hover:!text-red-400 transition-opacity flex-shrink-0"
				aria-label="Delete task: {task.title}"
			/>
		</div>
	{/if}
</div>

<style>
	/* ==================== GPU-Optimized Task Item Transitions ==================== */

	.task-item {
		/* GPU acceleration */
		transform: translateZ(0);
		backface-visibility: hidden;
		transform-origin: center;

		/* Only animate GPU-friendly properties */
		transition-property: transform, opacity, box-shadow, background-color;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);

		/* Pre-warm GPU */
		will-change: transform;
	}

	/* Cleanup will-change when not hovering/dragging */
	.task-item:not(:hover):not(.dragging) {
		will-change: auto;
	}

	.task-item:hover {
		transform: translateY(-1px) translateZ(0);
	}

	/* Dragging state */
	.task-item.dragging {
		opacity: 0.5;
		transform: scale(0.95) translateZ(0);
		cursor: grabbing;
		will-change: transform, opacity;
	}

	/* Drag handle cursor */
	:global(.drag-handle) {
		cursor: grab;
	}

	:global(.drag-handle:active) {
		cursor: grabbing;
	}

	/* Moving state (reordering) */
	:global(.task-item[data-moving='true']) {
		transition-property: transform, opacity;
		transition-duration: 300ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 0.6;
		transform: scale(0.99) translateZ(0);
		will-change: transform, opacity;
	}

	/* Mobile touch feedback */
	@media (max-width: 640px) {
		.task-item:hover {
			transform: none;
		}

		.task-item:active {
			transform: scale(0.99);
		}
	}

	/* Datetime input sizing */
	:global(.task-item input[type='datetime-local']) {
		font-size: 0.75rem;
	}

	/* Focus states for non-title buttons only */
	:global(.task-item button:not(.task-title):focus-visible) {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
	}
</style>
