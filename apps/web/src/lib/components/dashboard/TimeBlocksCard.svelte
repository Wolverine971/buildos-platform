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

	// Props using Svelte 5 runes
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

	// Determine if this card should show time blocks (only Today/Tomorrow, not Past Due)
	const showTimeBlocks = $derived(title.includes('Today') || title.includes('Tomorrow'));

	// Helper: Group tasks by time block
	const groupedContent = $derived.by(() => {
		if (!showTimeBlocks || !timeBlocks.length) {
			return { timeBlockGroups: [], ungroupedTasks: tasks };
		}

		// Filter time blocks based on the card title (Today vs Tomorrow)
		let filteredBlocks = timeBlocks;
		if (title.includes('Today')) {
			filteredBlocks = timeBlocks.filter((block) => isDateToday(block.start_time));
		} else if (title.includes('Tomorrow')) {
			filteredBlocks = timeBlocks.filter((block) => isDateTomorrow(block.start_time));
		}

		// Sort time blocks chronologically
		const sortedBlocks = [...filteredBlocks].sort(
			(a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
		);

		const groups: Array<{
			block: TimeBlockWithProject;
			tasks: any[];
		}> = [];

		const taskAssignedToBlock = new Set<string>();

		// For each time block, find tasks that should be grouped under it
		sortedBlocks.forEach((block) => {
			const blockStart = new Date(block.start_time);
			const blockEnd = new Date(block.end_time);

			const matchingTasks = tasks.filter((task) => {
				if (!task.start_date) return false;
				const taskDate = new Date(task.start_date);

				// Match if task is within block time range and same project (or build block)
				const isWithinTimeRange = taskDate >= blockStart && taskDate <= blockEnd;
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

		// Ungrouped tasks are those not assigned to any block
		const ungroupedTasks = tasks.filter((task) => !taskAssignedToBlock.has(task.id));

		return { timeBlockGroups: groups, ungroupedTasks };
	});

	const totalItems = $derived(
		showTimeBlocks
			? groupedContent.timeBlockGroups.length + groupedContent.ungroupedTasks.length
			: tasks.length
	);

	// Use centralized date formatting
	function formatTaskDateForDisplay(dateString: string): string {
		return formatDateShort(dateString);
	}

	function formatTimeBlockTime(dateString: string): string {
		return format(new Date(dateString), 'h:mm a');
	}

	// Helper function to get task display info
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
				: 'text-gray-500 dark:text-gray-400'
		};
	}

	// Helper function to get priority styling - more subtle for mobile
	function getPriorityColor(priority: string) {
		switch (priority?.toLowerCase()) {
			case 'high':
				return 'border-l-4 border-l-red-500 bg-red-50/20 dark:bg-red-900/10';
			case 'medium':
				return 'border-l-4 border-l-orange-500 bg-orange-50/20 dark:bg-orange-900/10';
			case 'low':
				return 'border-l-4 border-l-blue-500 bg-blue-50/20 dark:bg-blue-900/10';
			default:
				return 'border-l-4 border-l-gray-300 dark:border-l-gray-600 bg-white dark:bg-gray-800/50';
		}
	}

	// Helper function to get time block color based on project
	function getTimeBlockColor(block: TimeBlockWithProject): string {
		if (block.block_type === 'build') {
			return 'border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-900/10';
		}

		// Map calendar color IDs to Tailwind colors
		const colorMap: Record<string, string> = {
			'1': 'border-l-blue-500',
			'2': 'border-l-green-500',
			'3': 'border-l-purple-500',
			'4': 'border-l-pink-500',
			'5': 'border-l-yellow-500',
			'6': 'border-l-orange-500',
			'7': 'border-l-cyan-500',
			'8': 'border-l-gray-500',
			'9': 'border-l-indigo-500',
			'10': 'border-l-emerald-500',
			'11': 'border-l-red-500'
		};

		const colorId = block.project?.calendar_color_id || '9';
		const borderColor = colorMap[colorId] || 'border-l-blue-500';

		return `border-l-4 ${borderColor} bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-900/20 dark:to-transparent`;
	}

	// Helper function for priority badge
	function getPriorityBadge(priority: string) {
		const colors = {
			high: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800',
			medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800',
			low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
		};
		return colors[priority?.toLowerCase()] || '';
	}

	// Helper function to get overdue text
	function getOverdueText(daysOverdue: number): string {
		if (daysOverdue === 0) return 'Today';
		if (daysOverdue === 1) return '1d late';
		return `${daysOverdue}d late`;
	}
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5 hover:shadow-md transition-all duration-200"
>
	<!-- Compact header with count badge -->
	<div class="flex items-center justify-between mb-4">
		<h3
			class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center tracking-tight"
		>
			{#if title.includes('Past Due')}
				<AlertTriangle class="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
			{:else if title.includes('Today')}
				<Clock class="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
			{:else}
				<Calendar class="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
			{/if}
			<span class="truncate">{title}</span>
		</h3>
		{#if totalItems > 0}
			<span
				class="text-xs sm:text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium min-w-[28px] text-center"
			>
				{totalItems}
			</span>
		{/if}
	</div>

	{#if showTimeBlocks && (groupedContent.timeBlockGroups.length > 0 || groupedContent.ungroupedTasks.length > 0)}
		<!-- Scrollable content with time blocks -->
		<div class="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar">
			<!-- Time blocks with nested tasks -->
			{#each groupedContent.timeBlockGroups as { block, tasks: blockTasks }}
				<div class="space-y-2">
					<!-- Time block header -->
					<button
						on:click={() => onTimeBlockClick(block)}
						class="w-full text-left p-2.5 sm:p-3 rounded-lg transition-all duration-200 cursor-pointer
							   {getTimeBlockColor(block)}
							   hover:shadow-sm sm:hover:shadow-md hover:scale-[1.01]
							   focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1
							   active:scale-[0.99] active:transition-transform"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-1">
									<Clock class="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
									<span
										class="text-xs font-medium text-gray-600 dark:text-gray-400"
									>
										{formatTimeBlockTime(block.start_time)} - {formatTimeBlockTime(
											block.end_time
										)}
									</span>
									<span
										class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
									>
										{block.duration_minutes} min
									</span>
								</div>
								<h4 class="font-semibold text-sm text-gray-900 dark:text-white">
									{block.block_type === 'build'
										? 'Build Block'
										: block.project?.name || 'Focus Session'}
								</h4>
								{#if block.suggestions_summary}
									<p
										class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1"
									>
										{block.suggestions_summary}
									</p>
								{/if}
							</div>
							<ChevronRight class="h-4 w-4 text-gray-400" />
						</div>
					</button>

					<!-- Nested tasks under this time block -->
					{#if blockTasks.length > 0}
						<div
							class="ml-4 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
						>
							{#each blockTasks as task}
								{@const displayInfo = getTaskDisplayInfo(task)}
								<button
									on:click={() => onTaskClick(task)}
									class="w-full text-left p-2 rounded-lg transition-all duration-200 cursor-pointer
										   bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700
										   hover:bg-gray-50 dark:hover:bg-gray-700/30
										   hover:shadow-sm
										   focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1
										   active:scale-[0.99] active:transition-transform"
								>
									<div class="flex flex-col space-y-1 w-full">
										<div class="flex items-start justify-between gap-2">
											<h5
												class="font-medium text-xs text-gray-900 dark:text-white break-words leading-snug flex-1"
											>
												{task.title}
											</h5>
										</div>

										{#if task.description}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 line-clamp-1"
											>
												{task.description}
											</p>
										{/if}

										<div
											class="flex items-center justify-between flex-wrap gap-1"
										>
											<div class="flex items-center gap-2 text-xs flex-1">
												<span
													class="flex items-center gap-1 {displayInfo.dateColor}"
												>
													<span class="font-medium"
														>{displayInfo.formattedDate}</span
													>
													{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
														<span
															class="text-red-600 dark:text-red-400 font-semibold"
														>
															• {getOverdueText(
																displayInfo.daysOverdue
															)}
														</span>
													{/if}
												</span>

												{#if task.priority}
													<span
														class="hidden sm:inline-flex px-1.5 py-0.5 rounded text-xs font-medium {getPriorityBadge(
															task.priority
														)}"
													>
														{task.priority}
													</span>
												{/if}
											</div>
											<div class="flex items-center gap-1.5">
												<RecentActivityIndicator
													createdAt={task.created_at}
													updatedAt={task.updated_at}
													size="xs"
												/>
												{#if task.task_type === 'meeting'}
													<ExternalLink
														class="h-3 w-3 text-gray-400 opacity-60"
													/>
												{/if}
												{#if task.isRecurringInstance || task.task_type === 'recurring'}
													<RefreshCw
														class="h-3 w-3 text-blue-500 dark:text-blue-400 flex-shrink-0"
														title={task.recurrencePattern
															? `Recurring ${task.recurrencePattern}`
															: 'Recurring task'}
													/>
												{/if}
												{#if calendarStatus?.isConnected}
													{#if task.task_calendar_events && task.task_calendar_events.length > 0}
														<CalendarCheck
															class="h-3 w-3 text-green-500 dark:text-green-400"
														/>
													{:else}
														<Calendar
															class="h-3 w-3 text-gray-400 opacity-50"
														/>
													{/if}
												{/if}
											</div>
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<!-- Ungrouped tasks -->
			{#if groupedContent.ungroupedTasks.length > 0}
				<div class="space-y-2">
					{#each groupedContent.ungroupedTasks as task}
						{@const displayInfo = getTaskDisplayInfo(task)}
						<button
							on:click={() => onTaskClick(task)}
							class="w-full text-left p-2 sm:p-2.5 md:p-3 rounded-lg transition-all duration-200 cursor-pointer
								   {getPriorityColor(task.priority)}
								   hover:bg-gray-50 dark:hover:bg-gray-700/30
								   hover:shadow-sm sm:hover:shadow-md
								   focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1
								   active:scale-[0.99] active:transition-transform"
						>
							<div class="flex flex-col space-y-1.5 sm:space-y-2 w-full">
								<div class="flex items-start justify-between gap-2">
									<h4
										class="font-medium text-sm sm:text-base text-gray-900 dark:text-white break-words leading-snug flex-1"
									>
										{task.title}
									</h4>
								</div>

								{#if task.description}
									<p
										class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-1 sm:line-clamp-2"
									>
										{task.description}
									</p>
								{/if}

								<div
									class="flex items-center justify-between flex-wrap gap-1 sm:gap-2"
								>
									<div
										class="flex items-center gap-2 sm:gap-3 text-xs flex-1 w-full"
									>
										<span
											class="flex items-center gap-1 {displayInfo.dateColor}"
										>
											<span class="font-medium"
												>{displayInfo.formattedDate}</span
											>
											{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
												<span
													class="text-red-600 dark:text-red-400 font-semibold"
												>
													• {getOverdueText(displayInfo.daysOverdue)}
												</span>
											{/if}
										</span>

										{#if task.projects?.name}
											<span
												class="text-gray-500 dark:text-gray-400 truncate max-w-[100px] sm:max-w-none"
											>
												{task.projects.name}
											</span>
										{/if}

										{#if task.priority}
											<span
												class="hidden sm:inline-flex px-2 py-0.5 rounded-md text-xs font-medium {getPriorityBadge(
													task.priority
												)}"
											>
												{task.priority}
											</span>
										{/if}
									</div>
									<div class="flex items-center gap-1.5">
										<RecentActivityIndicator
											createdAt={task.created_at}
											updatedAt={task.updated_at}
											size="xs"
										/>
										{#if task.task_type === 'meeting'}
											<ExternalLink
												class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-400 opacity-60"
											/>
										{/if}
										{#if task.isRecurringInstance || task.task_type === 'recurring'}
											<RefreshCw
												class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0"
												title={task.recurrencePattern
													? `Recurring ${task.recurrencePattern}`
													: 'Recurring task'}
											/>
										{/if}
										{#if calendarStatus?.isConnected}
											{#if task.task_calendar_events && task.task_calendar_events.length > 0}
												<CalendarCheck
													class="h-3 w-3 text-green-500 dark:text-green-400"
												/>
											{:else}
												<Calendar
													class="h-3 w-3 text-gray-400 opacity-50"
												/>
											{/if}
										{/if}
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- New Time Block button -->
		{#if showTimeBlocks}
			<button
				on:click={onNewTimeBlock}
				class="w-full mt-3 p-2.5 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600
					   bg-gray-50 dark:bg-gray-800/50
					   hover:bg-blue-50 dark:hover:bg-blue-900/10
					   hover:border-blue-400 dark:hover:border-blue-600
					   transition-all duration-200
					   focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
					   active:scale-[0.99]"
			>
				<div
					class="flex items-center justify-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
				>
					<Plus class="h-4 w-4" />
					<span>New Focus Session</span>
				</div>
			</button>
		{/if}
	{:else if !showTimeBlocks && tasks.length > 0}
		<!-- Regular task list without time blocks (for Past Due column) -->
		<div
			class="space-y-2 sm:space-y-2.5 md:space-y-3 max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar"
		>
			{#each tasks as task}
				{@const displayInfo = getTaskDisplayInfo(task)}
				<button
					on:click={() => onTaskClick(task)}
					class="w-full text-left p-2 sm:p-2.5 md:p-3 rounded-lg transition-all duration-200 cursor-pointer
						   {getPriorityColor(task.priority)}
						   hover:bg-gray-50 dark:hover:bg-gray-700/30
						   hover:shadow-sm sm:hover:shadow-md
						   focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1
						   active:scale-[0.99] active:transition-transform"
				>
					<div class="flex flex-col space-y-1.5 sm:space-y-2 w-full">
						<div class="flex items-start justify-between gap-2">
							<h4
								class="font-medium text-sm sm:text-base text-gray-900 dark:text-white break-words leading-snug flex-1"
							>
								{task.title}
							</h4>
						</div>

						{#if task.description}
							<p
								class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-1 sm:line-clamp-2"
							>
								{task.description}
							</p>
						{/if}

						<div class="flex items-center justify-between flex-wrap gap-1 sm:gap-2">
							<div class="flex items-center gap-2 sm:gap-3 text-xs flex-1 w-full">
								<span class="flex items-center gap-1 {displayInfo.dateColor}">
									<span class="font-medium">{displayInfo.formattedDate}</span>
									{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
										<span class="text-red-600 dark:text-red-400 font-semibold">
											• {getOverdueText(displayInfo.daysOverdue)}
										</span>
									{/if}
								</span>

								{#if task.projects?.name}
									<span
										class="text-gray-500 dark:text-gray-400 truncate max-w-[100px] sm:max-w-none"
									>
										{task.projects.name}
									</span>
								{/if}

								{#if task.priority}
									<span
										class="hidden sm:inline-flex px-2 py-0.5 rounded-md text-xs font-medium {getPriorityBadge(
											task.priority
										)}"
									>
										{task.priority}
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1.5">
								<RecentActivityIndicator
									createdAt={task.created_at}
									updatedAt={task.updated_at}
									size="xs"
								/>
								{#if task.task_type === 'meeting'}
									<ExternalLink
										class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-400 opacity-60"
									/>
								{/if}
								{#if task.isRecurringInstance || task.task_type === 'recurring'}
									<RefreshCw
										class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0"
										title={task.recurrencePattern
											? `Recurring ${task.recurrencePattern}`
											: 'Recurring task'}
									/>
								{/if}
								{#if calendarStatus?.isConnected}
									{#if task.task_calendar_events && task.task_calendar_events.length > 0}
										<CalendarCheck
											class="h-3 w-3 text-green-500 dark:text-green-400"
										/>
									{:else}
										<Calendar class="h-3 w-3 text-gray-400 opacity-50" />
									{/if}
								{/if}
							</div>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{:else}
		<!-- Empty State - compact on mobile -->
		<div class="text-center py-6 sm:py-8">
			<svelte:component
				this={emptyIcon}
				class="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2 sm:mb-3"
			/>
			<p class="text-xs sm:text-sm text-gray-500">{emptyMessage}</p>
			{#if showTimeBlocks}
				<button
					on:click={onNewTimeBlock}
					class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg
						   bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
						   transition-colors shadow-sm hover:shadow-md
						   focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
				>
					<Plus class="h-4 w-4" />
					<span>Schedule Focus Session</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Custom scrollbar for task list */
	.custom-scrollbar {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
	}

	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.3);
		border-radius: 3px;
		transition: background-color 0.2s;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.5);
	}

	.dark .custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.3);
	}

	.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgba(75, 85, 99, 0.5);
	}

	/* Mobile touch optimization */
	@media (max-width: 640px) {
		.custom-scrollbar {
			scrollbar-width: none;
		}

		.custom-scrollbar::-webkit-scrollbar {
			display: none;
		}
	}

	/* Remove tap highlight on mobile */
	button {
		-webkit-tap-highlight-color: transparent;
	}

	/* Focus ring offset in dark mode */
	:global(.dark) button:focus-visible {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>
