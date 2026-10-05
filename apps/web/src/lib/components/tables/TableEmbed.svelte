<!-- apps/web/src/lib/components/tables/TableEmbed.svelte -->
<!--
	Read-only preview of a table for document embeds and chat cards: the first
	rows, the row count and a way into the full table.

	<TableEmbed documentId projectId />
-->
<script lang="ts">
	import type { LoadedTable } from '@buildos/shared-agent-ops/tables';
	import { buildRecordHref } from '@buildos/shared-types';
	import { ArrowUpRight, Table2 } from '$lib/icons/lucide';
	import TableCellView from './TableCellView.svelte';
	import { tableClient, type TableClient } from './table-client';
	import { friendlyTableError } from './table-controller.svelte';
	import { orderedVisibleColumns } from './table-view-model';

	let {
		documentId,
		projectId,
		initialTable = null,
		rowLimit = 8,
		columnLimit = 6,
		client = tableClient,
		onOpen
	}: {
		documentId: string;
		projectId: string;
		initialTable?: LoadedTable | null;
		rowLimit?: number;
		columnLimit?: number;
		client?: TableClient;
		/** Opens the table in place (reader/modal); falls back to the document page link. */
		onOpen?: (documentId: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let table = $state.raw<LoadedTable | null>(initialTable);
	let error = $state<string | null>(null);
	let loading = $state(false);

	$effect(() => {
		const id = documentId;
		if (table && table.document.id === id) return;
		let cancelled = false;
		loading = true;
		error = null;
		client
			.getTable(id)
			.then((response) => {
				if (!cancelled) table = response.table;
			})
			.catch((err: unknown) => {
				if (!cancelled) error = friendlyTableError(err, "Couldn't load this table.");
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	const columns = $derived(
		table ? orderedVisibleColumns(table.schema).slice(0, columnLimit) : []
	);
	const moreColumns = $derived(
		table ? Math.max(0, orderedVisibleColumns(table.schema).length - columns.length) : 0
	);
	const rows = $derived(table ? table.rows.slice(0, rowLimit) : []);
	const href = $derived(buildRecordHref('document', documentId, projectId));

	function open(event: MouseEvent) {
		if (!onOpen) return;
		event.preventDefault();
		onOpen(documentId);
	}
</script>

<figure
	class="table-embed not-prose my-3 overflow-clip rounded-lg border border-border bg-card shadow-ink"
>
	<figcaption class="flex items-center gap-2 border-b border-border px-3 py-2">
		<Table2 class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		<span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
			{table?.document.title ?? (loading ? 'Loading table…' : 'Table')}
		</span>
		{#if table}
			<span class="stamp shrink-0 text-2xs text-muted-foreground">
				{table.rows.length}
				{table.rows.length === 1 ? 'row' : 'rows'}
			</span>
		{/if}
		{#if href}
			<a
				{href}
				class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={open}
			>
				Open table
				<ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" />
			</a>
		{/if}
	</figcaption>

	{#if error}
		<p class="px-3 py-4 text-sm text-muted-foreground">{error}</p>
	{:else if !table}
		<div class="grid gap-1.5 p-3" aria-hidden="true">
			{#each Array(4) as _, index (index)}
				<div class="h-6 animate-pulse rounded bg-muted motion-reduce:animate-none"></div>
			{/each}
		</div>
	{:else if !rows.length}
		<p class="px-3 py-4 text-sm text-muted-foreground">No rows yet.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full min-w-max border-collapse text-sm">
				<thead>
					<tr class="bg-background">
						{#each columns as column (column.id)}
							<th
								scope="col"
								class="border-b border-border px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground"
							>
								{column.name}
							</th>
						{/each}
						{#if moreColumns}
							<th
								scope="col"
								class="border-b border-border px-3 py-1.5 text-left text-xs font-normal text-muted-foreground"
							>
								+{moreColumns} more
							</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-border/70 last:border-b-0">
							{#each columns as column, index (column.id)}
								<td
									class="max-w-56 px-3 py-1.5 align-middle {index === 0
										? 'font-medium'
										: ''}"
								>
									<TableCellView
										{column}
										value={row.cells[column.id]}
										meta={row.cell_meta?.[column.id] ?? null}
										{projectId}
										interactiveLinks
									/>
								</td>
							{/each}
							{#if moreColumns}<td></td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if table.rows.length > rows.length}
			<p class="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
				{table.rows.length - rows.length} more {table.rows.length - rows.length === 1
					? 'row'
					: 'rows'}
			</p>
		{/if}
	{/if}
</figure>
