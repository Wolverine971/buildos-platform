<!-- apps/web/src/lib/components/consolidation/ConsolidationPicture.svelte -->
<!--
	Before → after for a consolidation run: how many tasks and docs there are
	now and after, then one row per change with the items on the left, where
	they end up on the right, and lines between them (converging when several
	become one). Previews Apply while the run is open; records it after.
-->
<script lang="ts">
	import type {
		ConsolidationPictureModel,
		PictureItem,
		PictureRow
	} from './consolidation-picture';

	let { picture, applied = false }: { picture: ConsolidationPictureModel; applied?: boolean } =
		$props();

	let showAll = $state(false);
	const shown = $derived(showAll ? picture.rows : picture.rows.slice(0, 6));

	// One item is 34px tall with 6px between items; a plan box adds a 28px header.
	const ITEM = 34;
	const PITCH = 40;
	const HEADER = 28;
	const WIDTH = 56;

	function centers(count: number, offset = 0) {
		return Array.from({ length: count }, (_, index) => offset + index * PITCH + ITEM / 2);
	}
	function height(count: number, offset = 0) {
		return offset + Math.max(count, 1) * PITCH - (PITCH - ITEM);
	}
	function curve(y1: number, y2: number) {
		return `M0 ${y1} C ${WIDTH / 2} ${y1}, ${WIDTH / 2} ${y2}, ${WIDTH} ${y2}`;
	}

	/** Lines from each item on the left to where it lands on the right. */
	function lines(row: PictureRow): { d: string; dashed: boolean }[] {
		if (row.kind === 'merge' || row.kind === 'rollup') {
			const left = row.kind === 'merge' ? row.from.length : row.items.length;
			const target = height(left) / 2;
			return centers(left).map((y) => ({
				d: curve(y, target),
				dashed: row.kind === 'rollup'
			}));
		}
		if (row.kind === 'plan')
			return centers(row.items.length).map((y, index) => ({
				d: curve(y, HEADER + index * PITCH + ITEM / 2),
				dashed: false
			}));
		return centers(row.items.length).map((y) => ({ d: curve(y, y), dashed: false }));
	}
	function rowHeight(row: PictureRow) {
		if (row.kind === 'plan') return height(row.items.length, HEADER);
		return height(row.kind === 'merge' ? row.from.length : row.items.length);
	}
	function leftItems(row: PictureRow): PictureItem[] {
		return row.kind === 'merge' ? row.from : row.items;
	}
	function label(row: PictureRow): string {
		if (row.kind === 'merge')
			return row.what === 'task'
				? `${row.from.length} tasks become one`
				: `${row.from.length} docs become one new doc`;
		if (row.kind === 'plan')
			return row.sequence ? 'Steps put in order' : 'Pieces gathered in a plan';
		if (row.kind === 'rollup') return 'Rolled up in the parent project';
		if (row.kind === 'close') return row.how === 'done' ? 'Marked done' : 'Archived';
		if (row.kind === 'move') return `Moved from ${row.from}`;
		return 'Archived';
	}
	function fmt(count: { before: number; after: number }) {
		return count.before === count.after
			? `${count.before}`
			: `${count.before} → ${count.after}`;
	}
</script>

<section class="picture grid gap-4" aria-labelledby="picture-title">
	<div class="grid gap-2">
		<h2 id="picture-title" class="section-title">
			{applied ? 'What changed' : 'What Apply will change'}
		</h2>
		<div class="totals">
			{#if picture.tasks.before || picture.tasks.after}
				<p>
					<span class="big">{fmt(picture.tasks)}</span>
					<span class="unit">open {picture.tasks.after === 1 ? 'task' : 'tasks'}</span>
				</p>
			{/if}
			<p>
				<span class="big">{fmt(picture.docs)}</span>
				<span class="unit">{picture.docs.after === 1 ? 'doc' : 'docs'}</span>
			</p>
		</div>
		{#if picture.facts.length}
			<ul class="facts">
				{#each picture.facts as fact (fact)}<li>{fact}</li>{/each}
			</ul>
		{/if}
	</div>

	{#each shown as row, index (index)}
		{@const h = rowHeight(row)}
		<div class="row">
			<p class="row-label">{label(row)}</p>
			<div class="lanes">
				<ul class="side" aria-label="Before">
					{#each leftItems(row) as item, i (i)}
						<li class="item" title={item.title}>
							<span class="t">{item.title}</span>
							<span class="p">{item.project}</span>
						</li>
					{/each}
				</ul>
				<svg
					class="wires"
					width={WIDTH}
					height={h}
					viewBox="0 0 {WIDTH} {h}"
					aria-hidden="true"
				>
					{#each lines(row) as line, i (i)}
						<path
							d={line.d}
							class:dashed={line.dashed}
							class:accent={row.kind === 'merge'}
						/>
					{/each}
				</svg>
				<p class="down" aria-hidden="true">↓</p>
				<div class="side" aria-label="After">
					{#if row.kind === 'merge'}
						<div
							class="item one"
							class:new={!row.into.id}
							style:margin-top="{(h - ITEM) / 2}px"
						>
							<span class="t">{row.into.title}</span>
							<span class="p"
								>{row.what === 'task'
									? `+ ${row.from.length - 1} as checklist lines`
									: `new doc · ${row.into.project}`}</span
							>
						</div>
					{:else if row.kind === 'rollup'}
						<div class="item one new" style:margin-top="{(h - ITEM) / 2}px">
							<span class="t">{row.into.title}</span>
							<span class="p">new task · {row.into.project}</span>
						</div>
					{:else if row.kind === 'plan'}
						<div class="plan">
							<p class="plan-name">Plan · {row.name}</p>
							<ol>
								{#each row.items as item, i (i)}
									<li class="item">
										<span class="t"
											>{row.sequence ? `${i + 1}. ` : ''}{item.title}</span
										>
										<span class="p"
											>{row.sequence && i > 0
												? 'waits on the step before'
												: row.project}</span
										>
									</li>
								{/each}
							</ol>
						</div>
					{:else}
						<ul>
							{#each row.items as item, i (i)}
								<li class="item" class:gone={row.kind !== 'move'}>
									<span class="t">{item.title}</span>
									<span class="p"
										>{row.kind === 'move'
											? row.to
											: row.kind === 'close' && row.how === 'done'
												? 'done'
												: 'archived'}</span
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
			{#if row.kind === 'close' || (row.kind === 'archive' && row.note)}
				<p class="note">{row.note}</p>
			{/if}
		</div>
	{/each}

	{#if picture.rows.length > 6}
		<button type="button" class="more" onclick={() => (showAll = !showAll)}>
			{showAll ? 'Show fewer' : `Show all ${picture.rows.length} changes`}
		</button>
	{/if}
</section>

<style>
	.section-title {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 28px;
	}
	.big {
		font-size: 26px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--foreground));
	}
	.unit {
		font-size: 14px;
		color: hsl(var(--muted-foreground));
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 13px;
	}
	.facts li {
		border: 1px solid hsl(var(--border));
		border-radius: 999px;
		padding: 2px 10px;
		color: hsl(var(--muted-foreground));
	}
	.row {
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		background: hsl(var(--card));
	}
	.row-label {
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.lanes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr);
		align-items: start;
	}
	.side {
		min-width: 0;
		display: grid;
		gap: 6px;
	}
	.side ul,
	.side ol {
		display: grid;
		gap: 6px;
	}
	.item {
		height: 34px;
		min-width: 0;
		display: grid;
		align-content: center;
		padding: 0 10px;
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		background: hsl(var(--background));
		line-height: 1.2;
	}
	.item .t {
		font-size: 13px;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item .p {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item.new {
		border-color: hsl(var(--accent));
		border-style: dashed;
	}
	.item.one {
		border-color: hsl(var(--accent));
	}
	.item.gone .t {
		text-decoration: line-through;
		color: hsl(var(--muted-foreground));
	}
	.plan {
		display: grid;
		border: 1px solid hsl(var(--accent));
		border-radius: 10px;
		padding: 0 6px 6px;
	}
	.plan-name {
		height: 28px;
		display: flex;
		align-items: center;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.wires path {
		fill: none;
		stroke: hsl(var(--border-strong));
		stroke-width: 1.5;
	}
	.wires path.accent {
		stroke: hsl(var(--accent));
	}
	.wires path.dashed {
		stroke-dasharray: 4 3;
	}
	.down {
		display: none;
		text-align: center;
		color: hsl(var(--muted-foreground));
	}
	.note {
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.more {
		width: fit-content;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
	}
	/* Narrow screens stack before over after; the wires only make sense side by side. */
	@media (max-width: 560px) {
		.lanes {
			grid-template-columns: minmax(0, 1fr);
		}
		.wires {
			display: none;
		}
		.down {
			display: block;
		}
		.item.one {
			margin-top: 0 !important;
		}
	}
</style>
