<!-- apps/web/src/lib/components/tables/TableProvenance.svelte -->
<!--
	Where an AI-filled cell came from: who filled it, the sources, the note and
	how sure it was. Lives inside a TablePopover.
-->
<script lang="ts">
	import type { TableCellMeta, TableColumn, TableRow } from '@buildos/shared-agent-ops/tables';
	import { AlertCircle, Bot, ExternalLink, RefreshCw, Sparkles, X } from '$lib/icons/lucide';
	import TableCellView from './TableCellView.svelte';
	import { formatDate, hostnameOf, isEmptyCell, safeHref, urlLabel } from './table-cell-format';

	let {
		column,
		row,
		meta,
		projectId,
		readonly = false,
		onAskAgain,
		onClear,
		onClose
	}: {
		column: TableColumn;
		row: TableRow;
		meta: TableCellMeta;
		projectId: string;
		readonly?: boolean;
		onAskAgain?: () => void;
		onClear?: () => void;
		onClose: () => void;
	} = $props();

	const sources = $derived(
		(meta.source_urls ?? [])
			.map((url) => ({ url, href: safeHref(url) }))
			.filter((source): source is { url: string; href: string } => !!source.href)
	);
	const heading = $derived(
		meta.state === 'pending'
			? 'Still looking…'
			: meta.state === 'error'
				? "Couldn't find an answer"
				: meta.by === 'agent'
					? 'Filled by the agent'
					: 'Found by the question column'
	);
	const confidenceLabel = $derived(
		meta.confidence
			? `${meta.confidence.charAt(0).toUpperCase()}${meta.confidence.slice(1)} confidence`
			: null
	);
	const hasValue = $derived(!isEmptyCell(row.cells[column.id]));
</script>

<div class="grid gap-3 p-3.5">
	<div class="flex items-start gap-2">
		<span
			class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md {meta.state ===
			'error'
				? 'bg-destructive/10 text-destructive'
				: 'bg-accent/10 text-accent'}"
			aria-hidden="true"
		>
			{#if meta.state === 'error'}
				<AlertCircle class="h-3.5 w-3.5" />
			{:else if meta.by === 'agent'}
				<Bot class="h-3.5 w-3.5" />
			{:else}
				<Sparkles class="h-3.5 w-3.5" />
			{/if}
		</span>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold leading-snug text-foreground">{heading}</p>
			<p class="text-xs text-muted-foreground">
				{column.name} · row {row.row_number}{#if meta.at}<span class="stamp">
						· {formatDate(meta.at)}</span
					>{/if}
			</p>
		</div>
		<button
			type="button"
			class="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
			aria-label="Close"
			onclick={onClose}
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	{#if column.ai?.prompt}
		<p class="text-xs text-muted-foreground">
			<span class="micro-label">Question</span>
			<span class="mt-0.5 block text-foreground">{column.ai.prompt}</span>
		</p>
	{/if}

	{#if hasValue}
		<div class="rounded-md border border-border bg-background px-2.5 py-2 text-sm">
			<TableCellView
				{column}
				value={row.cells[column.id]}
				{projectId}
				wrap
				interactiveLinks
			/>
		</div>
	{/if}

	{#if meta.state === 'error' && meta.error}
		<p
			class="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-foreground"
		>
			{meta.error}
		</p>
	{/if}

	{#if confidenceLabel}
		<p class="flex items-center gap-1.5 text-xs text-foreground">
			<span class="inline-flex gap-0.5" role="img" aria-label={confidenceLabel}>
				{#each ['low', 'medium', 'high'] as level, index (level)}
					<span
						class="h-2 w-3 rounded-sm {index <=
						['low', 'medium', 'high'].indexOf(meta.confidence ?? 'low')
							? 'bg-accent'
							: 'bg-muted'}"
					></span>
				{/each}
			</span>
			{confidenceLabel}
		</p>
	{/if}

	{#if meta.note}
		<blockquote class="border-l-2 border-accent/50 pl-2.5 text-sm leading-snug text-foreground">
			{meta.note}
		</blockquote>
	{/if}

	{#if sources.length}
		<div>
			<p class="micro-label mb-1 text-muted-foreground">Sources</p>
			<ul class="grid gap-1">
				{#each sources as source (source.url)}
					<li>
						<a
							href={source.href}
							target="_blank"
							rel="noopener noreferrer"
							class="group flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-xs font-semibold text-foreground">
									{hostnameOf(source.url)}
								</span>
								<span class="block truncate text-2xs text-muted-foreground"
									>{urlLabel(source.url)}</span
								>
							</span>
							<ExternalLink
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-accent"
								aria-hidden="true"
							/>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{:else if meta.state === 'filled' || (!meta.state && meta.by === 'agent')}
		<p class="text-xs text-muted-foreground">No sources were recorded for this value.</p>
	{/if}

	{#if !readonly && (onAskAgain || onClear)}
		<div class="flex items-center justify-end gap-2 border-t border-border pt-3">
			{#if onClear && hasValue}
				<button
					type="button"
					class="min-h-9 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={onClear}
				>
					Clear value
				</button>
			{/if}
			{#if onAskAgain && column.ai}
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-ink pressable hover:border-accent"
					onclick={onAskAgain}
				>
					<RefreshCw class="h-3.5 w-3.5" />
					Ask again
				</button>
			{/if}
		</div>
	{/if}
</div>
