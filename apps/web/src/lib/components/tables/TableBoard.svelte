<!-- apps/web/src/lib/components/tables/TableBoard.svelte -->
<!--
	Board view: one lane per option of a Choice column (Status → Researching,
	Applied, Interview…). Drag a card to another lane, or focus it and press
	Alt+←/→, to change that value. Click a card to open the row.
-->
<script lang="ts">
	import type { TableColumn, TableRow, TableSchema } from '@buildos/shared-agent-ops/tables';
	import { Plus, SquareKanban } from '$lib/icons/lucide';
	import TableCellView from './TableCellView.svelte';
	import TableChoiceChip from './TableChoiceChip.svelte';
	import { isEmptyCell } from './table-cell-format';
	import { buildBoardLanes, primaryColumnId, rowTitle, type BoardLane } from './table-view-model';

	let {
		schema,
		columns,
		rows,
		boardColumn,
		candidates,
		readonly = false,
		projectId,
		onMove,
		onOpenRow,
		onAddCard,
		onBoardColumnChange,
		onCreateChoiceColumn
	}: {
		schema: TableSchema;
		/** Visible columns (cards show a few of them). */
		columns: TableColumn[];
		rows: TableRow[];
		boardColumn: TableColumn | null;
		candidates: TableColumn[];
		readonly?: boolean;
		projectId: string;
		onMove: (row: TableRow, value: string | null) => void;
		onOpenRow: (row: TableRow) => void;
		onAddCard: (value: string | null) => void;
		onBoardColumnChange: (columnId: string) => void;
		onCreateChoiceColumn: (anchor: HTMLElement) => void;
	} = $props();

	const LANE_CARD_LIMIT = 200;
	const lanes = $derived(boardColumn ? buildBoardLanes(boardColumn, rows) : []);
	const primaryId = $derived(primaryColumnId(schema));
	const detailColumns = $derived(
		columns
			.filter((column) => column.id !== primaryId && column.id !== boardColumn?.id)
			.slice(0, 6)
	);

	let dragRowId = $state<string | null>(null);
	let overLane = $state<string | null>(null);
	let expanded = $state<Record<string, boolean>>({});

	function laneKey(lane: BoardLane) {
		return lane.key ?? '__none__';
	}

	function cardFields(row: TableRow) {
		return detailColumns.filter((column) => !isEmptyCell(row.cells[column.id])).slice(0, 3);
	}

	function handleDragStart(event: DragEvent, row: TableRow) {
		if (readonly || !event.dataTransfer) return;
		dragRowId = row.id;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', row.id);
	}

	function handleDrop(event: DragEvent, lane: BoardLane) {
		event.preventDefault();
		const id = dragRowId ?? event.dataTransfer?.getData('text/plain');
		overLane = null;
		dragRowId = null;
		const row = rows.find((candidate) => candidate.id === id);
		if (!row || !boardColumn) return;
		const current = row.cells[boardColumn.id];
		if ((current ?? null) === lane.key) return;
		onMove(row, lane.key);
	}

	function handleCardKeydown(event: KeyboardEvent, row: TableRow, laneIndex: number) {
		if (readonly || !event.altKey) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const target = lanes[laneIndex + (event.key === 'ArrowLeft' ? -1 : 1)];
		if (!target) return;
		onMove(row, target.key);
		const id = row.id;
		requestAnimationFrame(() => document.getElementById(`board-card-${id}`)?.focus());
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	{#if candidates.length > 1 && boardColumn}
		<div class="flex items-center gap-2 px-3 pb-2 pt-1 text-xs text-muted-foreground">
			<label for="board-group-by">Lanes from</label>
			<select
				id="board-group-by"
				class="min-h-8 rounded-md border border-border-strong bg-background px-2 text-base text-foreground outline-none focus:border-accent sm:text-sm"
				value={boardColumn.id}
				onchange={(event) => onBoardColumnChange(event.currentTarget.value)}
			>
				{#each candidates as candidate (candidate.id)}
					<option value={candidate.id}>{candidate.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if !boardColumn}
		<div
			class="m-4 grid place-items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center"
		>
			<SquareKanban class="h-8 w-8 text-muted-foreground" />
			<div>
				<p class="font-semibold text-foreground">A board needs a Choice column</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Each option becomes a lane, like Applied → Interview → Offer.
				</p>
			</div>
			{#if !readonly}
				<button
					type="button"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground tx-button tx-button-accent"
					onclick={(event) => onCreateChoiceColumn(event.currentTarget)}
				>
					<Plus class="h-4 w-4" />
					Add a Choice column
				</button>
			{/if}
		</div>
	{:else}
		<div
			class="board-scroller flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden px-3 pb-3"
			role="list"
			aria-label={`Board by ${boardColumn.name}`}
		>
			{#each lanes as lane, laneIndex (laneKey(lane))}
				{@const key = laneKey(lane)}
				{@const limit = expanded[key] ? lane.rows.length : LANE_CARD_LIMIT}
				<section
					class="lane flex max-h-full w-[17rem] shrink-0 flex-col rounded-lg border bg-card {overLane ===
					key
						? 'border-accent bg-accent/5'
						: 'border-border'}"
					role="listitem"
					aria-label={`${lane.label}, ${lane.rows.length} ${lane.rows.length === 1 ? 'card' : 'cards'}`}
					ondragover={(event) => {
						if (readonly || !dragRowId) return;
						event.preventDefault();
						overLane = key;
					}}
					ondragleave={(event) => {
						if (
							!(event.currentTarget as HTMLElement).contains(
								event.relatedTarget as Node
							)
						) {
							if (overLane === key) overLane = null;
						}
					}}
					ondrop={(event) => handleDrop(event, lane)}
				>
					<header class="flex items-center gap-2 px-3 pb-2 pt-2.5">
						{#if lane.key === null}
							<span class="truncate text-xs font-semibold text-muted-foreground"
								>{lane.label}</span
							>
						{:else}
							<TableChoiceChip label={lane.label} color={lane.color} />
						{/if}
						<span class="stamp text-2xs text-muted-foreground">{lane.rows.length}</span>
						{#if !readonly}
							<button
								type="button"
								class="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-accent"
								aria-label={`Add a card to ${lane.label}`}
								onclick={() => onAddCard(lane.key)}
							>
								<Plus class="h-4 w-4" />
							</button>
						{/if}
					</header>
					<ul class="grid min-h-12 gap-2 overflow-y-auto px-2 pb-2">
						{#each lane.rows.slice(0, limit) as row (row.id)}
							<li>
								<button
									type="button"
									id={`board-card-${row.id}`}
									draggable={!readonly}
									class="card w-full rounded-md border border-border bg-background p-2.5 text-left shadow-ink transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {dragRowId ===
									row.id
										? 'opacity-50'
										: ''}"
									aria-describedby={readonly ? undefined : 'board-move-hint'}
									ondragstart={(event) => handleDragStart(event, row)}
									ondragend={() => {
										dragRowId = null;
										overLane = null;
									}}
									onclick={() => onOpenRow(row)}
									onkeydown={(event) => handleCardKeydown(event, row, laneIndex)}
								>
									<span
										class="block text-sm font-semibold leading-snug text-foreground"
									>
										{rowTitle(schema, row)}
									</span>
									{#each cardFields(row) as column (column.id)}
										<span
											class="mt-1.5 flex min-w-0 items-center gap-2 text-xs"
										>
											<span
												class="w-20 shrink-0 truncate text-muted-foreground"
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
								</button>
							</li>
						{/each}
						{#if lane.rows.length > limit}
							<li>
								<button
									type="button"
									class="min-h-9 w-full rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
									onclick={() => (expanded = { ...expanded, [key]: true })}
								>
									Show {lane.rows.length - limit} more
								</button>
							</li>
						{/if}
					</ul>
				</section>
			{/each}
		</div>
		{#if !readonly}
			<p id="board-move-hint" class="sr-only">
				Press Alt with the left or right arrow to move this card to another lane.
			</p>
		{/if}
	{/if}
</div>

<style>
	.card {
		cursor: grab;
	}
	.card:active {
		cursor: grabbing;
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
