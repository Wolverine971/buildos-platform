<!-- apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte -->
<script lang="ts">
	import { AlertTriangle, Calendar, Clock, CheckCircle, ExternalLink, Plus } from 'lucide-svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		isTaskOverdue,
		getDaysOverdue,
		categorizeTaskByDate,
		formatDateShort,
		isDateToday,
		isDateTomorrow
	} from '$lib/utils/date-utils';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import { format } from 'date-fns-tz';
	import type { TimeBlockWithProject } from '@buildos/shared-types';

	type Props = {
		pastDueTasks?: any[];
		todaysTasks?: any[];
		tomorrowsTasks?: any[];
		timeBlocks?: TimeBlockWithProject[];
		calendarStatus?: any;
		onTaskClick?: (task: any) => void;
		onTimeBlockClick?: (block: TimeBlockWithProject) => void;
		onNewTimeBlock?: () => void;
	};

	const {
		pastDueTasks = [],
		todaysTasks = [],
		tomorrowsTasks = [],
		timeBlocks = [],
		calendarStatus = { isConnected: false },
		onTaskClick = () => {},
		onTimeBlockClick = () => {},
		onNewTimeBlock = () => {}
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// State for active tab - preserve on data updates
	// Initialize from localStorage if available, otherwise default to 1 (Today tab)
	let activeTab = $state(1);

	// Initialize activeTab from localStorage on mount
	$effect(() => {
		if (typeof window !== 'undefined') {
			const savedTab = localStorage?.getItem('dashboard-tab-position');
			if (savedTab !== null) {
				const tabIndex = parseInt(savedTab, 10);
				if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 2) {
					activeTab = tabIndex;
				}
			}
		}
	});

	// Save tab position when changed
	$effect(() => {
		if (typeof window !== 'undefined' && activeTab !== undefined) {
			localStorage.setItem('dashboard-tab-position', activeTab.toString());
		}
	});

	// Tab configuration - must be reactive to update when task arrays change
	const tabs = $derived([
		{ id: 0, label: 'Past Due', count: pastDueTasks.length, icon: AlertTriangle, color: 'red' },
		{ id: 1, label: 'Today', count: todaysTasks.length, icon: Clock, color: 'blue' },
		{ id: 2, label: 'Tomorrow', count: tomorrowsTasks.length, icon: Calendar, color: 'green' }
	]);

	// Get tasks for active tab
	const activeTasks = $derived(
		activeTab === 0 ? pastDueTasks : activeTab === 1 ? todaysTasks : tomorrowsTasks
	);

	// Get configuration for active tab
	const activeTabConfig = $derived(tabs[activeTab]);

	// Group tasks by time blocks (similar to TimeBlocksCard)
	const groupedContent = $derived.by(() => {
		if (!timeBlocks.length || activeTab === 0) {
			// No time blocks for past due, or no timeBlocks data
			return { timeBlockGroups: [], ungroupedTasks: activeTasks };
		}

		// Filter blocks for the active tab (Today or Tomorrow)
		let filteredBlocks = timeBlocks;
		if (activeTab === 1) {
			// Today tab
			filteredBlocks = timeBlocks.filter((block) => isDateToday(block.start_time));
		} else if (activeTab === 2) {
			// Tomorrow tab
			filteredBlocks = timeBlocks.filter((block) => isDateTomorrow(block.start_time));
		}

		const sortedBlocks = [...filteredBlocks].sort(
			(a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
		);

		const groups: Array<{ block: TimeBlockWithProject; tasks: any[] }> = [];
		const taskAssignedToBlock = new Set<string>();

		sortedBlocks.forEach((block) => {
			const blockStart = new Date(block.start_time);
			const blockEnd = new Date(block.end_time);

			const matchingTasks = activeTasks.filter((task) => {
				if (!task.start_date) return false;
				const taskDate = new Date(task.start_date);

				// CRITICAL FIX: Compare dates only, not times!
				// task.start_date is just a date (e.g., "2025-10-25"), becomes midnight UTC
				// Comparing with time block (e.g., "09:00") fails because midnight < 09:00
				const taskDateOnly = new Date(
					taskDate.getFullYear(),
					taskDate.getMonth(),
					taskDate.getDate()
				);
				const blockStartDate = new Date(
					blockStart.getFullYear(),
					blockStart.getMonth(),
					blockStart.getDate()
				);
				const blockEndDate = new Date(
					blockEnd.getFullYear(),
					blockEnd.getMonth(),
					blockEnd.getDate()
				);
				const isWithinDateRange =
					taskDateOnly >= blockStartDate && taskDateOnly <= blockEndDate;
				const isWithinTimeRange = isWithinDateRange; // Use date range instead of time range
				const isMatchingProject =
					block.block_type === 'build' || task.project_id === block.project_id;

				return isWithinTimeRange && isMatchingProject && !taskAssignedToBlock.has(task.id);
			});

			matchingTasks.forEach((task) => taskAssignedToBlock.add(task.id));

			groups.push({
				block,
				tasks: matchingTasks
			});
		});

		const ungroupedTasks = activeTasks.filter((task) => !taskAssignedToBlock.has(task.id));

		return { timeBlockGroups: groups, ungroupedTasks };
	});

	// Helper functions
	function formatTaskDateForDisplay(dateString: string): string {
		return formatDateShort(dateString);
	}

	function formatTimeBlockTime(dateString: string): string {
		return format(new Date(dateString), 'h:mm a');
	}

	function formatTaskTimeRange(task: any): string | null {
		const event = task?.task_calendar_events?.[0];
		const startSource = event?.event_start || task?.start_date;
		if (!startSource) return null;

		const start = new Date(startSource);
		if (Number.isNaN(start.getTime())) return null;

		let end: Date | null = null;
		const endSource = event?.event_end;
		if (endSource) {
			const parsedEnd = new Date(endSource);
			if (!Number.isNaN(parsedEnd.getTime())) {
				end = parsedEnd;
			}
		}

		if (!end && typeof task?.duration_minutes === 'number' && task.duration_minutes > 0) {
			end = new Date(start.getTime() + task.duration_minutes * 60_000);
		}

		const startLabel = format(start, 'h:mm a');
		if (end) {
			return `${startLabel} - ${format(end, 'h:mm a')}`;
		}
		return startLabel;
	}

	function getTaskDisplayInfo(task: any) {
		const category = categorizeTaskByDate(task.start_date);
		const isOverdue = isTaskOverdue(task.start_date);
		const daysOverdue = getDaysOverdue(task.start_date);

		return {
			category,
			isOverdue,
			daysOverdue,
			formattedDate: formatTaskDateForDisplay(task.start_date),
			timeRange: formatTaskTimeRange(task),
			dateColor: isOverdue
				? 'text-red-600 dark:text-red-400'
				: 'text-gray-500 dark:text-gray-400'
		};
	}

	function getOverdueText(daysOverdue: number): string {
		if (daysOverdue === 0) return 'Today';
		if (daysOverdue === 1) return '1d late';
		return `${daysOverdue}d late`;
	}

	function getPriorityColor(priority: string) {
		switch (priority?.toLowerCase()) {
			case 'high':
				return 'border-l-red-500';
			case 'medium':
				return 'border-l-orange-500';
			case 'low':
				return 'border-l-blue-500';
			default:
				return 'border-l-gray-300';
		}
	}

	function handleTaskClickInternal(task: any) {
		onTaskClick(task);
		dispatch('taskClick', task);
	}

	function handleTimeBlockClickInternal(block: TimeBlockWithProject) {
		onTimeBlockClick(block);
		dispatch('timeBlockClick', block);
	}
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-2 sm:p-4 border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm"
>
	<!-- Tab buttons with Apple-style design -->
	<div class="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
		{#each tabs as tab}
			<Button
				onclick={() => (activeTab = tab.id)}
				class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all
				{activeTab === tab.id
					? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
					: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
				variant="ghost"
				btnType="container"
				size="sm"
			>
				<span class="flex items-center gap-1.5">
					<span>{tab.label}</span>
				</span>
			</Button>
		{/each}
	</div>

	<!-- Active tab content -->
	<div class="">
		<div class="flex items-center gap-2 mb-4">
			{#if activeTabConfig?.icon}
				{@const Icon = activeTabConfig.icon}
				<Icon
					class="h-4 w-4 {activeTabConfig.color === 'red'
						? 'text-red-600'
						: activeTabConfig.color === 'blue'
							? 'text-blue-600'
							: 'text-green-600'}"
				/>
			{/if}
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
				{activeTabConfig.label}
				{#if activeTabConfig.count > 0}
					<span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
						({activeTabConfig.count})
					</span>
				{/if}
			</h3>
		</div>

		{#if activeTasks.length > 0}
			<div
				class="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent pr-1"
			>
				<!-- Time Blocks Section (Only show for Today/Tomorrow) -->
				{#if activeTab > 0 && groupedContent.timeBlockGroups.length > 0}
					<div class="space-y-3">
						{#each groupedContent.timeBlockGroups as { block, tasks: blockTasks }}
							<div
								class="bg-gradient-to-br from-blue-50/50 via-white to-white dark:from-blue-900/10 dark:via-gray-900/60 dark:to-gray-900/70 rounded-xl border border-blue-200/50 dark:border-blue-800/50 overflow-hidden"
							>
								<!-- Time Block Header -->
								<Button
									onclick={() => handleTimeBlockClickInternal(block)}
									class="w-full text-left px-3 py-2.5 bg-blue-50/70 dark:bg-blue-900/20 hover:bg-blue-100/70 dark:hover:bg-blue-900/30 transition-all flex items-center justify-between gap-2"
									variant="ghost"
									size="sm"
								>
									<div class="flex items-center gap-2 min-w-0 flex-1">
										<div
											class="h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0"
										/>
										<div class="min-w-0">
											<p
												class="text-sm font-semibold text-gray-900 dark:text-white truncate"
											>
												{block.block_type === 'build'
													? 'Build session'
													: block.project?.name || 'Focus session'}
											</p>
											<p class="text-xs text-gray-600 dark:text-gray-400">
												{formatTimeBlockTime(block.start_time)} - {formatTimeBlockTime(
													block.end_time
												)}
											</p>
										</div>
									</div>
								</Button>

								<!-- Tasks under this time block -->
								{#if blockTasks.length > 0}
									<div
										class="space-y-2 px-3 py-2 border-t border-blue-200/50 dark:border-blue-800/50"
									>
										{#each blockTasks as task}
											{@const displayInfo = getTaskDisplayInfo(task)}
											<Button
												onclick={() => handleTaskClickInternal(task)}
												class="w-full text-left justify-start bg-gray-50/50 dark:bg-gray-700/30 rounded-lg p-2 border-l-3 {getPriorityColor(
													task.priority
												)}
												hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:shadow-sm transition-all relative group border border-gray-200/50 dark:border-gray-700/50 text-xs"
												variant="ghost"
												size="sm"
											>
												<div
													class="flex items-start justify-between gap-2 w-full"
												>
													<div class="flex-1 min-w-0">
														<h5
															class="font-semibold text-gray-900 dark:text-white break-words"
														>
															{task.title}
														</h5>
														{#if task.description}
															<p
																class="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1"
															>
																{task.description}
															</p>
														{/if}
														<div
															class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
														>
															{#if displayInfo.timeRange}
																<span
																	class={`flex items-center gap-1 ${displayInfo.dateColor}`}
																>
																	<Clock
																		class="h-3 w-3 opacity-60"
																	/>
																	<span class="font-medium"
																		>{displayInfo.timeRange}</span
																	>
																</span>
															{/if}
															<span
																class={`flex items-center gap-1 ${displayInfo.dateColor}`}
															>
																<span class="font-medium"
																	>{displayInfo.formattedDate}</span
																>
																{#if displayInfo.isOverdue}
																	<span
																		>&middot; {getOverdueText(
																			displayInfo.daysOverdue
																		)}</span
																	>
																{/if}
															</span>
															{#if task.projects?.name}
																<span
																	class="flex items-center gap-1 text-gray-500 dark:text-gray-400"
																>
																	<span>&middot;</span>
																	<span>{task.projects.name}</span
																	>
																</span>
															{/if}
														</div>
													</div>
													<div class="flex-shrink-0">
														<RecentActivityIndicator
															createdAt={task.created_at}
															updatedAt={task.updated_at}
															size="xs"
														/>
													</div>
												</div>
											</Button>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Ungrouped Tasks Section -->
				{#if groupedContent.ungroupedTasks.length > 0}
					<div class="space-y-3">
						{#if activeTab > 0 && groupedContent.timeBlockGroups.length > 0}
							<h4
								class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 pt-2"
							>
								Unscheduled tasks
							</h4>
						{/if}
						{#each groupedContent.ungroupedTasks as task}
							{@const displayInfo = getTaskDisplayInfo(task)}
							<Button
								onclick={() => handleTaskClickInternal(task)}
								class="w-full text-left justify-start bg-gray-50/50 dark:bg-gray-700/30 rounded-xl p-3 border-l-3 {getPriorityColor(
									task.priority
								)}
								hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:shadow-sm transition-all relative group border border-gray-200/50 dark:border-gray-700/50"
								variant="ghost"
								btnType="container"
								size="sm"
							>
								<!-- New badge for recently added tasks with Apple style -->
								{#if task.created_at && new Date(task.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)}
									<span
										class="absolute -top-1.5 -right-1.5 text-[10px] px-1.5 py-0.5 bg-gradient-to-br from-green-400 to-green-500 text-white rounded-full font-bold uppercase tracking-wider shadow-sm"
									>
										New
									</span>
								{/if}

								<div class="flex items-start justify-between gap-2">
									<div class="flex-1 min-w-0">
										<h4
											class="font-semibold text-sm text-gray-900 dark:text-white break-words tracking-tight"
										>
											{task.title}
										</h4>

										{#if task.description}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed"
											>
												{task.description}
											</p>
										{/if}

										<div
											class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
										>
											{#if displayInfo.timeRange}
												<span
													class={`flex items-center gap-1 ${displayInfo.dateColor}`}
												>
													<Clock class="h-3 w-3 opacity-60" />
													<span class="font-medium"
														>{displayInfo.timeRange}</span
													>
												</span>
											{/if}
											<span
												class={`flex items-center gap-1 ${displayInfo.dateColor}`}
											>
												<span class="font-medium"
													>{displayInfo.formattedDate}</span
												>
												{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
													<span
														>&middot; {getOverdueText(
															displayInfo.daysOverdue
														)}</span
													>
												{/if}
											</span>

											{#if task.projects?.name}
												<span class="flex items-center gap-1">
													<span>&middot;</span>
													<span>{task.projects.name}</span>
												</span>
											{/if}

											<!-- Priority (text only on mobile) -->
											{#if task.priority}
												<span
													class="text-xs font-medium {task.priority ===
													'high'
														? 'text-red-600 dark:text-red-400'
														: task.priority === 'medium'
															? 'text-orange-600 dark:text-orange-400'
															: 'text-blue-600 dark:text-blue-400'}"
												>
													{task.priority}
												</span>
											{/if}
										</div>
									</div>

									<!-- Icons -->
									<div class="flex items-center gap-1 flex-shrink-0">
										<RecentActivityIndicator
											createdAt={task.created_at}
											updatedAt={task.updated_at}
											size="xs"
										/>
										{#if calendarStatus?.isConnected && task.task_calendar_events && task.task_calendar_events.length > 0}
											<CheckCircle class="h-4 w-4 text-green-500" />
										{:else if task.task_type === 'meeting'}
											<ExternalLink class="h-3 w-3 text-gray-400" />
										{/if}
									</div>
								</div>
							</Button>
						{/each}
					</div>
				{/if}

				<!-- Add Time Block Button (Today/Tomorrow only) -->
				{#if activeTab > 0 && onNewTimeBlock}
					<button
						onclick={onNewTimeBlock}
						class="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300/70 bg-blue-50/50 px-4 py-2 text-sm font-semibold text-blue-600 transition-all duration-200 hover:bg-blue-100/70 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-blue-500/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
					>
						<Plus class="h-4 w-4" />
						<span>Schedule focus session</span>
					</button>
				{/if}
			</div>
		{:else}
			<!-- Empty state -->
			<div class="text-center py-12">
				<AlertTriangle class="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
				<p class="text-sm text-gray-500">
					{activeTabConfig.label === 'Past Due'
						? 'No overdue tasks'
						: activeTabConfig.label === 'Today'
							? 'No tasks for today'
							: 'No tasks for tomorrow'}
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Custom scrollbar styles */
	.scrollbar-thin {
		scrollbar-width: thin;
	}

	.scrollbar-thin::-webkit-scrollbar {
		width: 4px;
	}

	.scrollbar-thumb-gray-300::-webkit-scrollbar-thumb {
		background-color: rgb(209 213 219);
		border-radius: 9999px;
	}

	.dark .scrollbar-thumb-gray-600::-webkit-scrollbar-thumb {
		background-color: rgb(75 85 99);
	}

	.scrollbar-track-transparent::-webkit-scrollbar-track {
		background-color: transparent;
	}

	.border-l-3 {
		border-left-width: 3px;
	}
</style>
