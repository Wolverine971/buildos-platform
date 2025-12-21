<!-- apps/web/src/lib/components/project/TasksList.svelte -->
<script lang="ts">
	import {
		Circle,
		CircleCheck,
		Plus,
		Trash2,
		RotateCcw,
		TriangleAlert,
		Calendar,
		CalendarPlus,
		CalendarX,
		Clock,
		LoaderCircle,
		ChevronDown,
		ArrowUp,
		ArrowDown,
		CalendarCheck,
		RefreshCw,
		X
	} from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import CurrentTimeIndicator from '$lib/components/ui/CurrentTimeIndicator.svelte';
	import {
		isDateInPast,
		formatRelativeTime,
		formatDateTimeForDisplay
	} from '$lib/utils/date-utils';
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { toastService } from '$lib/stores/toast.store';
	import { ProjectService } from '$lib/services/projectService';

	// Essential props only - callbacks and config
	let {
		innerWidth,
		onCreateTask,
		onEditTask,
		onAddTaskToCalendar,
		onMarkDeleted,
		calendarStatus = {}
	}: {
		innerWidth: number;
		onCreateTask: () => void;
		onEditTask: (task: TaskWithCalendarEvents) => void;
		onAddTaskToCalendar: (task: TaskWithCalendarEvents) => void;
		onMarkDeleted: (task: TaskWithCalendarEvents) => void;
		calendarStatus?: any;
	} = $props();

	// Get everything from v2 store
	const projectService = ProjectService.getInstance();

	// Memoization cache for task type calculations
	const taskTypeCache = new Map<string, string>();

	// FIXED: Use direct store derivation instead of manual subscription
	let storeState = $derived($projectStoreV2);

	// Svelte 5 runes for optimal performance and fine-grained reactivity
	let projectId = $derived(storeState?.project?.id);
	let allTasksFromStore = $derived(storeState?.tasks || []);
	let calendarConnected = $derived(calendarStatus?.isConnected);

	// These are just for counting, not for display - using Svelte 5 runes
	let deletedTasksList = $derived(allTasksFromStore.filter((t: any) => t.deleted_at));
	let doneTasksList = $derived(
		allTasksFromStore.filter((t: any) => t.status === 'done' || t.status === 'completed')
	);
	let scheduledTasksList = $derived(
		allTasksFromStore.filter((t: any) => {
			const hasActiveEvents = t.task_calendar_events?.some(
				(e: any) => e.sync_status === 'synced' || e.sync_status === 'pending'
			);
			return (
				hasActiveEvents && t.status !== 'done' && t.status !== 'completed' && !t.deleted_at
			);
		})
	);

	// Memoized task type helper
	function getTaskTypeMemoized(task: any) {
		// Create cache key based on task properties that affect type
		const cacheKey = `${task.id}-${task.task_type}-${task.status}-${task.start_date}-${task.deleted_at}-${task.task_calendar_events?.length || 0}`;

		// Check cache first
		if (taskTypeCache.has(cacheKey)) {
			return taskTypeCache.get(cacheKey);
		}

		// Calculate task type
		let taskType: string;

		// Check recurring first so recurring tasks can also be categorized as overdue, scheduled, etc.
		if (task.task_type === 'recurring') {
			taskType = 'recurring';
		} else if (task.status === 'done') {
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
				(e: any) => e.sync_status === 'synced' || e.sync_status === 'pending'
			);
			taskType = hasCalendarEvent ? 'scheduled' : 'active';
		}

		// Cache the result (keep cache small)
		if (taskTypeCache.size > 100) {
			const firstKey = taskTypeCache.keys().next().value;
			taskTypeCache.delete(firstKey);
		}
		taskTypeCache.set(cacheKey, taskType);

		return taskType;
	}

	// Task type helper (legacy wrapper)
	function getTaskType(task: any) {
		return getTaskTypeMemoized(task);
	}

	// Local UI state only
	type TaskFilter = 'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring';
	let activeFilters: Set<TaskFilter> = $state(new Set(['active']));

	type SortField = 'created_at' | 'updated_at' | 'start_date';
	type SortDirection = 'asc' | 'desc';
	let sortField: SortField = $state('start_date');
	let sortDirection: SortDirection = $state('asc');
	let showSortDropdown = $state(false);
	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	// ===== BULK SELECTION STATE =====
	let selectedTaskIds = $state(new Set<string>());
	let bulkActionInProgress = $state(false);
	let bulkActionWarnings = $state<string[]>([]);

	// UI state for bulk action dropdowns
	let showBulkStatusDropdown = $state(false);
	let showBulkPriorityDropdown = $state(false);

	// Confirmation modal state
	let showRemoveDatesModal = $state(false);
	let showDeleteModal = $state(false);
	let tasksWithDatesToRemove = $state<any[]>([]);

	// Reactive computed values for selection
	let allTasksSelected = $derived(
		filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.has(task.id))
	);

	let someTasksSelected = $derived(selectedTaskIds.size > 0 && !allTasksSelected);

	let selectedTasks = $derived(filteredTasks.filter((task) => selectedTaskIds.has(task.id)));

	// Filter and sort tasks using Svelte 5 runes for better performance
	let filteredTasks = $derived(
		allTasksFromStore
			.filter((task) => activeFilters.has(getTaskType(task)))
			.sort((a, b) => {
				let aValue = a[sortField];
				let bValue = b[sortField];

				if (!aValue && !bValue) return 0;
				if (!aValue) return 1;
				if (!bValue) return -1;

				// Safe date parsing to prevent crashes
				const aDate = aValue ? new Date(aValue) : new Date(0);
				const bDate = bValue ? new Date(bValue) : new Date(0);

				// Check for invalid dates
				if (isNaN(aDate.getTime()) && isNaN(bDate.getTime())) return 0;
				if (isNaN(aDate.getTime())) return 1;
				if (isNaN(bDate.getTime())) return -1;

				const comparison = aDate.getTime() - bDate.getTime();
				return sortDirection === 'desc' ? -comparison : comparison;
			})
	);

	// Task counts by type - using Svelte 5 runes for better performance
	function computeTaskCounts() {
		const tasks = allTasksFromStore;
		const counts = {
			all: tasks.length,
			active: 0,
			scheduled: 0,
			deleted: 0,
			completed: 0,
			overdue: 0,
			recurring: 0
		};

		for (const task of tasks) {
			let taskType: string;

			if (task.task_type === 'recurring') {
				taskType = 'recurring';
			} else if (task.status === 'done') {
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
					(e: any) => e.sync_status === 'synced' || e.sync_status === 'pending'
				);
				taskType = hasCalendarEvent ? 'scheduled' : 'active';
			}

			if (taskType in counts) {
				counts[taskType as keyof typeof counts]++;
			}
		}

		return counts;
	}

	let taskCounts = $derived(computeTaskCounts());

	// Check if task is loading/scheduling using Svelte 5 runes
	let isTaskLoading = $derived(
		(taskId: string) => storeState.loadingStates?.[`task-${taskId}`] === 'loading'
	);
	let isTaskScheduling = $derived(
		(taskId: string) => storeState.loadingStates?.[`schedule-${taskId}`] === 'loading'
	);

	// Filter management
	function toggleFilter(filter: TaskFilter) {
		console.log(
			'[TasksList] Toggling filter:',
			filter,
			'Current filters:',
			Array.from(activeFilters)
		);

		// FIXED: Create new Set to ensure Svelte 5 reactivity
		const newFilters = new Set(activeFilters);
		if (newFilters.has(filter)) {
			newFilters.delete(filter);
		} else {
			newFilters.add(filter);
		}
		activeFilters = newFilters;

		console.log('[TasksList] New filters after toggle:', Array.from(activeFilters));
	}

	function selectAllFilters() {
		// Toggle behavior: if all filters are active, unselect all; otherwise, select all
		const allFilters: TaskFilter[] = [
			'active',
			'scheduled',
			'deleted',
			'completed',
			'overdue',
			'recurring'
		];
		const allActive = allFilters.every((f) => activeFilters.has(f));

		activeFilters = allActive ? new Set() : new Set(allFilters);
	}

	// Sort management
	function setSortField(field: SortField) {
		if (sortField === field) {
			sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}
		showSortDropdown = false;
	}

	// ===== BULK SELECTION FUNCTIONS =====

	/**
	 * Toggle individual task selection
	 * CRITICAL: Stop event propagation to prevent opening task edit modal
	 */
	function toggleTaskSelection(taskId: string, event: Event) {
		event.stopPropagation();

		if (selectedTaskIds.has(taskId)) {
			selectedTaskIds.delete(taskId);
		} else {
			selectedTaskIds.add(taskId);
		}

		// CRITICAL: Reassign to trigger Svelte 5 reactivity
		selectedTaskIds = new Set(selectedTaskIds);
	}

	/**
	 * Toggle "select all" for current filtered view
	 */
	function toggleSelectAll() {
		if (allTasksSelected) {
			// Deselect all
			selectedTaskIds = new Set();
		} else {
			// Select all filtered tasks
			selectedTaskIds = new Set(filteredTasks.map((t) => t.id));
		}
	}

	/**
	 * Clear all selections and warnings
	 */
	function clearSelection() {
		selectedTaskIds = new Set();
		bulkActionWarnings = [];
		showBulkStatusDropdown = false;
		showBulkPriorityDropdown = false;
	}

	/**
	 * Clean up selection after filter changes
	 * Removes tasks that are no longer in filtered view
	 */
	function cleanupSelection() {
		const validTaskIds = new Set(filteredTasks.map((t) => t.id));
		const newSelection = new Set<string>();

		for (const id of selectedTaskIds) {
			if (validTaskIds.has(id)) {
				newSelection.add(id);
			}
		}

		if (newSelection.size !== selectedTaskIds.size) {
			selectedTaskIds = newSelection;
		}
	}

	// Task actions
	async function handleScheduleTask(task: TaskWithCalendarEvents) {
		if (!task.id) return;

		projectStoreV2.setLoading(`schedule-${task.id}`, true);
		try {
			await onAddTaskToCalendar(task);
		} finally {
			projectStoreV2.setLoading(`schedule-${task.id}`, false);
		}
	}

	async function handleRestoreTask(task: TaskWithCalendarEvents) {
		if (!task.id || !projectService || !projectId) return;

		projectStoreV2.setLoading(`task-${task.id}`, true);

		// Optimistic update
		const restoredTask = { ...task, deleted_at: null };
		projectStoreV2.updateTask(restoredTask);

		try {
			const response = await projectService.updateTask(task.id, restoredTask, projectId);
			if (response.success && response?.data?.task) {
				projectStoreV2.updateTask(response.data.task);
				toastService.success('Task restored successfully');
			} else {
				// Revert on failure
				projectStoreV2.updateTask(task);
				toastService.error('Failed to restore task');
			}
		} catch (error) {
			projectStoreV2.updateTask(task);
			toastService.error('Failed to restore task');
		} finally {
			projectStoreV2.setLoading(`task-${task.id}`, false);
		}
	}

	async function handleToggleTaskComplete(task: TaskWithCalendarEvents) {
		if (!task.id || getTaskType(task) === 'deleted' || !projectService || !projectId) return;

		projectStoreV2.setLoading(`task-${task.id}`, true);

		const isComplete = task.status === 'done';
		const newStatus = isComplete ? 'backlog' : 'done';
		const completedAt = newStatus === 'done' ? new Date().toISOString() : null;

		// Optimistic update
		const updatedTask = {
			...task,
			status: newStatus,
			completed_at: completedAt
		};
		projectStoreV2.updateTask(updatedTask);

		try {
			const response = await projectService.updateTask(
				updatedTask.id,
				updatedTask as TaskWithCalendarEvents,
				projectId
			);

			if (response.success && response?.data?.task) {
				projectStoreV2.updateTask(response.data.task);
				toastService.success(
					isComplete ? 'Task marked as incomplete' : 'Task marked as complete'
				);
			} else {
				// Revert on failure
				projectStoreV2.updateTask(task);
				toastService.error('Failed to update task status');
			}
		} catch (error) {
			projectStoreV2.updateTask(task);
			toastService.error('Failed to update task status');
		} finally {
			projectStoreV2.setLoading(`task-${task.id}`, false);
		}
	}

	// ===== BULK OPERATION HANDLERS =====

	/**
	 * Handle bulk status change with optimistic updates
	 */
	async function handleBulkStatusChange(
		newStatus: 'backlog' | 'in_progress' | 'done' | 'blocked'
	) {
		if (selectedTaskIds.size === 0 || !projectId) return;

		bulkActionInProgress = true;
		bulkActionWarnings = [];
		showBulkStatusDropdown = false;

		try {
			const updates = Array.from(selectedTaskIds).map((id) => ({
				id,
				data: {
					status: newStatus,
					...(newStatus === 'done' ? { completed_at: new Date().toISOString() } : {}),
					...(newStatus !== 'done' &&
					selectedTasks.find((t) => t.id === id)?.status === 'done'
						? { completed_at: null }
						: {})
				}
			}));

			// Optimistic update
			updates.forEach(({ id, data }) => {
				const task = allTasksFromStore.find((t) => t.id === id);
				if (task) {
					projectStoreV2.updateTask({ ...task, ...data });
				}
			});

			// Call batch API
			const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ updates })
			});

			if (!response.ok) {
				throw new Error('Batch update failed');
			}

			const resp = await response.json();

			const result = resp.data;
			// Handle partial failures
			if (result.failed && result.failed.length > 0) {
				result.failed.forEach(({ id, error }: { id: string; error: string }) => {
					const originalTask = allTasksFromStore.find((t) => t.id === id);
					if (originalTask) {
						projectStoreV2.updateTask(originalTask);
					}
					bulkActionWarnings.push(`Failed to update task: ${error}`);
				});
			}

			// Update store with successful results
			if (result.successful) {
				result.successful.forEach((task: any) => {
					projectStoreV2.updateTask(task);
				});
			}

			toastService.success(
				`${result.summary?.successful || result.successful?.length || 0} task${result.summary?.successful > 1 ? 's' : ''} updated`
			);

			// Clear selection after successful operation
			if (!result.failed || result.failed.length === 0) {
				clearSelection();
			}
		} catch (error) {
			console.error('Bulk status change failed:', error);
			toastService.error('Failed to update tasks');

			// Rollback all optimistic updates
			selectedTasks.forEach((task) => {
				const originalTask = allTasksFromStore.find((t) => t.id === task.id);
				if (originalTask) {
					projectStoreV2.updateTask(originalTask);
				}
			});
		} finally {
			bulkActionInProgress = false;
		}
	}

	/**
	 * Handle bulk priority change
	 */
	async function handleBulkPriorityChange(newPriority: 'low' | 'medium' | 'high') {
		if (selectedTaskIds.size === 0 || !projectId) return;

		bulkActionInProgress = true;
		bulkActionWarnings = [];
		showBulkPriorityDropdown = false;

		try {
			const updates = Array.from(selectedTaskIds).map((id) => ({
				id,
				data: { priority: newPriority }
			}));

			// Optimistic update
			updates.forEach(({ id, data }) => {
				const task = allTasksFromStore.find((t) => t.id === id);
				if (task) {
					projectStoreV2.updateTask({ ...task, ...data });
				}
			});

			// Call batch API
			const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ updates })
			});

			if (!response.ok) {
				throw new Error('Batch update failed');
			}

			const result = await response.json();

			// Handle results
			if (result.failed && result.failed.length > 0) {
				result.failed.forEach(({ id, error }: { id: string; error: string }) => {
					const originalTask = allTasksFromStore.find((t) => t.id === id);
					if (originalTask) {
						projectStoreV2.updateTask(originalTask);
					}
					bulkActionWarnings.push(`Failed to update task: ${error}`);
				});
			}

			if (result.successful) {
				result.successful.forEach((task: any) => projectStoreV2.updateTask(task));
			}

			toastService.success(
				`${result.summary?.successful || result.successful?.length || 0} task${result.summary?.successful > 1 ? 's' : ''} updated`
			);

			// Clear selection after successful operation
			if (!result.failed || result.failed.length === 0) {
				clearSelection();
			}
		} catch (error) {
			console.error('Bulk priority change failed:', error);
			toastService.error('Failed to update tasks');

			// Rollback all optimistic updates
			selectedTasks.forEach((task) => {
				const originalTask = allTasksFromStore.find((t) => t.id === task.id);
				if (originalTask) {
					projectStoreV2.updateTask(originalTask);
				}
			});
		} finally {
			bulkActionInProgress = false;
		}
	}

	/**
	 * Handle bulk remove dates with confirmation
	 */
	function handleBulkRemoveDates() {
		if (selectedTaskIds.size === 0 || !projectId) return;

		// Check which tasks actually have dates
		const tasksWithDates = selectedTasks.filter((t) => t.start_date);

		if (tasksWithDates.length === 0) {
			toastService.info('No tasks have dates to remove');
			return;
		}

		// Show confirmation modal
		tasksWithDatesToRemove = tasksWithDates;
		showRemoveDatesModal = true;
	}

	/**
	 * Execute bulk remove dates after confirmation
	 */
	async function executeBulkRemoveDates() {
		if (!projectId) return;

		showRemoveDatesModal = false;
		bulkActionInProgress = true;
		bulkActionWarnings = [];

		try {
			const updates = tasksWithDatesToRemove.map((task) => ({
				id: task.id,
				data: {
					start_date: null,
					// Also clear recurrence if it's a recurring task
					...(task.task_type === 'recurring'
						? {
								task_type: 'one_off',
								recurrence_pattern: null,
								recurrence_ends: null
							}
						: {})
				}
			}));

			// Optimistic update
			updates.forEach(({ id, data }) => {
				const task = allTasksFromStore.find((t) => t.id === id);
				if (task) {
					projectStoreV2.updateTask({ ...task, ...data });
				}
			});

			// Call batch API (will automatically handle calendar cleanup)
			const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ updates })
			});

			if (!response.ok) {
				throw new Error('Batch update failed');
			}

			const result = await response.json();

			// Handle results
			if (result.failed && result.failed.length > 0) {
				result.failed.forEach(({ id, error }: { id: string; error: string }) => {
					const originalTask = allTasksFromStore.find((t) => t.id === id);
					if (originalTask) {
						projectStoreV2.updateTask(originalTask);
					}
					bulkActionWarnings.push(`Failed to update task: ${error}`);
				});
			}

			if (result.successful) {
				result.successful.forEach((task: any) => projectStoreV2.updateTask(task));
			}

			toastService.success(
				`Removed dates from ${result.summary?.successful || result.successful?.length || 0} task${result.summary?.successful > 1 ? 's' : ''}`
			);

			// Clear selection after successful operation
			if (!result.failed || result.failed.length === 0) {
				clearSelection();
			}
		} catch (error) {
			console.error('Bulk remove dates failed:', error);
			toastService.error('Failed to remove dates');

			// Rollback all optimistic updates
			tasksWithDatesToRemove.forEach((task) => {
				const originalTask = allTasksFromStore.find((t) => t.id === task.id);
				if (originalTask) {
					projectStoreV2.updateTask(originalTask);
				}
			});
		} finally {
			bulkActionInProgress = false;
			tasksWithDatesToRemove = [];
		}
	}

	/**
	 * Handle bulk delete (soft delete) with confirmation
	 */
	function handleBulkDelete() {
		if (selectedTaskIds.size === 0 || !projectId) return;

		// Show confirmation modal
		showDeleteModal = true;
	}

	/**
	 * Execute bulk delete after confirmation
	 */
	async function executeBulkDelete() {
		if (!projectId) return;

		showDeleteModal = false;
		bulkActionInProgress = true;
		bulkActionWarnings = [];

		try {
			const updates = Array.from(selectedTaskIds).map((id) => ({
				id,
				data: { deleted_at: new Date().toISOString() }
			}));

			// Optimistic update
			updates.forEach(({ id, data }) => {
				const task = allTasksFromStore.find((t) => t.id === id);
				if (task) {
					projectStoreV2.updateTask({ ...task, ...data });
				}
			});

			// Call batch API (will automatically handle calendar cleanup)
			const response = await fetch(`/api/projects/${projectId}/tasks/batch`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ updates })
			});

			if (!response.ok) {
				throw new Error('Batch update failed');
			}

			const result = await response.json();

			// Handle results
			if (result.failed && result.failed.length > 0) {
				result.failed.forEach(({ id, error }: { id: string; error: string }) => {
					const originalTask = allTasksFromStore.find((t) => t.id === id);
					if (originalTask) {
						projectStoreV2.updateTask(originalTask);
					}
					bulkActionWarnings.push(`Failed to delete task: ${error}`);
				});
			}

			if (result.successful) {
				result.successful.forEach((task: any) => projectStoreV2.updateTask(task));
			}

			toastService.success(
				`Deleted ${result.summary?.successful || result.successful?.length || 0} task${result.summary?.successful > 1 ? 's' : ''}`
			);

			// Clear selection after successful operation
			if (!result.failed || result.failed.length === 0) {
				clearSelection();
			}
		} catch (error) {
			console.error('Bulk delete failed:', error);
			toastService.error('Failed to delete tasks');

			// Rollback all optimistic updates
			selectedTasks.forEach((task) => {
				const originalTask = allTasksFromStore.find((t) => t.id === task.id);
				if (originalTask) {
					projectStoreV2.updateTask(originalTask);
				}
			});
		} finally {
			bulkActionInProgress = false;
		}
	}

	// Utility functions
	function getTaskIcon(task: TaskWithCalendarEvents) {
		const type = getTaskType(task);
		switch (type) {
			case 'completed':
				return CircleCheck;
			case 'deleted':
				return TriangleAlert;
			case 'overdue':
				return Clock;
			case 'scheduled':
				return Calendar;
			default:
				return Circle;
		}
	}

	function getTaskColor(task: TaskWithCalendarEvents): string {
		const type = getTaskType(task);
		switch (type) {
			case 'completed':
				return 'text-green-500';
			case 'deleted':
				return 'text-red-600';
			case 'overdue':
				return 'text-red-600';
			case 'scheduled':
				return 'text-blue-600';
			default:
				return 'text-gray-600';
		}
	}

	function getSortFieldLabel(field: SortField): string {
		switch (field) {
			case 'created_at':
				return 'Date Created';
			case 'updated_at':
				return 'Date Updated';
			case 'start_date':
				return 'Start Date';
		}
	}

	const priorityColors = {
		high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
		medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
		low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
	};

	// Helper function to get recurrence pattern text
	function getRecurrenceText(pattern: string): string {
		const patterns: Record<string, string> = {
			daily: 'Daily',
			weekdays: 'Weekdays',
			weekly: 'Weekly',
			biweekly: 'Biweekly',
			monthly: 'Monthly',
			quarterly: 'Quarterly',
			yearly: 'Yearly'
		};
		return patterns[pattern] || pattern;
	}

	// Close dropdown when clicking outside
	function handleClickOutside() {
		if (showSortDropdown) {
			showSortDropdown = false;
		}
	}

	// Cleanup selection when filters change
	$effect(() => {
		// This runs whenever activeFilters or filteredTasks changes
		if (selectedTaskIds.size > 0) {
			cleanupSelection();
		}
	});

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Cleanup cache on component destroy to prevent memory leaks
	onDestroy(() => {
		taskTypeCache.clear();
	});
</script>

<svelte:window onclick={handleClickOutside} />

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
			Tasks ({filteredTasks.length})
		</h3>
		<Button onclick={onCreateTask} variant="primary" size="sm" icon={Plus}>New Task</Button>
	</div>

	<!-- Sort Controls -->
	<div class="flex items-center gap-3">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</span>
		<div class="relative">
			<Button
				onclick={(e) => {
					e.stopPropagation();
					showSortDropdown = !showSortDropdown;
				}}
				variant="outline"
				size="sm"
				icon={ChevronDown}
				iconPosition="right"
			>
				{getSortFieldLabel(sortField)}
			</Button>

			{#if showSortDropdown}
				<div
					class="absolute z-10 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
				>
					{#each [{ field: 'created_at', label: 'Date Created' }, { field: 'updated_at', label: 'Date Updated' }, { field: 'start_date', label: 'Start Date' }] as option}
						<Button
							onclick={(e) => {
								e.stopPropagation();
								setSortField(option.field);
							}}
							variant="ghost"
							size="sm"
							class="w-full text-left justify-start {sortField === option.field
								? 'bg-blue-50 dark:bg-blue-900/30'
								: ''}"
						>
							{option.label}
						</Button>
					{/each}
				</div>
			{/if}
		</div>

		<Button
			onclick={() => (sortDirection = sortDirection === 'desc' ? 'asc' : 'desc')}
			variant="outline"
			size="sm"
			title={sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
			icon={sortDirection === 'desc' ? ArrowDown : ArrowUp}
		/>
	</div>

	<!-- Task Type Filters -->
	<div class="space-y-3">
		<div class="flex flex-wrap gap-2">
			<Button
				onclick={selectAllFilters}
				variant={activeFilters.size === 6 ? 'secondary' : 'outline'}
				size="sm"
				class="rounded-full"
			>
				All ({taskCounts.all})
			</Button>

			{#each [{ id: 'active', label: 'Active', icon: Circle }, { id: 'scheduled', label: 'Scheduled', icon: Calendar }, { id: 'overdue', label: 'Overdue', icon: Clock }, { id: 'recurring', label: 'Recurring', icon: RefreshCw }, { id: 'deleted', label: 'Deleted', icon: TriangleAlert }, { id: 'completed', label: 'Completed', icon: CircleCheck }] as filter}
				<Button
					onclick={() => toggleFilter(filter.id)}
					variant={activeFilters.has(filter.id) ? 'secondary' : 'outline'}
					size="sm"
					class="rounded-full"
					icon={filter.icon}
				>
					{filter.label} ({taskCounts[filter.id]})
				</Button>
			{/each}
		</div>

		<!-- Calendar Warning -->
		{#if !calendarConnected && taskCounts.active > 0}
			<div
				class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3"
			>
				<div class="flex">
					<CalendarX
						class="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0"
					/>
					<div class="text-sm text-yellow-700 dark:text-yellow-300">
						<p class="font-medium">Calendar not connected</p>
						<p class="mt-1">
							<a
								href="/profile?tab=calendar"
								class="underline hover:text-yellow-800 dark:hover:text-yellow-200"
							>
								Connect your calendar
							</a> to schedule tasks.
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Selection Controls with Actions -->
	{#if filteredTasks.length > 0}
		<div class="space-y-3">
			<div
				class="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700"
			>
				<!-- Left: Select All Checkbox -->
				<label
					class="flex items-center gap-2.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
				>
					<input
						type="checkbox"
						checked={allTasksSelected}
						indeterminate={someTasksSelected}
						onchange={toggleSelectAll}
						class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600
							focus:ring-blue-500 focus:ring-offset-0 cursor-pointer
							dark:bg-gray-700 dark:checked:bg-blue-600 dark:checked:border-blue-600"
						aria-label="Select all tasks"
					/>
					<span class="font-semibold text-gray-900 dark:text-white text-sm">
						{#if selectedTaskIds.size > 0}
							<span class="text-blue-600 dark:text-blue-400"
								>{selectedTaskIds.size}</span
							>
							of {filteredTasks.length} selected
						{:else}
							Select all <span class="text-gray-500 dark:text-gray-400"
								>({filteredTasks.length}
								{filteredTasks.length === 1 ? 'task' : 'tasks'})</span
							>
						{/if}
					</span>
				</label>

				<!-- Right: Bulk Actions (fade in when tasks selected) -->
				<div
					class="flex items-center gap-2 flex-wrap flex-1 justify-end transition-all {selectedTaskIds.size >
					0
						? 'opacity-100'
						: 'opacity-0 pointer-events-none'}"
				>
					<!-- Status Dropdown -->
					<div class="relative">
						<Button
							onclick={(e) => {
								e.stopPropagation();
								showBulkStatusDropdown = !showBulkStatusDropdown;
								showBulkPriorityDropdown = false;
							}}
							variant="outline"
							size="sm"
							icon={Circle}
							iconPosition="left"
							disabled={bulkActionInProgress}
						>
							Status
							<ChevronDown class="w-3 h-3 ml-1" />
						</Button>

						{#if showBulkStatusDropdown}
							<div
								class="absolute z-30 mt-1 w-40 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
							>
								{#each [{ value: 'backlog', label: 'Backlog', icon: Circle }, { value: 'in_progress', label: 'In Progress', icon: LoaderCircle }, { value: 'done', label: 'Done', icon: CircleCheck }, { value: 'blocked', label: 'Blocked', icon: TriangleAlert }] as status}
									{@const StatusIcon = status.icon}
									<button
										onclick={(e) => {
											e.stopPropagation();
											handleBulkStatusChange(status.value);
										}}
										class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2"
									>
										{#if status.icon}
											<StatusIcon class="w-3.5 h-3.5" />
										{/if}
										{status.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Priority Dropdown -->
					<div class="relative">
						<Button
							onclick={(e) => {
								e.stopPropagation();
								showBulkPriorityDropdown = !showBulkPriorityDropdown;
								showBulkStatusDropdown = false;
							}}
							variant="outline"
							size="sm"
							icon={ArrowUp}
							iconPosition="left"
							disabled={bulkActionInProgress}
						>
							Priority
							<ChevronDown class="w-3 h-3 ml-1" />
						</Button>

						{#if showBulkPriorityDropdown}
							<div
								class="absolute z-30 mt-1 w-36 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
							>
								{#each [{ value: 'high', label: 'High', color: 'text-red-600' }, { value: 'medium', label: 'Medium', color: 'text-yellow-600' }, { value: 'low', label: 'Low', color: 'text-green-600' }] as priority}
									<button
										onclick={(e) => {
											e.stopPropagation();
											handleBulkPriorityChange(priority.value);
										}}
										class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2"
									>
										<ArrowUp class="w-3.5 h-3.5 {priority.color}" />
										{priority.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Remove Dates Button -->
					<Button
						onclick={(e) => {
							e.stopPropagation();
							handleBulkRemoveDates();
						}}
						variant="outline"
						size="sm"
						icon={CalendarX}
						iconPosition="left"
						disabled={bulkActionInProgress}
						class="hidden sm:inline-flex"
					>
						Remove Dates
					</Button>

					<!-- Delete Button -->
					<Button
						onclick={(e) => {
							e.stopPropagation();
							handleBulkDelete();
						}}
						variant="outline"
						size="sm"
						icon={Trash2}
						iconPosition="left"
						class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
						disabled={bulkActionInProgress}
					>
						Delete
					</Button>

					<!-- Clear Selection Button -->
					<Button
						onclick={clearSelection}
						variant="ghost"
						size="sm"
						icon={X}
						iconPosition="left"
						disabled={bulkActionInProgress}
					>
						Clear
					</Button>
				</div>
			</div>

			<!-- Warnings -->
			{#if bulkActionWarnings.length > 0}
				<div
					class="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3"
				>
					<TriangleAlert class="w-4 h-4 flex-shrink-0 mt-0.5" />
					<div class="space-y-1">
						{#each bulkActionWarnings as warning}
							<div>{warning}</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Loading State -->
			{#if bulkActionInProgress}
				<div
					class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3"
				>
					<LoaderCircle class="w-4 h-4 animate-spin" />
					<span>Processing...</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Tasks List -->
	{#if filteredTasks.length === 0}
		<div
			class="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
		>
			<Circle class="w-12 h-12 text-gray-400 mx-auto mb-4" />
			<p class="text-gray-600 dark:text-gray-400 font-medium">
				{#if activeFilters.size === 0}
					No task types selected
				{:else if activeFilters.size === 6}
					No tasks yet
				{:else}
					No {Array.from(activeFilters).join(', ')} tasks
				{/if}
			</p>
		</div>
	{:else}
		{@const now = new Date()}
		<div class="space-y-3">
			{#each filteredTasks as task, index (task.id)}
				{@const taskDate = task.start_date ? new Date(task.start_date) : null}
				{@const prevTask = index > 0 ? filteredTasks[index - 1] : null}
				{@const prevTaskDate = prevTask?.start_date ? new Date(prevTask.start_date) : null}

				<!-- Current time indicator - only show container when indicator should be displayed -->
				{#if index > 0 && prevTaskDate && taskDate && sortField === 'start_date' && prevTaskDate <= now && taskDate > now}
					<div class="time-indicator-container my-4 flex items-center relative z-1">
						<CurrentTimeIndicator label="Now" showTime={true} className="w-full" />
					</div>
				{/if}

				<!-- Task Row with Checkbox -->
				<div class="flex items-center gap-3">
					<!-- Selection Checkbox (outside card) -->
					<input
						type="checkbox"
						checked={selectedTaskIds.has(task.id)}
						onchange={(e) => toggleTaskSelection(task.id, e)}
						onclick={(e) => e.stopPropagation()}
						class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600
							focus:ring-blue-500 focus:ring-offset-0 cursor-pointer flex-shrink-0
							dark:bg-gray-700 dark:checked:bg-blue-600 dark:checked:border-blue-600"
						aria-label="Select task: {task.title}"
					/>

					<!-- Task Card -->
					<div
						id="task-{task.id}"
						class="flex-1 rounded-lg border transition-all relative cursor-pointer active:scale-[0.99]
						{selectedTaskIds.has(task.id)
							? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600 shadow-sm'
							: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 hover:shadow-md'}
						{getTaskType(task) === 'deleted' ? 'opacity-75' : ''}
						{getTaskType(task) === 'completed' ? 'opacity-60' : ''}
						{isTaskLoading(task.id) ? 'opacity-50' : ''}"
						role="button"
						tabindex="0"
						onclick={() => onEditTask(task)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onEditTask(task);
							}
						}}
						aria-label="Edit task: {task.title}"
						aria-selected={selectedTaskIds.has(task.id)}
					>
						<!-- Loading overlay -->
						{#if isTaskLoading(task.id)}
							<div
								class="absolute inset-0 bg-white/50 dark:bg-gray-800/50 rounded-lg pointer-events-none z-10 flex items-center justify-center"
							>
								<LoaderCircle
									class="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400"
								/>
							</div>
						{/if}

						<!-- Task Content -->
						<div class="p-4">
							<div class="flex items-start gap-3">
								<!-- Task Icon/Status Button -->
								<!-- <Button
									onclick={(e) => {
										e.stopPropagation();
										handleToggleTaskComplete(task);
									}}
									variant="ghost"
									size="sm"
									class="{getTaskColor(task)} mt-0.5 hover:opacity-80 p-0"
									disabled={getTaskType(task) === 'deleted' ||
										isTaskLoading(task.id)}
									icon={getTaskIcon(task)}
									aria-label="{getTaskType(task) === 'completed'
										? 'Mark as incomplete'
										: 'Mark as complete'}: {task.title}"
								/> -->

								<!-- Task Details -->
								<div class="flex-1 min-w-0">
									<h4
										class="text-sm font-medium text-gray-900 dark:text-white {getTaskType(
											task
										) === 'completed'
											? 'line-through'
											: ''}"
									>
										{task.title}
										{#if task.task_type === 'recurring'}
											<RefreshCw
												class="inline-block w-3.5 h-3.5 ml-1 text-blue-500 dark:text-blue-400"
												title="Recurring task - {getRecurrenceText(
													task.recurrence_pattern
												) || 'repeating'}"
											/>
										{/if}
										<RecentActivityIndicator
											createdAt={task.created_at}
											updatedAt={task.updated_at}
											size="xs"
										/>
									</h4>

									<!-- Task Meta -->
									<div class="flex flex-wrap items-center gap-3 mt-1">
										{#if task.priority}
											<span
												class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border {priorityColors[
													task.priority
												]}"
											>
												{task.priority}
											</span>
										{/if}

										{#if task.start_date}
											<span
												class="text-xs text-gray-500 dark:text-gray-400 flex items-center"
											>
												<Calendar class="w-3 h-3 mr-1" />
												{formatDateTimeForDisplay(task.start_date)}
											</span>
										{/if}

										{#if task.task_calendar_events?.find((e) => e.sync_status === 'synced' || e.sync_status === 'pending')}
											<a
												href={task?.task_calendar_events?.find(
													(e) =>
														e.sync_status === 'synced' ||
														e.sync_status === 'pending'
												).event_link}
												target="_blank"
												rel="noopener noreferrer"
												class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center"
												onclick={(e) => e.stopPropagation()}
											>
												<CalendarCheck class="w-3 h-3 mr-1" />
												In calendar
											</a>
										{/if}

										{#if task.completed_at}
											<span class="text-xs text-gray-500 dark:text-gray-400">
												Completed {formatRelativeTime(task.completed_at)}
											</span>
										{/if}
									</div>
								</div>
								<!-- End Task Details -->

								<!-- Actions -->
								<div class="flex items-center gap-1 flex-shrink-0">
									{#if getTaskType(task) === 'active' && !task.task_calendar_events?.find((e) => e.sync_status === 'synced' || e.sync_status === 'pending') && task.start_date && !isDateInPast(task.start_date) && calendarConnected}
										<Button
											onclick={(e) => {
												e.stopPropagation();
												handleScheduleTask(task);
											}}
											disabled={isTaskScheduling(task.id) ||
												isTaskLoading(task.id)}
											variant="ghost"
											size="sm"
											class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
											title="Add to calendar"
											icon={isTaskScheduling(task.id)
												? LoaderCircle
												: CalendarPlus}
											aria-label="Add task to calendar: {task.title}"
										/>
									{/if}

									{#if getTaskType(task) === 'active'}
										<Button
											onclick={(e) => {
												e.stopPropagation();
												onMarkDeleted(task);
											}}
											disabled={isTaskLoading(task.id)}
											variant="ghost"
											size="sm"
											class="p-1.5 text-gray-400 hover:text-orange-600 dark:hover:text-orange-400"
											title="Mark as deleted"
											icon={Trash2}
											aria-label="Mark task as deleted: {task.title}"
										/>
									{/if}

									{#if getTaskType(task) === 'deleted'}
										<Button
											onclick={(e) => {
												e.stopPropagation();
												handleRestoreTask(task);
											}}
											disabled={isTaskLoading(task.id)}
											variant="ghost"
											size="sm"
											class="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
											title="Restore task"
											icon={RotateCcw}
											aria-label="Restore task: {task.title}"
										/>
									{/if}
								</div>
							</div>
						</div>
						<!-- End Task Card -->
					</div>
				</div>
				<!-- End Task Row -->
			{/each}

			<!-- Check if we should show indicator at the bottom (after all tasks) -->
			{#if filteredTasks.length > 0}
				{@const lastTask = filteredTasks[filteredTasks.length - 1]}
				{@const lastTaskDate = lastTask?.start_date ? new Date(lastTask.start_date) : null}
				{#if lastTaskDate && lastTaskDate <= now}
					{@const hasIndicatorInMiddle = filteredTasks.some((task, i) => {
						if (i === 0) return false;
						const curr = task.start_date ? new Date(task.start_date) : null;
						const prevTask = filteredTasks[i - 1];
						const prev = prevTask?.start_date ? new Date(prevTask.start_date) : null;
						return prev && curr && prev <= now && curr > now;
					})}
					{@const firstTask = filteredTasks[0]}
					{@const hasIndicatorAtTop =
						!firstTask?.start_date ||
						(firstTask.start_date ? new Date(firstTask.start_date) > now : false)}
					{#if !hasIndicatorInMiddle && !hasIndicatorAtTop}
						<div class="time-indicator-container my-4 flex items-center relative z-1">
							<CurrentTimeIndicator label="Now" showTime={true} className="w-full" />
						</div>
					{/if}
				{/if}
			{/if}
		</div>
	{/if}
</div>

<!-- Remove Dates Confirmation Modal -->
<ConfirmationModal
	isOpen={showRemoveDatesModal}
	title="Remove Task Dates"
	confirmText="Remove Dates"
	cancelText="Cancel"
	confirmVariant="primary"
	icon="warning"
	onconfirm={executeBulkRemoveDates}
	oncancel={() => {
		showRemoveDatesModal = false;
		tasksWithDatesToRemove = [];
	}}
>
	{#snippet content()}
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Remove start dates from <span class="font-semibold text-gray-900 dark:text-white"
				>{tasksWithDatesToRemove.length} task{tasksWithDatesToRemove.length > 1
					? 's'
					: ''}</span
			>?
		</p>
	{/snippet}

	{#snippet details()}
		<div class="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
			<p>This action will:</p>
			<ul class="list-disc list-inside ml-2 space-y-0.5">
				<li>Remove start dates from selected tasks</li>
				<li>Remove them from your calendar</li>
				<li>Clear any recurrence patterns</li>
			</ul>
		</div>
	{/snippet}
</ConfirmationModal>

<!-- Delete Tasks Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteModal}
	title="Delete Tasks"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="primary"
	icon="danger"
	onconfirm={executeBulkDelete}
	oncancel={() => (showDeleteModal = false)}
>
	{#snippet content()}
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Delete <span class="font-semibold text-gray-900 dark:text-white"
				>{selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''}</span
			>?
		</p>
	{/snippet}

	{#snippet details()}
		<div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
			<p>
				You can restore deleted tasks later from the <span class="font-medium"
					>Deleted filter</span
				>.
			</p>
		</div>
	{/snippet}
</ConfirmationModal>

<style>
	.line-through {
		text-decoration: line-through;
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Prevent text selection when clicking on task cards */
	[role='button'] {
		-webkit-user-select: none;
		user-select: none;
	}

	/* Mobile touch feedback */
	@media (max-width: 640px) {
		[role='button']:active {
			transform: scale(0.99);
		}
	}

	/* Dark mode hover state */
	:global(.dark) .dark\:hover\:bg-gray-750:hover {
		background-color: rgb(45 55 72);
	}
</style>
