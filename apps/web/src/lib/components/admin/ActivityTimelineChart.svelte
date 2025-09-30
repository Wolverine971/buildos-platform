<!-- apps/web/src/lib/components/admin/ActivityTimelineChart.svelte -->
<script lang="ts">
	import { FileText, FolderOpen, CheckSquare, StickyNote, Brain, Calendar } from 'lucide-svelte';
	import { onMount } from 'svelte';

	export let activities: any[] = [];
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Sort activities by date (most recent first)
	$: sortedActivities = activities
		.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
		.slice(0, 20); // Show last 20 activities

	function getActivityIcon(type: string) {
		switch (type) {
			case 'brief_generated':
			case 'brief_created':
				return FileText;
			case 'project_created':
			case 'project_updated':
				return FolderOpen;
			case 'task_created':
			case 'task_completed':
			case 'task_updated':
				return CheckSquare;
			case 'note_created':
			case 'note_updated':
				return StickyNote;
			case 'brain_dump_created':
			case 'brain_dump_updated':
				return Brain;
			case 'brief_scheduled':
				return Calendar;
			default:
				return FileText;
		}
	}

	function getActivityColor(type: string) {
		switch (type) {
			case 'brief_generated':
			case 'brief_created':
				return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
			case 'project_created':
			case 'project_updated':
				return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
			case 'task_created':
			case 'task_updated':
				return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
			case 'task_completed':
				return 'text-green-600 bg-green-100 dark:bg-green-900/20';
			case 'note_created':
			case 'note_updated':
				return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20';
			case 'brain_dump_created':
			case 'brain_dump_updated':
				return 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20';
			case 'brief_scheduled':
				return 'text-teal-600 bg-teal-100 dark:bg-teal-900/20';
			default:
				return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
		}
	}

	function formatActivityText(activity: any) {
		const action = activity.activity_type.replace('_', ' ');
		const object = activity.object_name || activity.title || 'item';
		return `${action} "${object}"`;
	}

	function formatRelativeTime(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();

		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMinutes < 60) {
			return `${diffMinutes}m ago`;
		} else if (diffHours < 24) {
			return `${diffHours}h ago`;
		} else if (diffDays < 7) {
			return `${diffDays}d ago`;
		} else {
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
		}
	}

	// Group activities by day for better visualization
	$: groupedActivities = sortedActivities.reduce(
		(groups, activity) => {
			const date = new Date(activity.created_at).toDateString();
			if (!groups[date]) {
				groups[date] = [];
			}
			groups[date].push(activity);
			return groups;
		},
		{} as Record<string, any[]>
	);
</script>

{#if sortedActivities?.length}
	<div class="w-full">
		<!-- Activity Type Legend -->
		<div class="flex flex-wrap gap-2 mb-6">
			<div class="flex items-center text-xs">
				<div class="w-3 h-3 bg-blue-500 rounded mr-1"></div>
				<span class="text-gray-600 dark:text-gray-400">Briefs</span>
			</div>
			<div class="flex items-center text-xs">
				<div class="w-3 h-3 bg-purple-500 rounded mr-1"></div>
				<span class="text-gray-600 dark:text-gray-400">Projects</span>
			</div>
			<div class="flex items-center text-xs">
				<div class="w-3 h-3 bg-orange-500 rounded mr-1"></div>
				<span class="text-gray-600 dark:text-gray-400">Tasks</span>
			</div>
			<div class="flex items-center text-xs">
				<div class="w-3 h-3 bg-emerald-500 rounded mr-1"></div>
				<span class="text-gray-600 dark:text-gray-400">Notes</span>
			</div>
			<div class="flex items-center text-xs">
				<div class="w-3 h-3 bg-indigo-500 rounded mr-1"></div>
				<span class="text-gray-600 dark:text-gray-400">Brain Dumps</span>
			</div>
		</div>

		<!-- Timeline -->
		<div class="relative">
			<!-- Vertical line -->
			<div class="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600"></div>

			<div class="space-y-6">
				{#each Object.entries(groupedActivities) as [date, dayActivities]}
					<!-- Date header -->
					<div class="relative">
						<div
							class="absolute left-4 w-4 h-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-full"
						></div>
						<div class="ml-12">
							<h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
								{new Date(date).toLocaleDateString('en-US', {
									weekday: 'long',
									month: 'short',
									day: 'numeric',
									timeZone
								})}
							</h4>

							<!-- Activities for this day -->
							<div class="space-y-2">
								{#each dayActivities as activity}
									<div
										class="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
									>
										<div
											class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center {getActivityColor(
												activity.activity_type
											)}"
										>
											<svelte:component
												this={getActivityIcon(activity.activity_type)}
												class="w-4 h-4"
											/>
										</div>

										<div class="flex-1 min-w-0">
											<p class="text-sm text-gray-900 dark:text-white">
												{formatActivityText(activity)}
											</p>
											{#if activity.project_name}
												<p class="text-xs text-gray-600 dark:text-gray-400">
													in project: {activity.project_name}
												</p>
											{/if}
											{#if activity.details}
												<p
													class="text-xs text-gray-600 dark:text-gray-400 truncate"
												>
													{activity.details}
												</p>
											{/if}
										</div>

										<div class="flex-shrink-0 text-xs text-gray-500">
											{formatRelativeTime(activity.created_at)}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Activity Summary -->
		<div class="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
			<h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Activity Summary</h4>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				{#each Object.entries(sortedActivities.reduce((counts, activity) => {
						const type = activity.activity_type.split('_')[0];
						counts[type] = (counts[type] || 0) + 1;
						return counts;
					}, {})) as [type, count]}
					<div class="text-center">
						<div class="text-lg font-bold text-gray-900 dark:text-white">{count}</div>
						<div class="text-xs text-gray-600 dark:text-gray-400 capitalize">
							{type}s
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<div class="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
		<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
			></path>
		</svg>
		<p class="text-lg font-medium">No Activity Data</p>
		<p class="text-sm text-center">No recent activity found for this user</p>
	</div>
{/if}
