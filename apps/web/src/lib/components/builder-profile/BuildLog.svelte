<!-- apps/web/src/lib/components/builder-profile/BuildLog.svelte -->
<!-- A year of active days: the section heading, three headline numbers, then the grid
     (Sunday at the top). A wide card shows the whole year; a narrow one (a phone) shows the
     last 6 months with numbers for the same 6 months, so nothing scrolls sideways and no
     month label is cut off. The switch is a container query on the card, so the server
     render is already right. Tapping (or hovering) a day shows its numbers under the grid.
     Numbers only: never titles or times. Two tones when the owner shows the agent split. -->
<script lang="ts">
	import type { BuilderProfileActivity } from '$lib/builder-profile/types';
	import {
		buildLogGrid,
		buildLogTotals,
		cellLabel,
		type BuildLogCell
	} from '$lib/builder-profile/format';

	let {
		activity,
		projectCount,
		ownerView = false,
		who = null,
		scopeLabel = null,
		headingId = 'builder-log'
	}: {
		activity: BuilderProfileActivity;
		projectCount: number;
		ownerView?: boolean;
		/** The owner's first name, for the legend ("DJ" / "DJ's AI agents"). */
		who?: string | null;
		/** Replaces "Across the N projects on this page." */
		scopeLabel?: string | null;
		/** id of the section heading (the section's aria-labelledby points at it). */
		headingId?: string;
	} = $props();

	/** Weeks a narrow card shows: about 6 months. */
	const HALF = 26;

	const person = $derived(ownerView ? 'You' : who || 'Them');
	const agents = $derived(
		ownerView ? 'Your AI agents' : who ? `${who}’s AI agents` : 'Their AI agents'
	);

	const grid = $derived(buildLogGrid(activity));
	const columns = $derived(grid.weeks.length);
	const half = $derived(Math.min(HALF, columns));
	const firstHalfWeek = $derived(columns - half);
	const halfTotals = $derived(buildLogTotals(grid.weeks.slice(firstHalfWeek)));
	// A label in the last two columns would run off the card's edge.
	const months = $derived(grid.months.filter((m) => m.index <= columns - 3));

	let picked = $state<BuildLogCell | null>(null);
	const pickedLabel = $derived(picked ? cellLabel(picked) : null);

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

	function cellAt(target: EventTarget | null): BuildLogCell | null {
		const el = (target as HTMLElement | null)?.closest?.('[data-day]') as HTMLElement | null;
		if (!el) return null;
		const [w, d] = (el.dataset.day ?? '').split(':').map(Number);
		const cell = grid.weeks[w ?? -1]?.[d ?? -1];
		return cell && !cell.future ? cell : null;
	}

	function pick(event: Event) {
		const cell = cellAt(event.target);
		if (cell) picked = cell;
	}

	/**
	 * Tap (or point at, with a mouse) a day to show its numbers under the grid. A pointer
	 * extra: the grid's label already gives keyboard and screen reader users the summary,
	 * and 365 focusable days would bury the rest of the page in the tab order.
	 */
	function dayPicker(node: HTMLElement) {
		const onPointerOver = (event: PointerEvent) => {
			if (event.pointerType === 'mouse') pick(event);
		};
		node.addEventListener('click', pick);
		node.addEventListener('pointerover', onPointerOver);
		return () => {
			node.removeEventListener('click', pick);
			node.removeEventListener('pointerover', onPointerOver);
		};
	}

	const scope = $derived(
		activity.includes_private
			? `all ${ownerView ? 'your' : who ? `${who}’s` : 'their'} work (private projects as numbers only)`
			: projectCount === 1
				? 'the project on this page'
				: `the ${projectCount} projects on this page`
	);
</script>

{#snippet numbers(totals: { activeDays: number; changes: number; agentPercent: number })}
	<dl class="flex flex-wrap gap-x-8 gap-y-2">
		<div>
			<dt class="sr-only">Active days</dt>
			<dd class="text-2xl font-semibold tabular-nums leading-none text-foreground">
				{totals.activeDays}
			</dd>
			<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">active days</dd>
		</div>
		<div>
			<dt class="sr-only">Updates</dt>
			<dd class="text-2xl font-semibold tabular-nums leading-none text-foreground">
				{totals.changes.toLocaleString()}
			</dd>
			<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">updates</dd>
		</div>
		{#if activity.show_agent_split && totals.changes > 0}
			<div>
				<dt class="sr-only">Share done by AI agents</dt>
				<dd class="text-2xl font-semibold tabular-nums leading-none text-accent">
					{totals.agentPercent}%
				</dd>
				<dd class="mt-1 text-xs text-muted-foreground" aria-hidden="true">
					done by AI agents
				</dd>
			</div>
		{/if}
	</dl>
{/snippet}

<div class="min-w-0 space-y-4">
	<div class="flex items-baseline justify-between gap-3">
		<h2 id={headingId} class="micro-label text-foreground">Build log</h2>
		<span class="micro-label"
			><span class="bl-wide">last 12 months</span><span class="bl-narrow">last 6 months</span
			></span
		>
	</div>

	<div class="bl-wide">{@render numbers(grid)}</div>
	<div class="bl-narrow">{@render numbers(halfTotals)}</div>

	<div class="min-w-0" style="--cols: {columns}; --half: {half}; --first: {firstHalfWeek}">
		<div class="bl-months relative mb-1.5 h-3.5" aria-hidden="true">
			{#each months as month (month.index)}
				<span
					class="bl-month absolute top-0 font-mono text-2xs leading-none text-muted-foreground"
					data-old={month.index < firstHalfWeek ? 'true' : undefined}
					style="--i: {month.index}">{month.label}</span
				>
			{/each}
		</div>
		<div
			class="bl-grid"
			role="img"
			aria-label="{grid.activeDays} active days in the last year"
			{@attach dayPicker}
		>
			{#each grid.weeks as week, w (w)}
				<div class="bl-week" data-old={w < firstHalfWeek ? 'true' : undefined}>
					{#each week as cell, d (cell.date)}
						<span
							class="bl-cell block aspect-square rounded-[2px] bg-muted"
							data-day="{w}:{d}"
							data-picked={picked?.date === cell.date ? 'true' : undefined}
							style={cellStyle(cell)}
						></span>
					{/each}
				</div>
			{/each}
		</div>
		<p class="mt-2 min-h-4 text-xs text-muted-foreground" aria-live="polite">
			{#if pickedLabel}
				<span class="stamp text-foreground">{pickedLabel}</span>
			{:else}
				Tap a day for its numbers.
			{/if}
		</p>
	</div>

	<div
		class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"
	>
		<span>{scopeLabel ?? `Across ${scope}.`}</span>
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

	{#if activity.show_agent_split}
		<details class="bl-about text-xs text-muted-foreground">
			<summary
				class="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				What counts as an update?
			</summary>
			<p class="max-w-prose leading-relaxed">
				Each change {ownerView ? 'you' : who || 'they'} made in BuildOS on these projects: a
				task added or finished, a plan or note written, a goal moved. The orange share was done
				by AI agents working for {ownerView ? 'you' : who || 'them'}, at
				{ownerView ? 'your' : 'their'} request. Days only, never what the work was.
			</p>
		</details>
	{/if}
</div>

<style>
	/* The grid always fits the card: a year when wide, the last 6 months when narrow. */
	.bl-grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 2px;
		touch-action: manipulation;
	}
	.bl-week {
		display: grid;
		grid-template-rows: repeat(7, auto);
		gap: 2px;
	}
	.bl-cell[data-picked='true'] {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.bl-month {
		left: calc(var(--i) / var(--cols) * 100%);
	}
	.bl-narrow {
		display: none;
	}
	.bl-about summary::-webkit-details-marker {
		display: none;
	}

	@container (min-width: 36rem) {
		.bl-grid,
		.bl-week {
			gap: 3px;
		}
	}

	@container (max-width: 35.99rem) {
		.bl-wide {
			display: none;
		}
		.bl-narrow {
			display: block;
		}
		span.bl-narrow {
			display: inline;
		}
		.bl-grid {
			grid-template-columns: repeat(var(--half), minmax(0, 1fr));
		}
		.bl-week[data-old='true'],
		.bl-month[data-old='true'] {
			display: none;
		}
		.bl-month {
			left: calc((var(--i) - var(--first)) / var(--half) * 100%);
		}
	}
</style>
