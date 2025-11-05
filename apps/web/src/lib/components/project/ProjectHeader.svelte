<!-- apps/web/src/lib/components/project/ProjectHeader.svelte -->
<script lang="ts">
	import {
		ArrowLeft,
		Edit3,
		Calendar,
		Tag,
		BarChart3,
		Settings,
		Trash2,
		MoreHorizontal,
		GitBranch
	} from 'lucide-svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { format } from 'date-fns/format';
	import type { Phase, Project, Task } from '$lib/types/project';
	import type { ProcessedPhase } from '$lib/types/project-page.types';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';

	// Import the v2 store
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Props - now only for callbacks and computed values
	let {
		onEdit = undefined,
		onDelete = undefined,
		onViewHistory = undefined,
		onCalendarSettings = undefined,
		onConnectCalendar = undefined
	}: {
		onEdit?: ((project: Project) => void) | undefined;
		onDelete?: (() => void) | undefined;
		onViewHistory?: (() => void) | undefined;
		onCalendarSettings?: (() => void) | undefined;
		onConnectCalendar?: (() => void) | undefined;
	} = $props();

	// Direct reactive access to store - Svelte 5 optimized pattern
	let storeState = $derived($projectStoreV2);

	// Subscribe to the v2 store using Svelte 5 runes for better performance
	let project = $derived(storeState?.project);
	let projectCalendar = $derived(storeState?.projectCalendar);
	let calendarStatus = $derived(storeState?.calendarStatus);
	let phases = $derived(storeState?.phases || []);
	let tasks = $derived(storeState?.tasks || []);
	let currentTaskStats = $derived(
		storeState?.stats || {
			total: 0,
			completed: 0,
			active: 0,
			inProgress: 0,
			blocked: 0
		}
	);

	// Task dots visualization using Svelte 5 runes
	let taskDotsLoaded = $derived(tasks.length > 0);
	let phaseTaskMap: Map<string, string> = new Map(); // Maps task ID to phase ID

	// Build task-to-phase map from phases data using Svelte 5 effect
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

	// Feature flags using Svelte 5 runes
	let isCalendarConnected = $derived(calendarStatus?.isConnected === true);
	let showCalendarSettings = $derived(onCalendarSettings && project && isCalendarConnected);
	let hasProjectCalendar = $derived(!!projectCalendar);
	let showConnectButton = $derived(!isCalendarConnected && !!onConnectCalendar);
	let showCustomizeButton = $derived(showCalendarSettings && !hasProjectCalendar);
	let showMenuCalendarConnect = $derived(!isCalendarConnected && !!onConnectCalendar);

	let showDesktopMenu = $state(false);
	let showMobileMenu = $state(false);
	let currentPos = $state(-1);
	let desktopMenuButton: HTMLButtonElement | null = null;
	let desktopMenuPanel: HTMLDivElement | null = null;

	let completionRate = $derived(
		currentTaskStats && currentTaskStats.total > 0
			? Math.round((currentTaskStats.completed / currentTaskStats.total) * 100)
			: 0
	);

	let hasPhases = $derived(phases.length > 0);

	function handleEditContext() {
		if (onEdit && project) {
			onEdit(project);
		}
	}

	function handleDelete() {
		if (onDelete) {
			onDelete();
		}
	}

	function handleViewHistory() {
		if (onViewHistory) {
			onViewHistory();
		}
	}

	function handleCalendarSettings() {
		if (onCalendarSettings) {
			onCalendarSettings();
		}
	}

	function handleConnectCalendar() {
		if (onConnectCalendar) {
			onConnectCalendar();
		}
	}

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
	}

	function toggleDesktopMenu() {
		showDesktopMenu = !showDesktopMenu;
	}

	function closeDesktopMenu() {
		showDesktopMenu = false;
	}

	function formatDateShort(dateStr: string): string {
		// For YYYY-MM-DD format dates, parse as local to avoid timezone shift
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			return format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy');
		}
		return format(new Date(dateStr), 'MMM d, yyyy');
	}

	function formatDateMobile(dateStr: string): string {
		// For YYYY-MM-DD format dates, parse as local to avoid timezone shift
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			return format(new Date(dateStr + 'T12:00:00'), 'MMM d');
		}
		return format(new Date(dateStr), 'MMM d');
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-500';
			case 'paused':
				return 'bg-yellow-500';
			case 'completed':
				return 'bg-blue-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStatusBadgeColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
			case 'paused':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
			case 'completed':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
		}
	}

	function getStatusLabel(status: string): string {
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	$effect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		function handleClickOutside(event: MouseEvent) {
			if (!showDesktopMenu) return;
			const target = event.target as Node;
			if (
				desktopMenuPanel &&
				!desktopMenuPanel.contains(target) &&
				desktopMenuButton &&
				!desktopMenuButton.contains(target)
			) {
				closeDesktopMenu();
			}
		}

		window.addEventListener('click', handleClickOutside);
		return () => window.removeEventListener('click', handleClickOutside);
	});

	// Timeline functions
	interface PhaseTrack {
		phase: ProcessedPhase;
		track: number;
		startPos: number;
		endPos: number;
	}

	function getTimelineBounds(): { start: Date; end: Date } | null {
		if (phases.length === 0) return null;

		// Get phase bounds
		const phaseStartMin = Math.min(
			...phases.map((p: Phase) => new Date(p.start_date).getTime())
		);
		const phaseEndMax = Math.max(...phases.map((p: Phase) => new Date(p.end_date).getTime()));

		// Use project dates if available, otherwise fall back to phase dates
		const timelineStart = project?.start_date
			? new Date(project?.start_date)
			: new Date(phaseStartMin);

		const timelineEnd = project?.end_date ? new Date(project?.end_date) : new Date(phaseEndMax);

		return { start: timelineStart, end: timelineEnd };
	}

	function calculatePhaseTracks(phases: ProcessedPhase[]): PhaseTrack[] {
		if (phases.length === 0) return [];

		const bounds = getTimelineBounds();
		if (!bounds) return [];

		const sortedPhases = [...phases].sort((a, b) => {
			const startDiff = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
			if (startDiff !== 0) return startDiff;

			const aDuration = new Date(a.end_date).getTime() - new Date(a.start_date).getTime();
			const bDuration = new Date(b.end_date).getTime() - new Date(b.start_date).getTime();
			return aDuration - bDuration;
		});

		const totalDuration = bounds.end.getTime() - bounds.start.getTime();
		const phaseTracks: PhaseTrack[] = [];
		const tracks: Array<{ endTime: number }> = [];

		for (const phase of sortedPhases) {
			const startTime = new Date(phase.start_date).getTime();
			const endTime = new Date(phase.end_date).getTime();

			const startPos = Math.max(
				0,
				((startTime - bounds.start.getTime()) / totalDuration) * 100
			);
			const endPos = Math.min(
				100,
				((endTime - bounds.start.getTime()) / totalDuration) * 100
			);

			let trackIndex = 0;
			while (trackIndex < tracks?.length && tracks[trackIndex].endTime > startTime) {
				trackIndex++;
			}

			while (tracks.length <= trackIndex) {
				tracks.push({ endTime: 0 });
			}

			tracks[trackIndex].endTime = endTime;

			phaseTracks.push({
				phase,
				track: trackIndex,
				startPos,
				endPos
			});
		}

		return phaseTracks;
	}

	function getTimelinePosition(date: string): number {
		const bounds = getTimelineBounds();
		if (!bounds) return 0;

		const targetDate = new Date(date);
		const totalDuration = bounds.end.getTime() - bounds.start.getTime();
		const elapsed = targetDate.getTime() - bounds.start.getTime();

		return Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
	}

	function getPhaseProgress(phase: ProcessedPhase): number {
		if (phase.task_count === 0) return 0;
		return Math.round((phase.completed_tasks / phase.task_count) * 100);
	}

	function getPhaseStatus(phase: ProcessedPhase): 'upcoming' | 'active' | 'completed' {
		const now = new Date();
		const startDate = new Date(phase.start_date);
		const endDate = new Date(phase.end_date);

		if (now < startDate) return 'upcoming';
		if (now > endDate) return 'completed';
		return 'active';
	}

	function getPhaseColor(index: number): string {
		const colors = [
			'bg-indigo-500 hover:bg-indigo-600',
			'bg-purple-500 hover:bg-purple-600',
			'bg-teal-500 hover:bg-teal-600',
			'bg-orange-500 hover:bg-orange-600',
			'bg-cyan-500 hover:bg-cyan-600',
			'bg-violet-500 hover:bg-violet-600',
			'bg-emerald-500 hover:bg-emerald-600',
			'bg-pink-500 hover:bg-pink-600'
		];
		return colors[index % colors.length];
	}

	function getTrackColor(trackIndex: number): string {
		const colors = [
			'bg-blue-500',
			'bg-green-500',
			'bg-purple-500',
			'bg-yellow-500',
			'bg-red-500',
			'bg-indigo-500',
			'bg-pink-500',
			'bg-gray-500'
		];
		return colors[trackIndex % colors.length];
	}

	function getTrackHoverColor(trackIndex: number): string {
		const colors = [
			'hover:bg-blue-600',
			'hover:bg-green-600',
			'hover:bg-purple-600',
			'hover:bg-yellow-600',
			'hover:bg-red-600',
			'hover:bg-indigo-600',
			'hover:bg-pink-600',
			'hover:bg-gray-600'
		];
		return colors[trackIndex % colors.length];
	}

	function scrollToPhase(phaseId: string) {
		const element = document.getElementById(`phase-card-${phaseId}`);
		if (element) {
			element.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
				inline: 'nearest'
			});
		}
	}

	function scrollToTask(taskId: string) {
		console.log(`Attempting to scroll to task: ${taskId}`);

		// Try to find task in the tasks list first
		let element = document.getElementById(`task-${taskId}`);
		if (!element) {
			// Try to find in phase cards
			element = document.getElementById(`phase-task-${taskId}`);
		}

		if (element) {
			// Element found, scroll to it
			console.log(`Found task element, scrolling to: ${element.id}`);
			element.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
				inline: 'nearest'
			});
			// Add a highlight effect
			element.classList.add('highlight-task');
			setTimeout(() => {
				element?.classList.remove('highlight-task');
			}, 2000);
		} else {
			// Element not found - just log and don't manipulate filters
			console.warn(
				`Task element not found for ID: ${taskId}. Task may be filtered out or not currently visible.`
			);
		}
	}

	// Calculate task dot positions and colors
	interface TaskDot {
		id: string;
		position: number;
		color: string;
		size: 'small' | 'normal';
		title: string;
		status: string;
	}

	function getTaskDotColor(task: Task): string {
		const now = new Date();

		// Deleted tasks - red
		if (task.deleted_at) {
			return 'bg-red-600';
		}

		// Completed tasks - blue
		if (task.status === 'done') {
			return 'bg-blue-500';
		}

		// In progress tasks - yellow/amber
		if (task.status === 'in_progress') {
			return 'bg-yellow-500';
		}

		// Blocked tasks - orange
		if (task.status === 'blocked') {
			return 'bg-orange-500';
		}

		// Tasks with start dates
		if (task.start_date) {
			const startDate = new Date(task.start_date + 'T00:00:00');

			// Overdue tasks - red
			if (startDate < now) {
				return 'bg-red-500';
			}

			// Future scheduled tasks - green
			if (startDate >= now) {
				return 'bg-green-500';
			}
		}

		// Backlog tasks - gray
		return 'bg-gray-400';
	}

	function calculateTaskDots(): TaskDot[] {
		if (!project || !tasks || tasks.length === 0) {
			return [];
		}

		// Parse dates more carefully
		const parseDate = (dateStr: string): Date => {
			// Handle YYYY-MM-DD format
			if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
				return new Date(dateStr + 'T12:00:00');
			}
			return new Date(dateStr);
		};

		// Calculate project bounds - use phase dates as fallback
		let projectStart: Date;
		let projectEnd: Date;

		if (project?.start_date && project?.end_date) {
			projectStart = parseDate(project.start_date);
			projectEnd = parseDate(project.end_date);
		} else if (phases && phases.length > 0) {
			// Use phase bounds as fallback
			const phaseDates = phases
				.flatMap((p) => [
					p.start_date ? parseDate(p.start_date) : null,
					p.end_date ? parseDate(p.end_date) : null
				])
				.filter((d) => d && !isNaN(d.getTime()));

			if (phaseDates.length === 0) {
				return [];
			}

			projectStart = new Date(Math.min(...phaseDates.map((d) => d.getTime())));
			projectEnd = new Date(Math.max(...phaseDates.map((d) => d.getTime())));
		} else {
			// Use task dates as last resort
			const taskDates = tasks
				.flatMap((t) => [
					t.start_date ? parseDate(t.start_date) : null,
					t.completed_at ? parseDate(t.completed_at) : null,
					t.deleted_at ? parseDate(t.deleted_at) : null
				])
				.filter((d) => d && !isNaN(d.getTime()));

			if (taskDates.length === 0) {
				return [];
			}

			projectStart = new Date(Math.min(...taskDates.map((d) => d.getTime())));
			projectEnd = new Date(Math.max(...taskDates.map((d) => d.getTime())));

			// Add some padding if using task dates
			projectStart.setDate(projectStart.getDate() - 7);
			projectEnd.setDate(projectEnd.getDate() + 7);
		}

		const totalDuration = projectEnd.getTime() - projectStart.getTime();

		// If duration is invalid, return empty
		if (totalDuration <= 0 || isNaN(totalDuration)) {
			return [];
		}

		const dots: TaskDot[] = [];

		// Group tasks by position for stacking
		const positionGroups = new Map<number, Task[]>();

		let processedCount = 0;
		let skippedCount = 0;

		for (const task of tasks) {
			// Skip tasks with missing or empty titles
			if (!task.title || task.title.trim() === '') {
				console.warn('Skipping task with empty title:', task);
				skippedCount++;
				continue;
			}

			let taskDate: Date;

			// Position deleted tasks at their deletion date
			if (task.deleted_at) {
				taskDate = parseDate(task.deleted_at);
			}
			// Position completed tasks at their completion date
			else if (task.status === 'done' && task.completed_at) {
				taskDate = parseDate(task.completed_at);
			}
			// Position tasks with start dates at their start date
			else if (task.start_date) {
				taskDate = parseDate(task.start_date);
			}
			// Backlog task assigned to a phase - position at phase start
			else if (task.status === 'backlog' && phaseTaskMap.has(task.id)) {
				const phaseId = phaseTaskMap.get(task.id);
				const phase = phases.find((p) => p.id === phaseId);
				if (phase && phase.start_date) {
					taskDate = parseDate(phase.start_date);
				} else {
					taskDate = projectStart;
				}
			}
			// True backlog - position at project start
			else {
				taskDate = projectStart;
			}

			// Validate taskDate
			if (isNaN(taskDate.getTime())) {
				console.warn('Invalid task date for task:', task.title, 'using project start');
				taskDate = projectStart;
			}

			// Calculate position - clamp between 0 and 100
			const position = Math.max(
				0,
				Math.min(100, ((taskDate.getTime() - projectStart.getTime()) / totalDuration) * 100)
			);

			// Check if position is valid
			if (isNaN(position)) {
				console.warn(
					'NaN position for task:',
					task.title,
					'taskDate:',
					taskDate,
					'projectStart:',
					projectStart,
					'totalDuration:',
					totalDuration
				);
				skippedCount++;
				continue; // Skip this task
			}

			// Skip tasks that are way outside project bounds (more than 20% outside)
			if (position < -20 || position > 120) {
				skippedCount++;
				continue;
			}

			processedCount++;

			// Round position to nearest 0.5% for grouping
			const roundedPos = Math.round(position * 2) / 2;

			if (!positionGroups.has(roundedPos)) {
				positionGroups.set(roundedPos, []);
			}
			positionGroups.get(roundedPos)!.push(task);
		}

		// Create dots with stacking
		for (const [position, tasksAtPosition] of positionGroups) {
			if (tasksAtPosition.length === 1) {
				// Single task at this position
				const task = tasksAtPosition[0];
				dots.push({
					id: task.id,
					position,
					color: getTaskDotColor(task),
					size: task.status === 'backlog' ? 'small' : 'normal',
					title: task.title,
					status: task.status
				});
			} else {
				// Multiple tasks - stack them
				const offset = 0.3; // Slight offset for each stacked task
				tasksAtPosition.forEach((task, index) => {
					dots.push({
						id: task.id,
						position: position + index * offset,
						color: getTaskDotColor(task),
						size: task.status === 'backlog' ? 'small' : 'normal',
						title: task.title,
						status: task.status
					});
				});
			}
		}

		return dots;
	}

	// Memoized taskDots calculation that only updates when positioning data changes
	let prevTaskDotKey = '';
	let cachedTaskDots: TaskDot[] = [];

	let taskDots = $derived.by(() => {
		if (!project || !tasks || !phases) return [];

		// Create a stable key from only the data that affects dot positioning
		const dotKey = JSON.stringify({
			projectId: project?.id,
			projectStart: project?.start_date,
			projectEnd: project?.end_date,
			taskCount: tasks.length,
			phaseCount: phases.length,
			// Only include task data that affects positioning
			taskPositions: tasks.map(
				(t) => `${t.id}-${t.start_date}-${t.status}-${t.deleted_at}-${t.completed_at}`
			),
			taskData: tasks.map((t) => ({
				id: t.id,
				start: t.start_date,
				status: t.status,
				deleted: t.deleted_at
			}))
		});

		// Only recalculate if the key has actually changed
		if (dotKey !== prevTaskDotKey) {
			prevTaskDotKey = dotKey;
			cachedTaskDots = calculateTaskDots();
		}

		return cachedTaskDots;
	});

	// Calculate dynamic legend based on existing task types using Svelte 5 runes
	let taskDotLegend = $derived.by(() => {
		if (!tasks || tasks.length === 0) return [];

		const now = new Date();
		const presentTypes = new Set<string>();

		// Check what types of tasks exist in the project - match the getTaskDotColor logic exactly
		for (const task of tasks) {
			// Use the same logic as getTaskDotColor to determine what types are present
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

		// Define legend items in order of importance - match the colors from getTaskDotColor
		const allLegendItems = [
			{ type: 'done', label: 'Done', bgClass: 'bg-blue-500', size: 'normal' },
			{ type: 'scheduled', label: 'Scheduled', bgClass: 'bg-green-500', size: 'normal' },
			{ type: 'in_progress', label: 'In Progress', bgClass: 'bg-yellow-500', size: 'normal' },
			{ type: 'blocked', label: 'Blocked', bgClass: 'bg-orange-500', size: 'normal' },
			{ type: 'overdue', label: 'Overdue', bgClass: 'bg-red-500', size: 'normal' },
			{ type: 'deleted', label: 'Deleted', bgClass: 'bg-red-600', size: 'normal' },
			{ type: 'backlog', label: 'Backlog', bgClass: 'bg-gray-400', size: 'normal' }
		];

		// Return only legend items for types that exist in the project
		const filteredLegend = allLegendItems.filter((item) => presentTypes.has(item.type));
		console.log(
			'TaskDotLegend - presentTypes:',
			Array.from(presentTypes),
			'filteredLegend:',
			filteredLegend
		);
		return filteredLegend;
	});

	// No need for async loading - use data from store

	function generateMonthMarkers(): Array<{ date: Date; position: number; label: string }> {
		const bounds = getTimelineBounds();
		if (!bounds) return [];

		const markers = [];
		const start = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
		const end = bounds.end;
		const totalDuration = end.getTime() - bounds.start.getTime();

		let current = new Date(start);
		while (current <= end) {
			const position = ((current.getTime() - bounds.start.getTime()) / totalDuration) * 100;

			if (position >= 0 && position <= 100) {
				markers.push({
					date: new Date(current),
					position,
					label: format(current, 'MMM')
				});
			}

			// Move to next month
			current.setMonth(current.getMonth() + 1);
		}

		return markers;
	}

	// Mobile scroll functionality - updated for unified timeline
	function scrollToCenter() {
		if (typeof window === 'undefined') return;

		const timelineElement = document.querySelector('.timeline-scroll');
		if (timelineElement && currentPos >= 0 && currentPos <= 100) {
			const containerWidth = timelineElement.clientWidth;
			const timelineWidth = 700; // min-w-[700px]
			const todayPixelPos = (currentPos / 100) * timelineWidth;
			const scrollLeft = Math.max(0, todayPixelPos - containerWidth / 2);

			timelineElement.scrollTo({
				left: scrollLeft,
				behavior: 'smooth'
			});
		}
	}

	// Enhanced scroll to center for unified timeline
	function scrollToCenterUnified() {
		if (typeof window === 'undefined') return;

		setTimeout(() => {
			const timelineElement = document.querySelector('.timeline-scroll');
			if (timelineElement && currentPos >= 0 && currentPos <= 100) {
				const containerWidth = timelineElement.clientWidth;
				const timelineWidth = 700; // min-w-[700px]
				const todayPixelPos = (currentPos / 100) * timelineWidth;
				const scrollLeft = Math.max(0, todayPixelPos - containerWidth / 2);

				timelineElement.scrollTo({
					left: scrollLeft,
					behavior: 'smooth'
				});
			}
		}, 100);
	}

	// Reactive calculations for timeline using Svelte 5 runes
	let timelineBounds = $derived(getTimelineBounds());
	let phaseTracks = $derived(calculatePhaseTracks(phases));
	let maxTracks = $derived(Math.max(1, ...phaseTracks.map((pt) => pt.track + 1)));
	let monthMarkers = $derived(generateMonthMarkers());

	// Recalculate current position whenever phases, project, or timeline bounds change using effect
	$effect(() => {
		// This block will re-run whenever any of these dependencies change
		if (phases && project) {
			const bounds = getTimelineBounds();
			if (bounds) {
				const newPos = getTimelinePosition(new Date().toISOString());
				currentPos = newPos;
			}
		}
	});

	// Also update on mount and when store updates
	onMount(() => {
		// Set up a small delay to ensure store data is loaded
		setTimeout(() => {
			const bounds = getTimelineBounds();
			if (bounds) {
				const newPos = getTimelinePosition(new Date().toISOString());
				currentPos = newPos;

				// Auto-scroll to today on mobile for unified timeline
				if (window.innerWidth < 640) {
					// sm breakpoint - use enhanced scroll function
					setTimeout(scrollToCenterUnified, 200);
				}
			}
		}, 100);
	});
</script>

<!-- Only render if project exists -->
{#if project}
	<!-- Back button -->
	<nav aria-label="Project navigation">
		<a
			href="/projects"
			class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 sm:mb-6 transition-colors group"
			aria-label="Return to projects list"
		>
			<ArrowLeft
				class="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform"
				aria-hidden="true"
			/>
			Back to Projects
		</a>
	</nav>

	<!-- Project Header -->
	<header
		class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
		aria-labelledby="project-title"
	>
		<!-- Main Header Section -->
		<div class="p-4 sm:p-6">
			<!-- Title and Actions Row - Now truly inline -->
			<div class="flex items-start justify-between gap-4 mb-4">
				<!-- Project Title only (no description here) -->
				<h1
					id="project-title"
					class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words"
				>
					{project?.name}
				</h1>

				<!-- Desktop Actions -->
				<div
					class="hidden sm:flex items-center space-x-2 flex-shrink-0"
					role="toolbar"
					aria-label="Project actions"
				>
					{#if onEdit}
						<Button
							onclick={handleEditContext}
							variant="outline"
							size="sm"
							aria-label="Edit project {project?.name} context"
						>
							<Settings class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Context
						</Button>
					{/if}

					{#if showConnectButton}
						<Button
							onclick={handleConnectCalendar}
							variant="outline"
							size="sm"
							aria-label="Connect Google Calendar"
						>
							<Calendar class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Connect Calendar
						</Button>
					{:else if showCustomizeButton}
						<Button
							onclick={handleCalendarSettings}
							variant="outline"
							size="sm"
							aria-label="Customize project calendar"
						>
							<Calendar class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Customize Calendar
						</Button>
					{/if}

					<div class="relative" role="presentation">
						<button
							type="button"
							onclick={toggleDesktopMenu}
							class="inline-flex items-center justify-center rounded-md border border-transparent p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
							aria-haspopup="true"
							aria-expanded={showDesktopMenu}
							aria-label="Open project settings menu"
							bind:this={desktopMenuButton}
						>
							<MoreHorizontal class="w-5 h-5" aria-hidden="true" />
						</button>

						{#if showDesktopMenu}
							<div
								class="absolute right-0 top-[calc(100%+0.5rem)] min-w-[12rem] w-max bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-fade-in duration-200"
								role="menu"
								aria-label="Project settings"
								tabindex="-1"
								onkeydown={(e) => e.key === 'Escape' && closeDesktopMenu()}
								bind:this={desktopMenuPanel}
							>
								{#if onViewHistory}
									<button
										onclick={() => {
											handleViewHistory();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<GitBranch
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>View History</span>
									</button>
								{/if}

								{#if showCalendarSettings}
									<button
										onclick={() => {
											handleCalendarSettings();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap relative"
										role="menuitem"
									>
										<Calendar
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span
											>{hasProjectCalendar
												? 'Calendar Settings'
												: 'Customize Calendar'}</span
										>
										{#if projectCalendar?.color_id && projectCalendar?.hex_color}
											<div
												class="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
												style="background-color: {projectCalendar.hex_color}"
											></div>
										{/if}
									</button>
								{:else if showMenuCalendarConnect}
									<button
										onclick={() => {
											handleConnectCalendar();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<Calendar
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>Connect Calendar</span>
									</button>
								{/if}

								{#if onDelete}
									<div
										class="border-t border-gray-200 dark:border-gray-700 my-1"
									></div>
									<button
										onclick={() => {
											handleDelete();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<Trash2
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>Delete Project</span>
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Mobile Actions -->
				<div class="sm:hidden flex items-center space-x-2">
					{#if onEdit}
						<Button
							onclick={handleEditContext}
							variant="outline"
							size="sm"
							aria-label="Edit project {project?.name} context"
						>
							<Settings class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Context
						</Button>
					{/if}

					{#if showConnectButton}
						<Button
							onclick={handleConnectCalendar}
							variant="outline"
							size="sm"
							aria-label="Connect Google Calendar"
						>
							<Calendar class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Connect
						</Button>
					{:else if showCustomizeButton}
						<Button
							onclick={handleCalendarSettings}
							variant="outline"
							size="sm"
							aria-label="Customize project calendar"
						>
							<Calendar class="w-4 h-4 mr-1.5" aria-hidden="true" />
							Customize
						</Button>
					{/if}

					<!-- Mobile Menu Button -->
					<div class="relative">
						<Button
							onclick={toggleMobileMenu}
							class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
							aria-label="Open project settings menu"
							aria-expanded={showMobileMenu}
							aria-haspopup="true"
						>
							<MoreHorizontal class="w-5 h-5" aria-hidden="true" />
						</Button>

						<!-- Mobile Dropdown Menu -->
						{#if showMobileMenu}
							<!-- Backdrop -->
							<div
								class="fixed inset-0 z-40"
								onclick={closeMobileMenu}
								onkeydown={(e) => e.key === 'Escape' && closeMobileMenu()}
								role="button"
								tabindex="-1"
								aria-label="Close menu"
							></div>

							<!-- Dropdown -->
							<div
								class="absolute right-0 top-[calc(100%+0.5rem)] min-w-[12rem] w-max bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-fade-in duration-200"
								role="menu"
								aria-label="Project settings"
								style="max-width: calc(100vw - 2rem); transform: translateX(min(0px, 100vw - 100% - 1rem));"
							>
								{#if onViewHistory}
									<button
										onclick={() => {
											handleViewHistory();
											closeMobileMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<GitBranch
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>View History</span>
									</button>
								{/if}

								{#if showCalendarSettings}
									<button
										onclick={() => {
											handleCalendarSettings();
											closeMobileMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap relative"
										role="menuitem"
									>
										<Calendar
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span
											>{hasProjectCalendar
												? 'Calendar Settings'
												: 'Customize Calendar'}</span
										>
										{#if projectCalendar?.color_id && projectCalendar?.hex_color}
											<div
												class="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
												style="background-color: {projectCalendar.hex_color}"
											></div>
										{/if}
									</button>
								{:else if showMenuCalendarConnect}
									<button
										onclick={() => {
											handleConnectCalendar();
											closeMobileMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<Calendar
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>Connect Calendar</span>
									</button>
								{/if}

								{#if onDelete}
									<div
										class="border-t border-gray-200 dark:border-gray-700 my-1"
									></div>
									<button
										onclick={() => {
											handleDelete();
											closeMobileMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left whitespace-nowrap"
										role="menuitem"
									>
										<Trash2
											class="w-4 h-4 mr-3 flex-shrink-0"
											aria-hidden="true"
										/>
										<span>Delete Project</span>
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Project Description - Full width below title -->
			{#if project?.description}
				<div
					class="prose prose-sm sm:prose-base prose-gray dark:prose-invert max-w-none dark:text-white mb-4"
					role="region"
					aria-label="Project description"
				>
					{@html renderMarkdown(project.description)}
				</div>
			{/if}

			<!-- Clean Key Metrics Grid -->
			<section class="space-y-4" aria-label="Project information">
				<!-- Key Metrics Cards -->
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<!-- Status Card -->
					{#if project?.status}
						<div
							class="bg-gray-50 dark:bg-gray-700/30 rounded-xl py-1 px-2 border border-gray-100 dark:border-gray-700"
						>
							<div
								class="text-xs text-gray-500 dark:text-gray-400 mb-0.5 font-medium uppercase tracking-wider"
							>
								Status
							</div>
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full {getStatusColor(
										project.status
									)} shadow-sm"
									aria-hidden="true"
								></div>
								<span class="text-sm font-semibold text-gray-900 dark:text-white">
									{getStatusLabel(project.status)}
								</span>
							</div>
						</div>
					{/if}

					<!-- Progress Card -->
					{#if currentTaskStats.total > 0}
						<div
							class="bg-gray-50 dark:bg-gray-700/30 rounded-xl py-1 px-2 border border-gray-100 dark:border-gray-700"
						>
							<div
								class="text-xs text-gray-500 dark:text-gray-400 mb-0.5 font-medium uppercase tracking-wider"
							>
								Progress
							</div>
							<div class="flex items-baseline gap-1.5">
								<span class="text-sm font-semibold text-gray-900 dark:text-white">
									{completionRate}%
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400">
									complete
								</span>
							</div>
						</div>
					{/if}

					<!-- Due Date Card -->
					{#if project?.end_date}
						{@const daysRemaining = Math.ceil(
							(new Date(project.end_date).getTime() - new Date().getTime()) /
								(1000 * 60 * 60 * 24)
						)}
						<div
							class="bg-gray-50 dark:bg-gray-700/30 rounded-xl py-1 px-2 border border-gray-100 dark:border-gray-700"
						>
							<div
								class="text-xs text-gray-500 dark:text-gray-400 mb-0.5 font-medium uppercase tracking-wider"
							>
								Due
							</div>
							<div class="text-sm font-semibold text-gray-900 dark:text-white">
								{#if daysRemaining > 0}
									{daysRemaining}d
									<span
										class="text-xs font-normal text-gray-500 dark:text-gray-400"
										>left</span
									>
								{:else if daysRemaining === 0}
									Today
								{:else}
									<span class="text-red-600 dark:text-red-400">
										{Math.abs(daysRemaining)}d over
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Active Tasks Card -->
					{#if currentTaskStats.active > 0 || currentTaskStats.inProgress > 0}
						<div
							class="bg-gray-50 dark:bg-gray-700/30 rounded-xl py-1 px-2 border border-gray-100 dark:border-gray-700"
						>
							<div
								class="text-xs text-gray-500 dark:text-gray-400 mb-0.5 font-medium uppercase tracking-wider"
							>
								Active
							</div>
							<div class="text-sm font-semibold text-gray-900 dark:text-white">
								{currentTaskStats.active + currentTaskStats.inProgress}
								<span class="text-xs font-normal text-gray-500 dark:text-gray-400"
									>tasks</span
								>
							</div>
						</div>
					{/if}
				</div>

				<!-- Tags Row -->
				{#if project?.tags?.length}
					<div class="flex items-start gap-2">
						<Tag
							class="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 mt-0.5 flex-shrink-0"
							aria-hidden="true"
						/>
						<div class="flex flex-wrap gap-1" role="list" aria-label="Project tags">
							{#each project.tags as tag}
								<span
									class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium"
									role="listitem"
									aria-label="Tag: {tag}"
								>
									{tag}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		</div>

		<!-- Elegant Progress Bar -->
		{#if currentTaskStats.total > 0}
			<section
				class="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50"
				aria-labelledby="progress-heading"
			>
				<div class="relative">
					<!-- Task dots visualization -->
					{#if taskDotsLoaded}
						<!-- Dynamic Legend for task dots - Moved above task dots -->
						<div
							class="mb-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
						>
							{#if taskDotLegend?.length}
								{#each taskDotLegend as legendItem}
									<div class="flex items-center gap-1">
										<span
											class="w-1.5 h-1.5 {legendItem.bgClass} rounded-full"
											style={legendItem.size === 'small'
												? 'width: 4px; height: 4px;'
												: ''}
										></span>
										<span>{legendItem.label}</span>
									</div>
								{/each}
							{/if}
						</div>

						<!-- Unified Timeline Container - Always show if tasks exist -->
						<div class="relative -mx-4 sm:-mx-6 px-4 sm:px-6">
							<!-- Fade edges for scroll indication -->
							<div
								class="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-gray-800 to-transparent pointer-events-none z-0"
							></div>
							<div
								class="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-gray-800 to-transparent pointer-events-none z-0"
							></div>

							<!-- Unified Scrollable Container -->
							<div class="overflow-x-auto scrollbar-custom timeline-scroll">
								<div class="relative min-w-[700px] w-full">
									<!-- Timeline Date Labels (always show for task dots) -->
									{#if timelineBounds}
										<div
											class="absolute -top-1 left-0 text-xs font-medium text-gray-900 dark:text-white z-0"
										>
											{formatDateShort(timelineBounds.start.toISOString())}
										</div>
										<div
											class="absolute -top-1 right-0 text-xs font-medium text-gray-900 dark:text-white z-0"
										>
											{formatDateShort(timelineBounds.end.toISOString())}
										</div>
									{/if}

									<!-- Month Markers (always show for task dots) -->
									{#each monthMarkers as marker}
										<div
											class="absolute top-0 bottom-0 z-5"
											style="left: {marker.position}%"
										>
											<!-- Month tick mark -->
											<div
												class="w-px h-2 bg-gray-300 dark:bg-gray-600"
											></div>
											<!-- Month label -->
											<div
												class="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-gray-500 dark:text-gray-400"
											>
												{marker.label}
											</div>
										</div>
									{/each}

									<!-- Task Dots Section -->
									<div
										class="relative h-12 bg-gray-50 dark:bg-gray-800/30 rounded mt-6 {hasPhases
											? 'mb-1'
											: ''}"
										aria-label="Task timeline"
									>
										<!-- Timeline background line -->
										<div
											class="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600 -translate-y-1/2"
										></div>

										{#if taskDots && taskDots.length > 0}
											{#each taskDots as dot, index (dot.id)}
												<span
													class="absolute block {dot.color} rounded-full transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:scale-150 ring-1 ring-white dark:ring-gray-800 hover:ring-2 hover:ring-offset-1 hover:ring-offset-white dark:hover:ring-offset-gray-900"
													style="left: {dot.position}%; top: 50%; transform: translate(-50%, -50%); width: {dot.size ===
													'small'
														? '8px'
														: '12px'}; height: {dot.size === 'small'
														? '8px'
														: '12px'}; z-index: 0;"
													onclick={() => scrollToTask(dot.id)}
													onkeydown={(e) =>
														e.key === 'Enter' && scrollToTask(dot.id)}
													role="button"
													tabindex="0"
													title="{dot.title} ({dot.status})"
													aria-label="Task: {dot.title}"
												></span>
											{/each}
										{:else}
											<div
												class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs text-gray-400"
											>
												No task dots to display
											</div>
										{/if}
									</div>

									<!-- Phases Timeline Section (only if phases exist) -->
									{#if hasPhases}
										<div class="relative py-4">
											<!-- Timeline Background Line -->
											<div
												class="absolute left-0 right-0 h-px bg-gray-200 dark:bg-gray-700"
												style="top: {(maxTracks * 20) / 2 + 16}px"
											></div>

											<!-- Phase Bars -->
											<div
												class="relative mt-6"
												style="height: {maxTracks * 20}px"
											>
												{#each phaseTracks as { phase, track, startPos, endPos }, index}
													{@const status = getPhaseStatus(phase)}
													{@const progress = getPhaseProgress(phase)}
													{@const phaseColor =
														status === 'completed'
															? 'bg-green-500 hover:bg-green-600'
															: status === 'active'
																? 'bg-blue-500 hover:bg-blue-600'
																: getPhaseColor(index)}

													<!-- Phase Bar -->
													<button
														class="absolute rounded-md {phaseColor} transition-all duration-200 hover:shadow-md hover:scale-y-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 group"
														style="left: {startPos}%; width: {Math.max(
															endPos - startPos,
															10
														)}%; top: {track * 20}px; height: 16px;"
														onclick={() => scrollToPhase(phase.id)}
														aria-label="Navigate to phase {phase.name}"
														title="{phase.name} ({progress}% complete)"
													>
														<!-- Phase Name -->
														<div
															class="h-full flex items-center justify-center px-2"
														>
															<span
																class="text-xs font-medium text-white truncate"
															>
																{phase.name}
															</span>
														</div>

														<!-- Progress Bar (subtle bottom indicator) -->
														{#if progress > 0}
															<div
																class="absolute bottom-0 left-0 h-0.5 bg-white/40 rounded-full"
																style="width: {progress}%"
															></div>
														{/if}
													</button>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Unified Today Marker spanning both task dots and phases -->
									{#if currentPos >= 0 && currentPos <= 100}
										<div
											class="absolute w-0.5 bg-red-500 z-0 pointer-events-none"
											style="left: {currentPos}%; top: 0; height: 100%;"
										>
											<!-- Today Label -->
											<div
												class="absolute -top-8 left-1/2 -translate-x-1/2 z-0"
											>
												<span
													class="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded shadow-sm border border-red-200 dark:border-red-800"
												>
													Today
												</span>
											</div>

											<!-- Task Dots Marker Dot -->
											<div
												class="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm z-0"
												style="top: 48px;"
											></div>

											<!-- Phase Timeline Marker Dot (only if phases exist) -->
											{#if hasPhases}
												<div
													class="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm z-0"
													style="top: {80 + (maxTracks * 20) / 2}px;"
												></div>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{:else if !taskDotsLoaded}
						<!-- Loading state -->
						<div class="h-8 mt-3 flex items-center">
							<div class="text-xs text-gray-400 animate-pulse">
								Loading task timeline...
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</header>

	<!-- Click outside to close mobile menu -->
	{#if showMobileMenu}
		<button
			class="fixed inset-0 z-0 bg-transparent"
			onclick={closeMobileMenu}
			tabindex="-1"
			aria-label="Close menu"
		></button>
	{/if}
{:else}
	<!-- Loading state or placeholder when project is null -->
	<div class="animate-pulse">
		<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
		<div class="bg-white dark:bg-gray-800 rounded-xl p-6">
			<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
			<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
			<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar styling for the timeline */
	.scrollbar-custom {
		scrollbar-width: thin;
		scrollbar-color: rgb(209 213 219) transparent;
	}

	.scrollbar-custom::-webkit-scrollbar {
		height: 6px;
	}

	.scrollbar-custom::-webkit-scrollbar-track {
		background: transparent;
	}

	.scrollbar-custom::-webkit-scrollbar-thumb {
		background-color: rgb(209 213 219);
		border-radius: 3px;
		transition: background-color 0.2s;
	}

	.scrollbar-custom::-webkit-scrollbar-thumb:hover {
		background-color: rgb(156 163 175);
	}

	/* Dark mode scrollbar */
	:global(.dark) .scrollbar-custom {
		scrollbar-color: rgb(75 85 99) transparent;
	}

	:global(.dark) .scrollbar-custom::-webkit-scrollbar-thumb {
		background-color: rgb(75 85 99);
	}

	:global(.dark) .scrollbar-custom::-webkit-scrollbar-thumb:hover {
		background-color: rgb(107 114 128);
	}

	/* Smooth scroll behavior */
	.timeline-scroll {
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
	}

	/* Highlight animation for scrolled-to tasks */
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

	/* Animation for pulsing dot */
	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.5);
		}
	}

	.pulse-dot {
		animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	/* Horizontal bounce animation for arrows */
	@keyframes bounce-x {
		0%,
		100% {
			transform: translateX(0);
		}
		50% {
			transform: translateX(4px);
		}
	}

	.animate-bounce-x {
		animation: bounce-x 1s ease-in-out infinite;
	}
</style>
