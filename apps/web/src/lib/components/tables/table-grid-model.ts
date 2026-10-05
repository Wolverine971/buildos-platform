// apps/web/src/lib/components/tables/table-grid-model.ts
//
// Pure spreadsheet mechanics for TableGrid: active cell + range selection,
// keyboard movement, the virtual row window, and turning clipboard blocks,
// fill-down and clear into cell edits / new rows. Positions are indexes into
// the rows and columns currently on screen (after filter + sort).
import {
	parseDelimitedText,
	type TableCellValue,
	type TableColumn,
	type TableRow
} from '@buildos/shared-agent-ops/tables';
import type { CellEdit } from './table-view-model';
import { cellCopyText, isEditableColumn, toTsv } from './table-cell-format';

export interface CellPos {
	row: number;
	col: number;
}

export interface GridSelection {
	anchor: CellPos;
	focus: CellPos;
}

export interface CellRange {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export function clampPos(pos: CellPos, rowCount: number, colCount: number): CellPos {
	return {
		row: Math.max(0, Math.min(pos.row, Math.max(0, rowCount - 1))),
		col: Math.max(0, Math.min(pos.col, Math.max(0, colCount - 1)))
	};
}

export function collapsed(pos: CellPos): GridSelection {
	return { anchor: { ...pos }, focus: { ...pos } };
}

export function selectionRange(selection: GridSelection): CellRange {
	return {
		top: Math.min(selection.anchor.row, selection.focus.row),
		bottom: Math.max(selection.anchor.row, selection.focus.row),
		left: Math.min(selection.anchor.col, selection.focus.col),
		right: Math.max(selection.anchor.col, selection.focus.col)
	};
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
	return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
}

export function rangeCellCount(range: CellRange): number {
	return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

export function isSingleCell(selection: GridSelection): boolean {
	return (
		selection.anchor.row === selection.focus.row && selection.anchor.col === selection.focus.col
	);
}

export interface NavigateOptions {
	rowCount: number;
	colCount: number;
	/** Ctrl/Cmd held: jump to the edge. */
	jump?: boolean;
	/** Rows per PageUp/PageDown. */
	pageRows?: number;
}

/** Where a navigation key moves the active cell, or null when the key isn't one. */
export function navigate(pos: CellPos, key: string, opts: NavigateOptions): CellPos | null {
	const { rowCount, colCount } = opts;
	if (rowCount === 0 || colCount === 0) return null;
	const lastRow = rowCount - 1;
	const lastCol = colCount - 1;
	const page = Math.max(1, opts.pageRows ?? 10);
	let next: CellPos;
	switch (key) {
		case 'ArrowUp':
			next = { row: opts.jump ? 0 : pos.row - 1, col: pos.col };
			break;
		case 'ArrowDown':
			next = { row: opts.jump ? lastRow : pos.row + 1, col: pos.col };
			break;
		case 'ArrowLeft':
			next = { row: pos.row, col: opts.jump ? 0 : pos.col - 1 };
			break;
		case 'ArrowRight':
			next = { row: pos.row, col: opts.jump ? lastCol : pos.col + 1 };
			break;
		case 'Home':
			next = opts.jump ? { row: 0, col: 0 } : { row: pos.row, col: 0 };
			break;
		case 'End':
			next = opts.jump ? { row: lastRow, col: lastCol } : { row: pos.row, col: lastCol };
			break;
		case 'PageUp':
			next = { row: pos.row - page, col: pos.col };
			break;
		case 'PageDown':
			next = { row: pos.row + page, col: pos.col };
			break;
		default:
			return null;
	}
	return clampPos(next, rowCount, colCount);
}

/** Tab / Shift+Tab: move across, wrapping to the next/previous row. */
export function tabMove(
	pos: CellPos,
	backwards: boolean,
	rowCount: number,
	colCount: number
): CellPos {
	if (backwards) {
		if (pos.col > 0) return { row: pos.row, col: pos.col - 1 };
		if (pos.row > 0) return { row: pos.row - 1, col: colCount - 1 };
		return pos;
	}
	if (pos.col < colCount - 1) return { row: pos.row, col: pos.col + 1 };
	if (pos.row < rowCount - 1) return { row: pos.row + 1, col: 0 };
	return pos;
}

/** A key that should start editing with its character (typing replaces the cell). */
export function isPrintableKey(
	event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>
): boolean {
	return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

// ---------------------------------------------------------------------------
// Virtual window
// ---------------------------------------------------------------------------

export interface VirtualWindow {
	start: number;
	end: number;
	padTop: number;
	padBottom: number;
}

export function virtualWindow(args: {
	scrollTop: number;
	viewportHeight: number;
	rowHeight: number;
	rowCount: number;
	overscan?: number;
}): VirtualWindow {
	const { rowHeight, rowCount } = args;
	const overscan = args.overscan ?? 8;
	if (rowCount === 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
	const viewport = Math.max(args.viewportHeight, rowHeight * 10);
	const first = Math.floor(Math.max(0, args.scrollTop) / rowHeight);
	const start = Math.max(0, Math.min(first - overscan, rowCount - 1));
	const visible = Math.ceil(viewport / rowHeight);
	const end = Math.min(rowCount, first + visible + overscan);
	return {
		start,
		end: Math.max(start, end),
		padTop: start * rowHeight,
		padBottom: Math.max(0, (rowCount - Math.max(start, end)) * rowHeight)
	};
}

/** scrollTop that brings a row fully into view, or null when it already is. */
export function scrollTopForRow(args: {
	row: number;
	rowHeight: number;
	scrollTop: number;
	viewportHeight: number;
	headerHeight: number;
	footerHeight: number;
}): number | null {
	const top = args.row * args.rowHeight;
	const bottom = top + args.rowHeight;
	const visibleTop = args.scrollTop;
	const visibleBottom =
		args.scrollTop + args.viewportHeight - args.headerHeight - args.footerHeight;
	if (top < visibleTop) return top;
	if (bottom > visibleBottom)
		return bottom - (args.viewportHeight - args.headerHeight - args.footerHeight);
	return null;
}

/** scrollLeft that brings a column into view past the pinned columns, or null. */
export function scrollLeftForColumn(args: {
	col: number;
	widths: readonly number[];
	pinnedWidth: number;
	pinnedCount: number;
	scrollLeft: number;
	viewportWidth: number;
}): number | null {
	if (args.col < args.pinnedCount) return null;
	let left = 0;
	for (let i = 0; i < args.col; i += 1) left += args.widths[i] ?? 0;
	const right = left + (args.widths[args.col] ?? 0);
	const visibleLeft = args.scrollLeft + args.pinnedWidth;
	const visibleRight = args.scrollLeft + args.viewportWidth;
	if (left < visibleLeft) return Math.max(0, left - args.pinnedWidth);
	if (right > visibleRight) return right - args.viewportWidth;
	return null;
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/**
 * Splits clipboard text into a block of cells. Sheets/Excel put tab-separated
 * text on the clipboard; anything without tabs is one value per line, so a
 * pasted "Baltimore, MD" stays one cell instead of being read as CSV.
 */
export function splitClipboardText(text: string): string[][] {
	const normalized = text.replace(/\r\n?/g, '\n');
	const trimmedEnd = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
	if (trimmedEnd === '') return [['']];
	if (trimmedEnd.includes('\t')) {
		try {
			const parsed = parseDelimitedText(trimmedEnd);
			if (parsed.delimiter === '\t') {
				const block = [parsed.headers, ...parsed.rows];
				return block.length ? block : [['']];
			}
		} catch {
			// fall through to the plain split
		}
		return trimmedEnd.split('\n').map((line) => line.split('\t'));
	}
	if (!trimmedEnd.includes('\n')) return [[trimmedEnd]];
	return trimmedEnd.split('\n').map((line) => [line]);
}

export type CoerceCell = (
	column: TableColumn,
	raw: string
) => { value: TableCellValue; error?: string };

export interface PasteChanges {
	edits: CellEdit[];
	/** New rows appended at the end, keyed by column id. */
	inserts: Array<Record<string, TableCellValue>>;
	/** Pasted columns that ran past the last visible column. */
	skippedColumns: number;
	/** Cells that couldn't be read as the column's type (kept out of the write). */
	errors: string[];
	/** Read-only columns (linked items) the block crossed. */
	skippedReadOnly: number;
}

/**
 * Turns a pasted block into edits starting at the selection's top-left. A
 * single value pasted over a larger selection fills every selected cell (the
 * Sheets behavior). Rows past the end become new rows.
 */
export function buildPasteChanges(args: {
	block: string[][];
	selection: GridSelection;
	rows: readonly TableRow[];
	columns: readonly TableColumn[];
	coerce: CoerceCell;
	allowInsert?: boolean;
	maxInserts?: number;
}): PasteChanges {
	const { block, rows, columns, coerce } = args;
	const range = selectionRange(args.selection);
	const changes: PasteChanges = {
		edits: [],
		inserts: [],
		skippedColumns: 0,
		errors: [],
		skippedReadOnly: 0
	};
	if (!block.length || !columns.length) return changes;

	const singleValue = block.length === 1 && block[0]!.length === 1;
	const fillSelection = singleValue && rangeCellCount(range) > 1;
	const height = fillSelection ? range.bottom - range.top + 1 : block.length;
	const width = fillSelection
		? range.right - range.left + 1
		: Math.max(...block.map((line) => line.length));
	const maxInserts = args.maxInserts ?? 1000;

	const readCell = (column: TableColumn, raw: string, label: string) => {
		if (raw.trim() === '') return { ok: true as const, value: null as TableCellValue };
		const result = coerce(column, raw);
		if (result.error) {
			changes.errors.push(`${label}: ${result.error}`);
			return { ok: false as const, value: null as TableCellValue };
		}
		return { ok: true as const, value: result.value };
	};

	for (let i = 0; i < height; i += 1) {
		const line = fillSelection ? block[0]! : (block[i] ?? []);
		const rowIndex = range.top + i;
		const row = rows[rowIndex];
		const insertCells: Record<string, TableCellValue> = {};
		let insertHasValue = false;
		for (let j = 0; j < width; j += 1) {
			const raw = fillSelection ? block[0]![0]! : line[j];
			if (raw === undefined) continue;
			const column = columns[range.left + j];
			if (!column) {
				if (i === 0) changes.skippedColumns += 1;
				continue;
			}
			if (!isEditableColumn(column)) {
				changes.skippedReadOnly += 1;
				continue;
			}
			const label = `${column.name} row ${rowIndex + 1}`;
			const cell = readCell(column, raw, label);
			if (!cell.ok) continue;
			if (row) {
				changes.edits.push({ rowId: row.id, columnId: column.id, value: cell.value });
			} else {
				if (cell.value !== null) {
					insertCells[column.id] = cell.value;
					insertHasValue = true;
				}
			}
		}
		if (!row && insertHasValue && args.allowInsert !== false) {
			if (changes.inserts.length < maxInserts) changes.inserts.push(insertCells);
		}
	}
	return changes;
}

/** Ctrl/Cmd+D: copy the top row of the selection down through the rest of it. */
export function buildFillDown(
	selection: GridSelection,
	rows: readonly TableRow[],
	columns: readonly TableColumn[]
): CellEdit[] {
	const range = selectionRange(selection);
	if (range.bottom === range.top) {
		// Single row selected: fill from the row above, like Sheets.
		if (range.top === 0) return [];
		return buildFillDown(
			{
				anchor: { row: range.top - 1, col: range.left },
				focus: { row: range.bottom, col: range.right }
			},
			rows,
			columns
		);
	}
	const source = rows[range.top];
	if (!source) return [];
	const edits: CellEdit[] = [];
	for (let r = range.top + 1; r <= range.bottom; r += 1) {
		const row = rows[r];
		if (!row) continue;
		for (let c = range.left; c <= range.right; c += 1) {
			const column = columns[c];
			if (!column || !isEditableColumn(column)) continue;
			edits.push({
				rowId: row.id,
				columnId: column.id,
				value: source.cells[column.id] ?? null
			});
		}
	}
	return edits;
}

/** Delete/Backspace over a selection: clear every editable, non-empty cell. */
export function buildClear(
	selection: GridSelection,
	rows: readonly TableRow[],
	columns: readonly TableColumn[]
): CellEdit[] {
	const range = selectionRange(selection);
	const edits: CellEdit[] = [];
	for (let r = range.top; r <= range.bottom; r += 1) {
		const row = rows[r];
		if (!row) continue;
		for (let c = range.left; c <= range.right; c += 1) {
			const column = columns[c];
			if (!column || !isEditableColumn(column)) continue;
			const value = row.cells[column.id];
			if (value === undefined || value === null || value === '') continue;
			edits.push({ rowId: row.id, columnId: column.id, value: null });
		}
	}
	return edits;
}

/** The selection as tab-separated text for the clipboard. */
export function rangeToTsv(
	selection: GridSelection,
	rows: readonly TableRow[],
	columns: readonly TableColumn[]
): string {
	const range = selectionRange(selection);
	const lines: string[][] = [];
	for (let r = range.top; r <= range.bottom; r += 1) {
		const row = rows[r];
		if (!row) continue;
		const line: string[] = [];
		for (let c = range.left; c <= range.right; c += 1) {
			const column = columns[c];
			if (!column) continue;
			line.push(cellCopyText(column, row.cells[column.id]));
		}
		lines.push(line);
	}
	return toTsv(lines);
}
