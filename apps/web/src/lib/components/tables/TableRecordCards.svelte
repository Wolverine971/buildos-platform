<!-- apps/web/src/lib/components/tables/TableRecordCards.svelte -->
<!--
	Phone view: each row is a card (title + a few fields). Tap a card to open
	the row and edit any field. Renders in pages so long tables stay light.
-->
<script lang="ts">
	import type { TableColumn, TableRow, TableSchema } from '@buildos/shared-agent-ops/tables';
	import { ChevronRight, Plus } from '$lib/icons/lucide';
	import TableCellView from './TableCellView.svelte';
	import { isEmptyCell } from './table-cell-format';
	import { primaryColumnId, rowTitle } from './table-view-model';

	let {
		schema,
		columns,
		rows,
		readonly = false,
		projectId,
		onOpenRow,
		onAddRow
	}: {
		schema: TableSchema;
		columns: TableColumn[];
		rows: TableRow[];
		readonly?: boolean;
		projectId: string;
		onOpenRow: (row: TableRow) => void;
		onAddRow: () => void;
	} = $props();

	const PAGE = 60;
	let shown = $state(PAGE);
	const primaryId = $derived(primaryColumnId(schema));
	const fieldColumns = $derived(columns.filter((column) => column.id !== primaryId));

	function fields(row: TableRow) {
		return fieldColumns
			.filter(
				(column) =>
					!isEmptyCell(row.cells[column.id]) ||
					row.cell_meta?.[column.id]?.state === 'pending'
			)
			.slice(0, 4);
	}
</script>

<div class="h-full overflow-y-auto overscroll-contain px-3 pb-6 pt-1">
	<ul class="grid gap-2" aria-label="Rows">
		{#each rows.slice(0, shown) as row (row.id)}
			<li>
				<button
					type="button"
					class="flex w-full items-start gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-ink pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() => onOpenRow(row)}
				>
					<span class="min-w-0 flex-1">
						<span class="flex items-baseline gap-2">
							<span
								class="min-w-0 flex-1 truncate text-base font-semibold text-foreground"
							>
								{rowTitle(schema, row)}
							</span>
							<span class="stamp shrink-0 text-2xs text-muted-foreground"
								>r{row.row_number}</span
							>
						</span>
						{#each fields(row) as column (column.id)}
							<span class="mt-1.5 flex min-w-0 items-center gap-2">
								<span class="w-24 shrink-0 truncate text-xs text-muted-foreground"
									>{column.name}</span
								>
								<span class="min-w-0 flex-1 text-sm">
									<TableCellView
										{column}
										value={row.cells[column.id]}
										meta={row.cell_meta?.[column.id] ?? null}
										{projectId}
										plain
									/>
								</span>
							</span>
						{/each}
					</span>
					<ChevronRight
						class="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				</button>
			</li>
		{/each}
	</ul>
	{#if rows.length > shown}
		<button
			type="button"
			class="mt-2 min-h-11 w-full rounded-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground"
			onclick={() => (shown += PAGE)}
		>
			Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
		</button>
	{/if}
	{#if !readonly}
		<button
			type="button"
			class="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-accent hover:text-accent"
			onclick={onAddRow}
		>
			<Plus class="h-4 w-4" />
			New row
		</button>
	{/if}
</div>
