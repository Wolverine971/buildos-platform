<!-- apps/web/src/lib/components/project/TaskModal.svelte -->
<!--
	Task Modal Component

	Simplified timezone approach:
	- All dates stored as UTC in database (Supabase timestamptz)
	- Display all dates/times in browser's local timezone
	- JavaScript Date handles UTC↔local conversion automatically
	- No manual UTC manipulation needed
-->
<script lang="ts">
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RecurrenceSelector from '$lib/components/tasks/RecurrenceSelector.svelte';
	import RecurringDeleteModal from '$lib/components/tasks/RecurringDeleteModal.svelte';
	import TaskBraindumpSection from '$lib/components/project/TaskBraindumpSection.svelte';
	import { ProjectService } from '$lib/services/projectService';
	import {
		Calendar,
		AlertTriangle,
		Clock,
		ExternalLink,
		Trash2,
		RefreshCw,
		Link,
		CheckCircle,
		FolderOpen,
		ArrowUpRight,
		X,
		Info
	} from 'lucide-svelte';
	import type { Task } from '$lib/types/project';
	import type { ProcessedPhase } from '$lib/types/project-page.types';
	import { toastService } from '$lib/stores/toast.store';
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import { formatDateForDisplay } from '$lib/utils/date-utils';
	import { onMount } from 'svelte';
	import type { ComponentType } from 'svelte';
	import { goto } from '$app/navigation';

	export let isOpen = false;
	export let task: Partial<Task> | null = null;
	export let projectId: string;
	export let onClose: () => void;

	// Phase context support
	export let phaseId: string | null = null;
	export let phase: ProcessedPhase | null = null;

	// Project context for end date inheritance
	export let project: { end_date?: string | null; name?: string } | null = null;

	// Calendar props - support both old and new structures
	export let calendarStatus: any = null;

	// Dashboard context support
	export let isDashboardContext: boolean = false;

	// ADD: New callback props for dashboard reactivity
	export let onUpdate: ((updatedTask: Task) => void) | null = null;
	export let onDelete: ((taskId: string) => void) | null = null;
	export let onCreate: ((createdTask: Task) => void) | null = null;

	// Get project service instance
	const projectService = ProjectService.getInstance();

	// Granular invalidation setup
	$: projectId = $page.params.id;

	// Optimized reactive statements - compute once and memoize
	$: isCalendarConnected = calendarStatus?.isConnected;
	$: calendarNeedsRefresh = calendarStatus?.needsRefresh ?? false;
	$: isEditing = !!task;
	$: modalTitle = (() => {
		const projectName = project?.name || '';
		if (isEditing) {
			return projectName ? `Edit ${projectName} Task` : 'Edit Task';
		} else if (phase) {
			return projectName
				? `Create ${projectName} Task in ${phase.name}`
				: `Create Task in ${phase.name}`;
		} else {
			return projectName ? `Create ${projectName} Task` : 'Create New Task';
		}
	})();
	$: submitText = isEditing ? 'Save Changes' : 'Create Task';
	$: loadingText = isEditing ? 'Saving...' : 'Creating...';

	// Form configuration (empty since we handle fields manually)
	const taskFormConfig = {};

	// Check if task is deleted (soft deleted with deleted_at timestamp)
	$: isDeleted = task?.deleted_at != null;

	// Calendar state - grouped for better performance
	let calendarState = {
		refreshingTokens: false,
		connectingCalendar: false,
		autoRefreshAttempted: false,
		refreshFailedNeedsReconnect: false,
		removingFromCalendar: false,
		addingToCalendar: false
	};

	type CalendarPanelAction =
		| {
				type: 'button';
				label: string;
				icon?: ComponentType;
				onClick: () => void | Promise<void>;
				variant?: 'primary' | 'ghost';
				disabled?: boolean;
				loading?: boolean;
				className?: string;
		  }
		| {
				type: 'message';
				message: string;
				className?: string;
		  };

	type CalendarPanelBadge = {
		icon: ComponentType;
		text: string;
		classes: string;
	};

	type CalendarPanelConfig = {
		icon: ComponentType;
		iconClasses: string;
		iconContainerClasses: string;
		cardClasses: string;
		title: string;
		titleClasses: string;
		description: string;
		descriptionClasses: string;
		actions: CalendarPanelAction[];
		badges?: CalendarPanelBadge[];
	};

	let calendarPanel: CalendarPanelConfig | null = null;

	// Recurring deletion state
	let showRecurringDeleteModal = false;
	let recurringDeleteLoading = false;

	// State for main content fields
	let titleValue = '';
	let descriptionValue = '';
	let detailsValue = '';

	// Compute recurrence end date message
	$: recurrenceEndMessage = (() => {
		if (taskTypeValue !== 'recurring') return null;

		if (recurrenceEndsValue) {
			return null; // User specified end date
		}

		if (project?.end_date) {
			const endDate = new Date(project.end_date);
			return `This task will recur until the project ends on ${format(endDate, 'MMM d, yyyy')}`;
		}

		return 'This task will recur indefinitely as the project has no end date';
	})();

	// Track if end date is inherited
	$: isEndDateInherited =
		taskTypeValue === 'recurring' && !recurrenceEndsValue && project?.end_date;

	// State for metadata fields
	let statusValue = 'backlog';
	let priorityValue = 'medium';
	let taskTypeValue = 'one_off';
	let startDateValue = '';
	let startDateDisplayValue = '';
	let durationMinutesValue = 60;
	let recurrencePatternValue = '';
	let recurrenceEndsValue = '';
	let recurrenceEndOption = 'never';
	let recurrenceCount = 10;
	let weeklyDays: string[] = [];
	let monthlyDayOption = 'date'; // 'date' or 'weekday'
	let customRRule = '';
	let showCustomRRule = false;
	let dependenciesValue: string[] = [];
	let parentTaskIdValue = '';
	let taskStepsValue = '';
	// Removed outdated field - using soft delete pattern
	let nextOccurrences: Date[] = [];

	let dependencyInput = '';

	// Phase date validation state
	let dateOutsidePhaseWarning = false;
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Check if date is outside phase boundaries
	function checkDateAgainstPhase(dateValue: string) {
		if (!phase || !dateValue) {
			dateOutsidePhaseWarning = false;
			return;
		}

		const selectedDate = new Date(dateValue);
		const phaseStart = new Date(phase.start_date);
		const phaseEnd = new Date(phase.end_date);

		// Set to start of day for fair comparison
		selectedDate.setHours(0, 0, 0, 0);
		phaseStart.setHours(0, 0, 0, 0);
		phaseEnd.setHours(0, 0, 0, 0);

		dateOutsidePhaseWarning = selectedDate < phaseStart || selectedDate > phaseEnd;
	}

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Watch for date changes
	$: checkDateAgainstPhase(startDateValue);

	// Simplified date conversion helper functions
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

	function formatDateForInput(date: Date | string | null): string {
		if (!date) return '';

		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';

			// Format for HTML date input
			return format(dateObj, 'yyyy-MM-dd');
		} catch (error) {
			console.warn('Failed to format date for input:', date, error);
			return '';
		}
	}

	function parseDateFromInput(value: string): string | null {
		if (!value) return null;

		try {
			// Parse the date and set to start of day in local timezone
			const date = new Date(value + 'T00:00:00');
			if (isNaN(date.getTime())) return null;

			// Convert to ISO string for storage (UTC)
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse date from input:', value, error);
			return null;
		}
	}

	// Options for select fields
	const statusOptions = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'done', label: 'Done' },
		{ value: 'blocked', label: 'Blocked' }
	];

	const priorityOptions = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' }
	];

	const taskTypeOptions = [
		{ value: 'one_off', label: 'One-off' },
		{ value: 'recurring', label: 'Recurring' }
	];

	const recurrenceOptions = [
		{ value: '', label: 'No recurrence' },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'biweekly', label: 'Every 2 weeks' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'quarterly', label: 'Every 3 months' },
		{ value: 'yearly', label: 'Yearly' },
		{ value: 'custom', label: 'Custom...' }
	];

	// Recurrence end options
	const recurrenceEndOptions = [
		{ value: 'never', label: 'Never' },
		{ value: 'date', label: 'On date' },
		{ value: 'count', label: 'After occurrences' }
	];

	// Initialize content fields when task changes
	$: if (task) {
		titleValue = task.title || '';
		descriptionValue = task.description || '';
		detailsValue = task.details || '';
		statusValue = task.status || 'backlog';
		priorityValue = task.priority || 'medium';
		taskTypeValue = task.task_type || 'one_off';
		startDateValue = task.start_date ? formatDateTimeForInput(task.start_date) : '';
		startDateDisplayValue = task.start_date ? formatDateTime(new Date(task.start_date)) : '';
		durationMinutesValue = task.duration_minutes || 60;
		recurrencePatternValue = task.recurrence_pattern || '';
		recurrenceEndsValue = task.recurrence_ends ? formatDateForInput(task.recurrence_ends) : '';
		// Determine end option from existing data
		if (task.recurrence_ends) {
			recurrenceEndOption = 'date';
		} else {
			recurrenceEndOption = 'never';
		}
		dependenciesValue = task.dependencies || [];
		parentTaskIdValue = task.parent_task_id || '';
		taskStepsValue = task.task_steps || '';
		// Removed outdated field processing
	} else if (!isOpen) {
		titleValue = '';
		descriptionValue = '';
		detailsValue = '';
		statusValue = 'backlog';
		priorityValue = 'medium';
		taskTypeValue = 'one_off';
		startDateValue = '';
		startDateDisplayValue = '';
		durationMinutesValue = 60;
		recurrencePatternValue = '';
		recurrenceEndsValue = '';
		recurrenceEndOption = 'never';
		recurrenceCount = 10;
		weeklyDays = [];
		monthlyDayOption = 'date';
		customRRule = '';
		showCustomRRule = false;
		dependenciesValue = [];
		parentTaskIdValue = '';
		taskStepsValue = '';
		// Removed outdated field reset
		nextOccurrences = [];
	}

	// Set initial data (empty since we handle manually)
	$: initialData = task || {};

	// Reset task type to one_off when start date is cleared
	$: if (!startDateValue && taskTypeValue === 'recurring') {
		taskTypeValue = 'one_off';
		recurrencePatternValue = '';
		recurrenceEndsValue = '';
	}

	// Set default recurrence pattern when task type changes to recurring
	$: if (taskTypeValue === 'recurring' && !recurrencePatternValue) {
		recurrencePatternValue = 'weekly'; // Default to weekly recurrence
	}

	// Sync recurrenceEndOption with recurrenceEndsValue
	$: if (recurrenceEndsValue) {
		recurrenceEndOption = 'date';
	} else if (!recurrenceEndsValue && recurrenceEndOption === 'date') {
		recurrenceEndOption = 'never';
	}

	// Optimized calendar event detection - only show active events
	$: calendarEvents = (task?.task_calendar_events || []).filter(
		(event) => event.sync_status === 'synced' || event.sync_status === 'pending'
	);
	$: isTaskScheduled = calendarEvents.length > 0;
	$: primaryCalendarEvent = calendarEvents[0] || null;

	// Auto-resize textarea
	function autoResize(textarea: HTMLTextAreaElement) {
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	}

	// Dependency management
	function handleDependencyKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && dependencyInput.trim()) {
			event.preventDefault();
			if (!dependenciesValue.includes(dependencyInput.trim())) {
				dependenciesValue = [...dependenciesValue, dependencyInput.trim()];
			}
			dependencyInput = '';
		}
	}

	function removeDependency(depToRemove: string) {
		dependenciesValue = dependenciesValue.filter((dep) => dep !== depToRemove);
	}

	// Auto-refresh tokens if needed when modal opens
	$: if (
		isOpen &&
		isCalendarConnected &&
		calendarNeedsRefresh &&
		!calendarState.autoRefreshAttempted
	) {
		handleAutoRefreshTokens();
	}

	// Reset state when modal closes - batch update for performance
	$: if (!isOpen) {
		resetCalendarState();
		dateOutsidePhaseWarning = false;
	}

	function resetCalendarState() {
		calendarState = {
			...calendarState,
			autoRefreshAttempted: false,
			refreshFailedNeedsReconnect: false
		};
	}

	async function handleAutoRefreshTokens() {
		if (calendarState.refreshingTokens || calendarState.autoRefreshAttempted) return;

		calendarState.autoRefreshAttempted = true;
		calendarState.refreshingTokens = true;

		try {
			const response = await fetch('/api/calendar/refresh', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();

			if (response.ok) {
				toastService.success('Calendar connection refreshed');
			} else if (result.requiresReconnect) {
				calendarState.refreshFailedNeedsReconnect = true;
				toastService.warning(
					'Calendar connection expired. Please reconnect your Google Calendar.'
				);
			} else {
				console.error('Failed to auto-refresh calendar tokens:', result.message);
				toastService.error('Failed to refresh calendar connection.');
			}
		} catch (error) {
			console.error('Error auto-refreshing calendar tokens:', error);
			calendarState.refreshFailedNeedsReconnect = true;
			toastService.error('Error refreshing calendar connection.');
		} finally {
			calendarState.refreshingTokens = false;
		}
	}

	async function handleConnectCalendar() {
		calendarState.connectingCalendar = true;
		try {
			await goto('/profile?tab=calendar');
		} catch (error) {
			console.error('Error connecting calendar:', error);
			calendarState.connectingCalendar = false;
			toastService.error('Failed to connect calendar.');
		}
	}

	async function handleRefreshTokens() {
		calendarState.refreshingTokens = true;
		try {
			await handleAutoRefreshTokens();
		} catch (error) {
			console.error('Error refreshing tokens:', error);
			toastService.error('Failed to refresh calendar connection.');
		} finally {
			calendarState.refreshingTokens = false;
		}
	}

	async function handleOpenInCalendar() {
		if (primaryCalendarEvent?.event_link) {
			window.open(primaryCalendarEvent.event_link, '_blank', 'noopener,noreferrer');
		}
	}

	async function handleRemoveFromCalendar() {
		if (!primaryCalendarEvent?.calendar_event_id) {
			toastService.error('No calendar event found to remove.');
			return;
		}

		calendarState.removingFromCalendar = true;
		try {
			const result = await projectService.removeTaskFromCalendar(
				primaryCalendarEvent.calendar_event_id,
				primaryCalendarEvent.calendar_id || 'primary'
			);

			if (result?.success) {
				// Update the local task object to remove calendar events
				task = { ...task, task_calendar_events: [] } as Task;

				// Call onUpdate callback if available to refresh parent UI
				if (onUpdate) {
					onUpdate(task);
				}

				toastService.success('Task removed from calendar');
			} else {
				throw new Error('Failed to remove task from calendar.');
			}
		} catch (error) {
			console.error('Error removing from calendar:', error);
			toastService.error('Failed to remove task from calendar.');
		} finally {
			calendarState.removingFromCalendar = false;
		}
	}

	// Simplified submission - parent handles API calls via optimistic store
	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		// Validate title
		if (!titleValue.trim()) {
			throw new Error('Title is required');
		}

		// Use local state values and convert dates back to ISO format
		const taskData = {
			title: titleValue.trim(),
			description: descriptionValue.trim(),
			details: detailsValue.trim(),
			status: statusValue,
			priority: priorityValue,
			task_type: taskTypeValue,
			start_date: parseDateTimeFromInput(startDateValue),
			duration_minutes: durationMinutesValue,
			recurrence_pattern: taskTypeValue === 'recurring' ? recurrencePatternValue : null,
			recurrence_ends:
				taskTypeValue === 'recurring' && recurrenceEndsValue
					? parseDateFromInput(recurrenceEndsValue)
					: null,
			dependencies: dependenciesValue.length > 0 ? dependenciesValue : null,
			parent_task_id: parentTaskIdValue || null,
			task_steps: taskStepsValue || null,
			// Removed outdated field from create data
			project_id: projectId,
			phase_id: phaseId, // Include phase_id if creating from within a phase
			timeZone
		};

		// For updates, include the task ID
		if (isEditing && task?.id) {
			taskData.id = task.id;
		}

		// Pass the task data to the parent component which will handle the API call
		// The parent uses the optimistic update store which properly manages the API calls
		if (isEditing && onUpdate) {
			onUpdate(taskData);
		} else if (!isEditing && onCreate) {
			onCreate(taskData);
		}

		// Close the modal after triggering the action
		onClose();
	}

	// UPDATED: Soft delete with proper rollback support
	// This calls the API endpoint which now uses soft delete (sets deleted_at timestamp)
	async function handleDelete(id: string): Promise<void> {
		// Ensure we have a valid task ID to delete
		const taskId = task?.id || id;

		if (!taskId) {
			toastService.error('Cannot delete task: Invalid task ID.');
			throw new Error('Cannot delete task: Invalid task ID.');
		}

		// Check if this is a recurring task
		if (task?.task_type === 'recurring') {
			// Show the recurring delete modal instead of deleting immediately
			showRecurringDeleteModal = true;
			return;
		}

		// For non-recurring tasks, proceed with normal deletion
		// Pass the delete request to the parent component which will handle the API call
		// The parent uses the optimistic update store which properly manages the API calls
		if (onDelete) {
			try {
				// Call the parent's delete handler
				await onDelete(taskId);
				// Close the modal after successful deletion
				onClose();
			} catch (error) {
				console.error('Error in onDelete callback:', error);
				toastService.error('Failed to delete task');
			}
		} else {
			toastService.error('Unable to delete task - deletion handler not available');
			return;
		}
	}

	// Handle recurring task deletion with scope
	async function handleRecurringDelete(event: CustomEvent) {
		const { scope, instanceDate } = event.detail;

		if (!task?.id) {
			toastService.error('Cannot delete task: Invalid task ID.');
			return;
		}

		recurringDeleteLoading = true;

		try {
			// Call the API with deletion scope
			const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					deletion_scope: scope,
					instance_date: instanceDate
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || errorData.message || 'Failed to delete recurring task'
				);
			}

			const result = await response.json();

			// Show appropriate success message
			if (scope === 'this_only') {
				toastService.success('Deleted this occurrence');
			} else if (scope === 'this_and_future') {
				toastService.success('Deleted this and future occurrences');
			} else {
				toastService.success('Deleted all occurrences');
			}

			// Call the onDelete callback if it exists for appropriate scopes
			// For 'all' scope or when deleting the entire series, notify parent
			if (onDelete) {
				if (scope === 'all') {
					// Complete deletion - remove from UI
					onDelete(task.id);
				} else if (scope === 'this_and_future') {
					// Task still exists but modified - trigger update
					// Parent should refresh to show updated recurrence
					onDelete(task.id);
				}
				// For 'this_only', task remains but instance is deleted
				// Parent might need to refresh to show the change
			}

			// Close both modals
			showRecurringDeleteModal = false;
			onClose();
		} catch (error) {
			console.error('Error deleting recurring task:', error);
			toastService.error('Failed to delete recurring task');
		} finally {
			recurringDeleteLoading = false;
		}
	}

	async function handleAddToCalendar() {
		if (!task?.id) {
			toastService.error('Cannot add to calendar: Invalid task.');
			return;
		}

		calendarState.addingToCalendar = true;
		try {
			// First, save any pending changes to the task
			if (isEditing) {
				// Prepare the updated task data with current form values
				const updatedTaskData = {
					id: task.id,
					title: titleValue.trim(),
					description: descriptionValue.trim(),
					details: detailsValue.trim(),
					status: statusValue,
					priority: priorityValue,
					task_type: taskTypeValue,
					start_date: parseDateTimeFromInput(startDateValue),
					duration_minutes: durationMinutesValue,
					recurrence_pattern:
						taskTypeValue === 'recurring' ? recurrencePatternValue : null,
					recurrence_ends:
						taskTypeValue === 'recurring' && recurrenceEndsValue
							? parseDateFromInput(recurrenceEndsValue)
							: null,
					dependencies: dependenciesValue.length > 0 ? dependenciesValue : null,
					parent_task_id: parentTaskIdValue || null,
					task_steps: taskStepsValue || null,
					project_id: projectId,
					addTaskToCalendar: true, // Signal that we want to add to calendar
					timeZone
				};

				// Update the task first with the calendar flag
				const updateResponse = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updatedTaskData)
				});

				if (!updateResponse.ok) {
					throw new Error('Failed to update task before adding to calendar');
				}

				const updateResult = await updateResponse.json();

				// Update the local task reference if the update was successful
				if (updateResult.success && updateResult.data?.task) {
					// Update the local task object to reflect the new calendar events
					task = updateResult.data.task;

					// Call onUpdate to refresh the parent UI
					if (onUpdate) {
						onUpdate(updateResult.data.task);
					}
					toastService.success('Task updated and added to calendar');
				}
			}
		} catch (error) {
			console.error('Error adding to calendar:', error);
			toastService.error('Failed to add task to calendar.');
		} finally {
			calendarState.addingToCalendar = false;
		}
	}

	// Helper function to format datetime for display
	function formatDateTime(date: Date): string {
		return format(date, 'MMM d, yyyy, h:mm a');
	}

	// Helper function to format date for display
	function formatDateTimeForDisplay(dateString: string): string {
		if (!dateString) return '';

		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return 'Invalid date';

			return formatDateTime(date);
		} catch (error) {
			console.warn('Failed to format datetime for display:', dateString, error);
			return 'Invalid date';
		}
	}

	// Static mapping objects for better performance
	const STATUS_ICONS = {
		synced: CheckCircle,
		error: AlertTriangle,
		pending: RefreshCw,
		default: Clock
	};

	const STATUS_COLORS = {
		synced: 'text-emerald-600 dark:text-emerald-400',
		error: 'text-rose-600 dark:text-rose-400',
		pending: 'text-amber-600 dark:text-amber-400',
		default: 'text-gray-600 dark:text-gray-400'
	};

	const STATUS_MESSAGES = {
		synced: 'Successfully synced with calendar',
		error: (event: any) => event.sync_error || 'Failed to sync with calendar',
		pending: 'Syncing with calendar...',
		default: 'Unknown sync status'
	};

	function getCalendarEventStatusIcon(event: any) {
		return STATUS_ICONS[event.sync_status] || STATUS_ICONS.default;
	}

	function getCalendarEventStatusColor(event: any) {
		return STATUS_COLORS[event.sync_status] || STATUS_COLORS.default;
	}

	function getCalendarEventStatusMessage(event: any) {
		const status = event.sync_status;
		if (status === 'error' && typeof STATUS_MESSAGES[status] === 'function') {
			return STATUS_MESSAGES[status](event);
		}
		return STATUS_MESSAGES[status] || STATUS_MESSAGES.default;
	}

	// Optimized computed values
	$: hasMultipleEvents = calendarEvents.length > 1;
	$: errorEventCount = calendarEvents.filter((e) => e.sync_status === 'error').length;
	$: pendingEventCount = calendarEvents.filter((e) => e.sync_status === 'pending').length;
	$: canAddToCalendar = isEditing && startDateValue && !isTaskScheduled;
	$: scheduledStartDisplay = (() => {
		if (startDateValue) {
			const parsedFromInput = new Date(startDateValue);
			if (!isNaN(parsedFromInput.getTime())) {
				return formatDateTime(parsedFromInput);
			}
		}
		if (task?.start_date) {
			const parsedFromTask = new Date(task.start_date);
			if (!isNaN(parsedFromTask.getTime())) {
				return formatDateTime(parsedFromTask);
			}
		}
		return '';
	})();
	$: calendarPanel = (() => {
		if (!startDateValue) return null;

		const baseCardClasses =
			'border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/60';
		const sharedButtonClass = 'w-full sm:w-auto';
		const badges: CalendarPanelBadge[] = [];

		if (!isCalendarConnected) {
			return {
				icon: Calendar,
				iconClasses: 'h-5 w-5 text-primary-600 dark:text-primary-300',
				iconContainerClasses:
					'bg-primary-100/80 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300',
				cardClasses: `${baseCardClasses} border-primary-200/60 dark:border-primary-800/50 bg-primary-50/70 dark:bg-primary-950/20`,
				title: 'Connect Google Calendar',
				titleClasses: 'text-primary-900 dark:text-primary-100',
				description:
					'Link your calendar so this scheduled task can stay in sync automatically.',
				descriptionClasses: 'text-gray-600 dark:text-gray-400',
				actions: [
					{
						type: 'button',
						label: 'Connect calendar',
						icon: Link,
						onClick: handleConnectCalendar,
						variant: 'primary',
						disabled: calendarState.connectingCalendar,
						loading: calendarState.connectingCalendar,
						className: sharedButtonClass
					}
				]
			} satisfies CalendarPanelConfig;
		}

		if (calendarState.refreshingTokens) {
			return {
				icon: RefreshCw,
				iconClasses: 'h-5 w-5 text-primary-600 dark:text-primary-300 animate-spin',
				iconContainerClasses:
					'bg-primary-100/70 dark:bg-primary-900/20 text-primary-600 dark:text-primary-300',
				cardClasses: `${baseCardClasses} border-primary-200/60 dark:border-primary-800/50 bg-primary-50/60 dark:bg-primary-950/20`,
				title: 'Refreshing connection',
				titleClasses: 'text-primary-900 dark:text-primary-100',
				description: "We're refreshing your Google Calendar access. Hang tight.",
				descriptionClasses: 'text-gray-600 dark:text-gray-400',
				actions: [
					{
						type: 'message',
						message: 'This usually only takes a moment.',
						className:
							'block w-full text-xs text-gray-500 dark:text-gray-400 sm:text-right'
					}
				]
			} satisfies CalendarPanelConfig;
		}

		if (calendarState.refreshFailedNeedsReconnect) {
			return {
				icon: AlertTriangle,
				iconClasses: 'h-5 w-5 text-rose-600 dark:text-rose-400',
				iconContainerClasses:
					'bg-rose-100/80 dark:bg-rose-900/25 text-rose-600 dark:text-rose-400',
				cardClasses: `${baseCardClasses} border-rose-200/60 dark:border-rose-800/40 bg-rose-50/70 dark:bg-rose-950/20`,
				title: 'Reconnect required',
				titleClasses: 'text-rose-700 dark:text-rose-300',
				description: 'Your Google Calendar session expired. Reconnect to keep syncing.',
				descriptionClasses: 'text-rose-700/90 dark:text-rose-300/90',
				actions: [
					{
						type: 'button',
						label: 'Reconnect',
						icon: Link,
						onClick: handleConnectCalendar,
						variant: 'primary',
						disabled: calendarState.connectingCalendar,
						loading: calendarState.connectingCalendar,
						className: sharedButtonClass
					}
				]
			} satisfies CalendarPanelConfig;
		}

		if (calendarNeedsRefresh) {
			return {
				icon: AlertTriangle,
				iconClasses: 'h-5 w-5 text-amber-600 dark:text-amber-400',
				iconContainerClasses:
					'bg-amber-100/80 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
				cardClasses: `${baseCardClasses} border-amber-200/70 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/20`,
				title: 'Refresh Google Calendar',
				titleClasses: 'text-amber-700 dark:text-amber-300',
				description: 'Update your connection to sync this task to your calendar.',
				descriptionClasses: 'text-amber-700/90 dark:text-amber-300/90',
				actions: [
					{
						type: 'button',
						label: 'Refresh connection',
						icon: RefreshCw,
						onClick: handleRefreshTokens,
						variant: 'ghost',
						disabled: calendarState.refreshingTokens,
						loading: calendarState.refreshingTokens,
						className: `${sharedButtonClass} sm:ml-0`
					}
				]
			} satisfies CalendarPanelConfig;
		}

		if (isTaskScheduled) {
			if (hasMultipleEvents) {
				badges.push({
					icon: Calendar,
					text: 'Multiple linked events',
					classes: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
				});
			}
			if (pendingEventCount > 0) {
				badges.push({
					icon: RefreshCw,
					text: `${pendingEventCount} syncing`,
					classes: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
				});
			}
			if (errorEventCount > 0) {
				badges.push({
					icon: AlertTriangle,
					text: `${errorEventCount} need attention`,
					classes: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
				});
			}

			const actions: CalendarPanelAction[] = [];
			if (primaryCalendarEvent?.calendar_event_id) {
				actions.push({
					type: 'button',
					label: 'Open in calendar',
					icon: ExternalLink,
					onClick: handleOpenInCalendar,
					variant: 'ghost',
					className: sharedButtonClass
				});
			}
			actions.push({
				type: 'button',
				label: 'Remove from calendar',
				icon: Trash2,
				onClick: handleRemoveFromCalendar,
				variant: 'ghost',
				disabled:
					calendarState.removingFromCalendar ||
					primaryCalendarEvent?.sync_status === 'pending',
				loading: calendarState.removingFromCalendar,
				className: `${sharedButtonClass} text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/20`
			});

			return {
				icon: CheckCircle,
				iconClasses: 'h-5 w-5 text-emerald-600 dark:text-emerald-400',
				iconContainerClasses:
					'bg-emerald-100/80 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-400',
				cardClasses: `${baseCardClasses} border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20`,
				title: 'Synced with Google Calendar',
				titleClasses: 'text-emerald-700 dark:text-emerald-300',
				description: scheduledStartDisplay
					? `Scheduled for ${scheduledStartDisplay} and kept up to date automatically.`
					: 'This task is linked to Google Calendar and will stay in sync.',
				descriptionClasses: 'text-emerald-700/90 dark:text-emerald-200/90',
				actions,
				badges
			} satisfies CalendarPanelConfig;
		}

		if (canAddToCalendar) {
			return {
				icon: Calendar,
				iconClasses: 'h-5 w-5 text-emerald-600 dark:text-emerald-400',
				iconContainerClasses:
					'bg-emerald-100/80 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-400',
				cardClasses: `${baseCardClasses} border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20`,
				title: 'Ready to add',
				titleClasses: 'text-emerald-700 dark:text-emerald-300',
				description: 'Add task to Google Calendar.',
				descriptionClasses: 'text-emerald-700/90 dark:text-emerald-200/90',
				actions: [
					{
						type: 'button',
						label: 'Add to calendar',
						icon: Calendar,
						onClick: handleAddToCalendar,
						variant: 'primary',
						disabled: calendarState.addingToCalendar,
						loading: calendarState.addingToCalendar,
						className: sharedButtonClass
					}
				]
			} satisfies CalendarPanelConfig;
		}

		return {
			icon: CheckCircle,
			iconClasses: 'h-5 w-5 text-emerald-600 dark:text-emerald-400',
			iconContainerClasses:
				'bg-emerald-100/80 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-400',
			cardClasses: baseCardClasses,
			title: 'Google Calendar connected',
			titleClasses: 'text-emerald-700 dark:text-emerald-300',
			description: 'Save the task to make it available for calendar syncing.',
			descriptionClasses: 'text-emerald-700/90 dark:text-emerald-200/90',
			actions: [
				{
					type: 'message',
					message: 'Once saved, you can add it to Google Calendar.',
					className: 'block w-full text-xs text-gray-500 dark:text-gray-400 sm:text-right'
				}
			]
		} satisfies CalendarPanelConfig;
	})();
</script>

<FormModal
	{isOpen}
	title=""
	{submitText}
	{loadingText}
	formConfig={taskFormConfig}
	{initialData}
	onSubmit={handleSubmit}
	onDelete={isEditing && !isDeleted ? handleDelete : null}
	{onClose}
	size="xl"
>
	<div slot="header">
		<div class="sm:hidden">
			<div class="modal-grab-handle"></div>
		</div>
		<div
			class="relative border-b border-slate-200/60 dark:border-slate-700/60 bg-white/85 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 dark:bg-slate-900/80"
		>
			<!-- Mobile Layout -->
			<div class="sm:hidden">
				<div class="flex items-center justify-between mb-2">
					<div class="flex-1 pr-2 space-y-1.5">
						<p
							class="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500"
						>
							Task Detail
						</p>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
							{modalTitle}
						</h2>
					</div>
					<!-- Close button for mobile -->
					<Button
						type="button"
						onclick={onClose}
						variant="ghost"
						size="sm"
						class="!p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200"
						aria-label="Close modal"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</Button>
				</div>
			</div>

			<!-- Desktop Layout -->
			<div class="hidden sm:flex sm:items-start sm:justify-between">
				<div class="flex-1 space-y-1.5">
					<p
						class="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500"
					>
						Task Detail
					</p>
					<h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
						{modalTitle}
					</h2>
				</div>

				<div class="flex items-center">
					<Button
						type="button"
						onclick={onClose}
						variant="ghost"
						size="sm"
						class="!p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200"
						aria-label="Close modal"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</Button>
				</div>
			</div>
		</div>
	</div>

	<div slot="before-form">
		<!-- Deleted Task Warning -->
		{#if isDeleted}
			<div
				class="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md"
			>
				<div class="flex items-start space-x-2">
					<Trash2 class="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
					<div>
						<p class="text-sm font-medium text-rose-900 dark:text-rose-100">
							This task has been deleted
						</p>
						{#if task?.deleted_at}
							<p class="text-xs text-rose-700 dark:text-rose-300 mt-1">
								Deleted on {formatDateTimeForDisplay(task.deleted_at)}
							</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Phase Info Box - Show when creating task within a phase -->
		{#if phase && !isEditing}
			<div
				class="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-md"
			>
				<div class="flex items-start space-x-2">
					<Info
						class="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5"
					/>
					<div class="text-sm">
						<span class="font-medium text-primary-900 dark:text-primary-100"
							>Phase Timeline:</span
						>
						<span class="text-primary-800 dark:text-primary-200">
							{formatDateForDisplay(phase.start_date)} - {formatDateForDisplay(
								phase.end_date
							)}
						</span>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div
		slot="after-form"
		class="flex flex-col flex-1 min-h-0 space-y-3 sm:space-y-4 pt-4 px-4 sm:px-6 lg:px-8"
	>
		<!-- Main Content Area -->
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 min-h-[40vh] flex-1">
			<!-- Content Section (Takes most space) -->
			<div
				class="lg:col-span-3 flex flex-col space-y-5 h-full min-h-0 rounded-2xl border border-slate-200/60 bg-white/85 p-4 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/70 sm:p-5 lg:p-6"
			>
				<!-- Title -->
				<div class="border-b border-slate-200/60 pb-5 sm:pb-6 dark:border-slate-700/60">
					<p
						class="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500"
					>
						Task Overview
					</p>
					<div class="mt-4 space-y-2">
						<label
							for="task-title"
							class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							<span>Title</span>
							<span class="text-rose-500">*</span>
						</label>
						<TextInput
							id="task-title"
							bind:value={titleValue}
							placeholder="What needs to be done?"
							size="lg"
							class="font-semibold border-slate-200/60 bg-white/85 text-slate-900 backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-white"
						/>
					</div>
				</div>

				<!-- Description -->
				<div class="space-y-2">
					<label
						for="task-description"
						class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						Summary
					</label>
					<Textarea
						id="task-description"
						bind:value={descriptionValue}
						placeholder="Brief overview of the task..."
						rows={2}
						class="border-slate-200/60 bg-white/80 text-slate-700 backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-slate-200"
					/>
				</div>

				<!-- Details -->
				<div class="flex flex-1 flex-col space-y-2">
					<label
						for="task-details"
						class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						Full Details
					</label>
					<Textarea
						id="task-details"
						bind:value={detailsValue}
						placeholder="Detailed task information, implementation notes, acceptance criteria..."
						autoResize={true}
						rows={8}
						maxRows={20}
						class="flex-1 border-slate-200/60 bg-white/80 leading-relaxed text-slate-700 backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-slate-200"
					/>
				</div>

				<!-- Content Stats -->
				<div
					class="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400"
				>
					<span>
						{#if detailsValue.length > 0}
							{detailsValue.length} characters in details
						{:else}
							Add detailed information about this task...
						{/if}
					</span>
					{#if titleValue.length > 0}
						<span>{titleValue.length} characters in title</span>
					{/if}
				</div>
			</div>

			<!-- Metadata Sidebar -->
			<div
				class="lg:col-span-1 rounded-2xl border border-slate-200/60 bg-white/85 p-3 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/70 sm:p-4 lg:max-h-full lg:overflow-y-auto"
			>
				<div
					class="-m-3 -mb-0 border-b border-slate-200/60 px-3 pb-4 pt-3 dark:border-slate-700/60 sm:-m-4 sm:px-4 sm:pt-4"
				>
					<h3
						class="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500"
					>
						Task Metadata
					</h3>
				</div>

				<!-- Status -->
				<div class="mt-4 space-y-2">
					<label
						for="task-status"
						class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>Status
					</label>
					<Select
						id="task-status"
						bind:value={statusValue}
						size="sm"
						onchange={(e) => (statusValue = e.detail)}
						class="border-slate-200/60 bg-white/85 dark:border-slate-600/60 dark:bg-slate-900/60"
					>
						{#each statusOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>

				<!-- Priority -->
				<div class="space-y-2">
					<label
						for="task-priority"
						class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>Priority
					</label>
					<Select
						id="task-priority"
						bind:value={priorityValue}
						onchange={(e) => (priorityValue = e.detail)}
						size="sm"
						class="border-slate-200/60 bg-white/85 dark:border-slate-600/60 dark:bg-slate-900/60"
					>
						{#each priorityOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>

				<!-- Start Date -->
				<div class="space-y-2">
					<label
						for="task-start-date"
						class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>Schedule
					</label>
					<TextInput
						id="task-start-date"
						type="datetime-local"
						bind:value={startDateValue}
						max={project?.end_date
							? formatDateTimeForInput(project.end_date)
							: undefined}
						size="sm"
						class={`border-slate-200/60 bg-white/85 dark:border-slate-600/60 dark:bg-slate-900/60 ${
							dateOutsidePhaseWarning ? 'border-amber-500 dark:border-amber-400' : ''
						}`}
					/>
					{#if dateOutsidePhaseWarning && phase}
						<div class="mt-1 flex items-start space-x-1">
							<AlertTriangle
								class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
							/>
							<p class="text-xs text-amber-600 dark:text-amber-400">
								This date is outside the phase timeline ({formatDateForDisplay(
									phase.start_date
								)} - {formatDateForDisplay(phase.end_date)})
							</p>
						</div>
					{/if}
				</div>

				<!-- Duration -->
				<div class="space-y-2">
					<label
						for="task-duration"
						class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>Duration
					</label>
					<TextInput
						id="task-duration"
						type="number"
						bind:value={durationMinutesValue}
						min="1"
						size="sm"
						placeholder="Minutes"
						class="border-slate-200/60 bg-white/85 dark:border-slate-600/60 dark:bg-slate-900/60"
					/>
				</div>

				<!-- Task Type - Only show when start date is selected -->
				{#if startDateValue}
					<div class="space-y-2">
						<label
							for="task-type"
							class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Task Type
						</label>
						<Select
							id="task-type"
							bind:value={taskTypeValue}
							onchange={(e) => (taskTypeValue = e.detail)}
							size="sm"
							class="border-slate-200/60 bg-white/85 dark:border-slate-600/60 dark:bg-slate-900/60"
						>
							{#each taskTypeOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>

					<!-- Recurrence -->
					{#if taskTypeValue === 'recurring'}
						<RecurrenceSelector
							pattern={recurrencePatternValue}
							endDate={recurrenceEndsValue}
							startDate={parseDateTimeFromInput(startDateValue) ||
								new Date().toISOString()}
							projectEndDate={project?.end_date}
							onChange={(config) => {
								recurrencePatternValue = config.pattern;
								recurrenceEndsValue = config.endDate;
								nextOccurrences = config.nextOccurrences;
							}}
						/>

						{#if recurrenceEndMessage}
							<div
								class="mt-3 flex items-start space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
							>
								<Info
									class="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
								/>
								<span class="text-sm text-blue-900 dark:text-blue-100">
									{recurrenceEndMessage}
								</span>
							</div>
						{/if}
					{/if}

					{#if calendarPanel}
						{@const PanelIcon = calendarPanel.icon}
						<div
							class={`mt-3 rounded-xl border p-4 sm:p-5 shadow-sm transition-colors ${calendarPanel.cardClasses}`}
						>
							<div
								class="flex flex-col gap-4 sm:items-start sm:justify-between sm:gap-6"
							>
								<div class="flex items-start gap-3">
									<div
										class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${calendarPanel.iconContainerClasses}`}
									>
										<PanelIcon class={calendarPanel.iconClasses} />
									</div>
									<div class="space-y-1">
										<p
											class={`text-sm font-semibold ${calendarPanel.titleClasses}`}
										>
											{calendarPanel.title}
										</p>
										<p
											class={`text-xs leading-relaxed ${calendarPanel.descriptionClasses}`}
										>
											{calendarPanel.description}
										</p>
									</div>
								</div>

								{#if calendarPanel.actions.length > 0}
									<div
										class="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[12rem] sm:flex-row sm:flex-wrap sm:justify-center"
									>
										{#each calendarPanel.actions as action}
											{#if action.type === 'button'}
												<Button
													type="button"
													onclick={action.onClick}
													icon={action.icon}
													size="sm"
													variant={action.variant ?? 'ghost'}
													disabled={action.disabled}
													loading={action.loading}
													class={action.className ?? ''}
												>
													{action.label}
												</Button>
											{:else if action.type === 'message'}
												<span class={`text-xs ${action.className ?? ''}`}>
													{action.message}
												</span>
											{/if}
										{/each}
									</div>
								{/if}
							</div>

							{#if calendarPanel.badges && calendarPanel.badges.length > 0}
								<div
									class="mt-3 flex flex-wrap items-center gap-2 text-[11px] leading-4"
								>
									{#each calendarPanel.badges as badge}
										{@const BadgeIcon = badge.icon}
										<span
											class={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium ${badge.classes}`}
										>
											<BadgeIcon class="h-3 w-3" />
											{badge.text}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}

				<!-- Task Steps -->
				<div class="space-y-2">
					<label
						for="task-steps"
						class="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						Task Steps
					</label>
					<Textarea
						id="task-steps"
						bind:value={taskStepsValue}
						placeholder="Step-by-step instructions..."
						rows={3}
						size="sm"
						class="border-slate-200/60 bg-white/85 text-slate-700 dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-slate-200"
					/>
				</div>

				<!-- Braindumps Section (only show when editing) -->
				{#if isEditing && task?.id}
					<TaskBraindumpSection taskId={task.id} />
				{/if}

				<!-- Deleted Status -->
				{#if isDeleted}
					<hr class="border-rose-200 dark:border-rose-700" />
					<div class="bg-rose-50 dark:bg-rose-900/30 rounded-md p-3">
						<div class="flex items-center space-x-2">
							<Trash2 class="w-4 h-4 text-rose-600 dark:text-rose-400" />
							<span class="text-sm font-medium text-rose-900 dark:text-rose-100">
								Task Deleted
							</span>
						</div>
					</div>
				{/if}

				<!-- Creation/Update Info (if editing) -->
				{#if isEditing && task}
					<hr class="border-slate-200/60 dark:border-slate-700/60" />
					<div
						class="rounded-xl border border-slate-200/60 bg-white/85 p-3 space-y-3 dark:border-slate-700/60 dark:bg-slate-900/70"
					>
						<!-- Activity Indicator -->
						<div class="flex items-center justify-between">
							<span
								class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400"
								>Activity</span
							>
							<RecentActivityIndicator
								createdAt={task.created_at}
								updatedAt={task.updated_at}
								size="sm"
							/>
						</div>
						<!-- Date Information - Responsive Grid -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
							{#if task.created_at}
								<div class="space-y-1">
									<span
										class="block font-medium text-slate-500 dark:text-slate-400"
										>Created</span
									>
									<span class="text-slate-700 dark:text-slate-300">
										{format(new Date(task.created_at), 'MMM d, yyyy')}
										<span class="hidden sm:inline">
											• {format(new Date(task.created_at), 'h:mm a')}</span
										>
									</span>
								</div>
							{/if}
							{#if task.updated_at}
								<div class="space-y-1">
									<span
										class="block font-medium text-slate-500 dark:text-slate-400"
										>Updated</span
									>
									<span class="text-slate-700 dark:text-slate-300">
										{format(new Date(task.updated_at), 'MMM d, yyyy')}
										<span class="hidden sm:inline">
											• {format(new Date(task.updated_at), 'h:mm a')}</span
										>
									</span>
								</div>
							{/if}
							{#if task.completed_at}
								<div class="col-span-2 sm:col-span-1 space-y-1">
									<span
										class="block font-medium text-slate-500 dark:text-slate-400"
										>Completed</span
									>
									<span class="text-slate-700 dark:text-slate-300">
										{format(new Date(task.completed_at), 'MMM d, yyyy')}
										<span class="hidden sm:inline">
											• {format(new Date(task.completed_at), 'h:mm a')}</span
										>
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Dashboard Context - Navigation Links -->
		{#if isDashboardContext && task?.projects}
			<div class="mt-auto pt-2 border-gray-200 dark:border-gray-700">
				<div class="space-y-3">
					<!-- Quick Navigation Header -->
					<div class="flex items-center space-x-2">
						<span
							class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Quick Navigation
						</span>
						<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
					</div>

					<!-- Navigation Buttons - Stack on mobile, inline on desktop -->
					<div class="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2">
						<a
							href="/projects/{task.projects.id}"
							target="_blank"
							rel="noopener noreferrer"
							class="flex items-center justify-center px-3 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 shadow-sm hover:shadow"
						>
							<FolderOpen class="w-4 h-4 mr-1.5" />
							View Project
						</a>
						{#if task?.id}
							<a
								href="/projects/{(task as any).projects?.id ||
									(task as any).project_id ||
									''}/tasks/{task.id}"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center justify-center px-3 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 shadow-sm hover:shadow"
							>
								<ArrowUpRight class="w-4 h-4 mr-1.5" />
								View Task
							</a>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</FormModal>

<!-- Recurring Delete Modal -->
<RecurringDeleteModal
	isOpen={showRecurringDeleteModal}
	{task}
	loading={recurringDeleteLoading}
	on:confirm={handleRecurringDelete}
	on:cancel={() => (showRecurringDeleteModal = false)}
/>
