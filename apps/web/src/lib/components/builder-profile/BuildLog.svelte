<!-- apps/web/src/lib/components/builder-profile/BuildLog.svelte -->
<!-- A year of active days: three headline numbers, then the grid (Sunday at the top).
     The grid stretches to fill a wide card; on a narrow one it keeps a readable cell size
     and scrolls, starting at today. Numbers only: never titles or times. Two tones when
     the owner shows the agent split. -->
<script lang="ts">
	import type { BuilderProfileActivity } from '$lib/builder-profile/types';
	import { buildLogGrid, cellLabel, type BuildLogCell } from '$lib/builder-profile/format';

	let {
		activity,
		projectCount,
		ownerView = false,
		who = null,
		scopeLabel = null
	}: {
		activity: BuilderProfileActivity;
		projectCount: number;
		ownerView?: boolean;
		/** The owner's first name, for the legend ("DJ" / "DJ's agents"). */
		who?: string | null;
		/** Replaces "Counting the N projects on this page." */
		scopeLabel?: string | null;
	} = $props();

	const person = $derived(ownerView ? 'You' : who || 'Them');
	const agents = $derived(ownerView ? 'Your agents' : who ? `${who}’s agents` : 'Their agents');

	const grid = $derived(buildLogGrid(activity));
	const columns = $derived(grid.weeks.length);
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

	function legendStyle(level: number): string {
		if (level === 0) return '';
		return `background:color-mix(in oklab, hsl(var(--foreground)) ${INTENSITY[level]}%, hsl(var(--muted)))`;
	}

	const scope = $derived(
		activity.includes_private
			? `all ${ownerView ? 'your' : 'their'} work (private projects as numbers only)`
			: projectCount === 1
				? 'the project on this page'
				: `the ${projectCount} projects on this page`
	);
</script>

<div class="min-w-0 space-y-4">
	<dl class="flex flex-wrap gap-x-8 gap-y-2">
		<div>
			<dt class="sr-only">Active days</dt>
			<dd class="text-2xl font-semibold tabular-nums leading-none text-foreground">
				{grid.activeDays}
			</dd>
			<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">active days</dd>
		</div>
		<div>
			<dt class="sr-only">Changes</dt>
			<dd class="text-2xl font-semibold tabular-nums leading-none text-foreground">
				{grid.changes.toLocaleString()}
			</dd>
			<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">changes</dd>
		</div>
		{#if activity.show_agent_split && grid.changes > 0}
			<div>
				<dt class="sr-only">Share done with agents</dt>
				<dd class="text-2xl font-semibold tabular-nums leading-none text-accent">
					{grid.agentPercent}%
				</dd>
				<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">with agents</dd>
			</div>
		{/if}
	</dl>

	<div bind:this={scroller} class="min-w-0 max-w-full overflow-x-auto pb-1">
		<div class="bl-inner" style="--cols: {columns}">
			<div class="relative mb-1.5 h-3.5">
				{#each grid.months as month (month.index)}
					<span
						class="absolute top-0 font-mono text-2xs leading-none text-muted-foreground"
						style="left: {(month.index / columns) * 100}%">{month.label}</span
					>
				{/each}
			</div>
			<div
				class="bl-grid"
				role="img"
				aria-label="{grid.activeDays} active days in the last year"
			>
				{#each grid.weeks as week, w (w)}
					{#each week as cell (cell.date)}
						<span
							class="block aspect-square rounded-[2px] bg-muted"
							style={cellStyle(cell)}
							title={cell.future ? undefined : cellLabel(cell)}
						></span>
					{/each}
				{/each}
			</div>
		</div>
	</div>

	<div
		class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"
	>
		<span>{scopeLabel ?? `Counting ${scope}.`}</span>
		<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
			{#if activity.show_agent_split}
				<span class="inline-flex items-center gap-1.5"
					><span class="inline-block h-2.5 w-2.5 rounded-[2px] bg-foreground/75"
					></span>{person}</span
				>
				<span class="inline-flex items-center gap-1.5"
					><span class="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent"
					></span>{agents}</span
				>
			{:else}
				<span class="inline-flex items-center gap-1" aria-hidden="true">
					Less
					{#each [0, 1, 2, 3, 4] as level (level)}
						<span
							class="inline-block h-2.5 w-2.5 rounded-[2px] bg-muted"
							style={legendStyle(level)}
						></span>
					{/each}
					More
				</span>
			{/if}
		</span>
	</div>
</div>

<style>
	/* Fill the card's width, but never shrink a day below ~9px: then it scrolls instead. */
	.bl-inner {
		min-width: calc(var(--cols) * 11px);
	}
	.bl-grid {
		display: grid;
		grid-auto-flow: column;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		grid-template-rows: repeat(7, auto);
		gap: 2px;
	}
	@container (min-width: 36rem) {
		.bl-grid {
			gap: 3px;
		}
	}
</style>
