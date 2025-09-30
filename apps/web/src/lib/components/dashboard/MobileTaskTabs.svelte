<!-- apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte -->
<script lang="ts">
	import { AlertTriangle, Calendar, Clock, CheckCircle, ExternalLink } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		isTaskOverdue,
		getDaysOverdue,
		categorizeTaskByDate,
		formatDateShort
	} from '$lib/utils/date-utils';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';

	export let pastDueTasks: any[] = [];
	export let todaysTasks: any[] = [];
	export let tomorrowsTasks: any[] = [];
	export let calendarStatus: any = { isConnected: false };
	export let onTaskClick: (task: any) => void = () => {};

	const dispatch = createEventDispatcher();

	// State for active tab - preserve on data updates
	let activeTab = localStorage.getItem('dashboard-tab-position')
		? parseInt(localStorage.getItem('dashboard-tab-position') || '1')
		: 1;

	// Save tab position when changed
	$: if (typeof window !== 'undefined' && activeTab !== undefined) {
		localStorage.setItem('dashboard-tab-position', activeTab.toString());
	}

	// Tab configuration
	const tabs = [
		{ id: 0, label: 'Past Due', count: pastDueTasks.length, icon: AlertTriangle, color: 'red' },
		{ id: 1, label: 'Today', count: todaysTasks.length, icon: Clock, color: 'blue' },
		{ id: 2, label: 'Tomorrow', count: tomorrowsTasks.length, icon: Calendar, color: 'green' }
	];

	// Get tasks for active tab
	$: activeTasks =
		activeTab === 0 ? pastDueTasks : activeTab === 1 ? todaysTasks : tomorrowsTasks;
	$: activeTabConfig = tabs[activeTab];

	// Helper functions
	function formatTaskDateForDisplay(dateString: string): string {
		return formatDateShort(dateString);
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
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm"
>
	<!-- Tab buttons with Apple-style design -->
	<div class="flex gap-1 mb-5 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
		{#each tabs as tab}
			<Button
				on:click={() => (activeTab = tab.id)}
				class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all
				{activeTab === tab.id
					? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
					: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
				variant="ghost"
				btnType="container"
				size="sm"
			>
				<span>{tab.label}</span>
			</Button>
		{/each}
	</div>

	<!-- Active tab content -->
	<div class="">
		<div class="flex items-center gap-2 mb-4">
			<svelte:component
				this={activeTabConfig.icon}
				class="h-4 w-4 {activeTabConfig.color === 'red'
					? 'text-red-600'
					: activeTabConfig.color === 'blue'
						? 'text-blue-600'
						: 'text-green-600'}"
			/>
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
				class="space-y-3 max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent pr-1"
			>
				{#each activeTasks as task}
					{@const displayInfo = getTaskDisplayInfo(task)}
					<Button
						on:click={() => handleTaskClickInternal(task)}
						class="w-full text-left bg-gray-50/50 dark:bg-gray-700/30 rounded-xl p-4 border-l-3 {getPriorityColor(
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

								<div class="flex flex-wrap items-center gap-2 mt-2">
									<!-- Time/Date -->
									<span class="text-xs {displayInfo.dateColor}">
										{displayInfo.formattedDate}
										{#if displayInfo.isOverdue && displayInfo.daysOverdue > 0}
											<span
												class="text-red-600 dark:text-red-400 font-medium"
											>
												• {getOverdueText(displayInfo.daysOverdue)}
											</span>
										{/if}
									</span>

									<!-- Project -->
									{#if task.projects?.name}
										<span class="text-xs text-gray-500 dark:text-gray-400">
											• {task.projects.name}
										</span>
									{/if}

									<!-- Priority (text only on mobile) -->
									{#if task.priority}
										<span
											class="text-xs font-medium {task.priority === 'high'
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
		{:else}
			<!-- Empty state -->
			<div class="text-center py-12">
				<svelte:component
					this={activeTabConfig.icon}
					class="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3"
				/>
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
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
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
