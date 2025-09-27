<!-- src/lib/components/dashboard/TaskDetailsCard.svelte -->
<script lang="ts">
	import {
		AlertTriangle,
		Calendar,
		Clock,
		ExternalLink,
		CalendarCheck,
		RefreshCw
	} from 'lucide-svelte';
	import {
		isTaskOverdue,
		getDaysOverdue,
		categorizeTaskByDate,
		formatDateShort
	} from '$lib/utils/date-utils';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';

	export let title: string;
	export let tasks: any[] = [];
	export let calendarStatus: any = { isConnected: false };
	export let onTaskClick: (task: any) => void = () => {};
	export let emptyMessage: string = 'No tasks';
	export let emptyIcon: any = Calendar;

	// Use centralized date formatting
	function formatTaskDateForDisplay(dateString: string): string {
		return formatDateShort(dateString);
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
		{#if tasks.length > 0}
			<span
				class="text-xs sm:text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium min-w-[28px] text-center"
			>
				{tasks.length}
			</span>
		{/if}
	</div>

	{#if tasks.length > 0}
		<!-- Scrollable task list with max height -->
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
						<!-- Title row with activity indicator -->
						<div class="flex items-start justify-between gap-2">
							<h4
								class="font-medium text-sm sm:text-base text-gray-900 dark:text-white break-words leading-snug flex-1"
							>
								{task.title}
							</h4>
						</div>

						<!-- Description (if exists) -->
						{#if task.description}
							<p
								class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-1 sm:line-clamp-2"
							>
								{task.description}
							</p>
						{/if}

						<!-- Metadata row - compact on mobile -->
						<div class="flex items-center justify-between flex-wrap gap-1 sm:gap-2">
							<div class="flex items-center gap-2 sm:gap-3 text-xs flex-1 w-full">
								<!-- Date with overdue indicator -->
								<span class="flex items-center gap-1 {displayInfo.dateColor}">
									<span class="font-medium">{displayInfo.formattedDate}</span>
									{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
										<span class="text-red-600 dark:text-red-400 font-semibold">
											• {getOverdueText(displayInfo.daysOverdue)}
										</span>
									{/if}
								</span>

								<!-- Project name (truncated on mobile) -->
								{#if task.projects?.name}
									<span
										class="text-gray-500 dark:text-gray-400 truncate max-w-[100px] sm:max-w-none"
									>
										{task.projects.name}
									</span>
								{/if}

								<!-- Priority badge (hidden on mobile if space is tight) -->
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
								<!-- Calendar status - simplified -->
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
