<!-- src/lib/components/phases/PhaseCard.svelte -->
<script lang="ts">
	import {
		Clock,
		PenTool,
		Save,
		X,
		Trash2,
		CalendarCheck,
		TriangleAlert,
		CircleCheck,
		ChevronDown,
		ChevronRight,
		Plus
	} from 'lucide-svelte';

	import type { ProcessedPhase } from '$lib/types/project-page.types';
	import { createEventDispatcher } from 'svelte';
	import TaskItem from './TaskItem.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CurrentTimeIndicator from '$lib/components/ui/CurrentTimeIndicator.svelte';
	import TaskFilterDropdown from './TaskFilterDropdown.svelte';
	import TaskFilterBar from './TaskFilterBar.svelte';
	import { slide, fade, crossfade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { spring } from 'svelte/motion';
	import {
		validatePhaseDateAgainstProject,
		getPhaseeDateConstraintsWithPartner
	} from '$lib/utils/dateValidation';
	import { formatDateForDisplay } from '$lib/utils/date-utils';
	import { projectStoreV2 } from '$lib/stores/project.store';

	let {
		project,
		phase,
		viewMode = 'kanban',
		isEditing = false,
		editingData = {
			name: '',
			description: '',
			start_date: '',
			end_date: ''
		},
		dragOverPhase = null,
		calendarConnected = false,
		// Timeline-specific props
		isCollapsed = false,
		showTrackIndicator = false,
		trackIndex = 0,
		trackColor = '',
		maxTracks = 1,
		showCurrentDateLines = false,
		isComplete = false
	}: {
		project: { start_date: string | null; end_date: string | null };
		phase: ProcessedPhase;
		viewMode?: 'kanban' | 'timeline';
		isEditing?: boolean;
		editingData?: {
			name: string;
			description: string;
			start_date: string;
			end_date: string;
		};
		dragOverPhase?: string | null;
		calendarConnected?: boolean;
		isCollapsed?: boolean;
		showTrackIndicator?: boolean;
		trackIndex?: number;
		trackColor?: string;
		maxTracks?: number;
		showCurrentDateLines?: boolean;
		isComplete?: boolean;
	} = $props();

	const dispatch = createEventDispatcher();

	// Define TaskFilter type locally
	type TaskFilter = 'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring';

	// Direct reactive access to store - Svelte 5 optimized pattern
	let storeState = $derived($projectStoreV2);
	// Ensure globalTaskFilters is always an array of TaskFilter
	let globalTaskFilters = $derived<TaskFilter[]>(
		(() => {
			const filters = storeState?.globalTaskFilters || [
				'active',
				'scheduled',
				'overdue',
				'recurring'
			];
			return (filters as string[]).map((f) => f as TaskFilter);
		})()
	);

	// LOCAL FILTER STATE - using arrays for better reactivity
	// Initialize from global filters to ensure consistency
	// Don't initialize from storeState directly as it's not reactive yet
	let localPhaseFilters = $state<TaskFilter[]>([
		'active' as TaskFilter,
		'scheduled' as TaskFilter,
		'overdue' as TaskFilter,
		'recurring' as TaskFilter
	]);
	let hasCustomFilters = $state(false);

	// Track if we've initialized from global filters
	let initialized = $state(false);

	// Initialize localPhaseFilters from globalTaskFilters when they first become available
	$effect(() => {
		// Only initialize once from global filters if we haven't customized
		if (
			!initialized &&
			!hasCustomFilters &&
			globalTaskFilters &&
			globalTaskFilters.length > 0
		) {
			localPhaseFilters = [...globalTaskFilters];
			initialized = true;
		}
	});

	// Container management for smooth transitions
	let containerElement = $state<HTMLElement>();
	let isFiltering = false;

	// Create crossfade for seamless transitions
	const [send, receive] = crossfade({
		duration: 250,
		fallback(node) {
			const style = getComputedStyle(node);
			const transform = style.transform === 'none' ? '' : style.transform;
			return {
				duration: 250,
				easing: cubicOut,
				css: (t) => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
			};
		}
	});

	// Spring store for smooth height transitions
	const containerHeight = spring(0, {
		stiffness: 0.2,
		damping: 0.8
	});

	// Mobile detection for conditional rendering (prevents DOM bloat) using Svelte 5 runes
	let innerWidth = $state(640); // Default to Tailwind's sm: breakpoint
	let isMobile = $derived(innerWidth < 640);

	// Memoized task type cache for performance optimization
	const taskTypeCache = new Map<string, TaskFilter>();

	// Helper function to get task type with memoization
	function getTaskTypeMemoized(task: any): TaskFilter {
		// Create a cache key based on task properties that affect type calculation
		const cacheKey = `${task.id}-${task.status}-${task.start_date}-${task.deleted_at}-${task.task_calendar_events?.length || 0}`;

		// Check cache first
		if (taskTypeCache.has(cacheKey)) {
			return taskTypeCache.get(cacheKey)!;
		}

		// Calculate task type
		let taskType: TaskFilter;
		if (task.status === 'done' || task.status === 'completed') {
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

		// Cache the result
		taskTypeCache.set(cacheKey, taskType);

		// Clean cache periodically to prevent memory leaks (keep only last 100 entries)
		if (taskTypeCache.size > 100) {
			const firstKey = taskTypeCache.keys().next().value;
			taskTypeCache.delete(firstKey);
		}

		return taskType;
	}

	// Legacy function for backward compatibility
	function getTaskType(task: any): TaskFilter {
		return getTaskTypeMemoized(task);
	}

	// Memoize filtered tasks to prevent unnecessary recalculations
	let prevPhaseTasks: any = null; // Initialize as null to force first calculation
	let prevLocalFilters: any = null; // Initialize as null to force first calculation
	let cachedFilteredTasks: any[] = [];

	// Remove debug logging that causes unnecessary re-runs

	// Get filtered tasks based on active filters (global or local) using Svelte 5 runes
	// Use IIFE to get the value directly, not a function
	let filteredTasks = $derived(
		(() => {
			if (!phase.tasks || phase.tasks.length === 0) {
				return [];
			}

			// Use local filters if custom, otherwise use global
			// Both are now guaranteed to be TaskFilter arrays
			const activeFilters: TaskFilter[] = hasCustomFilters
				? localPhaseFilters
				: globalTaskFilters;

			// Debug logging
			// Calculate filtered tasks WITHOUT caching to fix reactivity
			const filtered = phase?.tasks?.filter((task) => {
				const taskType = getTaskType(task);
				const shouldInclude = activeFilters.includes(taskType);

				return shouldInclude;
			});

			return filtered || [];
		})()
	);

	// Remove debug logging in production

	// Memoize task counts to prevent unnecessary recalculations
	let prevCountTasks = phase.tasks;
	let cachedTaskCounts = {
		active: 0,
		scheduled: 0,
		deleted: 0,
		completed: 0,
		overdue: 0
	};

	// Calculate task counts with memoization using Svelte 5 runes
	// Use IIFE to get the value directly, not a function
	let phaseTaskCounts = $derived(
		(() => {
			// Reset counts
			const counts: Record<TaskFilter, number> = {
				active: 0,
				scheduled: 0,
				deleted: 0,
				completed: 0,
				overdue: 0
			};

			// Debug: Check if phase.tasks exists
			if (!phase.tasks || phase.tasks.length === 0) {
				return counts;
			}

			// Count ALL tasks in the phase (not filtered)
			phase.tasks.forEach((task) => {
				const type = getTaskType(task) as TaskFilter;
				counts[type]++;
			});

			return counts;
		})()
	);

	// Update local filters when global filters change (but only if not customized) using Svelte 5 effects
	$effect(() => {
		if (!hasCustomFilters && globalTaskFilters && globalTaskFilters.length > 0) {
			// globalTaskFilters is already properly typed as TaskFilter[]
			localPhaseFilters = [...globalTaskFilters];
		}
	});

	// Local filter handlers - these completely override global filters when set
	function handlePhaseFilterChange(filters: TaskFilter[]) {
		// Force reactivity by creating new array
		localPhaseFilters = [...filters];
		hasCustomFilters = true; // This phase now has custom filters that override global
	}

	function handleResetPhaseFilters() {
		// Reset to use global filters - removes the override
		localPhaseFilters = globalTaskFilters
			? [...globalTaskFilters].map((f) => f as TaskFilter)
			: ['active' as TaskFilter, 'scheduled' as TaskFilter, 'overdue' as TaskFilter];
		hasCustomFilters = false; // Back to using global filters
	}

	// TaskFilterBar handlers - create custom filters that override global
	function handleFilterToggle(event: CustomEvent<TaskFilter>) {
		const filter = event.detail;

		if (localPhaseFilters.includes(filter)) {
			// Remove filter
			localPhaseFilters = localPhaseFilters?.filter((f) => f !== filter);
		} else {
			// Add filter
			localPhaseFilters = [...localPhaseFilters, filter];
		}

		hasCustomFilters = true; // Mark as having custom filters that override global
	}

	function handleSelectAll() {
		// Select all filters - this overrides global filters
		localPhaseFilters = ['active', 'scheduled', 'deleted', 'completed', 'overdue', 'recurring'];
		hasCustomFilters = true; // Custom filters now override global
	}

	// Stable container height management without jarring transitions
	let previousFilterCount = $state(0);
	let isFilterTransition = $state(false);

	$effect(() => {
		if (hasCustomFilters && filteredTasks?.length !== previousFilterCount) {
			isFilterTransition = true;
			// Brief transition flag to enable smooth animations
			setTimeout(() => {
				isFilterTransition = false;
			}, 300);
		}
		previousFilterCount = filteredTasks?.length || 0;
	});

	// Update spring height using Svelte 5 effects
	$effect(() => {
		if (filteredTasks?.length) {
			containerHeight.set(filteredTasks.length * 52 + 16); // Approximate height
		} else {
			containerHeight.set(80); // Empty state height
		}
	});

	// Validation state
	let validationErrors = $state<{ [key: string]: string }>({});
	let validationWarnings = $state<{ [key: string]: string }>({});

	// Reactive validation for phase editing using Svelte 5 effects
	$effect(() => {
		if (isEditing && editingData) {
			// Create new objects to avoid direct mutation
			const newErrors: { [key: string]: string } = {};
			const newWarnings: { [key: string]: string } = {};

			// Basic validation
			if (!editingData.name?.trim()) {
				newErrors.name = 'Phase name is required';
			}

			// Date validation against project boundaries
			if (editingData.start_date || editingData.end_date) {
				const validation = validatePhaseDateAgainstProject(
					editingData.start_date || null,
					editingData.end_date || null,
					project
				);

				if (!validation.isValid && validation.error) {
					newErrors.dates = validation.error;
				} else if (validation.warning) {
					newWarnings.dates = validation.warning;
				}
			}

			// Check if both dates are provided and start is after end
			if (editingData.start_date && editingData.end_date) {
				const startDate = new Date(editingData.start_date);
				const endDate = new Date(editingData.end_date);

				if (startDate >= endDate) {
					newErrors.end_date = 'End date must be after start date';
				}
			}

			// Only update state if values actually changed to prevent loops
			const errorsChanged = JSON.stringify(validationErrors) !== JSON.stringify(newErrors);
			const warningsChanged =
				JSON.stringify(validationWarnings) !== JSON.stringify(newWarnings);

			if (errorsChanged) {
				validationErrors = newErrors;
			}
			if (warningsChanged) {
				validationWarnings = newWarnings;
			}
		}
	});

	// Get date constraints for editing using Svelte 5 runes
	let editingStartDateConstraints = $derived(
		isEditing
			? getPhaseeDateConstraintsWithPartner(
					project,
					true, // isStartDate
					editingData.end_date
				)
			: {}
	);

	let editingEndDateConstraints = $derived(
		isEditing
			? getPhaseeDateConstraintsWithPartner(
					project,
					false, // isStartDate
					editingData.start_date
				)
			: {}
	);

	let isFormValid = $derived(Object.keys(validationErrors).length === 0);

	// Date formatters
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	// Fixed function to create date in local timezone
	function createLocalDate(dateString: string): Date {
		if (!dateString) return new Date();

		// Split the date string to get individual components
		const datePart = dateString.split('T')[0];
		if (!datePart) return new Date();

		const [year, month, day] = datePart.split('-').map(Number);

		// Create date in local timezone (month is 0-indexed)
		return new Date(year || 0, (month || 1) - 1, day || 1);
	}

	let progress = $derived(getPhaseProgress(phase));
	let status = $derived(getPhaseStatus(phase));

	function getPhaseProgress(phase: ProcessedPhase): number {
		// Always use total task count for progress, not filtered
		if (!phase?.task_count) return 0;

		return Math.round((phase.completed_tasks / phase.task_count) * 100);
	}

	function getPhaseStatus(phase: ProcessedPhase): 'upcoming' | 'active' | 'completed' {
		const now = new Date();
		// Use local dates for comparison to avoid timezone issues
		const startDate = createLocalDate(phase.start_date);
		const endDate = createLocalDate(phase.end_date);

		// For comparison, we only care about the date part, not time
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const phaseStart = new Date(
			startDate.getFullYear(),
			startDate.getMonth(),
			startDate.getDate()
		);
		const phaseEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

		if (today < phaseStart) return 'upcoming';
		if (today > phaseEnd) return 'completed';
		return 'active';
	}

	function getPhaseStatusColor(status: string): string {
		switch (status) {
			case 'upcoming':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
			case 'active':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			case 'completed':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}

	function shouldShowCurrentDateLine(tasks: any[], index: number): boolean {
		if (!tasks || tasks.length === 0 || !showCurrentDateLines) return false;

		const currentDate = new Date();
		const sortedTasks = tasks.sort((a, b) => {
			const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
			const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
			return aDate - bDate;
		});

		// If this is the last task and current date is after it
		if (index === sortedTasks.length - 1) {
			const taskDate = new Date(sortedTasks[index].start_date);
			return currentDate > taskDate;
		}

		// If current date is between this task and the next
		if (index < sortedTasks.length - 1) {
			const currentTaskDate = new Date(sortedTasks[index].start_date);
			const nextTaskDate = new Date(sortedTasks[index + 1].start_date);
			return currentDate > currentTaskDate && currentDate <= nextTaskDate;
		}

		return false;
	}

	function shouldShowCurrentDateLineAtStart(tasks: any[]): boolean {
		if (!tasks || tasks.length === 0 || !showCurrentDateLines) return false;

		const currentDate = new Date();
		const sortedTasks = tasks.sort((a, b) => {
			const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
			const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
			return aDate - bDate;
		});
		const firstTaskDate = new Date(sortedTasks[0].start_date);

		return currentDate <= firstTaskDate;
	}

	function handleTaskDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Set dropEffect to show it's a valid drop target
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
		dispatch('taskDragOver', { event, phaseId: phase.id });
	}

	function handleTaskDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dispatch('taskDragLeave', { event });
	}

	function handleTaskDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Get the task data from dataTransfer
		const taskData = event.dataTransfer?.getData('application/json');
		if (taskData) {
			try {
				const draggedTask = JSON.parse(taskData);
				dispatch('taskDrop', {
					event,
					phaseId: phase.id,
					task: draggedTask
				});
			} catch (e) {
				console.error('Failed to parse dragged task data:', e);
			}
		} else {
			// Fallback to existing mechanism
			dispatch('taskDrop', { event, phaseId: phase.id });
		}
	}

	function handleSchedulePhase() {
		dispatch('schedule', phase);
	}

	function handleEditPhase() {
		dispatch('edit', phase);
	}

	function handleDeletePhase() {
		dispatch('delete', phase);
	}

	function handleSavePhase() {
		// Check validation before saving
		if (!isFormValid) {
			return;
		}
		dispatch('save', phase.id);
	}

	function handleCancelEdit() {
		dispatch('cancelEdit');
	}

	function handleToggleCollapse() {
		dispatch('toggleCollapse', phase.id);
	}

	function handleCreateTaskInPhase() {
		dispatch('createTask', phase.id);
	}

	// Compute drag over state using Svelte 5 rune
	let isDragOver = $derived(dragOverPhase === phase.id);

	// Cleanup cache on component destroy to prevent memory leaks - Svelte 5 pattern
	$effect(() => {
		return () => {
			taskTypeCache.clear();
		};
	});
</script>

<!-- Bind window width for mobile detection -->
<svelte:window bind:innerWidth />

<article
	id="phase-card-{phase.id}"
	class="phase-card bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-md transition-all
	{isDragOver ? 'ring-2 ring-purple-500 ring-opacity-50 shadow-lg' : ''}
	{isComplete && viewMode === 'timeline' ? 'bg-green-50/50 dark:bg-green-900/10' : ''}"
	role="region"
	aria-labelledby="phase-heading-{phase.id}"
	aria-describedby="phase-description-{phase.id}"
>
	{#if viewMode === 'timeline'}
		<!-- Timeline View Header -->
		<div
			class="w-full bg-gray-50 dark:bg-gray-800/50 {isDragOver
				? 'bg-purple-50 dark:bg-purple-900/20'
				: ''} rounded-t-lg transition-colors relative"
			on:dragover={handleTaskDragOver}
			on:dragleave={handleTaskDragLeave}
			on:drop={handleTaskDrop}
		>
			<!-- Track indicator bar -->
			{#if showTrackIndicator && maxTracks > 1}
				<div
					class="absolute left-0 top-0 bottom-0 w-1 rounded-tl-lg {trackColor}"
					title="Track {trackIndex + 1}"
				></div>
			{/if}

			<Button
				variant="ghost"
				size="lg"
				fullWidth
				btnType="container"
				on:click={handleToggleCollapse}
				aria-expanded={!isCollapsed}
				aria-controls="phase-content-{phase.id}"
				class="w-full px-3 pt-3 sm:px-4 text-left rounded-t-lg hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation justify-start font-normal rounded-b-none {maxTracks >
				1
					? 'pl-6'
					: ''}"
			>
				<!-- Mobile Layout -->
				<div class="flex flex-col w-full sm:hidden">
					<div class="flex items-start justify-between mb-2">
						<div class="flex items-center gap-2 flex-1 min-w-0">
							{#if isCollapsed}
								<ChevronRight
									class="w-4 h-4 text-gray-500 transition-transform flex-shrink-0"
									aria-hidden="true"
								/>
							{:else}
								<ChevronDown
									class="w-4 h-4 text-gray-500 transition-transform flex-shrink-0"
									aria-hidden="true"
								/>
							{/if}

							{#if isComplete}
								<CircleCheck
									class="w-4 h-4 text-green-600 flex-shrink-0"
									aria-hidden="true"
								/>
							{:else if status === 'active'}
								<Clock
									class="w-4 h-4 text-blue-600 flex-shrink-0"
									aria-hidden="true"
								/>
							{:else}
								<Clock
									class="w-4 h-4 text-gray-400 flex-shrink-0"
									aria-hidden="true"
								/>
							{/if}

							<h3
								id="phase-heading-{phase.id}"
								class="font-medium text-base text-gray-900 dark:text-white truncate"
							>
								{phase.name}
								{#if maxTracks > 1}
									<span class="text-xs text-gray-500 ml-1"
										>(T{trackIndex + 1})</span
									>
								{/if}
							</h3>
						</div>

						<div class="text-right flex-shrink-0">
							<div
								class="text-lg font-bold {isComplete
									? 'text-green-600'
									: status === 'active'
										? 'text-blue-600'
										: 'text-gray-600'}"
							>
								{progress}%
							</div>
						</div>
					</div>

					<div class="flex items-center justify-between text-xs">
						<span
							class="font-medium px-2 py-1 rounded-md {getPhaseStatusColor(status)}"
						>
							{status.charAt(0).toUpperCase() + status.slice(1)}
						</span>
						<span class="text-gray-500 dark:text-gray-400">
							{phase.task_count} tasks
						</span>
					</div>
				</div>

				<!-- Desktop Layout -->
				<div class="hidden sm:flex items-center justify-between w-full">
					<div class="flex items-center gap-2 flex-1 min-w-0">
						{#if isCollapsed}
							<ChevronRight
								class="w-4 h-4 text-gray-500 transition-transform"
								aria-hidden="true"
							/>
						{:else}
							<ChevronDown
								class="w-4 h-4 text-gray-500 transition-transform"
								aria-hidden="true"
							/>
						{/if}

						{#if isComplete}
							<CircleCheck class="w-5 h-5 text-green-600" aria-hidden="true" />
						{:else if status === 'active'}
							<Clock class="w-5 h-5 text-blue-600" aria-hidden="true" />
						{:else}
							<Clock class="w-5 h-5 text-gray-400" aria-hidden="true" />
						{/if}

						<h3
							class="font-medium text-base sm:text-lg text-gray-900 dark:text-white truncate"
						>
							{phase.name}
							{#if maxTracks > 1}
								<span class="text-sm text-gray-500 ml-2"
									>Track {trackIndex + 1}</span
								>
							{/if}
						</h3>
						<span
							class="text-xs font-medium px-2 py-1 rounded-md {getPhaseStatusColor(
								status
							)}"
						>
							{status.charAt(0).toUpperCase() + status.slice(1)}
						</span>
					</div>
					<div class="text-right flex-shrink-0 ml-2">
						<div
							class="text-xl sm:text-2xl font-bold {isComplete
								? 'text-green-600'
								: status === 'active'
									? 'text-blue-600'
									: 'text-gray-600'}"
						>
							{progress}%
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{phase.task_count} tasks
						</div>
					</div>
				</div>
			</Button>
		</div>
	{:else}
		<!-- Kanban View Header -->
		<header class="phase-header p-4 bg-gray-50 dark:bg-gray-800/50">
			<!-- Mobile layout: Title on top, actions below -->
			<div class="flex flex-col sm:items-start sm:justify-between gap-2 sm:gap-2 mb-3">
				<!-- Title and status row -->
				<div class="flex items-center justify-between gap-2 w-full sm:flex-1">
					<h3
						id="phase-heading-{phase.id}"
						class="font-semibold text-lg sm:text-lg text-gray-900 dark:text-white flex-1 min-w-0"
					>
						{#if isEditing}
							<FormField label="Phase name" error={validationErrors.name}>
								<TextInput
									id="phase-name-{phase.id}"
									bind:value={editingData.name}
									aria-label="Edit phase name"
									class="font-medium {validationErrors.name
										? 'border-red-300 dark:border-red-700'
										: ''}"
								/>
							</FormField>
						{:else}
							<span class="block truncate">{phase.name}</span>
						{/if}
					</h3>
					<!-- Status badge on mobile, moves to actions row on desktop -->
					<span
						class="sm:hidden text-xs font-medium px-2 py-1 rounded-md {getPhaseStatusColor(
							status
						)}"
						aria-label="Phase status: {status}"
					>
						{status}
					</span>
				</div>

				<!-- Actions row -->
				<div class="flex items-center justify-between sm:justify-end gap-1 w-full">
					<!-- Status badge on desktop only -->
					<span
						class="hidden sm:inline-flex text-xs font-medium px-2 py-1 rounded-md {getPhaseStatusColor(
							status
						)} ml-2"
						aria-label="Phase status: {status}"
					>
						{status}
					</span>
					{#if !isEditing}
						<div class="flex items-center gap-1 ml-auto">
							<Button
								variant="ghost"
								size="sm"
								on:click={handleCreateTaskInPhase}
								aria-label="Add task to {phase.name}"
							>
								<Plus class="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								on:click={handleSchedulePhase}
								disabled={!calendarConnected || !!phase.tasks?.length}
								aria-label="Schedule tasks for {phase.name}"
							>
								<CalendarCheck class="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								on:click={handleEditPhase}
								aria-label="Edit phase {phase.name}"
							>
								<PenTool class="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								on:click={handleDeletePhase}
								aria-label="Delete phase {phase.name}"
								class="hover:text-red-600 dark:hover:text-red-400"
							>
								<Trash2 class="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
							</Button>
						</div>
					{/if}
				</div>
			</div>

			{#if !isEditing}
				{#if phase.description}
					<p
						id="phase-description-{phase.id}"
						class="text-sm text-gray-600 dark:text-gray-400 mb-3"
					>
						{phase.description}
					</p>
				{/if}

				<div
					class="flex items-center text-xs sm:text-xs text-gray-500 dark:text-gray-400 mb-3"
					aria-label="Phase duration"
				>
					<Clock class="w-4 h-4 sm:w-3 sm:h-3 mr-1 flex-shrink-0" aria-hidden="true" />
					<time datetime={phase.start_date} class="whitespace-nowrap">
						{dateFormatter.format(createLocalDate(phase.start_date))}
					</time>
					<span aria-hidden="true" class="mx-1"> - </span>
					<time datetime={phase.end_date} class="whitespace-nowrap">
						{dateFormatter.format(createLocalDate(phase.end_date))}
					</time>
				</div>
			{/if}

			<!-- Progress (only for Kanban view) -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600 dark:text-gray-400">
						{phase.completed_tasks}/{phase.task_count} tasks
					</span>
					<span
						class="font-medium text-gray-900 dark:text-white"
						aria-label="{progress} percent complete"
					>
						{progress || 0}%
					</span>
				</div>
				<div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
					<div
						class="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
						style="width: {progress}%"
						role="progressbar"
						aria-valuenow={progress}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label="Phase completion progress"
					></div>
				</div>
			</div>
		</header>
	{/if}

	<!-- Main Content (Timeline View - Collapsible) -->
	{#if viewMode === 'timeline' && !isCollapsed}
		<div id="phase-content-{phase.id}" transition:slide|local={{ duration: 300 }}>
			<div class="p-3 sm:p-4 !pt-0">
				{#if isEditing}
					<!-- Phase editing form -->
					<form
						on:submit={(e) => {
							e.preventDefault();
							handleSavePhase();
						}}
					>
						<!-- Date validation container - reserve space to prevent layout shift -->
						<div class="min-h-[3rem] mb-3">
							{#if validationErrors.dates}
								<div
									class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800"
									role="alert"
								>
									<div class="flex">
										<TriangleAlert
											class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5"
										/>
										<p class="text-sm text-red-800 dark:text-red-200 ml-2">
											{validationErrors.dates}
										</p>
									</div>
								</div>
							{:else if validationWarnings.dates}
								<div
									class="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 border border-yellow-200 dark:border-yellow-800"
									role="alert"
								>
									<div class="flex">
										<TriangleAlert
											class="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5"
										/>
										<p
											class="text-sm text-yellow-800 dark:text-yellow-200 ml-2"
										>
											{validationWarnings.dates}
										</p>
									</div>
								</div>
							{/if}
						</div>

						<!-- Project timeline info -->
						{#if project && (project.start_date || project.end_date)}
							<div
								class="text-xs text-gray-600 dark:text-gray-400 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded"
							>
								Project timeline:
								{#if project.start_date}{formatDateForDisplay(
										project.start_date
									)}{:else}No start{/if}
								-
								{#if project.end_date}{formatDateForDisplay(
										project.end_date
									)}{:else}No end{/if}
							</div>
						{/if}

						<fieldset class="space-y-3 mb-3">
							<legend class="sr-only">Edit phase details</legend>

							<FormField label="Phase Name" required error={validationErrors.name}>
								<TextInput
									id="phase-name-{phase.id}"
									bind:value={editingData.name}
									placeholder="Enter phase name..."
									required
									class={validationErrors.name
										? 'border-red-300 dark:border-red-700'
										: ''}
								/>
							</FormField>

							<FormField label="Description" error={validationErrors.description}>
								<Textarea
									id="phase-description-{phase.id}"
									bind:value={editingData.description}
									rows={2}
									placeholder="Enter phase description..."
									class={validationErrors.description
										? 'border-red-300 dark:border-red-700'
										: ''}
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<FormField
									label="Start Date"
									required
									error={validationErrors.start_date}
									hint={project?.start_date
										? `Project starts: ${formatDateForDisplay(project.start_date)}`
										: undefined}
								>
									<TextInput
										id="phase-start-{phase.id}"
										type="date"
										bind:value={editingData.start_date}
										min={editingStartDateConstraints.min}
										max={editingStartDateConstraints.max}
										required
										class={validationErrors.start_date
											? 'border-red-300 dark:border-red-700'
											: ''}
									/>
								</FormField>
								<FormField
									label="End Date"
									required
									error={validationErrors.end_date}
									hint={project?.end_date
										? `Project ends: ${formatDateForDisplay(project.end_date)}`
										: undefined}
								>
									<TextInput
										id="phase-end-{phase.id}"
										type="date"
										bind:value={editingData.end_date}
										min={editingEndDateConstraints.min}
										max={editingEndDateConstraints.max}
										required
										class={validationErrors.end_date
											? 'border-red-300 dark:border-red-700'
											: ''}
									/>
								</FormField>
							</div>
						</fieldset>

						<div
							class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
							role="group"
							aria-label="Save or cancel changes"
						>
							<Button
								type="submit"
								variant="primary"
								disabled={!isFormValid}
								aria-label="Save changes to phase {phase.name}"
							>
								<Save class="w-4 h-4 mr-1.5" aria-hidden="true" />
								Save Changes
							</Button>
							<Button
								type="button"
								variant="outline"
								on:click={handleCancelEdit}
								aria-label="Cancel editing phase {phase.name}"
							>
								<X class="w-4 h-4 mr-1.5" aria-hidden="true" />
								Cancel
							</Button>
						</div>
					</form>
				{:else}
					<!-- Phase details -->
					{#if phase.description}
						<p class="text-sm text-gray-600 dark:text-gray-400 mb-2 break-words">
							{phase.description}
						</p>
					{/if}

					<!-- Mobile: Stack date and task info -->
					<div class="block sm:hidden space-y-2 text-sm mb-3">
						<div
							class="flex items-center text-gray-500 dark:text-gray-400"
							aria-label="Phase duration"
						>
							<Clock class="w-4 h-4 mr-1 flex-shrink-0" aria-hidden="true" />
							<span class="text-xs">
								<time datetime={phase.start_date}>
									{formatDateForDisplay(phase.start_date)}
								</time>
								<span aria-hidden="true"> — </span>
								<time datetime={phase.end_date}>
									{formatDateForDisplay(phase.end_date)}
								</time>
							</span>
						</div>
						<div
							class="flex items-center text-gray-700 dark:text-gray-300"
							aria-label="Task completion status"
						>
							<CircleCheck class="w-4 h-4 mr-1 flex-shrink-0" aria-hidden="true" />
							<span class="text-xs"
								>{phase.completed_tasks}/{phase.task_count} completed</span
							>
						</div>
					</div>

					<!-- Desktop: Horizontal layout -->
					<div
						class="hidden sm:flex sm:items-center gap-2 sm:gap-4 text-sm mb-2 justify-between"
					>
						<div class="flex gap-2">
							<div
								class="flex items-center text-gray-500 dark:text-gray-400 min-w-0"
								aria-label="Phase duration"
							>
								<Clock class="w-4 h-4 mr-1 flex-shrink-0" aria-hidden="true" />
								<span class="truncate">
									<time datetime={phase.start_date}>
										{formatDateForDisplay(phase.start_date)}
									</time>
									<span aria-hidden="true"> - </span>
									<time datetime={phase.end_date}>
										{formatDateForDisplay(phase.end_date)}
									</time>
								</span>
							</div>
							<div
								class="flex items-center text-gray-700 dark:text-gray-300"
								aria-label="Task completion status"
							>
								<CircleCheck
									class="w-4 h-4 mr-1 flex-shrink-0"
									aria-hidden="true"
								/>
								<span>{phase.completed_tasks}/{phase.task_count} tasks</span>
							</div>
						</div>
						{#if !isEditing}
							<!-- Action buttons for non-editing state -->
							<div
								class="flex items-center gap-1 sm:gap-2 mb-2 justify-end"
								role="toolbar"
								aria-label="Phase actions for {phase.name}"
							>
								<Button
									variant="ghost"
									title="Add task to phase"
									size="md"
									on:click={handleCreateTaskInPhase}
									aria-label="Add task to phase {phase.name}"
								>
									<Plus class="w-4 h-4" aria-hidden="true" />
								</Button>
								<Button
									variant="ghost"
									title="Schedule phase"
									size="md"
									on:click={handleSchedulePhase}
									disabled={!calendarConnected || !phase.tasks?.length}
									aria-label="Schedule tasks for phase {phase.name}"
								>
									<CalendarCheck class="w-4 h-4" aria-hidden="true" />
								</Button>
								<Button
									variant="ghost"
									size="md"
									on:click={handleEditPhase}
									aria-label="Edit phase {phase.name}"
								>
									<PenTool class="w-4 h-4" aria-hidden="true" />
								</Button>
								<Button
									variant="ghost"
									size="md"
									on:click={handleDeletePhase}
									aria-label="Delete phase {phase.name}"
								>
									<Trash2 class="w-4 h-4" aria-hidden="true" />
								</Button>
							</div>
						{/if}
					</div>

					<!-- Phase Filters - Only show if phase has tasks -->
					{#if phase.tasks?.length}
						<div class="mb-2 space-y-2" transition:fade|local={{ duration: 200 }}>
							<!-- Filter header with reset button -->
							<div class="flex items-center justify-between">
								<span class="text-xs font-medium text-gray-600 dark:text-gray-400">
									{hasCustomFilters
										? 'Custom filters (overriding global)'
										: 'Using global filters'}
								</span>
								{#if hasCustomFilters}
									<Button
										variant="ghost"
										size="sm"
										on:click={handleResetPhaseFilters}
										class="!text-xs !px-2 !py-1 transition-all duration-200 hover:scale-105"
									>
										Reset to global
									</Button>
								{/if}
							</div>

							<!-- Conditional rendering instead of hidden elements (prevents DOM bloat) -->
							{#if !isMobile}
								<!-- Desktop filter bar with smooth transitions -->
								<div in:fade|local={{ duration: 300, delay: 100 }}>
									<TaskFilterBar
										size={'sm'}
										activeFilters={localPhaseFilters}
										taskCounts={phaseTaskCounts}
										showAllButton={false}
										on:toggle={handleFilterToggle}
										on:selectAll={handleSelectAll}
									/>
								</div>
							{:else}
								<!-- Mobile filter dropdown -->
								<div in:fade|local={{ duration: 300, delay: 100 }}>
									<TaskFilterDropdown
										activeFilters={localPhaseFilters}
										taskCounts={phaseTaskCounts}
										label="Phase Filters"
										on:change={(e) => handlePhaseFilterChange(e.detail)}
									/>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Task List with Drop Zone and Current Date Line -->
					<div
						class="task-container-wrapper"
						bind:this={containerElement}
						class:filter-transitioning={isFilterTransition}
						class:has-custom-filters={hasCustomFilters}
						on:dragover|preventDefault={handleTaskDragOver}
						on:dragleave|preventDefault={handleTaskDragLeave}
						on:drop|preventDefault={handleTaskDrop}
					>
						{#if filteredTasks && filteredTasks.length > 0}
							{@const sortedTasks = [...filteredTasks].sort(
								(a, b) =>
									new Date(a.start_date || 0).getTime() -
									new Date(b.start_date || 0).getTime()
							)}
							<div
								class="space-y-1 min-h-[40px] p-2 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 transition-all duration-300 {isDragOver
									? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg transform scale-[1.01]'
									: ''}"
								on:dragover={handleTaskDragOver}
								on:dragleave={handleTaskDragLeave}
								on:drop={handleTaskDrop}
								role="region"
								aria-label="Tasks for {phase.name}"
								aria-describedby="task-drop-instructions-{phase.id}"
								in:fade|local={{ duration: hasCustomFilters ? 400 : 300 }}
							>
								<div id="task-drop-instructions-{phase.id}" class="sr-only">
									Drop tasks here to move them to this phase. Tasks are sorted by
									start date. Showing {filteredTasks.length} of {phase.tasks
										.length} tasks.
								</div>

								<div
									role="list"
									aria-label="Tasks in {phase.name}"
									class="space-y-1"
								>
									<!-- Current date line at start if needed -->
									{#if shouldShowCurrentDateLineAtStart(sortedTasks)}
										<CurrentTimeIndicator
											label=""
											showTime={false}
											className="my-2"
										/>
									{/if}

									{#each sortedTasks as task, index (task.id)}
										<div
											animate:flip={{
												duration: hasCustomFilters ? 400 : 300,
												easing: cubicOut
											}}
										>
											<div
												role="listitem"
												class="task-item {isComplete ? 'opacity-75' : ''}"
												in:receive|local={{ key: task.id }}
												out:send|local={{ key: task.id }}
											>
												<TaskItem
													{index}
													{task}
													{phase}
													showGrip={false}
													on:dragStart={(e) =>
														dispatch('taskDragStart', {
															...e.detail,
															phaseId: phase.id
														})}
													on:editTask={(e) =>
														dispatch('editTask', e.detail)}
													on:deleteTask={(e) =>
														dispatch('deleteTask', e.detail)}
													on:updateTask={(e) =>
														dispatch('updateTask', e.detail)}
												/>
											</div>
											<!-- Current date line after this task if needed -->
											{#if shouldShowCurrentDateLine(sortedTasks, index)}
												<CurrentTimeIndicator
													label=""
													showTime={false}
													className="my-2"
												/>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<!-- Empty state with drop zone -->
							<div
								class="empty-state p-3 sm:p-4 rounded border-2 border-dashed text-center transition-all duration-300 {isDragOver
									? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 border-solid transform scale-[1.01] shadow-lg'
									: 'border-gray-300 dark:border-gray-600'}"
								on:dragover={handleTaskDragOver}
								on:dragleave={handleTaskDragLeave}
								on:drop={handleTaskDrop}
								role="region"
								aria-label="Empty task area for {phase.name}"
								aria-describedby="empty-drop-instructions-{phase.id}"
								in:fade|local={{ duration: hasCustomFilters ? 400 : 200 }}
								out:fade|local={{ duration: hasCustomFilters ? 300 : 150 }}
							>
								<p
									id="empty-drop-instructions-{phase.id}"
									class="text-sm text-gray-500 dark:text-gray-400 italic"
								>
									{#if phase.tasks?.length}
										No tasks match current filters
										<span class="block text-xs mt-1 opacity-70">
											({phase.tasks.length} task{phase.tasks.length === 1
												? ''
												: 's'} hidden)
										</span>
									{:else}
										Drop tasks here
									{/if}
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Kanban View Content -->
	{#if viewMode === 'kanban'}
		<!-- Kanban View Header with Collapse -->
		<div
			class="w-full bg-gray-50 dark:bg-gray-800/50 {isDragOver
				? 'bg-purple-50 dark:bg-purple-900/20'
				: ''} rounded-t-lg transition-colors"
		>
			<Button
				variant="ghost"
				size="sm"
				fullWidth
				btnType="container"
				on:click={handleToggleCollapse}
				aria-expanded={!isCollapsed}
				aria-controls="kanban-phase-content-{phase.id}"
				class="w-full px-3 py-2 text-left rounded-t-lg hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation justify-start font-normal"
			>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2 flex-1 min-w-0">
						{#if isCollapsed}
							<ChevronRight
								class="w-4 h-4 text-gray-500 transition-transform"
								aria-hidden="true"
							/>
						{:else}
							<ChevronDown
								class="w-4 h-4 text-gray-500 transition-transform"
								aria-hidden="true"
							/>
						{/if}

						<h3 class="font-medium text-sm text-gray-900 dark:text-white truncate">
							{phase.name}
						</h3>
					</div>

					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-500 dark:text-gray-400">
							{phase.task_count} tasks
						</span>
						{#if phase.task_count > 0}
							<div
								class="text-sm font-bold {isComplete
									? 'text-green-600'
									: 'text-gray-600'}"
							>
								{progress}%
							</div>
						{/if}
					</div>
				</div>
			</Button>
		</div>

		{#if !isCollapsed}
			<div id="kanban-phase-content-{phase.id}" transition:slide|local={{ duration: 300 }}>
				{#if isEditing}
					<div class="p-4 pt-0">
						<!-- Date validation container - reserve space to prevent layout shift -->
						<div class="min-h-[2.5rem] mb-2">
							{#if validationErrors.dates}
								<div
									class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800"
									role="alert"
								>
									<div class="flex">
										<TriangleAlert
											class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5"
										/>
										<p class="text-sm text-red-800 dark:text-red-200 ml-2">
											{validationErrors.dates}
										</p>
									</div>
								</div>
							{:else if validationWarnings.dates}
								<div
									class="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 border border-yellow-200 dark:border-yellow-800"
									role="alert"
								>
									<div class="flex">
										<TriangleAlert
											class="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5"
										/>
										<p
											class="text-sm text-yellow-800 dark:text-yellow-200 ml-2"
										>
											{validationWarnings.dates}
										</p>
									</div>
								</div>
							{/if}
						</div>

						<!-- Project timeline info -->
						{#if project && (project.start_date || project.end_date)}
							<div
								class="text-xs text-gray-600 dark:text-gray-400 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded"
							>
								Project timeline:
								{#if project.start_date}{formatDateForDisplay(
										project.start_date
									)}{:else}No start{/if}
								-
								{#if project.end_date}{formatDateForDisplay(
										project.end_date
									)}{:else}No end{/if}
							</div>
						{/if}

						<!-- Phase editing form -->
						<form class="space-y-3 mb-3" on:submit|preventDefault={handleSavePhase}>
							<FormField label="Description" error={validationErrors.description}>
								<Textarea
									id="phase-description-{phase.id}"
									bind:value={editingData.description}
									rows={2}
									aria-label="Edit phase description"
									class={validationErrors.description
										? 'border-red-300 dark:border-red-700'
										: ''}
								/>
							</FormField>
							<FormField
								label="Start Date"
								error={validationErrors.start_date}
								hint={project?.start_date
									? `Project starts: ${formatDateForDisplay(project.start_date)}`
									: undefined}
							>
								<TextInput
									id="phase-start-{phase.id}"
									type="date"
									bind:value={editingData.start_date}
									min={editingStartDateConstraints.min}
									max={editingStartDateConstraints.max}
									aria-label="Edit phase start date"
									class={validationErrors.start_date
										? 'border-red-300 dark:border-red-700'
										: ''}
								/>
							</FormField>
							<FormField
								label="End Date"
								error={validationErrors.end_date}
								hint={project?.end_date
									? `Project ends: ${formatDateForDisplay(project.end_date)}`
									: undefined}
							>
								<TextInput
									id="phase-end-{phase.id}"
									type="date"
									bind:value={editingData.end_date}
									min={editingEndDateConstraints.min}
									max={editingEndDateConstraints.max}
									aria-label="Edit phase end date"
									class={validationErrors.end_date
										? 'border-red-300 dark:border-red-700'
										: ''}
								/>
							</FormField>
							<div class="flex items-center gap-2">
								<Button
									type="submit"
									variant="primary"
									size="sm"
									disabled={!isFormValid}
									aria-label="Save changes to {phase.name}"
								>
									<Save class="w-3 h-3 mr-1" aria-hidden="true" />
									Save
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									on:click={handleCancelEdit}
									aria-label="Cancel editing {phase.name}"
								>
									<X class="w-3 h-3 mr-1" aria-hidden="true" />
									Cancel
								</Button>
							</div>
						</form>
					</div>
				{/if}

				<!-- Task List (Kanban View Only) -->
				<div
					class="phase-tasks p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out"
					class:has-custom-filters={hasCustomFilters}
					class:filter-transitioning={isFilterTransition}
					style="max-height: 16rem; overflow-y: auto;"
					bind:this={containerElement}
					on:dragover|preventDefault={handleTaskDragOver}
					on:dragleave|preventDefault={handleTaskDragLeave}
					on:drop|preventDefault={handleTaskDrop}
					role="region"
					aria-label="Tasks for {phase.name}"
					aria-describedby="task-drop-instructions-{phase.id}"
				>
					<div class="sr-only" id="task-drop-instructions-{phase.id}">
						Drop tasks here to move them to this phase
					</div>

					<!-- Phase Filters (Kanban View) -->
					{#if phase.tasks?.length}
						<div
							class="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700"
							transition:fade|local={{ duration: 200 }}
						>
							<div class="flex items-center justify-between mb-2">
								<span class="text-xs font-medium text-gray-600 dark:text-gray-400">
									{hasCustomFilters
										? 'Custom filters (overriding global)'
										: 'Using global filters'}
								</span>
								{#if hasCustomFilters}
									<Button
										variant="ghost"
										size="sm"
										on:click={handleResetPhaseFilters}
										class="!text-xs !px-1.5 !py-0.5 transition-all duration-200 hover:scale-105"
									>
										Reset
									</Button>
								{/if}
							</div>

							<div in:fade|local={{ duration: 300, delay: 100 }}>
								<TaskFilterDropdown
									activeFilters={localPhaseFilters}
									taskCounts={phaseTaskCounts}
									label="Filter"
									on:change={(e) => handlePhaseFilterChange(e.detail)}
								/>
							</div>
						</div>
					{/if}

					<div class="task-list-inner">
						{#if filteredTasks && filteredTasks.length > 0}
							<div
								class="space-y-2"
								role="list"
								aria-label="Tasks in {phase.name}"
								in:fade|local={{ duration: hasCustomFilters ? 400 : 300 }}
							>
								{#each filteredTasks as task, index (task.id)}
									<div
										role="listitem"
										class="task-item"
										in:receive|local={{ key: task.id }}
										out:send|local={{ key: task.id }}
										animate:flip={isFiltering
											? undefined
											: {
													duration: 300,
													easing: cubicOut
												}}
									>
										<TaskItem
											{index}
											{task}
											{phase}
											on:dragStart={(e) =>
												dispatch('taskDragStart', {
													...e.detail,
													phaseId: phase.id
												})}
											on:editTask={(e) => dispatch('editTask', e.detail)}
											on:updateTask={(e) => dispatch('updateTask', e.detail)}
											on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
										/>
									</div>
								{/each}
							</div>
						{:else}
							<p
								class="empty-state text-sm text-gray-500 dark:text-gray-400 italic text-center py-4"
								role="status"
								aria-live="polite"
								in:fade|local={{ duration: hasCustomFilters ? 400 : 200 }}
								out:fade|local={{ duration: hasCustomFilters ? 300 : 150 }}
							>
								{#if phase.tasks?.length}
									No tasks match filters
									<span class="block text-xs mt-1 opacity-70">
										({phase.tasks?.length || 0} task{phase.tasks?.length === 1
											? ''
											: 's'} hidden)
									</span>
								{:else}
									Drop tasks here
								{/if}
							</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</article>

<style>
	/* Mobile-first phase card styling */
	.phase-card {
		transition: all 0.2s ease;
		contain: layout style;
		transform: translateZ(0); /* Hardware acceleration */
	}

	@media (max-width: 640px) {
		.phase-card {
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}
	}

	/* Touch feedback */

	/* Phase header mobile optimization */
	.phase-header {
		position: relative;
	}

	/* Task list scrolling */
	.phase-tasks {
		min-height: 60px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		-webkit-overflow-scrolling: touch;
		scroll-behavior: smooth;
		scrollbar-width: thin;
		transform: translateZ(0);
	}

	.phase-tasks::-webkit-scrollbar {
		width: 6px;
	}

	.phase-tasks::-webkit-scrollbar-track {
		background: transparent;
	}

	.phase-tasks::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	:global(.dark) .phase-tasks::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.5);
	}

	/* Task container wrapper transitions */
	.task-container-wrapper {
		transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: height;
		position: relative;
		min-height: 60px;
	}

	/* Phase-specific filter transitions (no layout shift) */
	.task-container-wrapper.has-custom-filters {
		transition: none;
	}

	.task-container-wrapper.is-transitioning {
		overflow: hidden;
	}

	/* Task item animations */
	.task-item {
		will-change: transform, opacity;
		transform-origin: center;
		transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.task-item:hover {
		transform: translateY(-1px);
	}

	/* Smooth task list animations */
	:global(.phase-card [role='list']) {
		will-change: contents;
		min-height: 40px;
	}

	/* Task list inner container */
	.task-list-inner {
		transform: translateZ(0);
		will-change: contents;
		position: relative;
		min-height: 60px;
	}

	/* Empty state positioning for phase filters */
	.has-custom-filters .empty-state {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: calc(100% - 2rem);
	}

	/* Kanban specific styles */
	.phase-tasks.has-custom-filters {
		transition: none;
		position: relative;
	}

	.phase-tasks:not(.has-custom-filters) {
		transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Different opacity transitions for phase vs global */
	.has-custom-filters .task-item {
		animation: phaseFilterFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	@keyframes phaseFilterFadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Ensure empty state doesn't cause layout shift */
	.empty-state {
		will-change: opacity;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Enhanced drag feedback */
	.empty-state:hover {
		border-color: rgba(59, 130, 246, 0.3);
	}

	/* Filter transition enhancements */
	:global(.task-filter-bar) {
		transition:
			opacity 0.3s ease,
			transform 0.3s ease;
		transform: translateZ(0);
	}

	/* Progress bar animation on mobile */

	/* Edit form mobile optimization */
	.phase-header form input,
	.phase-header form textarea {
		font-size: 16px; /* Prevent zoom on iOS */
	}

	@media (min-width: 640px) {
		.phase-header form input,
		.phase-header form textarea {
			font-size: 14px;
		}
	}

	/* GPU acceleration for smooth animations */
	@supports (transform: translateZ(0)) {
		.task-item,
		.task-container-wrapper,
		.task-list-inner {
			transform: translateZ(0);
			backface-visibility: hidden;
		}
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.task-item,
		.task-container-wrapper,
		.task-list-inner,
		.empty-state {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
		}
	}
</style>
