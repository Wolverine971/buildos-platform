<!-- apps/web/src/lib/components/agent/RecordList.svelte -->
<!--
	Records the assistant looked at or changed, one per row: kind in small caps, then the title,
	which opens the record in a new tab. A long list shows its first rows and a "Show 7 more
	tasks" toggle that opens the rest in place and closes it again. Used by the chat work log
	for both the context ledger and each step's results, so they read as one kind of list.
-->
<script lang="ts" module>
	export type RecordListRow = {
		/** Unique in the list. */
		key: string;
		/** Short kind word: "task", "document". */
		kind: string;
		title: string;
		/** The record's page; a plain row when it has none. */
		href: string | null;
		/** What the model had of it: hover text, and read out by screen readers. */
		note?: string | null;
		/** Quiet text after the title (sections read, a carried mark). */
		aside?: string | null;
	};

	const PLURALS: Record<string, string> = {
		task: 'tasks',
		document: 'documents',
		goal: 'goals',
		milestone: 'milestones',
		plan: 'plans',
		risk: 'risks',
		project: 'projects'
	};
</script>

<script lang="ts">
	import { slide } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { ArrowUpRight, ChevronDown } from '$lib/icons/lucide';

	let {
		rows,
		preview = 2,
		uncounted = 0,
		tone = null
	}: {
		rows: readonly RecordListRow[];
		/** Rows shown before the toggle. One hidden row is never worth a toggle, so it shows. */
		preview?: number;
		/** Records the step touched beyond `rows` (a very long result is cut). */
		uncounted?: number;
		/** `handed` rows are muted: the model only had a summary of them. */
		tone?: 'handed' | 'opened' | 'changed' | null;
	} = $props();

	let open = $state(false);

	const folds = $derived(rows.length > preview + 1);
	const head = $derived(folds ? rows.slice(0, preview) : rows);
	const rest = $derived(folds ? rows.slice(preview) : []);
	// "tasks" when every hidden row is one kind; otherwise just the number.
	const noun = $derived.by(() => {
		const kind = rest[0]?.kind;
		if (!kind || rest.some((row) => row.kind !== kind)) return '';
		const plural = PLURALS[kind];
		if (!plural) return '';
		return rest.length + uncounted === 1 ? kind : plural;
	});
	const hiddenCount = $derived(rest.length + uncounted);
</script>

{#snippet rowBody(row: RecordListRow)}
	<span class="record-row-kind">{row.kind}</span>
	<span class="record-row-title">{row.title}</span>
	{#if row.aside}<span class="record-row-aside">{row.aside}</span>{/if}
{/snippet}

{#snippet rowItem(row: RecordListRow)}
	<li>
		{#if row.href}
			<a
				class="record-row"
				href={row.href}
				target="_blank"
				rel="noopener"
				title={row.note ?? `Open ${row.title} in a new tab`}
			>
				{@render rowBody(row)}
				<ArrowUpRight class="record-row-icon" aria-hidden="true" />
				<span class="sr-only">{row.note ? `${row.note} ` : ''}(opens in a new tab)</span>
			</a>
		{:else}
			<span class="record-row" title={row.note ?? undefined}>
				{@render rowBody(row)}
				{#if row.note}<span class="sr-only">{row.note}</span>{/if}
			</span>
		{/if}
	</li>
{/snippet}

<div class="record-list" data-tone={tone ?? undefined} data-testid="record-list">
	<ul class="record-rows">
		{#each head as row (row.key)}
			{@render rowItem(row)}
		{/each}
	</ul>
	{#if folds}
		{#if open}
			<div transition:slide={{ duration: prefersReducedMotion.current ? 0 : 220 }}>
				<ul class="record-rows">
					{#each rest as row (row.key)}
						{@render rowItem(row)}
					{/each}
				</ul>
				{#if uncounted > 0}
					<p class="record-list-uncounted">and {uncounted} more not listed here</p>
				{/if}
			</div>
		{/if}
		<button
			type="button"
			class="record-list-toggle"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<span class="record-list-chevron" class:record-list-chevron-open={open}>
				<ChevronDown class="h-3 w-3" aria-hidden="true" />
			</span>
			{open ? 'Show fewer' : `Show ${hiddenCount} more${noun ? ` ${noun}` : ''}`}
		</button>
	{/if}
</div>

<style>
	.record-list {
		min-width: 0;
		font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
		font-size: 0.68rem;
		line-height: 1.35;
	}

	.record-rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.record-row {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.4rem;
		margin: 0 -0.3rem;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		color: hsl(var(--foreground));
		transition: background-color 120ms ease;
	}

	a.record-row:hover {
		background: hsl(var(--accent) / 0.1);
	}

	a.record-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -1px;
	}

	/* One fixed column, so titles line up across every list in the work log. */
	.record-row-kind {
		flex: 0 0 3.9rem;
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.record-row-title {
		min-width: 0;
		flex: 0 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a.record-row:hover .record-row-title {
		text-decoration: underline;
		text-decoration-color: hsl(var(--accent));
		text-underline-offset: 2px;
	}

	.record-row-aside {
		min-width: 0;
		flex: 0 2 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
		font-size: 0.62rem;
	}

	.record-row :global(.record-row-icon) {
		flex: 0 0 auto;
		align-self: center;
		width: 0.7rem;
		height: 0.7rem;
		margin-left: -0.2rem;
		opacity: 0.45;
	}

	a.record-row:hover :global(.record-row-icon) {
		opacity: 0.9;
	}

	/* Only a summary was in view: muted, so it never reads as opened. */
	.record-list[data-tone='handed'] .record-row {
		color: hsl(var(--muted-foreground));
	}

	.record-list-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0.1rem 0 0 -0.3rem;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.62rem;
		font-weight: 600;
		transition:
			color 120ms ease,
			background-color 120ms ease;
	}

	.record-list-toggle:hover {
		background: hsl(var(--muted) / 0.7);
		color: hsl(var(--foreground));
	}

	.record-list-toggle:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}

	.record-list-chevron {
		display: inline-flex;
		transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.record-list-chevron-open {
		transform: rotate(180deg);
	}

	.record-list-uncounted {
		padding: 0.1rem 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.62rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.record-row,
		.record-list-toggle,
		.record-list-chevron {
			transition: none;
		}
	}
</style>
