<!-- apps/web/src/lib/components/tables/TableWorkspace.svelte -->
<!--
	The one component every surface mounts for a table (reader, modal, page):

	<TableWorkspace documentId projectId initialTable? layout?="page"|"panel"|"sheet"
	                readonly? onChanged? onAsk? />

	Toolbar (search, filter/sort, view switch, add row, paste rows, export, "Ask
	about this table"), the grid on desktop / record cards on phones / a board by
	any Choice column, a totals footer, column menus (rename, type, options,
	description, hide, delete, question columns), row menus (open, make task,
	delete), AI-cell sources, optimistic edits with undo, and live AI fills.
	Contract: docs/specs/tables/CONTRACT.md.
-->
<script lang="ts" module>
	export interface TableAskContext {
		documentId: string;
		projectId: string;
		title: string;
		rowCount: number;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import {
		coerceCellValue,
		type LoadedTable,
		type TableCellValue,
		type TableColumn,
		type TableColumnChange,
		type TableColumnInput,
		type TableColumnType,
		type TableFilter,
		type TableRow,
		type TableSort
	} from '@buildos/shared-agent-ops/tables';
	import { buildRecordHref } from '@buildos/shared-types';
	import { toastService } from '$lib/stores/toast.store';
	import {
		AlertCircle,
		ClipboardPaste,
		Eye,
		ListChecks,
		Maximize2,
		Plus,
		RefreshCw,
		Sparkles,
		Trash2,
		X
	} from '$lib/icons/lucide';
	import TableGrid from './TableGrid.svelte';
	import TableBoard from './TableBoard.svelte';
	import TableRecordCards from './TableRecordCards.svelte';
	import TableRowDetail from './TableRowDetail.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import TablePopover from './TablePopover.svelte';
	import TableColumnMenu from './TableColumnMenu.svelte';
	import TableAddColumn from './TableAddColumn.svelte';
	import TableFilterPanel from './TableFilterPanel.svelte';
	import TableProvenance from './TableProvenance.svelte';
	import TablePasteRowsDialog from './TablePasteRowsDialog.svelte';
	import {
		createTableController,
		type NotifyAction,
		type TableNotifier
	} from './table-controller.svelte';
	import type { TableClient } from './table-client';
	import { tableClient } from './table-client';
	import { isEmptyCell, nextChoiceColor, selectValues } from './table-cell-format';
	import type { CoerceCell, PasteChanges } from './table-grid-model';
	import { recordsToCells, type AppendPlan } from './table-import';
	import {
		activeFilters,
		applyView,
		boardCandidateColumns,
		computeTotals,
		cycleSort,
		defaultViewState,
		findColumn,
		footerCells,
		hiddenColumns,
		orderedVisibleColumns,
		parseStoredViewState,
		primaryColumnId,
		rowTitle,
		sanitizeViewState,
		storedViewState,
		type CellEdit,
		type WorkspaceMode,
		type WorkspaceViewState
	} from './table-view-model';

	let {
		documentId,
		projectId,
		initialTable = null,
		layout = 'page',
		readonly = false,
		showTitle = false,
		class: className = '',
		client = tableClient,
		onChanged,
		onAsk
	}: {
		documentId: string;
		projectId: string;
		initialTable?: LoadedTable | null;
		layout?: 'page' | 'panel' | 'sheet';
		readonly?: boolean;
		/** Editable title + description above the toolbar (hosts usually show their own). */
		showTitle?: boolean;
		class?: string;
		/** Injected for previews/tests; defaults to the real endpoints. */
		client?: TableClient;
		onChanged?: (table: LoadedTable) => void;
		/** "Ask about this table" — the host opens chat focused on this document. */
		onAsk?: (context: TableAskContext) => void;
	} = $props();

	function toToastOptions(action?: NotifyAction) {
		return action ? { action: { label: action.label, onClick: action.onClick } } : undefined;
	}

	const notify: TableNotifier = {
		success: (message, action) => void toastService.success(message, toToastOptions(action)),
		info: (message, action) => void toastService.info(message, toToastOptions(action)),
		warning: (message, action) => void toastService.warning(message, toToastOptions(action)),
		error: (message, action) => void toastService.error(message, toToastOptions(action))
	};

	// One controller per table document. Hosts that swap documents get a fresh one.
	const controller = $derived.by(() =>
		createTableController({
			documentId,
			projectId,
			initialTable: untrack(() => initialTable),
			client: untrack(() => client),
			notify,
			onChanged: (table) => onChanged?.(table)
		})
	);

	$effect(() => {
		const current = controller;
		void current.load();
		return () => current.dispose();
	});

	const phone = new MediaQuery('max-width: 767px', false);
	let rootWidth = $state(1024);
	const compact = $derived(phone.current || layout === 'sheet');
	const wide = $derived(rootWidth >= 760);

	const table = $derived(controller.table);
	const schema = $derived(table?.schema ?? null);

	// ---------------------------------------------------------------------------
	// View state (remembered per table, per browser)
	// ---------------------------------------------------------------------------

	// Replaced wholesale on every change, so no deep proxy is needed.
	let view = $state.raw<WorkspaceViewState | null>(null);
	let compactMode = $state<WorkspaceMode>('cards');
	let searchText = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);
	const storageKey = $derived(`buildos:table-view:${documentId}`);

	$effect(() => {
		// Seed the view once the schema is known (per document).
		if (!schema || view) return;
		const key = storageKey;
		let seeded: WorkspaceViewState | null = null;
		try {
			const raw = localStorage.getItem(key);
			if (raw) seeded = parseStoredViewState(JSON.parse(raw), schema);
		} catch {
			seeded = null;
		}
		view = seeded ?? defaultViewState(schema);
		compactMode = view.mode === 'board' ? 'board' : 'cards';
	});

	$effect(() => {
		// Reset when the host swaps documents.
		void documentId;
		return () => {
			view = null;
			searchText = '';
		};
	});

	$effect(() => {
		const current = view;
		const key = storageKey;
		if (!current) return;
		const payload = JSON.stringify(storedViewState(current));
		const timer = setTimeout(() => {
			try {
				localStorage.setItem(key, payload);
			} catch {
				// Private mode / blocked storage: the view just isn't remembered.
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const text = searchText;
		const timer = setTimeout(() => {
			if (view && view.search !== text) view = { ...view, search: text };
		}, 140);
		return () => clearTimeout(timer);
	});

	const effectiveView = $derived(view && schema ? sanitizeViewState(view, schema) : null);
	const mode = $derived<WorkspaceMode>(
		compact
			? compactMode
			: effectiveView?.mode === 'cards'
				? 'grid'
				: (effectiveView?.mode ?? 'grid')
	);
	const modes = $derived<WorkspaceMode[]>(
		compact ? ['cards', 'board', 'grid'] : ['grid', 'board']
	);

	function patchView(patch: Partial<WorkspaceViewState>) {
		if (!view) return;
		view = { ...view, ...patch };
	}

	function setMode(next: WorkspaceMode) {
		if (compact) compactMode = next;
		else patchView({ mode: next });
	}

	// ---------------------------------------------------------------------------
	// Derived table data
	// ---------------------------------------------------------------------------

	const columns = $derived(schema ? orderedVisibleColumns(schema) : []);
	const hidden = $derived(schema ? hiddenColumns(schema) : []);
	const primaryId = $derived(schema ? primaryColumnId(schema) : null);
	const result = $derived(table && effectiveView ? applyView(table, effectiveView) : null);
	const rows = $derived(result?.rows ?? table?.rows ?? []);
	const totals = $derived(schema ? computeTotals(schema, rows) : {});
	const footer = $derived(
		footerCells(columns, rows, totals, {
			primaryColumnId: primaryId,
			matched: result?.matched ?? rows.length,
			total: result?.total ?? table?.rows.length ?? 0
		})
	);
	const filterCount = $derived(
		effectiveView ? activeFilters(effectiveView.filters).length + effectiveView.sort.length : 0
	);
	const filtered = $derived(!!result?.filtered);
	const boardCandidates = $derived(schema ? boardCandidateColumns(schema) : []);
	const boardColumn = $derived(
		schema && effectiveView?.boardColumnId
			? findColumn(schema, effectiveView.boardColumnId)
			: null
	);
	const linkColumn = $derived(schema?.columns.find((column) => column.type === 'link') ?? null);
	const aiFill = $derived(controller.aiFill);
	const aiFillColumn = $derived(
		aiFill && schema ? schema.columns.find((column) => column.id === aiFill.columnId) : null
	);
	const aiFillRunning = $derived(
		!!aiFill && (aiFill.status === 'queued' || aiFill.status === 'running')
	);

	const coerce: CoerceCell = (column, raw) => {
		try {
			return coerceCellValue(column, raw);
		} catch (error) {
			return { value: raw, error: error instanceof Error ? error.message : undefined };
		}
	};

	// ---------------------------------------------------------------------------
	// Popovers + dialogs (one popover at a time)
	// ---------------------------------------------------------------------------

	type PopoverState =
		| {
				kind: 'column';
				columnId: string;
				anchor: HTMLElement | DOMRect;
				initialView: 'main' | 'ai';
		  }
		| { kind: 'addColumn'; anchor: HTMLElement | DOMRect; presetType: TableColumnType | null }
		| { kind: 'row'; rowId: string; rowIds: string[]; anchor: HTMLElement | DOMRect }
		| { kind: 'filters'; anchor: HTMLElement }
		| { kind: 'hidden'; anchor: HTMLElement }
		| { kind: 'provenance'; rowId: string; columnId: string; anchor: HTMLElement };

	let popover = $state.raw<PopoverState | null>(null);
	let detailRowId = $state<string | null>(null);
	let pasteOpen = $state(false);
	let grid = $state<ReturnType<typeof TableGrid> | null>(null);

	function closePopover() {
		popover = null;
	}

	function columnById(columnId: string): TableColumn | null {
		return schema?.columns.find((candidate) => candidate.id === columnId) ?? null;
	}

	function findRow(rowId: string | null): TableRow | null {
		if (!rowId || !table) return null;
		const id = controller.resolveRowId(rowId);
		return table.rows.find((row) => row.id === id || row.id === rowId) ?? null;
	}

	const detailRow = $derived(findRow(detailRowId));
	const detailPosition = $derived.by(() => {
		if (!detailRow) return null;
		const index = rows.findIndex((row) => row.id === detailRow.id);
		return index === -1 ? null : { index, total: rows.length };
	});

	$effect(() => {
		// The open row was deleted (here or elsewhere): close its sheet.
		if (detailRowId && table && !detailRow) detailRowId = null;
	});

	// ---------------------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------------------

	function editCells(edits: CellEdit[], opts?: { undoToast?: string }) {
		if (readonly) return;
		void controller.editCells(edits, opts);
	}

	function addChoices(columnId: string, values: string[]) {
		const column = schema?.columns.find((candidate) => candidate.id === columnId);
		if (!column || !values.length) return;
		const choices = [...(column.options?.choices ?? [])];
		for (const value of values) {
			if (choices.some((choice) => choice.value.toLowerCase() === value.toLowerCase()))
				continue;
			choices.push({ value, color: nextChoiceColor(choices) });
		}
		void controller.changeColumns([
			{ action: 'update', column: columnId, options: { choices } }
		]);
	}

	function handlePaste(changes: PasteChanges) {
		if (readonly) return;
		const cells = changes.edits.length;
		const added = changes.inserts.length;
		if (!cells && !added) {
			if (changes.errors.length)
				notify.warning(changes.errors[0] ?? 'Nothing in that paste fits these columns.');
			return;
		}
		// New select values from a paste become options so they get colors.
		const fresh = new Map<string, Set<string>>();
		const collect = (columnId: string, value: TableCellValue) => {
			const column = schema?.columns.find((candidate) => candidate.id === columnId);
			if (!column || (column.type !== 'select' && column.type !== 'multi_select')) return;
			for (const item of selectValues(value)) {
				if (
					column.options?.choices?.some(
						(choice) => choice.value.toLowerCase() === item.toLowerCase()
					)
				)
					continue;
				const set = fresh.get(columnId) ?? new Set<string>();
				set.add(item);
				fresh.set(columnId, set);
			}
		};
		changes.edits.forEach((edit) => collect(edit.columnId, edit.value));
		changes.inserts.forEach((insert) =>
			Object.entries(insert).forEach(([id, value]) => collect(id, value))
		);
		for (const [columnId, values] of fresh) addChoices(columnId, [...values]);

		const parts = [
			cells ? `${cells} ${cells === 1 ? 'cell' : 'cells'}` : '',
			added ? `${added} new ${added === 1 ? 'row' : 'rows'}` : ''
		].filter(Boolean);
		void controller.applyPaste(changes.edits, changes.inserts, {
			undoToast: cells + added > 1 ? `Pasted ${parts.join(' and ')}` : undefined
		});
		const skipped = changes.errors.length + changes.skippedColumns;
		if (skipped) {
			notify.warning(
				changes.skippedColumns
					? `${changes.skippedColumns} pasted ${changes.skippedColumns === 1 ? 'column' : 'columns'} ran past the last column and ${changes.skippedColumns === 1 ? 'was' : 'were'} left out.`
					: `${changes.errors.length} ${changes.errors.length === 1 ? 'value' : 'values'} didn't fit ${changes.errors.length === 1 ? 'its column' : 'their columns'}: ${changes.errors[0]}`
			);
		}
	}

	function clearFilters() {
		searchText = '';
		patchView({ filters: [], search: '' });
	}

	function addRow(cells: Record<string, TableCellValue> = {}): string | null {
		if (readonly || !table) return null;
		const tempId = controller.insertRow(cells);
		if (filtered) {
			notify.info('Row added. Your search or filters may hide it.', {
				label: 'Show all',
				onClick: clearFilters
			});
		}
		return tempId;
	}

	function addRowFromToolbar() {
		if (mode === 'grid') {
			// The grid's own button focuses + edits the new row.
			const tempId = addRow();
			if (tempId) requestAnimationFrame(() => grid?.focusRow(tempId));
		} else {
			const tempId = addRow();
			if (tempId) detailRowId = tempId;
		}
	}

	async function makeTask(rowId: string) {
		const row = findRow(rowId);
		if (!row || !schema) return;
		const task = await controller.makeTask(row.id, {
			title: rowTitle(schema, row),
			linkColumnId: linkColumn?.id ?? null
		});
		if (!task) return;
		const href = buildRecordHref('task', task.id, projectId);
		notify.success(
			`Task created: ${task.title ?? rowTitle(schema, row)}`,
			href ? { label: 'Open', onClick: () => void goto(href) } : undefined
		);
	}

	function deleteRows(rowIds: string[]) {
		if (readonly) return;
		void controller.deleteRows(rowIds);
	}

	function changeColumns(changes: TableColumnChange[], opts?: { undoToast?: string }) {
		if (readonly) return;
		void controller.changeColumns(changes, opts);
	}

	function renameChoice(column: TableColumn, from: string, to: string) {
		if (!table) return;
		const choices = (column.options?.choices ?? []).map((choice) =>
			choice.value === from ? { ...choice, value: to } : choice
		);
		void controller.changeColumns([
			{ action: 'update', column: column.id, options: { choices } }
		]);
		const edits: CellEdit[] = [];
		for (const row of table.rows) {
			const value = row.cells[column.id];
			if (column.type === 'select' && value === from) {
				edits.push({ rowId: row.id, columnId: column.id, value: to });
			} else if (
				column.type === 'multi_select' &&
				Array.isArray(value) &&
				value.includes(from)
			) {
				edits.push({
					rowId: row.id,
					columnId: column.id,
					value: value.map((item) => (item === from ? to : item))
				});
			}
		}
		if (edits.length) void controller.editCells(edits);
	}

	async function addColumn(input: TableColumnInput, opts: { fill: boolean }) {
		const after = columns.at(-1)?.id ?? null;
		await controller.changeColumns([{ action: 'add', after, ...input }]);
		if (!opts.fill) return;
		const created = controller.table ? findColumn(controller.table.schema, input.name) : null;
		if (created) await controller.startAiFill(created.id, { onlyEmpty: true });
	}

	function fillColumn(columnId: string, onlyEmpty: boolean, rowIds?: string[]) {
		if (readonly) return;
		void controller.startAiFill(columnId, { onlyEmpty, rowIds });
	}

	function emptyCountFor(columnId: string): number {
		return table ? table.rows.filter((row) => isEmptyCell(row.cells[columnId])).length : 0;
	}

	function setSort(sort: TableSort[]) {
		patchView({ sort });
	}

	function ask() {
		if (!table) return;
		onAsk?.({
			documentId,
			projectId,
			title: table.document.title,
			rowCount: table.rows.length
		});
	}

	function stepDetail(delta: 1 | -1) {
		if (!detailPosition) return;
		const next = rows[detailPosition.index + delta];
		if (next) detailRowId = next.id;
	}

	function closeDetail() {
		const id = detailRowId;
		detailRowId = null;
		if (id && mode === 'grid')
			requestAnimationFrame(() => grid?.focusRow(controller.resolveRowId(id)));
	}

	async function importRows(plan: AppendPlan) {
		if (plan.newColumns.length) {
			const after = columns.at(-1)?.id ?? null;
			await controller.changeColumns(
				plan.newColumns.map((column, index) =>
					index === 0
						? { action: 'add' as const, after, ...column }
						: { action: 'add' as const, ...column }
				)
			);
		}
		const current = controller.table;
		if (!current) return;
		const { rows: cells, errors } = recordsToCells(current.schema, plan.records, coerce);
		const nonEmpty = cells.filter((row) => Object.keys(row).length > 0);
		await controller.appendRows(nonEmpty, {
			undoToast: `Added ${nonEmpty.length} ${nonEmpty.length === 1 ? 'row' : 'rows'}`
		});
		if (errors.length)
			notify.warning(`${errors.length} values didn't fit their columns: ${errors[0]}`);
	}

	function handleRootKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing =
			!!target &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
		if (typing || event.defaultPrevented) return;
		const mod = event.metaKey || event.ctrlKey;
		if (mod && !event.shiftKey && event.key.toLowerCase() === 'z' && !readonly) {
			event.preventDefault();
			void controller.undo();
			return;
		}
		if (event.key === '/' && !mod) {
			event.preventDefault();
			searchInput?.focus();
		}
	}

	const exportName = $derived(
		`${(table?.document.title ?? 'table').replace(/[^\w\- ]+/g, '').trim() || 'table'}.csv`
	);
</script>

<!-- Workspace-level shortcuts (⌘Z undo, / search) bubble up from any control inside. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="table-workspace flex min-h-0 w-full flex-col gap-2 {layout === 'page'
		? 'workspace-page'
		: 'h-full flex-1'} {className}"
	data-layout={layout}
	aria-label={table ? `Table: ${table.document.title}` : 'Table'}
	bind:clientWidth={rootWidth}
	onkeydown={handleRootKeydown}
>
	{#if controller.loading && !table}
		<div class="grid gap-2 p-1" aria-busy="true" aria-label="Loading table">
			<div
				class="h-9 w-2/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
			></div>
			{#each Array(6) as _, index (index)}
				<div
					class="h-9 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none"
				></div>
			{/each}
		</div>
	{:else if controller.loadError && !table}
		<div
			class="m-auto grid max-w-sm place-items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center tx tx-static tx-weak"
		>
			<AlertCircle class="h-6 w-6 text-destructive" />
			<p class="text-sm text-foreground">{controller.loadError}</p>
			<button
				type="button"
				class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-ink pressable hover:border-accent"
				onclick={() => void controller.load()}
			>
				<RefreshCw class="h-4 w-4" />
				Try again
			</button>
		</div>
	{:else if table && schema && effectiveView}
		{#if showTitle}
			<header class="px-1">
				<input
					value={table.document.title}
					disabled={readonly}
					aria-label="Table name"
					class="w-full rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold text-foreground outline-none hover:border-border focus:border-accent focus:bg-background"
					onchange={(event) => {
						const title = event.currentTarget.value.trim();
						if (title && title !== table?.document.title)
							void controller.updateDocument({ title });
					}}
				/>
				{#if table.document.description}
					<p class="px-1 text-sm text-muted-foreground">{table.document.description}</p>
				{/if}
			</header>
		{/if}

		<TableToolbar
			bind:search={searchText}
			bind:searchInput
			{filterCount}
			hiddenCount={hidden.length}
			{mode}
			{modes}
			canUndo={controller.canUndo}
			saving={controller.saving}
			{readonly}
			{wide}
			exportHref={client.exportCsvUrl(documentId)}
			{exportName}
			canAsk={!!onAsk}
			onFilters={(anchor) => (popover = { kind: 'filters', anchor })}
			onHidden={(anchor) => (popover = { kind: 'hidden', anchor })}
			onMode={setMode}
			onUndo={() => void controller.undo()}
			onPasteRows={() => (pasteOpen = true)}
			onAsk={ask}
			onAddRow={addRowFromToolbar}
		/>

		{#if aiFill && aiFillColumn}
			{@const done = aiFill.filled + aiFill.failed}
			<div
				class="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm tx tx-bloom tx-weak"
				role="status"
				aria-live="polite"
			>
				<Sparkles
					class="h-4 w-4 shrink-0 text-accent {aiFillRunning
						? 'motion-safe:animate-pulse'
						: ''}"
				/>
				<div class="min-w-0 flex-1">
					<p class="truncate text-foreground">
						{#if aiFillRunning}
							Filling <span class="font-semibold">{aiFillColumn.name}</span> · {done} of
							{aiFill.total}
						{:else if aiFill.status === 'done'}
							Filled <span class="font-semibold">{aiFill.filled}</span> of {aiFill.total}
							in {aiFillColumn.name}{aiFill.failed
								? ` · ${aiFill.failed} couldn't be found`
								: ''}
						{:else}
							The fill stopped · {aiFill.filled} of {aiFill.total} filled
						{/if}
					</p>
					<div class="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
						<div
							class="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
							style:width="{aiFill.total
								? Math.round((done / aiFill.total) * 100)
								: 0}%"
						></div>
					</div>
				</div>
				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Hide fill progress"
					onclick={() => controller.dismissAiFill()}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{:else if controller.pendingAiCells > 0}
			<p class="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status">
				<Sparkles class="h-3.5 w-3.5 text-accent motion-safe:animate-pulse" />
				Finding answers for {controller.pendingAiCells}
				{controller.pendingAiCells === 1 ? 'cell' : 'cells'}…
			</p>
		{/if}

		<div
			class="workspace-body min-h-0 flex-1 {mode === 'grid'
				? 'overflow-clip rounded-lg border border-border bg-background shadow-ink'
				: ''}"
		>
			{#if mode === 'grid'}
				{#if columns.length === 0}
					<div class="grid h-full place-items-center p-8 text-center">
						<div class="grid place-items-center gap-3">
							<p class="text-sm text-muted-foreground">
								{schema.columns.length
									? 'Every column is hidden.'
									: 'This table has no columns yet.'}
							</p>
							{#if !readonly}
								<button
									type="button"
									class="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground tx-button tx-button-accent"
									onclick={(event) =>
										schema.columns.length
											? changeColumns(
													hidden.map((column) => ({
														action: 'update',
														column: column.id,
														hidden: false
													}))
												)
											: (popover = {
													kind: 'addColumn',
													anchor: event.currentTarget,
													presetType: null
												})}
								>
									{#if schema.columns.length}<Eye class="h-4 w-4" /> Show all columns{:else}<Plus
											class="h-4 w-4"
										/> Add a column{/if}
								</button>
							{/if}
						</div>
					</div>
				{:else}
					<TableGrid
						bind:this={grid}
						{columns}
						{rows}
						sort={effectiveView.sort}
						{footer}
						{readonly}
						{projectId}
						flashKeys={controller.flashKeys}
						rowTasks={controller.rowTasks}
						{coerce}
						label={table.document.title}
						resolveRowId={(id) => controller.resolveRowId(id)}
						onSort={(columnId, additive) =>
							setSort(cycleSort(effectiveView.sort, columnId, additive))}
						onEdit={editCells}
						onPaste={handlePaste}
						onNewChoices={addChoices}
						onColumnMenu={(column, anchor) =>
							(popover = {
								kind: 'column',
								columnId: column.id,
								anchor,
								initialView: 'main'
							})}
						onAddColumn={(anchor) =>
							(popover = { kind: 'addColumn', anchor, presetType: null })}
						onAddRow={() => addRow()}
						onRowMenu={(row, anchor, rowIds) =>
							(popover = { kind: 'row', rowId: row.id, rowIds, anchor })}
						onOpenRow={(row) => (detailRowId = row.id)}
						onProvenance={(row, column, anchor) =>
							(popover = {
								kind: 'provenance',
								rowId: row.id,
								columnId: column.id,
								anchor
							})}
						onResizeColumn={(columnId, width) =>
							changeColumns([{ action: 'update', column: columnId, width }])}
						onInvalid={(message) => notify.warning(message)}
						onUndo={() => void controller.undo()}
					>
						{#snippet empty()}
							<div class="grid gap-3 text-left">
								{#if filtered}
									<p class="text-sm text-foreground">No rows match.</p>
									<button
										type="button"
										class="w-max min-h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:border-accent"
										onclick={clearFilters}
									>
										Clear search and filters
									</button>
								{:else}
									<p class="text-sm font-medium text-foreground">
										Nothing here yet.
									</p>
									<p class="text-sm text-muted-foreground">
										Add a row, or paste cells straight from Google Sheets or
										Excel.
									</p>
									{#if !readonly}
										<div class="flex flex-wrap gap-2">
											<button
												type="button"
												class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground tx-button tx-button-accent"
												onclick={addRowFromToolbar}
											>
												<Plus class="h-4 w-4" /> New row
											</button>
											<button
												type="button"
												class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:border-accent"
												onclick={() => (pasteOpen = true)}
											>
												<ClipboardPaste class="h-4 w-4" /> Paste rows
											</button>
										</div>
									{/if}
								{/if}
							</div>
						{/snippet}
					</TableGrid>
				{/if}
			{:else if mode === 'board'}
				<TableBoard
					{schema}
					{columns}
					{rows}
					{boardColumn}
					candidates={boardCandidates}
					{readonly}
					{projectId}
					onMove={(row, value) =>
						boardColumn &&
						editCells([{ rowId: row.id, columnId: boardColumn.id, value }])}
					onOpenRow={(row) => (detailRowId = row.id)}
					onAddCard={(value) => {
						const tempId = addRow(
							boardColumn && value ? { [boardColumn.id]: value } : {}
						);
						if (tempId) detailRowId = tempId;
					}}
					onBoardColumnChange={(columnId) => patchView({ boardColumnId: columnId })}
					onCreateChoiceColumn={(anchor) =>
						(popover = { kind: 'addColumn', anchor, presetType: 'select' })}
				/>
			{:else}
				<TableRecordCards
					{schema}
					{columns}
					{rows}
					{readonly}
					{projectId}
					onOpenRow={(row) => (detailRowId = row.id)}
					onAddRow={addRowFromToolbar}
				/>
			{/if}
		</div>
	{/if}
</section>

{#if popover && table && schema && effectiveView}
	{#key popover}
		{#if popover.kind === 'column'}
			{@const column = columnById(popover.columnId)}
			{#if column}
				<TablePopover
					anchor={popover.anchor}
					label={`${column.name} column`}
					width="w-80"
					onClose={closePopover}
				>
					<TableColumnMenu
						{column}
						isPrimary={column.id === primaryId}
						rowCount={table.rows.length}
						emptyCount={emptyCountFor(column.id)}
						{readonly}
						initialView={popover.initialView}
						{aiFillRunning}
						onChange={changeColumns}
						onRenameChoice={(from, to) => renameChoice(column, from, to)}
						onSort={(direction) => setSort([{ column: column.id, direction }])}
						onSetPrimary={() =>
							void controller.updateDocument({ primary_column_id: column.id })}
						onFill={({ onlyEmpty }) => fillColumn(column.id, onlyEmpty)}
						onClose={closePopover}
					/>
				</TablePopover>
			{/if}
		{:else if popover.kind === 'addColumn'}
			<TablePopover
				anchor={popover.anchor}
				label="Add a column"
				width="w-80"
				placement="below-end"
				onClose={closePopover}
			>
				<TableAddColumn
					existingNames={schema.columns.map((column) => column.name)}
					rowCount={table.rows.length}
					presetType={popover.presetType}
					onAdd={(input, opts) => void addColumn(input, opts)}
					onClose={closePopover}
				/>
			</TablePopover>
		{:else if popover.kind === 'filters'}
			<TablePopover
				anchor={popover.anchor}
				label="Filter and sort"
				width="w-[34rem]"
				onClose={closePopover}
			>
				<TableFilterPanel
					columns={schema.columns}
					filters={effectiveView.filters}
					match={effectiveView.match}
					sort={effectiveView.sort}
					onChange={(next: {
						filters?: TableFilter[];
						match?: 'all' | 'any';
						sort?: TableSort[];
					}) => patchView(next)}
					onClose={closePopover}
				/>
			</TablePopover>
		{:else if popover.kind === 'hidden'}
			<TablePopover
				anchor={popover.anchor}
				label="Hidden columns"
				width="w-64"
				onClose={closePopover}
			>
				<div class="grid gap-0.5 p-1.5">
					<p class="micro-label px-2 pb-1 pt-1.5 text-muted-foreground">Hidden columns</p>
					{#each hidden as column (column.id)}
						<button
							type="button"
							class="flex min-h-11 items-center justify-between gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
							disabled={readonly}
							onclick={() =>
								changeColumns([
									{ action: 'update', column: column.id, hidden: false }
								])}
						>
							<span class="truncate">{column.name}</span>
							<span class="flex items-center gap-1 text-xs text-muted-foreground"
								><Eye class="h-3.5 w-3.5" /> Show</span
							>
						</button>
					{/each}
					{#if hidden.length > 1 && !readonly}
						<button
							type="button"
							class="mt-1 min-h-9 rounded-md border-t border-border px-2.5 text-left text-sm font-medium text-accent hover:bg-accent/10"
							onclick={() => {
								changeColumns(
									hidden.map((column) => ({
										action: 'update',
										column: column.id,
										hidden: false
									}))
								);
								closePopover();
							}}
						>
							Show all
						</button>
					{/if}
				</div>
			</TablePopover>
		{:else if popover.kind === 'row'}
			{@const row = findRow(popover.rowId)}
			{@const menuRowIds = popover.rowIds}
			{@const many = menuRowIds.length > 1}
			{#if row}
				<TablePopover
					anchor={popover.anchor}
					label={`Row ${row.row_number} options`}
					width="w-60"
					onClose={closePopover}
				>
					<div class="grid gap-0.5 p-1.5" role="menu">
						<button
							type="button"
							role="menuitem"
							class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
							onclick={() => {
								detailRowId = row.id;
								closePopover();
							}}
						>
							<Maximize2 class="h-4 w-4 text-muted-foreground" />
							Open row
						</button>
						{#if !readonly}
							<button
								type="button"
								role="menuitem"
								class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
								onclick={() => {
									closePopover();
									void makeTask(row.id);
								}}
							>
								<ListChecks class="h-4 w-4 text-muted-foreground" />
								Make a task
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
								onclick={() => {
									closePopover();
									const tempId = controller.insertRow({}, row.id);
									if (tempId && mode === 'grid')
										requestAnimationFrame(() => grid?.focusRow(tempId));
								}}
							>
								<Plus class="h-4 w-4 text-muted-foreground" />
								Insert row below
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-destructive/10 hover:text-destructive sm:min-h-9"
								onclick={() => {
									closePopover();
									deleteRows(many ? menuRowIds : [row.id]);
								}}
							>
								<Trash2 class="h-4 w-4" />
								{many ? `Delete ${menuRowIds.length} rows` : 'Delete row'}
							</button>
						{/if}
					</div>
				</TablePopover>
			{/if}
		{:else if popover.kind === 'provenance'}
			{@const row = findRow(popover.rowId)}
			{@const column = columnById(popover.columnId)}
			{@const meta = row && column ? row.cell_meta?.[column.id] : null}
			{#if row && column && meta}
				<TablePopover
					anchor={popover.anchor}
					label={`Where ${column.name} came from`}
					width="w-80"
					onClose={closePopover}
				>
					<TableProvenance
						{column}
						{row}
						{meta}
						{projectId}
						{readonly}
						onAskAgain={column.ai
							? () => {
									closePopover();
									fillColumn(column.id, false, [row.id]);
								}
							: undefined}
						onClear={() => {
							closePopover();
							editCells([{ rowId: row.id, columnId: column.id, value: null }]);
						}}
						onClose={closePopover}
					/>
				</TablePopover>
			{/if}
		{/if}
	{/key}
{/if}

{#if detailRow && schema}
	<TableRowDetail
		{schema}
		row={detailRow}
		{projectId}
		tasks={controller.rowTasks[detailRow.id] ?? []}
		{readonly}
		{coerce}
		position={detailPosition}
		onEdit={(columnId, value) => editCells([{ rowId: detailRow.id, columnId, value }])}
		onMakeTask={() => void makeTask(detailRow.id)}
		onDelete={() => {
			const id = detailRow.id;
			detailRowId = null;
			deleteRows([id]);
		}}
		onAskAgain={(column) => fillColumn(column.id, false, [detailRow.id])}
		onStep={stepDetail}
		onInvalid={(message) => notify.warning(message)}
		onClose={closeDetail}
	/>
{/if}

{#if pasteOpen && schema}
	<TablePasteRowsDialog {schema} onImport={importRows} onClose={() => (pasteOpen = false)} />
{/if}

<style>
	.workspace-page {
		height: clamp(28rem, calc(100dvh - 11rem), 64rem);
	}
	.table-workspace[data-layout='sheet'] {
		height: 100%;
	}
</style>
