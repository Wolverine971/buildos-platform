<!-- apps/web/src/lib/components/ui/RecordChip.svelte -->
<!--
	One record as a chip: its kind in small caps, its title, and (when it has a page) a link
	that opens in a new tab. Shared by the chat's step rows and the inbox's "Looked at" trail
	(tasker 156) so a record looks the same wherever the assistant names it. Text size comes
	from where it is placed.
-->
<script lang="ts">
	import { ArrowUpRight } from '$lib/icons/lucide';

	let {
		kind,
		title,
		href = null,
		tooltip = null
	}: {
		/** Short kind word: "task", "Doc", "Goal". */
		kind: string;
		title: string;
		/** The record's page; a plain chip when it has none. */
		href?: string | null;
		/** Hover text; defaults to "Open … in a new tab" on links. */
		tooltip?: string | null;
	} = $props();
</script>

{#if href}
	<a
		class="record-chip"
		{href}
		target="_blank"
		rel="noopener"
		title={tooltip ?? `Open ${title} in a new tab`}
		><span class="record-chip-kind">{kind}</span><span class="record-chip-title">{title}</span
		><ArrowUpRight class="record-chip-icon" aria-hidden="true" /><span class="sr-only"
			>(opens in a new tab)</span
		></a
	>
{:else}
	<span class="record-chip" title={tooltip ?? undefined}
		><span class="record-chip-kind">{kind}</span><span class="record-chip-title">{title}</span
		></span
	>
{/if}

<style>
	.record-chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
		padding: 0.05rem 0.4rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.3rem;
		background: hsl(var(--background) / 0.6);
		color: hsl(var(--foreground));
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	a.record-chip:hover {
		border-color: hsl(var(--accent) / 0.6);
		background: hsl(var(--accent) / 0.08);
	}

	a.record-chip:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}

	.record-chip-kind {
		font-size: 0.56rem;
		font-weight: 700;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.record-chip-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: min(16rem, 100%);
	}

	.record-chip :global(.record-chip-icon) {
		display: inline;
		flex-shrink: 0;
		width: 0.7rem;
		height: 0.7rem;
		margin-left: 0.1rem;
		vertical-align: -0.1em;
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.record-chip {
			transition: none;
		}
	}
</style>
