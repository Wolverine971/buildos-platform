<!-- apps/web/src/lib/components/builder-profile/ActivityBars.svelte -->
<!-- Twelve weekly bars for a live project card: ink for the owner, accent for their agents. -->
<script lang="ts">
	let { weeks, agentSplit = true }: { weeks: [number, number][]; agentSplit?: boolean } = $props();

	const W = 10;
	const G = 3;
	const H = 30;
	const max = $derived(Math.max(1, ...weeks.map(([c]) => c)));
	const total = $derived(weeks.reduce((sum, [c]) => sum + c, 0));
	const bars = $derived(
		weeks.map(([changes, agents], i) => {
			const h = changes ? Math.max(2, (changes / max) * (H - 2)) : 1.5;
			const ah = agentSplit && changes ? h * (Math.min(agents, changes) / changes) : 0;
			return { x: i * (W + G), h, ah, changes };
		})
	);
</script>

<svg
	class="block h-8 w-full"
	viewBox="0 0 {weeks.length * (W + G) - G} {H}"
	preserveAspectRatio="none"
	role="img"
	aria-label="{total} changes in the last 12 weeks"
>
	{#each bars as bar (bar.x)}
		<rect
			x={bar.x}
			y={H - bar.h}
			width={W}
			height={bar.h}
			rx="1.5"
			class={bar.changes ? 'fill-foreground/70' : 'fill-border'}
		/>
		{#if bar.ah > 0.5}
			<rect x={bar.x} y={H - bar.h} width={W} height={bar.ah} rx="1.5" class="fill-accent" />
		{/if}
	{/each}
</svg>
