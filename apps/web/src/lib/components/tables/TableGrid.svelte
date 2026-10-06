<!-- apps/web/src/lib/components/tables/TableGrid.svelte -->
<!--
	The grid engine behind TableWorkspace (swappable: the workspace only talks to
	these props). One bounded scroll container owns both axes, so the sticky
	header, totals footer, row-number gutter and pinned first column work no
	matter what the page's overflow does. Rows are virtualized; focus stays on
	the grid (aria-activedescendant) so keyboard movement survives virtualization.

	Keys: arrows / Home / End / PgUp / PgDn move (Shift extends, Ctrl/⌘ jumps),
	Enter or typing edits, Delete clears, ⌘C/⌘X/⌘V copy-cut-paste (Sheets/Excel
	compatible), ⌘D fills down, ⌘A selects all, ⌘Enter opens the row, ⌘Z undoes.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import type {
		TableCellValue,
		TableColumn,
		TableRow,
		TableRowTask,
		TableSort
	} from '@buildos/shared-agent-ops/tables';
	import {
		ArrowDown,
		ArrowUp,
		ChevronDown,
		ListChecks,
		Maximize2,
		MoreHorizontal,
		Plus,
		Sparkles
	} from '$lib/icons/lucide';
	import TableCellView from './TableCellView.svelte';
	import TableCellEditor, { type EditorMove } from './TableCellEditor.svelte';
	import TableColumnTypeIcon from './TableColumnTypeIcon.svelte';
	import { defaultColumnWidth, formatCellDisplay, isEditableColumn } from './table-cell-format';
	import {
		buildClear,
		buildFillDown,
		buildPasteChanges,
		clampPos,
		isPrintableKey,
		navigate,
		rangeCellCount,
		rangeContains,
		rangeToTsv,
		scrollLeftForColumn,
		scrollTopForRow,
		selectionRange,
		splitClipboardText,
		tabMove,
		virtualWindow,
		type CellPos,
		type CoerceCell,
		type GridSelection,
		type PasteChanges
	} from './table-grid-model';
	import { ariaSortFor, cellKey, type CellEdit, type FooterCell } from './table-view-model';

	let {
		columns,
		rows,
		sort,
		footer,
		readonly = false,
		projectId,
		flashKeys,
		rowTasks = {},
		coerce,
		label = 'Table',
		resolveRowId = (id: string) => id,
		onSort,
		onEdit,
		onPaste,
		onNewChoices,
		onColumnMenu,
		onAddColumn,
		onAddRow,
		onRowMenu,
		onOpenRow,
		onProvenance,
		onResizeColumn,
		onInvalid,
		onUndo,
		empty
	}: {
		/** Visible columns, primary first (it pins at the left on wide screens). */
		columns: TableColumn[];
		/** Rows after filter + sort. */
		rows: TableRow[];
		sort: TableSort[];
		footer: Record<string, FooterCell>;
		readonly?: boolean;
		projectId: string;
		flashKeys: ReadonlySet<string>;
		/** Tasks made from rows, by row id: the gutter marks rows that have any. */
		rowTasks?: Record<string, TableRowTask[]>;
		coerce: CoerceCell;
		label?: string;
		resolveRowId?: (id: string) => string;
		onSort: (columnId: string, additive: boolean) => void;
		onEdit: (edits: CellEdit[], opts?: { undoToast?: string }) => void;
		onPaste: (changes: PasteChanges) => void;
		onNewChoices: (columnId: string, values: string[]) => void;
		onColumnMenu: (column: TableColumn, anchor: HTMLElement | DOMRect) => void;
		onAddColumn: (anchor: HTMLElement) => void;
		onAddRow: () => string | null;
		/** `rowIds`: every row in the selection when the clicked row is part of it. */
		onRowMenu: (row: TableRow, anchor: HTMLElement | DOMRect, rowIds: string[]) => void;
		onOpenRow: (row: TableRow) => void;
		onProvenance: (row: TableRow, column: TableColumn, anchor: HTMLElement) => void;
		onResizeColumn: (columnId: string, width: number) => void;
		onInvalid: (message: string) => void;
		onUndo: () => void;
		empty?: Snippet;
	} = $props();

	const gridId = $props.id();
	const ROW_H = 36;
	const HEAD_H = 38;
	const FOOT_H = 34;
	const GUTTER = 64;
	const ADD_W = 48;

	let scroller = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);
	let viewportHeight = $state(480);
	let viewportWidth = $state(960);

	/** Selection by row/column id so it survives sorting, filtering and inserts. */
	let sel = $state<{
		anchorRow: string;
		anchorCol: string;
		focusRow: string;
		focusCol: string;
	} | null>(null);
	let editing = $state<{ rowId: string; colId: string; initialText: string | null } | null>(null);
	let editRect = $state<DOMRect | null>(null);
	let dragging = $state(false);
	let liveWidths = $state<Record<string, number>>({});

	const rowIndex = $derived(new Map(rows.map((row, index) => [row.id, index])));
	const colIndex = $derived(new Map(columns.map((column, index) => [column.id, index])));
	const pinPrimary = $derived(columns.length > 1 && viewportWidth >= 640);
	const widths = $derived(
		columns.map((column, index) => {
			const live = liveWidths[column.id];
			const base = live ?? defaultColumnWidth(column);
			return index === 0 ? Math.max(base, 160) : base;
		})
	);
	const template = $derived(
		`${GUTTER}px ${widths.map((width) => `${width}px`).join(' ')} minmax(${ADD_W}px, 1fr)`
	);
	const canvasWidth = $derived(GUTTER + widths.reduce((sum, width) => sum + width, 0) + ADD_W);
	const bodyViewport = $derived(Math.max(ROW_H, viewportHeight - HEAD_H - FOOT_H));
	const win = $derived(
		virtualWindow({
			scrollTop,
			viewportHeight: bodyViewport,
			rowHeight: ROW_H,
			rowCount: rows.length,
			overscan: 10
		})
	);
	const windowRows = $derived(rows.slice(win.start, win.end));

	function indexOfRow(id: string): number | undefined {
		return rowIndex.get(id) ?? rowIndex.get(resolveRowId(id));
	}

	const selection = $derived.by<GridSelection | null>(() => {
		if (!sel) return null;
		const focusRow = indexOfRow(sel.focusRow);
		const focusCol = colIndex.get(sel.focusCol);
		if (focusRow === undefined || focusCol === undefined) return null;
		const anchorRow = indexOfRow(sel.anchorRow) ?? focusRow;
		const anchorCol = colIndex.get(sel.anchorCol) ?? focusCol;
		return {
			anchor: { row: anchorRow, col: anchorCol },
			focus: { row: focusRow, col: focusCol }
		};
	});
	const range = $derived(selection ? selectionRange(selection) : null);
	const active = $derived(selection?.focus ?? null);
	const activeId = $derived(
		active && active.row >= win.start && active.row < win.end
			? cellDomId(active.row, active.col)
			: undefined
	);

	function cellDomId(row: number, col: number) {
		return `${gridId}-r${row}-c${col}`;
	}

	function setSelection(anchor: CellPos, focus: CellPos = anchor) {
		const a = clampPos(anchor, rows.length, columns.length);
		const f = clampPos(focus, rows.length, columns.length);
		const aRow = rows[a.row];
		const fRow = rows[f.row];
		const aCol = columns[a.col];
		const fCol = columns[f.col];
		if (!aRow || !fRow || !aCol || !fCol) {
			sel = null;
			return;
		}
		sel = { anchorRow: aRow.id, anchorCol: aCol.id, focusRow: fRow.id, focusCol: fCol.id };
	}

	function scrollIntoView(pos: CellPos) {
		if (!scroller) return;
		const top = scrollTopForRow({
			row: pos.row,
			rowHeight: ROW_H,
			scrollTop: scroller.scrollTop,
			viewportHeight: scroller.clientHeight,
			headerHeight: HEAD_H,
			footerHeight: FOOT_H
		});
		if (top !== null) scroller.scrollTop = top;
		const left = scrollLeftForColumn({
			col: pos.col + 1,
			widths: [GUTTER, ...widths],
			pinnedWidth: GUTTER + (pinPrimary ? (widths[0] ?? 0) : 0),
			pinnedCount: pinPrimary ? 2 : 1,
			scrollLeft: scroller.scrollLeft,
			viewportWidth: scroller.clientWidth
		});
		if (left !== null) scroller.scrollLeft = left;
	}

	function moveTo(pos: CellPos, extend = false) {
		if (extend && selection) setSelection(selection.anchor, pos);
		else setSelection(pos);
		scrollIntoView(pos);
	}

	function focusGrid() {
		scroller?.focus({ preventScroll: true });
	}

	function handleScroll() {
		if (!scroller) return;
		scrollTop = scroller.scrollTop;
		if (editing) measureEditCell();
	}

	function handleFocus() {
		if (!sel && rows.length && columns.length) setSelection({ row: 0, col: 0 });
	}

	// -------------------------------------------------------------------------
	// Editing
	// -------------------------------------------------------------------------

	function measureEditCell() {
		if (!editing) return;
		const row = indexOfRow(editing.rowId);
		const col = colIndex.get(editing.colId);
		const element =
			row !== undefined && col !== undefined
				? document.getElementById(cellDomId(row, col))
				: null;
		// Scrolled out of the rendered window: keep the editor where it was so typing isn't lost.
		if (!element) return;
		editRect = element.getBoundingClientRect();
	}

	async function startEdit(initialText: string | null = null) {
		if (readonly || !active) return;
		const row = rows[active.row];
		const column = columns[active.col];
		if (!row || !column || !isEditableColumn(column)) return;
		if (column.type === 'checkbox') {
			toggleCheckbox(row, column);
			return;
		}
		scrollIntoView(active);
		editing = {
			rowId: row.id,
			colId: column.id,
			initialText: column.type === 'date' ? null : initialText
		};
		await tick();
		measureEditCell();
	}

	function toggleCheckbox(row: TableRow, column: TableColumn) {
		if (readonly) return;
		onEdit([{ rowId: row.id, columnId: column.id, value: row.cells[column.id] !== true }]);
	}

	function commitEdit(value: TableCellValue, move: EditorMove, newChoices?: string[]) {
		const current = editing;
		editing = null;
		editRect = null;
		if (!current) return;
		const rowId = resolveRowId(current.rowId);
		const row = rows.find(
			(candidate) => candidate.id === rowId || candidate.id === current.rowId
		);
		if (row) {
			if (newChoices?.length) onNewChoices(current.colId, newChoices);
			const before = row.cells[current.colId] ?? null;
			if (JSON.stringify(before) !== JSON.stringify(value ?? null)) {
				onEdit([{ rowId: row.id, columnId: current.colId, value }]);
			}
		}
		afterEdit(move);
	}

	function cancelEdit() {
		editing = null;
		editRect = null;
		afterEdit('none');
	}

	function afterEdit(move: EditorMove) {
		if (active && move !== 'none') {
			let next: CellPos = active;
			if (move === 'down')
				next = { row: Math.min(active.row + 1, rows.length - 1), col: active.col };
			if (move === 'up') next = { row: Math.max(active.row - 1, 0), col: active.col };
			if (move === 'right' || move === 'left')
				next = tabMove(active, move === 'left', rows.length, columns.length);
			moveTo(next);
		}
		// Back to the grid unless the user deliberately clicked somewhere else
		// (search box, toolbar). The editor itself is unmounting, so focus inside it counts as lost.
		const focused = document.activeElement as HTMLElement | null;
		const lost =
			!focused || focused === document.body || !!focused.closest('.table-cell-editor');
		if (move !== 'none' || lost) focusGrid();
	}

	// -------------------------------------------------------------------------
	// Keyboard
	// -------------------------------------------------------------------------

	function handleKeydown(event: KeyboardEvent) {
		if (editing || event.target !== scroller) return;
		const mod = event.metaKey || event.ctrlKey;
		if (!rows.length || !columns.length) {
			if (event.key === 'Enter' && !readonly) {
				event.preventDefault();
				addRow();
			}
			return;
		}
		if (!active) {
			if (event.key.startsWith('Arrow') || event.key === 'Enter') {
				event.preventDefault();
				setSelection({ row: 0, col: 0 });
			}
			return;
		}
		const pageRows = Math.max(1, Math.floor(bodyViewport / ROW_H) - 1);
		const nav = navigate(active, event.key, {
			rowCount: rows.length,
			colCount: columns.length,
			jump: mod,
			pageRows
		});
		if (nav) {
			event.preventDefault();
			moveTo(nav, event.shiftKey);
			return;
		}
		if (event.key === 'Tab') {
			const next = tabMove(active, event.shiftKey, rows.length, columns.length);
			if (next.row === active.row && next.col === active.col) return; // leave the grid
			event.preventDefault();
			moveTo(next);
			return;
		}
		if (mod && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			setSelection({ row: 0, col: 0 }, { row: rows.length - 1, col: columns.length - 1 });
			return;
		}
		if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
			event.preventDefault();
			onUndo();
			return;
		}
		if (mod && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			if (readonly || !selection) return;
			const edits = buildFillDown(selection, rows, columns);
			if (edits.length) onEdit(edits, { undoToast: `Filled ${edits.length} cells` });
			return;
		}
		if (mod && event.key === 'Enter') {
			event.preventDefault();
			const row = rows[active.row];
			if (row) onOpenRow(row);
			return;
		}
		if (event.key === 'Enter' || event.key === 'F2') {
			event.preventDefault();
			void startEdit(null);
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			if (readonly || !selection) return;
			const edits = buildClear(selection, rows, columns);
			if (edits.length) {
				onEdit(
					edits,
					edits.length > 1 ? { undoToast: `Cleared ${edits.length} cells` } : {}
				);
			}
			return;
		}
		if (event.key === 'Escape') {
			if (selection && range && rangeCellCount(range) > 1) {
				event.preventDefault();
				setSelection(active);
			}
			return;
		}
		if (event.key === ' ') {
			const column = columns[active.col];
			const row = rows[active.row];
			if (column?.type === 'checkbox' && row) {
				event.preventDefault();
				toggleCheckbox(row, column);
				return;
			}
		}
		if (isPrintableKey(event) && !readonly) {
			const column = columns[active.col];
			if (!column || !isEditableColumn(column) || column.type === 'checkbox') return;
			event.preventDefault();
			void startEdit(event.key);
		}
	}

	// -------------------------------------------------------------------------
	// Clipboard
	// -------------------------------------------------------------------------

	function handleCopy(event: ClipboardEvent) {
		if (editing || !selection || !event.clipboardData) return;
		event.preventDefault();
		event.clipboardData.setData('text/plain', rangeToTsv(selection, rows, columns));
	}

	function handleCut(event: ClipboardEvent) {
		handleCopy(event);
		if (readonly || !selection) return;
		const edits = buildClear(selection, rows, columns);
		if (edits.length) onEdit(edits, { undoToast: `Cut ${edits.length} cells` });
	}

	function handlePaste(event: ClipboardEvent) {
		if (editing || readonly || !event.clipboardData) return;
		const text = event.clipboardData.getData('text/plain');
		if (!text) return;
		event.preventDefault();
		const target: GridSelection = selection ?? {
			anchor: { row: rows.length, col: 0 },
			focus: { row: rows.length, col: 0 }
		};
		const block = splitClipboardText(text);
		const changes = buildPasteChanges({ block, selection: target, rows, columns, coerce });
		onPaste(changes);
		if (selection && rows.length) {
			const r = selectionRange(selection);
			const height =
				block.length === 1 && block[0]!.length === 1 ? r.bottom - r.top : block.length - 1;
			const widthCells =
				block.length === 1 && block[0]!.length === 1
					? r.right - r.left
					: Math.max(...block.map((line) => line.length)) - 1;
			setSelection(
				{ row: r.top, col: r.left },
				{
					row: Math.min(r.top + height, rows.length - 1),
					col: Math.min(r.left + widthCells, columns.length - 1)
				}
			);
		}
	}

	// -------------------------------------------------------------------------
	// Pointer
	// -------------------------------------------------------------------------

	function handleCellPointerDown(event: PointerEvent, row: number, col: number) {
		if (event.button !== 0) return;
		const pos = { row, col };
		const wasActive =
			active &&
			active.row === row &&
			active.col === col &&
			range &&
			rangeCellCount(range) === 1;
		if (event.shiftKey && selection) {
			setSelection(selection.anchor, pos);
		} else {
			setSelection(pos);
			dragging = true;
		}
		focusGrid();
		event.preventDefault();
		if (wasActive && event.pointerType !== 'mouse') void startEdit(null);
	}

	function handleCellPointerEnter(row: number, col: number) {
		if (!dragging || !selection) return;
		setSelection(selection.anchor, { row, col });
	}

	function selectedRowIdsFor(rowPos: number): string[] {
		if (!range || rowPos < range.top || rowPos > range.bottom) return [];
		return rows.slice(range.top, range.bottom + 1).map((row) => row.id);
	}

	function openRowMenu(row: TableRow, rowPos: number, anchor: HTMLElement | DOMRect) {
		const ids = selectedRowIdsFor(rowPos);
		onRowMenu(row, anchor, ids.length ? ids : [row.id]);
	}

	function handleCellContextMenu(event: MouseEvent, row: TableRow, rowPos: number, col: number) {
		event.preventDefault();
		if (!range || !rangeContains(range, rowPos, col)) setSelection({ row: rowPos, col });
		openRowMenu(row, rowPos, new DOMRect(event.clientX, event.clientY, 0, 0));
	}

	function stopDragging() {
		dragging = false;
	}

	// -------------------------------------------------------------------------
	// Column resize
	// -------------------------------------------------------------------------

	let resize: { columnId: string; startX: number; startWidth: number } | null = null;

	function startResize(event: PointerEvent, column: TableColumn, index: number) {
		if (readonly) return;
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		resize = { columnId: column.id, startX: event.clientX, startWidth: widths[index] ?? 160 };
	}

	function moveResize(event: PointerEvent) {
		if (!resize) return;
		const width = Math.round(
			Math.min(640, Math.max(72, resize.startWidth + event.clientX - resize.startX))
		);
		liveWidths = { ...liveWidths, [resize.columnId]: width };
	}

	function endResize() {
		if (!resize) return;
		const { columnId, startWidth } = resize;
		resize = null;
		const width = liveWidths[columnId];
		if (width && width !== startWidth) onResizeColumn(columnId, width);
	}

	function resetWidth(column: TableColumn) {
		if (readonly) return;
		const { [column.id]: _drop, ...rest } = liveWidths;
		liveWidths = rest;
		onResizeColumn(column.id, defaultColumnWidth({ type: column.type }));
	}

	// -------------------------------------------------------------------------
	// Rows
	// -------------------------------------------------------------------------

	async function addRow() {
		const tempId = onAddRow();
		if (!tempId || !columns[0]) return;
		await tick();
		const index = indexOfRow(tempId);
		if (index === undefined) return;
		sel = {
			anchorRow: tempId,
			anchorCol: columns[0].id,
			focusRow: tempId,
			focusCol: columns[0].id
		};
		scrollIntoView({ row: index, col: 0 });
		focusGrid();
		await tick();
		void startEdit(null);
	}

	/** Lets the workspace move focus to a row (e.g. after the row detail closes). */
	export function focusRow(rowId: string) {
		const index = indexOfRow(rowId);
		if (index === undefined || !columns[0]) return;
		setSelection({ row: index, col: active?.col ?? 0 });
		scrollIntoView({ row: index, col: active?.col ?? 0 });
		focusGrid();
	}

	function editingColumn(): TableColumn | undefined {
		return editing ? columns.find((column) => column.id === editing!.colId) : undefined;
	}

	function editingRow(): TableRow | undefined {
		if (!editing) return undefined;
		const id = resolveRowId(editing.rowId);
		return rows.find((row) => row.id === id || row.id === editing!.rowId);
	}

	function cellAriaLabel(column: TableColumn, row: TableRow): string | undefined {
		const meta = row.cell_meta?.[column.id];
		const text = formatCellDisplay(column, row.cells[column.id]);
		if (!meta || meta.by === 'import') return undefined;
		const tag =
			meta.state === 'pending'
				? 'finding an answer'
				: meta.state === 'error'
					? 'fill failed'
					: 'AI-filled';
		return `${text || 'Empty'}, ${tag}`;
	}
</script>

<svelte:window onpointerup={stopDragging} onpointercancel={stopDragging} />

<div
	bind:this={scroller}
	bind:clientHeight={viewportHeight}
	bind:clientWidth={viewportWidth}
	class="grid-scroller relative h-full min-h-0 w-full overflow-auto bg-background focus-visible:outline-none"
	role="grid"
	tabindex="0"
	aria-label={label}
	aria-rowcount={rows.length + 2}
	aria-colcount={columns.length + 1}
	aria-multiselectable="true"
	aria-readonly={readonly ? 'true' : undefined}
	aria-activedescendant={activeId}
	onscroll={handleScroll}
	onfocus={handleFocus}
	onkeydown={handleKeydown}
	oncopy={handleCopy}
	oncut={handleCut}
	onpaste={handlePaste}
	style:--grid-cols={template}
	style:--row-h="{ROW_H}px"
	style:--head-h="{HEAD_H}px"
	style:--foot-h="{FOOT_H}px"
	style:--gutter="{GUTTER}px"
>
	<div class="grid-canvas" style:width="max({canvasWidth}px, 100%)">
		<!-- Header -->
		<div role="rowgroup" class="grid-head">
			<div role="row" aria-rowindex={1} class="grid-row head-row">
				<div role="columnheader" aria-colindex={1} class="cell gutter pinned-0 head-cell">
					<span class="sr-only">Row</span>
					<span class="micro-label text-muted-foreground" aria-hidden="true">#</span>
				</div>
				{#each columns as column, ci (column.id)}
					{@const sortState = ariaSortFor(sort, column.id)}
					<div
						role="columnheader"
						tabindex="-1"
						aria-colindex={ci + 2}
						aria-sort={sortState}
						class="cell head-cell group/head {ci === 0 && pinPrimary ? 'pinned-1' : ''}"
						oncontextmenu={(event) => {
							event.preventDefault();
							onColumnMenu(column, new DOMRect(event.clientX, event.clientY, 0, 0));
						}}
					>
						<button
							type="button"
							class="head-label flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							title={column.description
								? `${column.name} — ${column.description}`
								: `Sort by ${column.name}`}
							onclick={(event) => onSort(column.id, event.shiftKey)}
						>
							<span class="shrink-0 text-muted-foreground/80"
								><TableColumnTypeIcon {column} /></span
							>
							<span class="truncate text-foreground/90">{column.name}</span>
							{#if column.ai}
								<Sparkles
									class="h-3 w-3 shrink-0 text-accent"
									aria-label="Question column"
								/>
							{/if}
							{#if sortState === 'ascending'}
								<ArrowUp class="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
							{:else if sortState === 'descending'}
								<ArrowDown
									class="h-3 w-3 shrink-0 text-accent"
									aria-hidden="true"
								/>
							{/if}
						</button>
						<button
							type="button"
							class="menu-btn shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={`${column.name} column options`}
							aria-haspopup="dialog"
							onclick={(event) => onColumnMenu(column, event.currentTarget)}
						>
							<ChevronDown class="h-3.5 w-3.5" />
						</button>
						{#if !readonly}
							<span
								class="resize-handle"
								role="separator"
								aria-orientation="vertical"
								aria-label={`Resize ${column.name}`}
								onpointerdown={(event) => startResize(event, column, ci)}
								onpointermove={moveResize}
								onpointerup={endResize}
								onpointercancel={endResize}
								ondblclick={() => resetWidth(column)}
							></span>
						{/if}
					</div>
				{/each}
				<div class="cell head-cell add-col" role="presentation">
					{#if !readonly}
						<button
							type="button"
							class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Add column"
							title="Add column"
							onclick={(event) => onAddColumn(event.currentTarget)}
						>
							<Plus class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Body -->
		<div role="rowgroup" class="grid-body">
			{#if rows.length === 0}
				<div class="empty-row" role="presentation">
					{#if empty}{@render empty()}{/if}
				</div>
			{:else}
				<div style:height="{win.padTop}px" role="presentation"></div>
				{#each windowRows as row, wi (row.id)}
					{@const ri = win.start + wi}
					{@const rowActive = active?.row === ri}
					{@const taskCount = rowTasks[row.id]?.length ?? 0}
					<div
						role="row"
						aria-rowindex={ri + 2}
						class="grid-row body-row group/row {rowActive ? 'row-active' : ''}"
					>
						<div role="rowheader" aria-colindex={1} class="cell gutter pinned-0">
							<span
								class="row-num stamp inline-flex items-center gap-1 text-2xs text-muted-foreground"
								>{row.row_number}{#if taskCount}<span
										class="inline-flex items-center gap-0.5 text-accent"
										><ListChecks
											class="h-3 w-3"
											aria-hidden="true"
										/>{#if taskCount > 1}{taskCount}{/if}</span
									><span class="sr-only"
										>, {taskCount} {taskCount === 1 ? 'task' : 'tasks'}</span
									>{/if}</span
							>
							<span class="row-actions">
								<button
									type="button"
									tabindex="-1"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label={`Open row ${row.row_number}`}
									title="Open row (⌘↵)"
									onclick={() => onOpenRow(row)}
								>
									<Maximize2 class="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									tabindex="-1"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label={`Row ${row.row_number} options`}
									onclick={(event) => openRowMenu(row, ri, event.currentTarget)}
								>
									<MoreHorizontal class="h-3.5 w-3.5" />
								</button>
							</span>
						</div>
						{#each columns as column, ci (column.id)}
							{@const inRange = !!range && rangeContains(range, ri, ci)}
							{@const isActive = rowActive && active?.col === ci}
							{@const meta = row.cell_meta?.[column.id] ?? null}
							<div
								role="gridcell"
								tabindex="-1"
								id={cellDomId(ri, ci)}
								aria-colindex={ci + 2}
								aria-selected={inRange}
								aria-readonly={readonly || !isEditableColumn(column)
									? 'true'
									: undefined}
								aria-label={cellAriaLabel(column, row)}
								data-active={isActive ? 'true' : undefined}
								class="table-cell cell body-cell {ci === 0 && pinPrimary
									? 'pinned-1'
									: ''} {inRange ? 'in-range' : ''} {isActive
									? 'is-active'
									: ''} {flashKeys.has(cellKey(row.id, column.id))
									? 'flash'
									: ''} {column.type === 'number' ? 'justify-end' : ''} {ci === 0
									? 'font-medium'
									: ''}"
								onpointerdown={(event) => handleCellPointerDown(event, ri, ci)}
								onpointerenter={() => handleCellPointerEnter(ri, ci)}
								ondblclick={() => {
									if (column.type !== 'checkbox') void startEdit(null);
								}}
								oncontextmenu={(event) => handleCellContextMenu(event, row, ri, ci)}
							>
								<TableCellView
									{column}
									value={row.cells[column.id]}
									{meta}
									{projectId}
									{readonly}
									onToggle={column.type === 'checkbox'
										? () => toggleCheckbox(row, column)
										: undefined}
									onProvenance={(anchor) => onProvenance(row, column, anchor)}
								/>
							</div>
						{/each}
						<div class="cell filler" role="presentation"></div>
					</div>
				{/each}
				<div style:height="{win.padBottom}px" role="presentation"></div>
			{/if}
			{#if !readonly && (rows.length > 0 || !empty)}
				<div class="add-row" role="presentation">
					<button
						type="button"
						class="add-row-btn inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => void addRow()}
					>
						<Plus class="h-4 w-4" />
						New row
					</button>
				</div>
			{/if}
		</div>

		<!-- Totals -->
		<div role="rowgroup" class="grid-foot">
			<div role="row" aria-rowindex={rows.length + 2} class="grid-row foot-row">
				<div role="rowheader" aria-colindex={1} class="cell gutter pinned-0 foot-cell">
					<span class="sr-only">Totals</span>
				</div>
				{#each columns as column, ci (column.id)}
					{@const cell = footer[column.id]}
					<div
						role="gridcell"
						aria-colindex={ci + 2}
						class="cell foot-cell {ci === 0 && pinPrimary
							? 'pinned-1'
							: ''} {column.type === 'number' ? 'justify-end' : ''}"
						title={cell?.title || undefined}
					>
						<span class="stamp truncate text-2xs text-muted-foreground"
							>{cell?.text ?? ''}</span
						>
					</div>
				{/each}
				<div class="cell foot-cell filler" role="presentation"></div>
			</div>
		</div>
	</div>
</div>

{#if editing && editRect}
	{@const column = editingColumn()}
	{@const row = editingRow()}
	{#if column && row}
		<TableCellEditor
			{column}
			value={row.cells[column.id]}
			initialText={editing.initialText}
			rect={editRect}
			{coerce}
			onCommit={commitEdit}
			onCancel={cancelEdit}
			{onInvalid}
		/>
	{/if}
{/if}

<style>
	.grid-scroller {
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		/* Whatever the host does with heights, the grid never grows past the screen:
		   it keeps its own scroll, so the sticky header and row virtualization hold. */
		max-height: var(--table-grid-max-height, calc(100dvh - 6rem));
	}
	.grid-scroller:focus-visible {
		box-shadow: inset 0 0 0 2px hsl(var(--ring) / 0.5);
	}
	.grid-canvas {
		min-width: 100%;
		position: relative;
	}
	.grid-row {
		display: grid;
		grid-template-columns: var(--grid-cols);
		width: 100%;
	}
	.cell {
		display: flex;
		align-items: center;
		min-width: 0;
		padding: 0 0.625rem;
		border-right: 1px solid hsl(var(--border) / 0.7);
		border-bottom: 1px solid hsl(var(--border) / 0.7);
		background-color: hsl(var(--background));
	}
	.grid-head {
		position: sticky;
		top: 0;
		z-index: 3;
	}
	.head-row {
		height: var(--head-h);
	}
	.head-cell {
		position: relative;
		gap: 0.125rem;
		padding: 0 0.25rem 0 0.375rem;
		background-color: hsl(var(--card));
		border-bottom-color: hsl(var(--border));
	}
	.head-cell .menu-btn {
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.head-cell:hover .menu-btn,
	.head-cell:focus-within .menu-btn {
		opacity: 1;
	}
	@media (hover: none) {
		.head-cell .menu-btn {
			opacity: 1;
		}
	}
	.resize-handle {
		position: absolute;
		top: 0;
		right: -4px;
		width: 8px;
		height: 100%;
		cursor: col-resize;
		z-index: 2;
		touch-action: none;
	}
	.resize-handle::after {
		content: '';
		position: absolute;
		top: 25%;
		bottom: 25%;
		left: 3px;
		width: 2px;
		border-radius: 1px;
		background: transparent;
		transition: background-color 120ms ease;
	}
	.resize-handle:hover::after {
		background: hsl(var(--accent));
	}
	.body-row {
		height: var(--row-h);
	}
	.body-cell {
		font-size: 0.875rem;
		line-height: 1.25rem;
		cursor: cell;
		user-select: none;
	}
	.body-row:hover .cell:not(.in-range) {
		background-color: hsl(var(--muted) / 0.45);
	}
	.body-row:hover .pinned-0,
	.body-row:hover .pinned-1:not(.in-range) {
		background-color: hsl(var(--muted));
	}
	/* Tint over an opaque base so pinned cells never show content scrolling beneath. */
	.in-range,
	.body-row:hover .cell.in-range {
		background: linear-gradient(hsl(var(--accent) / 0.1), hsl(var(--accent) / 0.1))
			hsl(var(--background));
	}
	.is-active {
		box-shadow: inset 0 0 0 2px hsl(var(--accent));
		position: relative;
		z-index: 1;
	}
	.pinned-0,
	.pinned-1 {
		position: sticky;
		z-index: 2;
	}
	.pinned-0 {
		left: 0;
	}
	.pinned-1 {
		left: var(--gutter);
		box-shadow: 1px 0 0 hsl(var(--border));
	}
	.pinned-1.is-active {
		box-shadow:
			inset 0 0 0 2px hsl(var(--accent)),
			1px 0 0 hsl(var(--border));
		z-index: 2;
	}
	.head-cell.pinned-0,
	.head-cell.pinned-1,
	.foot-cell.pinned-0,
	.foot-cell.pinned-1 {
		z-index: 4;
	}
	.gutter {
		justify-content: center;
		padding: 0 0.25rem;
		background-color: hsl(var(--card));
	}
	.row-actions {
		display: none;
		gap: 0.125rem;
	}
	.body-row:hover .row-num,
	.row-active .row-num {
		display: none;
	}
	.body-row:hover .row-actions,
	.row-active .row-actions {
		display: inline-flex;
	}
	@media (hover: none) {
		.row-num {
			display: none;
		}
		.row-actions {
			display: inline-flex;
		}
	}
	.row-active .gutter {
		box-shadow: inset 2px 0 0 hsl(var(--accent));
	}
	.filler {
		border-right: none;
	}
	.add-col {
		justify-content: flex-start;
		border-right: none;
	}
	.empty-row {
		position: sticky;
		left: 0;
		width: min(100%, 40rem);
		padding: 2.5rem 1.5rem;
	}
	.add-row {
		position: sticky;
		left: 0;
		display: flex;
		align-items: center;
		height: var(--row-h);
		padding-left: calc(var(--gutter) - 0.75rem);
		width: max-content;
	}
	.grid-foot {
		position: sticky;
		bottom: 0;
		z-index: 3;
	}
	.foot-row {
		height: var(--foot-h);
	}
	.foot-cell {
		background-color: hsl(var(--card));
		border-top: 1px solid hsl(var(--border));
		border-bottom: none;
	}
	.flash {
		animation: table-cell-flash 1.6s ease-out;
	}
	@keyframes table-cell-flash {
		0% {
			background-color: hsl(var(--accent) / 0.28);
		}
		100% {
			background-color: hsl(var(--background));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flash {
			animation: none;
			box-shadow: inset 0 0 0 1px hsl(var(--accent) / 0.5);
		}
		.head-cell .menu-btn,
		.resize-handle::after {
			transition: none;
		}
	}
</style>
