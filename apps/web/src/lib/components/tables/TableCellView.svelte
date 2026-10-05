<!-- apps/web/src/lib/components/tables/TableCellView.svelte -->
<!--
	Read view of one cell, shared by the grid, cards, board and embed. Cells the
	agent or a question column filled carry a small marker that opens their
	sources; pending cells shimmer while a fill runs; failed fills say so.
-->
<script lang="ts">
	import type {
		TableCellMeta,
		TableCellValue,
		TableColumn
	} from '@buildos/shared-agent-ops/tables';
	import { buildRecordHref } from '@buildos/shared-types';
	import { AlertCircle, Bot, Check, ExternalLink, Link2, Sparkles } from '$lib/icons/lucide';
	import TableChoiceChip from './TableChoiceChip.svelte';
	import {
		choiceColor,
		formatCellDisplay,
		isEmptyCell,
		isLinkValue,
		linkLabel,
		safeHref,
		selectValues
	} from './table-cell-format';

	let {
		column,
		value,
		meta = null,
		projectId = null,
		wrap = false,
		interactiveLinks = false,
		plain = false,
		readonly = true,
		onToggle,
		onProvenance
	}: {
		column: TableColumn;
		value: TableCellValue | undefined;
		meta?: TableCellMeta | null;
		projectId?: string | null;
		/** Multi-line (cards/detail) instead of one truncated line (grid). */
		wrap?: boolean;
		/** Render URLs/emails as clickable anchors (cards/detail/embed). */
		interactiveLinks?: boolean;
		/** No nested links or buttons at all (inside a card that is itself a button). */
		plain?: boolean;
		readonly?: boolean;
		onToggle?: () => void;
		onProvenance?: (anchor: HTMLElement) => void;
	} = $props();

	const empty = $derived(isEmptyCell(value));
	const display = $derived(formatCellDisplay(column, value));
	const provenance = $derived(meta && meta.by !== 'import' ? meta : null);
	const pending = $derived(provenance?.state === 'pending');
	const failed = $derived(provenance?.state === 'error');
	const href = $derived.by(() => {
		if (typeof value !== 'string') return null;
		if (column.type === 'url') return safeHref(value, 'url');
		if (column.type === 'email') return safeHref(value, 'email');
		return null;
	});
	const linkHref = $derived(
		isLinkValue(value) &&
			(value.kind === 'task' || value.kind === 'document' || value.kind === 'project')
			? buildRecordHref(value.kind, value.id, projectId ?? undefined)
			: null
	);
	const markerLabel = $derived(
		provenance
			? failed
				? `Couldn't fill: ${provenance.error ?? 'no answer found'}. Show details`
				: provenance.by === 'agent'
					? 'Filled by the agent. Show sources'
					: 'Filled by the question column. Show sources'
			: ''
	);

	function openProvenance(event: MouseEvent) {
		event.stopPropagation();
		onProvenance?.(event.currentTarget as HTMLElement);
	}

	function toggle(event: MouseEvent) {
		event.stopPropagation();
		if (!readonly) onToggle?.();
	}
</script>

<span class="cell-view relative flex min-w-0 items-center gap-1.5 {wrap ? 'items-start' : ''}">
	{#if pending && empty}
		<span class="pending-shimmer h-2.5 w-full max-w-24 rounded-full" aria-hidden="true"></span>
		<span class="sr-only">Finding an answer…</span>
	{:else if column.type === 'checkbox'}
		{#if onToggle && !readonly}
			<button
				type="button"
				tabindex="-1"
				role="checkbox"
				aria-checked={value === true}
				aria-label={value === true ? 'Checked' : 'Not checked'}
				class="check-box flex h-4 w-4 items-center justify-center rounded border {value ===
				true
					? 'border-accent bg-accent text-accent-foreground'
					: 'border-border-strong bg-background'}"
				onclick={toggle}
			>
				{#if value === true}<Check class="h-3 w-3" strokeWidth={3} />{/if}
			</button>
		{:else}
			<span
				class="flex h-4 w-4 items-center justify-center rounded border {value === true
					? 'border-accent bg-accent text-accent-foreground'
					: 'border-border-strong bg-background'}"
				role="img"
				aria-label={value === true ? 'Checked' : 'Not checked'}
			>
				{#if value === true}<Check class="h-3 w-3" strokeWidth={3} />{/if}
			</span>
		{/if}
	{:else if empty}
		<span class="sr-only">Empty</span>
	{:else if column.type === 'select'}
		<TableChoiceChip label={display} color={choiceColor(column, display)} />
	{:else if column.type === 'multi_select'}
		<span class="flex min-w-0 gap-1 {wrap ? 'flex-wrap' : 'overflow-hidden'}">
			{#each selectValues(value) as item (item)}
				<TableChoiceChip label={item} color={choiceColor(column, item)} />
			{/each}
		</span>
	{:else if column.type === 'link' && isLinkValue(value)}
		{#if linkHref && interactiveLinks}
			<a
				href={linkHref}
				class="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Link2 class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span class="truncate">{linkLabel(value)}</span>
			</a>
		{:else}
			<span
				class="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
			>
				<Link2 class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span class="truncate">{linkLabel(value)}</span>
			</span>
		{/if}
	{:else if (column.type === 'url' || column.type === 'email') && href}
		{#if interactiveLinks}
			<a
				{href}
				target={column.type === 'url' ? '_blank' : undefined}
				rel={column.type === 'url' ? 'noopener noreferrer' : undefined}
				class="min-w-0 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {wrap
					? 'break-all'
					: 'truncate'}"
			>
				{display}
			</a>
		{:else}
			<span
				class="min-w-0 truncate text-foreground underline decoration-border-strong underline-offset-2"
			>
				{display}
			</span>
			{#if !plain}
				<a
					{href}
					target={column.type === 'url' ? '_blank' : undefined}
					rel={column.type === 'url' ? 'noopener noreferrer' : undefined}
					tabindex="-1"
					class="open-link ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-accent"
					aria-label={column.type === 'url' ? `Open ${display}` : `Email ${display}`}
					onclick={(event) => event.stopPropagation()}
					onpointerdown={(event) => event.stopPropagation()}
				>
					<ExternalLink class="h-3 w-3" aria-hidden="true" />
				</a>
			{/if}
		{/if}
	{:else if column.type === 'number'}
		<span class="stamp ml-auto min-w-0 truncate text-foreground">{display}</span>
	{:else if column.type === 'date'}
		<span class="min-w-0 truncate text-foreground">{display}</span>
	{:else}
		<span
			class="min-w-0 text-foreground {wrap ? 'whitespace-pre-wrap break-words' : 'truncate'}"
			>{display}</span
		>
	{/if}

	{#if provenance && !(pending && empty)}
		{#if onProvenance && !plain}
			<button
				type="button"
				tabindex="-1"
				class="marker shrink-0 rounded p-0.5 {failed
					? 'text-destructive'
					: 'text-accent'} hover:bg-muted {column.type === 'number' ? '' : 'ml-auto'}"
				aria-label={markerLabel}
				title={markerLabel}
				onclick={openProvenance}
				onpointerdown={(event) => event.stopPropagation()}
			>
				{#if failed}
					<AlertCircle class="h-3 w-3" aria-hidden="true" />
				{:else if provenance.by === 'agent'}
					<Bot class="h-3 w-3" aria-hidden="true" />
				{:else}
					<Sparkles class="h-3 w-3" aria-hidden="true" />
				{/if}
			</button>
		{:else}
			<span
				class="shrink-0 {failed ? 'text-destructive' : 'text-accent'} {column.type ===
				'number'
					? ''
					: 'ml-auto'}"
				title={markerLabel}
			>
				{#if failed}
					<AlertCircle class="h-3 w-3" aria-hidden="true" />
				{:else if provenance.by === 'agent'}
					<Bot class="h-3 w-3" aria-hidden="true" />
				{:else}
					<Sparkles class="h-3 w-3" aria-hidden="true" />
				{/if}
				<span class="sr-only">{markerLabel}</span>
			</span>
		{/if}
	{/if}
</span>

<style>
	.pending-shimmer {
		background: linear-gradient(
			90deg,
			hsl(var(--muted)) 0%,
			hsl(var(--accent) / 0.25) 50%,
			hsl(var(--muted)) 100%
		);
		background-size: 200% 100%;
		animation: table-shimmer 1.4s ease-in-out infinite;
	}
	@keyframes table-shimmer {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -100% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pending-shimmer {
			animation: none;
			background: hsl(var(--accent) / 0.18);
		}
	}
	.open-link {
		opacity: 0;
		transition: opacity 120ms ease;
	}
	:global(.table-cell:hover) .open-link,
	:global(.table-cell[data-active='true']) .open-link,
	.open-link:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.open-link {
			opacity: 1;
		}
	}
</style>
