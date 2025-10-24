<!-- apps/web/src/lib/components/dashboard/TimeBlocksCard.svelte -->
<script lang="ts">
	import {
		AlertTriangle,
		Calendar,
		Clock,
		ExternalLink,
		CalendarCheck,
		RefreshCw,
		Plus,
		ChevronRight
	} from 'lucide-svelte';
	import {
		isTaskOverdue,
		getDaysOverdue,
		categorizeTaskByDate,
		formatDateShort,
		isDateToday,
		isDateTomorrow
	} from '$lib/utils/date-utils';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import { format } from 'date-fns-tz';

	type Props = {
		title: string;
		tasks?: any[];
		timeBlocks?: TimeBlockWithProject[];
		calendarStatus?: any;
		onTaskClick?: (task: any) => void;
		onTimeBlockClick?: (block: TimeBlockWithProject) => void;
		onNewTimeBlock?: () => void;
		emptyMessage?: string;
		emptyIcon?: any;
	};

	let {
		title,
		tasks = [],
		timeBlocks = [],
		calendarStatus = { isConnected: false },
		onTaskClick = () => {},
		onTimeBlockClick = () => {},
		onNewTimeBlock = () => {},
		emptyMessage = 'No tasks',
		emptyIcon = Calendar
	}: Props = $props();

	const showTimeBlocks = $derived(title.includes('Today') || title.includes('Tomorrow'));

	const groupedContent = $derived.by(() => {
		if (!showTimeBlocks || !timeBlocks.length) {
			return { timeBlockGroups: [], ungroupedTasks: tasks };
		}

		let filteredBlocks = timeBlocks;
		if (title.includes('Today')) {
			filteredBlocks = timeBlocks.filter((block) => isDateToday(block.start_time));
		} else if (title.includes('Tomorrow')) {
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

			const matchingTasks = tasks.filter((task) => {
				if (!task.start_date) return false;
				const taskDate = new Date(task.start_date);

					// CRITICAL FIX: Compare dates only, not times!
				// task.start_date is just a date (e.g., "2025-10-25"), becomes midnight UTC
				// Comparing with time block (e.g., "09:00") fails because midnight < 09:00
				const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
				const blockStartDate = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate());
				const blockEndDate = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate());
				const isWithinDateRange = taskDateOnly >= blockStartDate && taskDateOnly <= blockEndDate;
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

		const ungroupedTasks = tasks.filter((task) => !taskAssignedToBlock.has(task.id));

		return { timeBlockGroups: groups, ungroupedTasks };
	});

	const totalItems = $derived(
		showTimeBlocks
			? groupedContent.timeBlockGroups.length + groupedContent.ungroupedTasks.length
			: tasks.length
	);

	const focusSessionCount = $derived(showTimeBlocks ? groupedContent.timeBlockGroups.length : 0);

	const scheduledTaskCount = $derived(
		showTimeBlocks
			? groupedContent.timeBlockGroups.reduce((total, group) => total + group.tasks.length, 0)
			: 0
	);

	const ungroupedTaskCount = $derived(
		showTimeBlocks ? groupedContent.ungroupedTasks.length : tasks.length
	);

	const hasTimeBlockContent = $derived(
		showTimeBlocks &&
			(focusSessionCount > 0 || scheduledTaskCount > 0 || ungroupedTaskCount > 0)
	);

	const headerSubtitle = $derived(
		title.includes('Past Due')
			? 'Requires attention'
			: title.includes('Tomorrow')
				? 'Preview & prepare'
				: "Today's focus"
	);

	const metricChipClass =
		'inline-flex items-center gap-1 rounded-lg border border-gray-200/60 bg-gray-50/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-gray-300';

	const taskCardBaseClass =
		'group relative flex w-full flex-col gap-2 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-shadow duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500/40 bg-transparent appearance-none';

	type TimeBlockStyle = {
		surface: string;
		bullet: string;
		accentText: string;
		badge: string;
		ring: string;
	};

	const DEFAULT_BLOCK_STYLE: TimeBlockStyle = {
		surface:
			'bg-gradient-to-br from-blue-50/70 via-white to-white dark:from-blue-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
		bullet: 'bg-blue-500',
		accentText: 'text-blue-600 dark:text-blue-300',
		badge: 'bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
		ring: 'ring-blue-500/10 dark:ring-blue-500/20'
	};

	const BUILD_BLOCK_STYLE: TimeBlockStyle = {
		surface:
			'bg-gradient-to-br from-purple-50/70 via-white to-white dark:from-purple-900/20 dark:via-gray-900/60 dark:to-gray-900/70',
		bullet: 'bg-purple-500',
		accentText: 'text-purple-600 dark:text-purple-300',
		badge: 'bg-purple-100/70 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
		ring: 'ring-purple-500/15 dark:ring-purple-500/25'
	};

	const TIME_BLOCK_STYLE_MAP: Record<string, TimeBlockStyle> = {
		'1': {
			surface:
				'bg-gradient-to-br from-sky-50/80 via-white to-white dark:from-sky-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-sky-500',
			accentText: 'text-sky-600 dark:text-sky-300',
			badge: 'bg-sky-100/80 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
			ring: 'ring-sky-500/15 dark:ring-sky-500/25'
		},
		'2': {
			surface:
				'bg-gradient-to-br from-emerald-50/75 via-white to-white dark:from-emerald-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-emerald-500',
			accentText: 'text-emerald-600 dark:text-emerald-300',
			badge: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
			ring: 'ring-emerald-500/15 dark:ring-emerald-500/25'
		},
		'3': {
			surface:
				'bg-gradient-to-br from-violet-50/80 via-white to-white dark:from-violet-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-violet-500',
			accentText: 'text-violet-600 dark:text-violet-300',
			badge: 'bg-violet-100/80 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
			ring: 'ring-violet-500/15 dark:ring-violet-500/25'
		},
		'4': {
			surface:
				'bg-gradient-to-br from-pink-50/80 via-white to-white dark:from-pink-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-pink-500',
			accentText: 'text-pink-600 dark:text-pink-300',
			badge: 'bg-pink-100/80 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
			ring: 'ring-pink-500/15 dark:ring-pink-500/25'
		},
		'5': {
			surface:
				'bg-gradient-to-br from-amber-50/80 via-white to-white dark:from-amber-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-amber-500',
			accentText: 'text-amber-600 dark:text-amber-300',
			badge: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
			ring: 'ring-amber-500/15 dark:ring-amber-500/25'
		},
		'6': {
			surface:
				'bg-gradient-to-br from-orange-50/80 via-white to-white dark:from-orange-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-orange-500',
			accentText: 'text-orange-600 dark:text-orange-300',
			badge: 'bg-orange-100/80 text-orange-700 dark:bg-orange-900/25 dark:text-orange-300',
			ring: 'ring-orange-500/15 dark:ring-orange-500/25'
		},
		'7': {
			surface:
				'bg-gradient-to-br from-cyan-50/80 via-white to-white dark:from-cyan-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-cyan-500',
			accentText: 'text-cyan-600 dark:text-cyan-300',
			badge: 'bg-cyan-100/80 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
			ring: 'ring-cyan-500/15 dark:ring-cyan-500/25'
		},
		'8': {
			surface:
				'bg-gradient-to-br from-slate-50/80 via-white to-white dark:from-slate-900/20 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-slate-500',
			accentText: 'text-slate-600 dark:text-slate-300',
			badge: 'bg-slate-100/80 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
			ring: 'ring-slate-500/15 dark:ring-slate-500/25'
		},
		'9': {
			surface:
				'bg-gradient-to-br from-indigo-50/80 via-white to-white dark:from-indigo-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-indigo-500',
			accentText: 'text-indigo-600 dark:text-indigo-300',
			badge: 'bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
			ring: 'ring-indigo-500/15 dark:ring-indigo-500/25'
		},
		'10': {
			surface:
				'bg-gradient-to-br from-emerald-50/75 via-white to-white dark:from-emerald-900/15 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-emerald-500',
			accentText: 'text-emerald-600 dark:text-emerald-300',
			badge: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
			ring: 'ring-emerald-500/15 dark:ring-emerald-500/25'
		},
		'11': {
			surface:
				'bg-gradient-to-br from-rose-50/80 via-white to-white dark:from-rose-900/20 dark:via-gray-900/60 dark:to-gray-900/70',
			bullet: 'bg-rose-500',
			accentText: 'text-rose-600 dark:text-rose-300',
			badge: 'bg-rose-100/80 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
			ring: 'ring-rose-500/15 dark:ring-rose-500/25'
		}
	};

	function getTimeBlockStyle(block: TimeBlockWithProject): TimeBlockStyle {
		if (block.block_type === 'build') {
			return BUILD_BLOCK_STYLE;
		}

		const colorId = String(block.project?.calendar_color_id || '');
		return TIME_BLOCK_STYLE_MAP[colorId] || DEFAULT_BLOCK_STYLE;
	}

	const calendarIsConnected = $derived(!!calendarStatus?.isConnected);

	// Capitalize emptyIcon for Svelte 5 component rendering
	const EmptyIcon = $derived(emptyIcon);

	function formatTaskDateForDisplay(dateString: string): string {
		return formatDateShort(dateString);
	}

	function formatTimeBlockTime(dateString: string): string {
		return format(new Date(dateString), 'h:mm a');
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
			dateColor: isOverdue
				? 'text-red-600 dark:text-red-400'
				: 'text-gray-600 dark:text-gray-400'
		};
	}

	function getPriorityClasses(priority: string) {
		switch (priority?.toLowerCase()) {
			case 'high':
				return 'border-red-200/60 bg-red-50/70 dark:border-red-900/60 dark:bg-red-900/20';
			case 'medium':
				return 'border-amber-200/60 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-900/20';
			case 'low':
				return 'border-blue-200/60 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-900/20';
			default:
				return 'border-gray-200/60 bg-white/95 dark:border-gray-800/60 dark:bg-gray-900/60';
		}
	}

	function getPriorityBadge(priority: string) {
		const colors = {
			high: 'bg-red-100/80 text-red-700 border border-red-200/60 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/60',
			medium: 'bg-amber-100/80 text-amber-700 border border-amber-200/60 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800/60',
			low: 'bg-blue-100/80 text-blue-700 border border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/60'
		};
		return (
			colors[priority?.toLowerCase() as keyof typeof colors] ||
			'border border-gray-200/60 bg-gray-100/70 text-gray-600 dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-gray-300'
		);
	}

	function getOverdueText(daysOverdue: number): string {
		if (daysOverdue === 0) return 'Today';
		if (daysOverdue === 1) return '1d late';
		return `${daysOverdue}d late`;
	}
</script>

<div
	class="flex h-full min-h-[21rem] flex-col rounded-2xl border border-gray-200/60 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:shadow-md dark:border-gray-800/60 dark:bg-gray-900/70 sm:p-5"
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 via-white to-white text-gray-600 shadow-inner dark:from-gray-800/70 dark:via-gray-900 dark:to-gray-900"
			>
				{#if title.includes('Past Due')}
					<AlertTriangle class="h-4 w-4 text-red-600" />
				{:else if title.includes('Today')}
					<Clock class="h-4 w-4 text-blue-600" />
				{:else}
					<Calendar class="h-4 w-4 text-green-600" />
				{/if}
			</div>
			<div class="min-w-0">
				<h3
					class="truncate text-base font-semibold text-gray-900 tracking-tight dark:text-white sm:text-lg"
				>
					{title}
				</h3>
				<p class="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
					{headerSubtitle}
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center justify-end gap-2">
			<span
				class="inline-flex items-center gap-1 rounded-full border border-gray-200/70 bg-gray-50/90 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-gray-300"
			>
				<span class="text-sm font-semibold text-gray-900 dark:text-white">
					{totalItems}
				</span>
				<span class="uppercase tracking-wide text-[10px] text-gray-500 dark:text-gray-400">
					items
				</span>
			</span>

			{#if calendarStatus !== undefined && calendarStatus !== null}
				<span
					class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
						calendarIsConnected
							? 'border border-emerald-200/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/25 dark:text-emerald-300'
							: 'border border-amber-200/60 bg-amber-50/80 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/25 dark:text-amber-300'
					}`}
				>
					{#if calendarIsConnected}
						<CalendarCheck class="h-3.5 w-3.5" />
						<span>Calendar linked</span>
					{:else}
						<AlertTriangle class="h-3.5 w-3.5" />
						<span>Calendar offline</span>
					{/if}
				</span>
			{/if}
		</div>
	</div>

	{#if showTimeBlocks}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<span
				class={`${metricChipClass} border-purple-200/60 bg-purple-50/70 text-purple-700 dark:border-purple-800/50 dark:bg-purple-900/25 dark:text-purple-300`}
			>
				<span class="font-semibold">{focusSessionCount}</span>
				<span>sessions</span>
			</span>
			<span
				class={`${metricChipClass} border-emerald-200/60 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/25 dark:text-emerald-300`}
			>
				<span class="font-semibold">{scheduledTaskCount}</span>
				<span>planned</span>
			</span>
			<span
				class={`${metricChipClass} border-slate-200/60 bg-slate-50/80 text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/30 dark:text-slate-300`}
			>
				<span class="font-semibold">{ungroupedTaskCount}</span>
				<span>{title.includes('Past Due') ? 'overdue' : 'loose'}</span>
			</span>
		</div>
	{:else}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<span
				class={`${metricChipClass} border-red-200/60 bg-red-50/70 text-red-700 dark:border-red-800/50 dark:bg-red-900/25 dark:text-red-300`}
			>
				<span class="font-semibold">{totalItems}</span>
				<span>overdue</span>
			</span>
		</div>
	{/if}

	<div class="mt-4 flex-1 overflow-hidden">
		{#if showTimeBlocks}
			{#if hasTimeBlockContent}
				<div class="flex h-full flex-col gap-4">
					<div class="flex-1 overflow-y-auto pr-1 custom-scrollbar max-h-80 sm:max-h-96">
						<div class="space-y-4">
							{#each groupedContent.timeBlockGroups as { block, tasks: blockTasks }}
								{@const blockStyle = getTimeBlockStyle(block)}
								<section class="space-y-2">
									<button
										on:click={() => onTimeBlockClick(block)}
										class="timeblock-card group relative w-full overflow-hidden rounded-2xl border border-gray-200/60 bg-transparent px-4 py-3 text-left shadow-sm transition-shadow duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500/40 appearance-none dark:border-gray-700/60"
									>
										<span
											class={`absolute inset-0 rounded-2xl opacity-95 ${blockStyle.surface}`}
											aria-hidden="true"
										/>
										<span
											class={`absolute inset-0 rounded-2xl ring-1 ring-inset ${blockStyle.ring}`}
											aria-hidden="true"
										/>
										<div class="relative flex flex-col gap-2">
											<div class="flex items-center justify-between gap-3">
												<div
													class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
												>
													<span
														class={`flex h-2.5 w-2.5 rounded-full ${blockStyle.bullet}`}
													/>
													<span
														class={`font-semibold ${blockStyle.accentText}`}
													>
														{formatTimeBlockTime(block.start_time)} - {formatTimeBlockTime(
															block.end_time
														)}
													</span>
													<span
														class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${blockStyle.badge}`}
													>
														{block.duration_minutes} min
													</span>
												</div>
												<ChevronRight
													class="h-4 w-4 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5"
												/>
											</div>
											<div class="flex flex-wrap items-center gap-2">
												<h4
													class="text-sm font-semibold text-gray-900 dark:text-white"
												>
													{block.block_type === 'build'
														? 'Build session'
														: block.project?.name || 'Focus session'}
												</h4>
												{#if block.project?.name && block.block_type !== 'build'}
													<span
														class="rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium text-gray-500 shadow-sm backdrop-blur-sm dark:bg-gray-900/60 dark:text-gray-300"
													>
														{block.project.name}
													</span>
												{/if}
											</div>
											{#if block.suggestions_summary}
												<p
													class="text-xs text-gray-600 line-clamp-1 dark:text-gray-400"
												>
													{block.suggestions_summary}
												</p>
											{/if}
										</div>
									</button>

									{#if blockTasks.length > 0}
										<div class="timeline-connector ml-6 space-y-2 pl-2">
											{#each blockTasks as task}
												{@const displayInfo = getTaskDisplayInfo(task)}
												<button
													on:click={() => onTaskClick(task)}
													class={`${taskCardBaseClass} ${getPriorityClasses(task.priority)}`}
												>
													<div
														class="flex items-start justify-between gap-3"
													>
														<div class="min-w-0 space-y-1">
															<h5
																class="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-white"
															>
																{task.title}
															</h5>
															{#if task.description}
																<p
																	class="line-clamp-2 text-xs text-gray-600 dark:text-gray-400"
																>
																	{task.description}
																</p>
															{/if}
														</div>
														<div class="flex flex-col items-end gap-1">
															{#if task.priority}
																<span
																	class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${getPriorityBadge(
																		task.priority
																	)}`}
																>
																	{task.priority}
																</span>
															{/if}
															<RecentActivityIndicator
																createdAt={task.created_at}
																updatedAt={task.updated_at}
																size="xs"
															/>
														</div>
													</div>
													<div
														class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
													>
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
															<span class="truncate">
																{task.projects.name}
															</span>
														{/if}
														{#if task.task_type === 'meeting'}
															<span class="flex items-center gap-1">
																<ExternalLink
																	class="h-3 w-3 opacity-60"
																/>
																<span>Meeting</span>
															</span>
														{/if}
														{#if task.isRecurringInstance || task.task_type === 'recurring'}
															<span
																class="flex items-center gap-1 text-blue-500 dark:text-blue-300"
															>
																<RefreshCw class="h-3 w-3" />
																<span>Recurring</span>
															</span>
														{/if}
														{#if calendarIsConnected}
															{#if task.task_calendar_events && task.task_calendar_events.length > 0}
																<span
																	class="flex items-center gap-1 text-emerald-600 dark:text-emerald-300"
																>
																	<CalendarCheck
																		class="h-3 w-3"
																	/>
																	<span>Synced</span>
																</span>
															{:else}
																<span
																	class="flex items-center gap-1 opacity-70"
																>
																	<Calendar class="h-3 w-3" />
																	<span>Unsynced</span>
																</span>
															{/if}
														{/if}
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</section>
							{/each}

							{#if groupedContent.ungroupedTasks.length > 0}
								<section class="space-y-3">
									<div class="flex items-center justify-between">
										<h4
											class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
										>
											Loose tasks
										</h4>
										<span
											class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
										>
											{groupedContent.ungroupedTasks.length}
										</span>
									</div>
									<div class="space-y-2">
										{#each groupedContent.ungroupedTasks as task}
											{@const displayInfo = getTaskDisplayInfo(task)}
											<button
												on:click={() => onTaskClick(task)}
												class={`${taskCardBaseClass} ${getPriorityClasses(task.priority)}`}
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0 space-y-1">
														<h5
															class="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-white"
														>
															{task.title}
														</h5>
														{#if task.description}
															<p
																class="line-clamp-2 text-xs text-gray-600 dark:text-gray-400"
															>
																{task.description}
															</p>
														{/if}
													</div>
													<div class="flex flex-col items-end gap-1">
														{#if task.priority}
															<span
																class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${getPriorityBadge(
																	task.priority
																)}`}
															>
																{task.priority}
															</span>
														{/if}
														<RecentActivityIndicator
															createdAt={task.created_at}
															updatedAt={task.updated_at}
															size="xs"
														/>
													</div>
												</div>
												<div
													class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
												>
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
														<span class="truncate">
															{task.projects.name}
														</span>
													{/if}
													{#if task.task_type === 'meeting'}
														<span class="flex items-center gap-1">
															<ExternalLink
																class="h-3 w-3 opacity-60"
															/>
															<span>Meeting</span>
														</span>
													{/if}
													{#if task.isRecurringInstance || task.task_type === 'recurring'}
														<span
															class="flex items-center gap-1 text-blue-500 dark:text-blue-300"
														>
															<RefreshCw class="h-3 w-3" />
															<span>Recurring</span>
														</span>
													{/if}
													{#if calendarIsConnected}
														{#if task.task_calendar_events && task.task_calendar_events.length > 0}
															<span
																class="flex items-center gap-1 text-emerald-600 dark:text-emerald-300"
															>
																<CalendarCheck class="h-3 w-3" />
																<span>Synced</span>
															</span>
														{:else}
															<span
																class="flex items-center gap-1 opacity-70"
															>
																<Calendar class="h-3 w-3" />
																<span>Unsynced</span>
															</span>
														{/if}
													{/if}
												</div>
											</button>
										{/each}
									</div>
								</section>
							{/if}
						</div>
					</div>

					<button
						on:click={onNewTimeBlock}
						class="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300/70 bg-blue-50/50 px-4 py-2 text-sm font-semibold text-blue-600 transition-all duration-200 hover:bg-blue-100/70 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-blue-500/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
					>
						<Plus class="h-4 w-4" />
						<span>Schedule focus session</span>
					</button>
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
					<EmptyIcon class="h-12 w-12 text-gray-300 dark:text-gray-600" />
					<div class="space-y-1">
						<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
							{emptyMessage}
						</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Start your day with a focused session.
						</p>
					</div>
					<button
						on:click={onNewTimeBlock}
						class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						<Plus class="h-4 w-4" />
						<span>Schedule focus session</span>
					</button>
				</div>
			{/if}
		{:else if tasks.length > 0}
			<div class="flex-1 overflow-y-auto pr-1 custom-scrollbar max-h-80 sm:max-h-96">
				<div class="space-y-3">
					{#each tasks as task}
						{@const displayInfo = getTaskDisplayInfo(task)}
						<button
							on:click={() => onTaskClick(task)}
							class={`${taskCardBaseClass} ${getPriorityClasses(task.priority)}`}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 space-y-1">
									<h4
										class="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-white"
									>
										{task.title}
									</h4>
									{#if task.description}
										<p
											class="line-clamp-2 text-xs text-gray-600 dark:text-gray-400"
										>
											{task.description}
										</p>
									{/if}
								</div>
								<div class="flex flex-col items-end gap-1">
									{#if task.priority}
										<span
											class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${getPriorityBadge(
												task.priority
											)}`}
										>
											{task.priority}
										</span>
									{/if}
									<RecentActivityIndicator
										createdAt={task.created_at}
										updatedAt={task.updated_at}
										size="xs"
									/>
								</div>
							</div>
							<div
								class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
							>
								<span class={`flex items-center gap-1 ${displayInfo.dateColor}`}>
									<span class="font-medium">{displayInfo.formattedDate}</span>
									{#if displayInfo.isOverdue}
										<span
											>&middot; {getOverdueText(
												displayInfo.daysOverdue
											)}</span
										>
									{/if}
								</span>
								{#if task.projects?.name}
									<span class="truncate">
										{task.projects.name}
									</span>
								{/if}
								{#if task.task_type === 'meeting'}
									<span class="flex items-center gap-1">
										<ExternalLink class="h-3 w-3 opacity-60" />
										<span>Meeting</span>
									</span>
								{/if}
								{#if task.isRecurringInstance || task.task_type === 'recurring'}
									<span
										class="flex items-center gap-1 text-blue-500 dark:text-blue-300"
									>
										<RefreshCw class="h-3 w-3" />
										<span>Recurring</span>
									</span>
								{/if}
								{#if calendarIsConnected}
									{#if task.task_calendar_events && task.task_calendar_events.length > 0}
										<span
											class="flex items-center gap-1 text-emerald-600 dark:text-emerald-300"
										>
											<CalendarCheck class="h-3 w-3" />
											<span>Synced</span>
										</span>
									{:else}
										<span class="flex items-center gap-1 opacity-70">
											<Calendar class="h-3 w-3" />
											<span>Unsynced</span>
										</span>
									{/if}
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
				<EmptyIcon class="h-12 w-12 text-gray-300 dark:text-gray-600" />
				<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
					{emptyMessage}
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.custom-scrollbar {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.35) transparent;
	}

	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.35);
		border-radius: 9999px;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.55);
	}

	.dark .custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.35);
	}

	.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgba(75, 85, 99, 0.55);
	}

	.timeline-connector {
		position: relative;
	}

	.timeline-connector::before {
		content: '';
		position: absolute;
		top: 0.5rem;
		left: -1.2rem;
		bottom: 0.5rem;
		width: 2px;
		background-image: linear-gradient(
			to bottom,
			rgba(99, 102, 241, 0.1),
			rgba(99, 102, 241, 0.35)
		);
		border-radius: 9999px;
	}

	@media (max-width: 640px) {
		.custom-scrollbar {
			scrollbar-width: none;
		}

		.custom-scrollbar::-webkit-scrollbar {
			display: none;
		}
	}

	button {
		-webkit-tap-highlight-color: transparent;
	}

	:global(.dark) button:focus-visible {
		--tw-ring-offset-color: rgb(17 24 39);
	}
</style>
