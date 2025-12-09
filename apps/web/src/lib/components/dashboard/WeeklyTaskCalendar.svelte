<!-- apps/web/src/lib/components/dashboard/WeeklyTaskCalendar.svelte -->
<script lang="ts">
	import { Calendar, Clock, ChevronRight, CheckCircle } from 'lucide-svelte';
	import {
		format,
		addDays,
		isSameDay,
		parseISO,
		isWithinInterval,
		startOfDay,
		endOfDay
	} from 'date-fns';
	import { getProjectColor } from '$lib/utils/project-colors';
	import Button from '$lib/components/ui/Button.svelte';
	import type { TimeBlockWithProject } from '@buildos/shared-types';

	type Props = {
		tasksByDate?: Record<string, any[]>;
		timeBlocks?: TimeBlockWithProject[];
		calendarStatus?: any;
		onTaskClick?: (task: any) => void;
		onTimeBlockClick?: (block: TimeBlockWithProject) => void;
	};

	let {
		tasksByDate = {},
		timeBlocks = [],
		calendarStatus = { isConnected: false },
		onTaskClick = () => {},
		onTimeBlockClick = undefined
	}: Props = $props();

	// Generate the next 7 days
	const today = new Date();
	const weekDays = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const date = addDays(today, i);
			return {
				date,
				dateStr: format(date, 'yyyy-MM-dd'),
				isToday: isSameDay(date, today),
				dayName: format(date, 'EEE'),
				dayNumber: format(date, 'd'),
				monthName: format(date, 'MMM'),
				fullDate: format(date, 'MMM d')
			};
		})
	);

	function getTasksForDate(dateStr: string): any[] {
		return tasksByDate[dateStr] || [];
	}

	function getTimeBlocksForDate(dateStr: string): TimeBlockWithProject[] {
		if (!timeBlocks || timeBlocks.length === 0) return [];

		try {
			const targetDate = parseISO(dateStr);
			const dayStart = startOfDay(targetDate);
			const dayEnd = endOfDay(targetDate);

			return timeBlocks
				.filter((block) => {
					const blockStart = new Date(block.start_time);
					const blockEnd = new Date(block.end_time);

					// Check if block overlaps with this day
					return (
						isWithinInterval(blockStart, { start: dayStart, end: dayEnd }) ||
						isWithinInterval(blockEnd, { start: dayStart, end: dayEnd }) ||
						(blockStart <= dayStart && blockEnd >= dayEnd)
					);
				})
				.sort(
					(a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
				);
		} catch {
			return [];
		}
	}

	function formatTime(dateString: string): string {
		try {
			return format(parseISO(dateString), 'h:mm a');
		} catch {
			return '';
		}
	}

	function formatTimeBlockTime(block: TimeBlockWithProject): string {
		try {
			const start = format(new Date(block.start_time), 'h:mm');
			const end = format(new Date(block.end_time), 'h:mm a');
			return `${start}-${end}`;
		} catch {
			return '';
		}
	}

	// Helper to get time block color classes for compact display
	function getTimeBlockColorClasses(block: TimeBlockWithProject) {
		if (block.block_type === 'build') {
			return {
				bg: 'bg-purple-50 dark:bg-purple-900/20',
				border: 'border-l-purple-500',
				text: 'text-purple-700 dark:text-purple-300',
				hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30'
			};
		}

		// Map calendar color IDs to Tailwind colors
		const colorMap: Record<
			string,
			{ border: string; bg: string; text: string; hover: string }
		> = {
			'1': {
				border: 'border-l-blue-500',
				bg: 'bg-blue-50 dark:bg-blue-900/20',
				text: 'text-blue-700 dark:text-blue-300',
				hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30'
			},
			'2': {
				border: 'border-l-green-500',
				bg: 'bg-green-50 dark:bg-green-900/20',
				text: 'text-green-700 dark:text-green-300',
				hover: 'hover:bg-green-100 dark:hover:bg-green-900/30'
			},
			'3': {
				border: 'border-l-purple-500',
				bg: 'bg-purple-50 dark:bg-purple-900/20',
				text: 'text-purple-700 dark:text-purple-300',
				hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30'
			},
			'4': {
				border: 'border-l-pink-500',
				bg: 'bg-pink-50 dark:bg-pink-900/20',
				text: 'text-pink-700 dark:text-pink-300',
				hover: 'hover:bg-pink-100 dark:hover:bg-pink-900/30'
			},
			'5': {
				border: 'border-l-yellow-500',
				bg: 'bg-yellow-50 dark:bg-yellow-900/20',
				text: 'text-yellow-700 dark:text-yellow-300',
				hover: 'hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
			},
			'6': {
				border: 'border-l-orange-500',
				bg: 'bg-orange-50 dark:bg-orange-900/20',
				text: 'text-orange-700 dark:text-orange-300',
				hover: 'hover:bg-orange-100 dark:hover:bg-orange-900/30'
			},
			'7': {
				border: 'border-l-cyan-500',
				bg: 'bg-cyan-50 dark:bg-cyan-900/20',
				text: 'text-cyan-700 dark:text-cyan-300',
				hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/30'
			},
			'8': {
				border: 'border-l-gray-500',
				bg: 'bg-gray-50 dark:bg-gray-900/20',
				text: 'text-gray-700 dark:text-gray-300',
				hover: 'hover:bg-gray-100 dark:hover:bg-gray-900/30'
			},
			'9': {
				border: 'border-l-indigo-500',
				bg: 'bg-indigo-50 dark:bg-indigo-900/20',
				text: 'text-indigo-700 dark:text-indigo-300',
				hover: 'hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
			},
			'10': {
				border: 'border-l-emerald-500',
				bg: 'bg-emerald-50 dark:bg-emerald-900/20',
				text: 'text-emerald-700 dark:text-emerald-300',
				hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
			},
			'11': {
				border: 'border-l-red-500',
				bg: 'bg-red-50 dark:bg-red-900/20',
				text: 'text-red-700 dark:text-red-300',
				hover: 'hover:bg-red-100 dark:hover:bg-red-900/30'
			}
		};

		const colorId = block.project?.calendar_color_id || '9';
		return colorMap[colorId] || colorMap['9'];
	}

	// Group tasks and time blocks by time slots for chronological display
	function groupItemsByTimeSlot(
		tasks: any[],
		timeBlocks: TimeBlockWithProject[]
	): Map<string, Array<{ type: 'task' | 'timeblock'; data: any }>> {
		const groups = new Map<string, Array<{ type: 'task' | 'timeblock'; data: any }>>();

		// Add tasks to groups
		tasks.forEach((task) => {
			// Create a time key for grouping
			let timeKey = 'unscheduled';

			if (task.start_date) {
				try {
					const date =
						typeof task.start_date === 'string'
							? parseISO(task.start_date)
							: new Date(task.start_date);

					if (!isNaN(date.getTime())) {
						// Group by hour and minute
						timeKey = format(date, 'HH:mm');
					}
				} catch {
					// Keep as unscheduled
				}
			}

			if (!groups.has(timeKey)) {
				groups.set(timeKey, []);
			}
			groups.get(timeKey)?.push({ type: 'task', data: task });
		});

		// Add time blocks to groups
		timeBlocks.forEach((block) => {
			try {
				const date = new Date(block.start_time);
				if (!isNaN(date.getTime())) {
					const timeKey = format(date, 'HH:mm');

					if (!groups.has(timeKey)) {
						groups.set(timeKey, []);
					}
					groups.get(timeKey)?.push({ type: 'timeblock', data: block });
				}
			} catch {
				// Skip invalid time blocks
			}
		});

		// Sort the map by time
		return new Map(
			[...groups.entries()].sort((a, b) => {
				if (a[0] === 'unscheduled') return 1;
				if (b[0] === 'unscheduled') return -1;
				return a[0].localeCompare(b[0]);
			})
		);
	}

	function getTotalTasks(): number {
		return Object.values(tasksByDate).reduce(
			(total, day: any) => total + (day?.length || 0),
			0
		);
	}

	// Group tasks by day for mobile view
	const mobileTaskDays = $derived(
		weekDays
			.map((day) => ({
				...day,
				tasks: getTasksForDate(day.dateStr)
			}))
			.filter((day) => day.tasks.length > 0 || day.isToday)
	);
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
>
	<!-- Header -->
	<div class="p-2 sm:p-4 border-b border-gray-200 dark:border-gray-700">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
			<h2
				class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center"
			>
				<Calendar class="mr-2 h-5 w-5 text-blue-600 dark:text-blue-400" />
				Weekly Tasks
			</h2>
			<div class="flex items-center justify-between sm:justify-end gap-4">
				<div class="flex items-center gap-2">
					<span class="text-2xl font-bold text-blue-600 dark:text-blue-400">
						{getTotalTasks()}
					</span>
					<span class="text-sm text-gray-500 dark:text-gray-400">Next 7 days</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="p-2 sm:p-4">
		{#if getTotalTasks() === 0}
			<!-- Empty state -->
			<div class="text-center py-8 sm:py-12">
				<Calendar
					class="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4"
				/>
				<h3 class="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
					No tasks scheduled
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
					Your scheduled tasks will appear here. Start by creating tasks for your
					projects.
				</p>
			</div>
		{:else}
			<!-- Mobile View: Vertical List -->
			<div class="block sm:hidden space-y-4">
				{#each mobileTaskDays as day}
					<div
						class="border-l-2 {day.isToday
							? 'border-blue-500'
							: 'border-gray-200 dark:border-gray-700'} pl-4"
					>
						<!-- Day header -->
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<span
									class="text-sm font-medium {day.isToday
										? 'text-blue-600 dark:text-blue-400'
										: 'text-gray-700 dark:text-gray-300'}"
								>
									{day.fullDate}
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{day.dayName}
								</span>
								{#if day.isToday}
									<span
										class="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
									>
										Today
									</span>
								{/if}
							</div>
							{#if day.tasks.length > 0}
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{day.tasks.length}
									{day.tasks.length === 1 ? 'task' : 'tasks'}
								</span>
							{/if}
						</div>

						<!-- Tasks for this day -->
						{#if day.tasks.length > 0}
							<div class="space-y-2">
								{#each day.tasks as task}
									<button
										onclick={() => onTaskClick(task)}
										class="w-full text-left p-3 rounded-lg border transition-all hover:shadow-md
											{task.completed
											? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
											: task.projects
												? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
												: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900/30'}"
									>
										<div class="flex items-start justify-between mb-1">
											<h4
												class="font-medium text-sm text-gray-900 dark:text-white flex-1 mr-2 {task.completed
													? 'line-through opacity-60'
													: ''}"
											>
												{task.title || 'Untitled'}
											</h4>
											{#if task.start_date}
												<span
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													{formatTime(task.start_date)}
												</span>
											{/if}
										</div>
										{#if task.description}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
											>
												{task.description}
											</p>
										{/if}
										<div class="flex items-center justify-between">
											{#if task.projects}
												<div
													class="flex items-center text-xs text-blue-600 dark:text-blue-400"
												>
													<div
														class="w-2 h-2 bg-current rounded-full mr-1.5"
													></div>
													<span>{task.projects.name}</span>
												</div>
											{/if}
											{#if task.completed}
												<CheckCircle
													class="w-4 h-4 text-green-600 dark:text-green-400"
												/>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{:else}
							<div class="text-xs text-gray-400 dark:text-gray-500 italic">
								No tasks scheduled
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Desktop View: Week Grid -->
			<div class="hidden sm:grid sm:grid-cols-7 gap-3 lg:gap-4">
				{#each weekDays as day}
					{@const dayTasks = getTasksForDate(day.dateStr)}
					{@const dayTimeBlocks = getTimeBlocksForDate(day.dateStr)}
					{@const groupedItems = groupItemsByTimeSlot(dayTasks, dayTimeBlocks)}
					<div class="flex flex-col">
						<!-- Day header -->
						<div
							class="text-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
						>
							<div class="text-xs font-medium text-gray-600 dark:text-gray-400">
								{day.dayName}
							</div>
							<div class="flex items-center justify-center mt-1">
								<span
									class="text-base font-semibold {day.isToday
										? 'text-blue-600 dark:text-blue-400'
										: 'text-gray-900 dark:text-white'}"
								>
									{day.dayNumber}
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
									{day.monthName}
								</span>
							</div>
							{#if day.isToday}
								<div
									class="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full mx-auto mt-1"
								></div>
							{/if}
						</div>

						<!-- Tasks and Time Blocks for this day (chronologically sorted) -->
						<div class="space-y-2 min-h-[120px] max-h-[400px] overflow-y-auto">
							{#if groupedItems.size > 0}
								{#each [...groupedItems.entries()] as [timeSlot, itemsInSlot]}
									<!-- Separate time blocks and tasks for this time slot -->
									{@const timeBlocksInSlot = itemsInSlot.filter(
										(item) => item.type === 'timeblock'
									)}
									{@const tasksInSlot = itemsInSlot
										.filter((item) => item.type === 'task')
										.map((item) => item.data)}

									<!-- Render time blocks first -->
									{#each timeBlocksInSlot as { data: block }}
										{@const colors = getTimeBlockColorClasses(block)}
										<Button
											onclick={() => onTimeBlockClick?.(block)}
											class="w-full text-left p-2 rounded-lg border-l-3 transition-all hover:shadow-md hover:scale-105 {colors.bg} {colors.border} {colors.hover}"
											disabled={!onTimeBlockClick}
										>
											<div class="flex items-start justify-between mb-1">
												<div
													class="text-[10px] font-semibold {colors.text} uppercase tracking-wide"
												>
													{block.block_type === 'build'
														? 'Build'
														: block.project?.name || 'Focus'}
												</div>
											</div>
											<div
												class="text-xs text-gray-600 dark:text-gray-300 font-medium"
											>
												{formatTimeBlockTime(block)}
											</div>
											<div
												class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5"
											>
												{block.duration_minutes} min
											</div>
										</Button>
									{/each}

									<!-- Render tasks for this time slot -->
									{#if tasksInSlot.length > 1 && timeSlot !== 'unscheduled'}
										<!-- Multiple tasks at same time, show in grid -->
										<div class="space-y-1">
											<div
												class="text-[10px] text-gray-500 dark:text-gray-400 font-medium px-1"
											>
												{timeSlot === 'unscheduled'
													? 'Unscheduled'
													: formatTime(tasksInSlot[0].start_date)}
											</div>
											<div class="grid grid-cols-2 gap-1">
												{#each tasksInSlot as task}
													<button
														onclick={() => onTaskClick(task)}
														class="w-full text-left p-1.5 rounded-lg border text-[10px] transition-all hover:shadow-md
															{task.completed
															? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
															: task.projects
																? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
																: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900/30'}"
													>
														<div
															class="font-medium truncate text-gray-900 dark:text-white {task.completed
																? 'line-through opacity-60'
																: ''}"
														>
															{task.title || 'Untitled'}
														</div>
														{#if task.projects}
															{@const projectColor = getProjectColor(
																task.projects
															)}
															<div
																class="flex items-center mt-0.5"
																style="color: {projectColor.hex};"
															>
																<div
																	class="w-1 h-1 rounded-full mr-0.5"
																	style="background-color: {projectColor.hex};"
																></div>
																<span class="truncate text-[9px]">
																	{task.projects.name}
																</span>
															</div>
														{/if}
													</button>
												{/each}
											</div>
										</div>
									{:else if tasksInSlot.length > 0}
										<!-- Single task or unscheduled tasks -->
										{#each tasksInSlot as task}
											<button
												onclick={() => onTaskClick(task)}
												class="w-full text-left p-2 rounded-lg border text-xs transition-all hover:shadow-md hover:scale-105
													{task.completed
													? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
													: task.projects
														? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
														: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900/30'}"
											>
												<div
													class="font-medium truncate mb-1 text-gray-900 dark:text-white {task.completed
														? 'line-through opacity-60'
														: ''}"
												>
													{task.title || 'Untitled'}
												</div>
												{#if task.start_date}
													<div
														class="text-gray-500 dark:text-gray-400 mb-1"
													>
														{formatTime(task.start_date)}
													</div>
												{/if}
												{#if task.projects}
													{@const projectColor = getProjectColor(
														task.projects
													)}
													<div
														class="flex items-center"
														style="color: {projectColor.hex};"
													>
														<div
															class="w-1.5 h-1.5 rounded-full mr-1"
															style="background-color: {projectColor.hex};"
														></div>
														<span class="truncate">
															{task.projects.name}
														</span>
													</div>
												{/if}
												{#if task.completed}
													<CheckCircle
														class="w-3 h-3 text-green-600 dark:text-green-400 mt-1"
													/>
												{/if}
											</button>
										{/each}
									{/if}
								{/each}
							{:else}
								<div class="flex items-center justify-center h-full min-h-[80px]">
									<div class="text-center">
										<Clock
											class="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto mb-1"
										/>
										<span class="text-xs text-gray-400 dark:text-gray-500"
											>No tasks</span
										>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Footer actions -->
		<div
			class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
		>
			<div class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
				<div class="flex items-center gap-1.5">
					<div
						class="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded border border-blue-300 dark:border-blue-600"
					></div>
					<span class="text-gray-600 dark:text-gray-400">Project tasks</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div
						class="w-3 h-3 bg-green-500 dark:bg-green-400 rounded border border-green-300 dark:border-green-600"
					></div>
					<span class="text-gray-600 dark:text-gray-400">Completed</span>
				</div>
				{#if calendarStatus?.isConnected}
					<div class="flex items-center gap-1.5">
						<div
							class="w-3 h-3 bg-gray-500 dark:bg-gray-400 rounded border border-gray-300 dark:border-gray-600"
						></div>
						<span class="text-gray-600 dark:text-gray-400">Calendar synced</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
