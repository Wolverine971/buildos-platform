<!-- apps/web/src/lib/components/builder-profile/BuildLog.svelte -->
<!-- A year of active days as a grid (Sunday at the top), scrolled to today. Numbers only:
     never titles or times. Two tones when the owner shows the agent split. -->
<script lang="ts">
	import type { BuilderProfileActivity } from '$lib/builder-profile/types';
	import { buildLogGrid, cellLabel, type BuildLogCell } from '$lib/builder-profile/format';

	let {
		activity,
		projectCount,
		ownerView = false
	}: { activity: BuilderProfileActivity; projectCount: number; ownerView?: boolean } = $props();

	const grid = $derived(buildLogGrid(activity));
	let scroller = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void grid;
		if (scroller) scroller.scrollLeft = scroller.scrollWidth;
	});

	const INTENSITY = [0, 32, 52, 74, 96];
	function cellStyle(cell: BuildLogCell): string {
		if (cell.future) return 'visibility:hidden';
		if (cell.level === 0) return '';
		const ink = `color-mix(in oklab, hsl(var(--accent)) ${cell.agentPercent}%, hsl(var(--foreground)))`;
		return `background:color-mix(in oklab, ${ink} ${INTENSITY[cell.level]}%, hsl(var(--muted)))`;
	}

	const scope = $derived(
		activity.includes_private
			? `all ${ownerView ? 'your' : 'their'} work; private projects count as numbers only`
			: projectCount === 1
				? 'the project on this page'
				: `the ${projectCount} projects on this page`
	);
</script>

<div class="min-w-0 space-y-3">
	<p class="text-sm text-foreground">
		<span class="font-semibold tabular-nums">{grid.activeDays}</span> active days ·
		<span class="font-semibold tabular-nums">{grid.changes.toLocaleString()}</span> changes
		{#if activity.show_agent_split && grid.changes > 0}
			· <span class="font-semibold tabular-nums">{grid.agentPercent}%</span> with agents
		{/if}
	</p>
	<div bind:this={scroller} class="min-w-0 max-w-full overflow-x-auto pb-1">
		<div class="w-max">
			<div class="relative mb-1 h-3.5" style="width: {grid.weeks.length * 13 - 2}px">
				{#each grid.months as month (month.index)}
					<span
						class="absolute top-0 font-mono text-2xs leading-none text-muted-foreground"
						style="left: {month.index * 13}px">{month.label}</span
					>
				{/each}
			</div>
			<div
				class="grid grid-flow-col gap-[2px]"
				style="grid-template-rows: repeat(7, 11px); grid-auto-columns: 11px;"
				role="img"
				aria-label="{grid.activeDays} active days in the last year"
			>
				{#each grid.weeks as week, w (w)}
					{#each week as cell (cell.date)}
						<span
							class="block rounded-[2.5px] bg-muted"
							style={cellStyle(cell)}
							title={cell.future ? undefined : cellLabel(cell)}
						></span>
					{/each}
				{/each}
			</div>
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
		<span>Counting {scope}.</span>
		{#if activity.show_agent_split}
			<span class="inline-flex items-center gap-1.5"
				><span class="inline-block h-2.5 w-2.5 rounded-[2.5px] bg-foreground/75"></span>{ownerView ? 'You' : 'Them'}</span
			>
			<span class="inline-flex items-center gap-1.5"
				><span class="inline-block h-2.5 w-2.5 rounded-[2.5px] bg-accent"></span>{ownerView ? 'Your agents' : 'Their agents'}</span
			>
		{/if}
	</div>
</div>
