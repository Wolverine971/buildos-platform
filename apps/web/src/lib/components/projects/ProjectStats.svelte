<!-- apps/web/src/lib/components/projects/ProjectStats.svelte -->
<script lang="ts">
	import type { FilterCounts } from '$lib/types/projects-page';

	export let filterCounts: FilterCounts = {
		all: 0,
		active: 0,
		paused: 0,
		completed: 0,
		archived: 0
	};
	export let totalProjects: number = 0;

	const stats = [
		{ label: 'Active', value: 'active', colorClass: 'text-blue-600 dark:text-blue-400' },
		{ label: 'Paused', value: 'paused', colorClass: 'text-orange-600 dark:text-orange-400' },
		{
			label: 'Completed',
			value: 'completed',
			colorClass: 'text-green-600 dark:text-green-400'
		},
		{ label: 'Archived', value: 'archived', colorClass: 'text-gray-500 dark:text-gray-400' },
		{ label: 'Total', value: 'total', colorClass: 'text-gray-900 dark:text-white' }
	];
</script>

<div
	class="mt-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border
		border-gray-200 dark:border-gray-700 p-6"
>
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">Project Overview</h3>
	<div class="grid grid-cols-2 md:grid-cols-4 gap-6">
		{#each stats as stat}
			<div class="text-center">
				<div class="text-3xl font-bold {stat.colorClass} mb-1">
					{stat.value === 'total' ? totalProjects : filterCounts[stat.value]}
				</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
			</div>
		{/each}
	</div>
</div>
