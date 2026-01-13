<!-- apps/web/src/lib/components/projects/ProjectStats.svelte -->
<!-- Inkprint Design System: Uses semantic tokens and status-specific textures -->
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

	// Using Inkprint semantic colors with appropriate textures
	const stats = [
		{
			label: 'Active',
			value: 'active',
			colorClass: 'text-accent',
			texture: 'tx tx-pulse tx-weak'
		},
		{
			label: 'Paused',
			value: 'paused',
			colorClass: 'text-muted-foreground',
			texture: 'tx tx-static tx-weak'
		},
		{
			label: 'Completed',
			value: 'completed',
			colorClass: 'text-foreground',
			texture: 'tx tx-grain tx-weak'
		},
		{ label: 'Archived', value: 'archived', colorClass: 'text-muted-foreground', texture: '' },
		{
			label: 'Total',
			value: 'total',
			colorClass: 'text-foreground',
			texture: 'tx tx-frame tx-weak'
		}
	];
</script>

<div
	class="mt-8 sm:mt-12 bg-card rounded-xl shadow-ink border border-border p-4 sm:p-6 tx tx-frame tx-weak"
>
	<p class="micro-label text-accent mb-4 sm:mb-6">PROJECT OVERVIEW</p>
	<div class="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6">
		{#each stats as stat}
			<div class="text-center p-3 rounded-lg bg-muted/30 {stat.texture}">
				<div class="text-2xl sm:text-3xl font-bold {stat.colorClass} mb-1">
					{stat.value === 'total' ? totalProjects : filterCounts[stat.value]}
				</div>
				<div class="text-xs sm:text-sm text-muted-foreground font-medium">{stat.label}</div>
			</div>
		{/each}
	</div>
</div>
