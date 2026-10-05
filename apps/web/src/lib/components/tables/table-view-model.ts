// apps/web/src/lib/components/tables/table-view-model.ts
//
// Pure view logic for TableWorkspace: which columns show, how the toolbar state
// becomes a shared `queryTable` call, how optimistic edits sit on top of the
// last server copy, how write results merge back, board lanes, filter
// vocabulary and footer totals. No Svelte, no fetch.
import {
	computeColumnTotals,
	queryTable,
	TABLE_LIMITS,
	type LoadedTable,
	type TableAggregateValue,
	type TableApplyResult,
	type TableCellMeta,
	type TableCellValue,
	type TableChoiceColor,
	type TableColumn,
	type TableColumnChange,
	type TableFilter,
	type TableFilterOp,
	type TableQuery,
	type TableRow,
	type TableSchema,
	type TableSort,
	type TableView
} from '@buildos/shared-agent-ops/tables';
import { choiceFor, formatAggregate, isEmptyCell, selectValues } from './table-cell-format';

// ---------------------------------------------------------------------------
// Toolbar / view state
// ---------------------------------------------------------------------------

export type WorkspaceMode = 'grid' | 'board' | 'cards';

export interface WorkspaceViewState {
	mode: WorkspaceMode;
	search: string;
	filters: TableFilter[];
	match: 'all' | 'any';
	sort: TableSort[];
	/** board: the choice column whose options become lanes. */
	boardColumnId: string | null;
}

export function defaultViewState(schema?: TableSchema | null): WorkspaceViewState {
	const saved = schema?.views?.[0];
	const base: WorkspaceViewState = {
		mode: 'grid',
		search: '',
		filters: [],
		match: 'all',
		sort: [],
		boardColumnId: schema ? defaultBoardColumnId(schema) : null
	};
	if (!saved || !schema) return base;
	return sanitizeViewState(
		{
			...base,
			mode: saved.layout === 'board' ? 'board' : 'grid',
			filters: saved.filters ?? [],
			match: saved.match === 'any' ? 'any' : 'all',
			sort: saved.sort ?? [],
			boardColumnId: saved.group_by ?? base.boardColumnId
		},
		schema
	);
}

/** Drops filters/sorts/board columns that point at columns which no longer exist. */
export function sanitizeViewState(
	state: WorkspaceViewState,
	schema: TableSchema
): WorkspaceViewState {
	const has = (ref: string | null | undefined) => !!ref && !!findColumn(schema, ref);
	const boardColumn = state.boardColumnId ? findColumn(schema, state.boardColumnId) : null;
	return {
		...state,
		filters: state.filters.filter((filter) => has(filter.column)),
		sort: state.sort.filter((sort) => sort.column === 'row' || has(sort.column)),
		boardColumnId:
			boardColumn && boardColumn.type === 'select'
				? boardColumn.id
				: defaultBoardColumnId(schema)
	};
}

/** Parses a remembered view (localStorage) defensively; anything odd → defaults. */
export function parseStoredViewState(raw: unknown, schema: TableSchema): WorkspaceViewState | null {
	if (!raw || typeof raw !== 'object') return null;
	const value = raw as Partial<WorkspaceViewState>;
	const modes: WorkspaceMode[] = ['grid', 'board', 'cards'];
	const state: WorkspaceViewState = {
		mode: modes.includes(value.mode as WorkspaceMode) ? (value.mode as WorkspaceMode) : 'grid',
		search: '',
		filters: Array.isArray(value.filters)
			? value.filters.filter(
					(filter): filter is TableFilter =>
						!!filter &&
						typeof filter === 'object' &&
						typeof filter.column === 'string' &&
						typeof filter.op === 'string'
				)
			: [],
		match: value.match === 'any' ? 'any' : 'all',
		sort: Array.isArray(value.sort)
			? value.sort.filter(
					(sort): sort is TableSort =>
						!!sort &&
						typeof sort === 'object' &&
						typeof sort.column === 'string' &&
						(sort.direction === 'asc' || sort.direction === 'desc')
				)
			: [],
		boardColumnId: typeof value.boardColumnId === 'string' ? value.boardColumnId : null
	};
	return sanitizeViewState(state, schema);
}

export function storedViewState(state: WorkspaceViewState) {
	const { search: _search, ...rest } = state;
	return rest;
}

/** The view as a saved TableView (so agents and other devices see it). */
export function toTableView(
	state: WorkspaceViewState,
	id = 'default',
	name = 'Default'
): TableView {
	return {
		id,
		name,
		layout: state.mode === 'board' ? 'board' : 'grid',
		filters: activeFilters(state.filters),
		match: state.match,
		sort: state.sort,
		group_by: state.mode === 'board' ? (state.boardColumnId ?? undefined) : undefined
	};
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export function findColumn(schema: TableSchema, ref: string): TableColumn | null {
	const byId = schema.columns.find((column) => column.id === ref);
	if (byId) return byId;
	const needle = ref.trim().toLowerCase();
	return schema.columns.find((column) => column.name.trim().toLowerCase() === needle) ?? null;
}

export function visibleColumns(schema: TableSchema): TableColumn[] {
	return schema.columns.filter((column) => !column.hidden);
}

export function hiddenColumns(schema: TableSchema): TableColumn[] {
	return schema.columns.filter((column) => column.hidden);
}

export function primaryColumnId(schema: TableSchema): string | null {
	if (schema.primary_column_id && schema.columns.some((c) => c.id === schema.primary_column_id)) {
		return schema.primary_column_id;
	}
	return schema.columns[0]?.id ?? null;
}

/** Visible columns with the primary column first (it stays pinned at the left). */
export function orderedVisibleColumns(schema: TableSchema): TableColumn[] {
	const visible = visibleColumns(schema);
	const primaryId = primaryColumnId(schema);
	const primary = visible.find((column) => column.id === primaryId);
	if (!primary) return visible;
	return [primary, ...visible.filter((column) => column.id !== primaryId)];
}

export function rowTitle(schema: TableSchema, row: TableRow): string {
	const id = primaryColumnId(schema);
	const value = id ? row.cells[id] : undefined;
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number') return String(value);
	return `Row ${row.row_number}`;
}

export function boardCandidateColumns(schema: TableSchema): TableColumn[] {
	return schema.columns.filter((column) => column.type === 'select');
}

export function defaultBoardColumnId(schema: TableSchema): string | null {
	return boardCandidateColumns(schema)[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Filters + query
// ---------------------------------------------------------------------------

const VALUELESS_OPS: readonly TableFilterOp[] = ['is_empty', 'is_not_empty'];

export function filterNeedsValue(op: TableFilterOp): boolean {
	return !VALUELESS_OPS.includes(op);
}

export function filterOpsFor(column: Pick<TableColumn, 'type'>): TableFilterOp[] {
	switch (column.type) {
		case 'number':
			return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
		case 'date':
			return ['eq', 'lt', 'gt', 'lte', 'gte', 'is_empty', 'is_not_empty'];
		case 'select':
			return ['eq', 'neq', 'is_empty', 'is_not_empty'];
		case 'multi_select':
			return ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
		case 'checkbox':
			return ['eq'];
		case 'link':
			return ['is_empty', 'is_not_empty'];
		default:
			return ['contains', 'not_contains', 'eq', 'neq', 'is_empty', 'is_not_empty'];
	}
}

export function filterOpLabel(op: TableFilterOp, column?: Pick<TableColumn, 'type'>): string {
	const date = column?.type === 'date';
	switch (op) {
		case 'eq':
			return 'is';
		case 'neq':
			return 'is not';
		case 'contains':
			return column?.type === 'multi_select' ? 'has' : 'contains';
		case 'not_contains':
			return column?.type === 'multi_select' ? "doesn't have" : "doesn't contain";
		case 'gt':
			return date ? 'is after' : '>';
		case 'gte':
			return date ? 'is on or after' : '≥';
		case 'lt':
			return date ? 'is before' : '<';
		case 'lte':
			return date ? 'is on or before' : '≤';
		case 'in':
			return 'is any of';
		case 'not_in':
			return 'is none of';
		case 'is_empty':
			return 'is empty';
		case 'is_not_empty':
			return 'is filled';
	}
}

/** Typed filter value from what the user typed/picked. */
export function normalizeFilterValue(
	column: Pick<TableColumn, 'type'>,
	raw: unknown
): TableCellValue | undefined {
	if (column.type === 'checkbox') return raw === true || raw === 'true';
	if (raw === null || raw === undefined) return undefined;
	if (column.type === 'number') {
		if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
		const cleaned = String(raw).replace(/[,$\s]/g, '');
		if (!cleaned) return undefined;
		const parsed = Number(cleaned);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	const text = String(raw);
	return text.trim() === '' ? undefined : text;
}

/** Filters that are complete enough to run (a value where the op needs one). */
export function activeFilters(filters: readonly TableFilter[]): TableFilter[] {
	return filters.filter((filter) => {
		if (!filterNeedsValue(filter.op)) return true;
		const value = filter.value;
		if (value === undefined || value === null) return false;
		if (typeof value === 'string') return value.trim() !== '';
		if (Array.isArray(value)) return value.length > 0;
		return true;
	});
}

export function buildViewQuery(
	state: Pick<WorkspaceViewState, 'search' | 'filters' | 'match' | 'sort'>
): TableQuery {
	const query: TableQuery = {
		match: state.match,
		limit: TABLE_LIMITS.maxRows,
		offset: 0
	};
	const filters = activeFilters(state.filters);
	if (filters.length) query.filters = filters;
	const search = state.search.trim();
	if (search) query.search = search;
	if (state.sort.length) query.sort = state.sort;
	return query;
}

export interface ViewResult {
	rows: TableRow[];
	matched: number;
	total: number;
	warnings: string[];
	filtered: boolean;
}

export function applyView(
	table: LoadedTable,
	state: Pick<WorkspaceViewState, 'search' | 'filters' | 'match' | 'sort'>
): ViewResult {
	const query = buildViewQuery(state);
	const filtered = !!(query.filters?.length || query.search);
	if (!filtered && !query.sort?.length) {
		return {
			rows: table.rows,
			matched: table.rows.length,
			total: table.rows.length,
			warnings: [],
			filtered: false
		};
	}
	const result = queryTable(table, query);
	return {
		rows: result.rows,
		matched: result.matched_rows,
		total: result.total_rows,
		warnings: result.warnings ?? [],
		filtered
	};
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** Click: none → asc → desc → none. Shift-click adds/cycles a secondary sort. */
export function cycleSort(
	sort: readonly TableSort[],
	columnId: string,
	additive = false
): TableSort[] {
	const current = sort.find((entry) => entry.column === columnId);
	const next: TableSort | null = !current
		? { column: columnId, direction: 'asc' }
		: current.direction === 'asc'
			? { column: columnId, direction: 'desc' }
			: null;
	if (!additive) return next ? [next] : [];
	const rest = sort.filter((entry) => entry.column !== columnId);
	if (!next) return rest;
	const index = sort.findIndex((entry) => entry.column === columnId);
	if (index === -1) return [...rest, next];
	const copy = [...sort];
	copy[index] = next;
	return copy;
}

export function ariaSortFor(
	sort: readonly TableSort[],
	columnId: string
): 'ascending' | 'descending' | 'none' {
	const entry = sort.find((item) => item.column === columnId);
	if (!entry) return 'none';
	return entry.direction === 'asc' ? 'ascending' : 'descending';
}

// ---------------------------------------------------------------------------
// Optimistic edits: pending ops replayed over the last server copy
// ---------------------------------------------------------------------------

export interface CellEdit {
	rowId: string;
	columnId: string;
	value: TableCellValue;
}

export type PendingOp =
	| { id: number; kind: 'edit'; edits: CellEdit[] }
	| {
			id: number;
			kind: 'insert';
			ref: string;
			cells: Record<string, TableCellValue>;
			afterRowId?: string | null;
	  }
	| { id: number; kind: 'delete'; rowIds: string[] }
	| { id: number; kind: 'columns'; changes: TableColumnChange[] };

const TEMP_PREFIX = 'tmp:';

export function tempRowId(ref: string): string {
	return `${TEMP_PREFIX}${ref}`;
}

export function isTempRowId(id: string): boolean {
	return id.startsWith(TEMP_PREFIX);
}

export function groupEditsByRow(
	edits: readonly CellEdit[]
): Array<{ rowId: string; cells: Record<string, TableCellValue> }> {
	const byRow = new Map<string, Record<string, TableCellValue>>();
	for (const edit of edits) {
		const cells = byRow.get(edit.rowId) ?? {};
		cells[edit.columnId] = isEmptyCell(edit.value) ? null : edit.value;
		byRow.set(edit.rowId, cells);
	}
	return [...byRow.entries()].map(([rowId, cells]) => ({ rowId, cells }));
}

function mergeCells(
	row: TableRow,
	cells: Record<string, TableCellValue>,
	clearMeta: boolean
): TableRow {
	const nextCells = { ...row.cells };
	const nextMeta = { ...row.cell_meta };
	for (const [key, value] of Object.entries(cells)) {
		if (isEmptyCell(value)) delete nextCells[key];
		else nextCells[key] = value;
		if (clearMeta) delete nextMeta[key];
	}
	return { ...row, cells: nextCells, cell_meta: nextMeta };
}

/** A human edit: writes the values and drops provenance for the touched cells. */
export function patchRowCells(table: LoadedTable, edits: readonly CellEdit[]): LoadedTable {
	if (!edits.length) return table;
	const grouped = new Map(groupEditsByRow(edits).map((entry) => [entry.rowId, entry.cells]));
	let changed = false;
	const rows = table.rows.map((row) => {
		const cells = grouped.get(row.id);
		if (!cells) return row;
		changed = true;
		return mergeCells(row, cells, true);
	});
	return changed ? { ...table, rows } : table;
}

export function makeTempRow(
	ref: string,
	cells: Record<string, TableCellValue>,
	rowNumber: number
): TableRow {
	const now = new Date(0).toISOString();
	const clean: Record<string, TableCellValue> = {};
	for (const [key, value] of Object.entries(cells)) {
		if (!isEmptyCell(value)) clean[key] = value;
	}
	return {
		id: tempRowId(ref),
		row_number: rowNumber,
		position: Number.MAX_SAFE_INTEGER,
		cells: clean,
		cell_meta: {},
		version: 0,
		created_by: null,
		updated_by: null,
		created_at: now,
		updated_at: now
	};
}

function insertRowAt(rows: TableRow[], row: TableRow, afterRowId?: string | null): TableRow[] {
	if (afterRowId) {
		const index = rows.findIndex((candidate) => candidate.id === afterRowId);
		if (index !== -1) return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)];
	}
	return [...rows, row];
}

export function nextRowNumber(table: LoadedTable): number {
	return table.rows.reduce((max, row) => Math.max(max, row.row_number), 0) + 1;
}

export function removeRows(table: LoadedTable, rowIds: readonly string[]): LoadedTable {
	if (!rowIds.length) return table;
	const drop = new Set(rowIds);
	const rows = table.rows.filter((row) => !drop.has(row.id));
	return rows.length === table.rows.length ? table : { ...table, rows };
}

/**
 * Column changes that can show instantly (rename, describe, hide, width,
 * choices, AI config, move, delete). `add` and `retype` wait for the server,
 * which assigns ids and coerces cells.
 */
export function applyLocalColumnChanges(
	schema: TableSchema,
	changes: readonly TableColumnChange[]
): TableSchema {
	let columns = [...schema.columns];
	for (const change of changes) {
		if (change.action === 'add' || change.action === 'retype') continue;
		const index = columns.findIndex(
			(column) =>
				column.id === change.column ||
				column.name.trim().toLowerCase() === change.column.trim().toLowerCase()
		);
		if (index === -1) continue;
		const column = columns[index]!;
		if (change.action === 'rename') {
			columns[index] = { ...column, name: change.name };
		} else if (change.action === 'update') {
			const next: TableColumn = { ...column };
			if (change.description !== undefined) next.description = change.description;
			if (change.options !== undefined)
				next.options = { ...column.options, ...change.options };
			if (change.ai !== undefined) next.ai = change.ai;
			if (change.width !== undefined) next.width = change.width;
			if (change.hidden !== undefined) next.hidden = change.hidden;
			columns[index] = next;
		} else if (change.action === 'delete') {
			columns = columns.filter((_, i) => i !== index);
		} else if (change.action === 'move') {
			const without = columns.filter((_, i) => i !== index);
			if (!change.after) {
				columns = [column, ...without];
			} else {
				const afterIndex = without.findIndex((c) => c.id === change.after);
				columns =
					afterIndex === -1
						? [...without, column]
						: [
								...without.slice(0, afterIndex + 1),
								column,
								...without.slice(afterIndex + 1)
							];
			}
		}
	}
	return { ...schema, columns };
}

/** The optimistic view: the server copy with every unacknowledged op replayed. */
export function applyPendingOps(table: LoadedTable, ops: readonly PendingOp[]): LoadedTable {
	let next = table;
	for (const op of ops) {
		switch (op.kind) {
			case 'edit':
				next = patchRowCells(next, op.edits);
				break;
			case 'insert':
				if (!next.rows.some((row) => row.id === tempRowId(op.ref))) {
					next = {
						...next,
						rows: insertRowAt(
							next.rows,
							makeTempRow(op.ref, op.cells, nextRowNumber(next)),
							op.afterRowId
						)
					};
				}
				break;
			case 'delete':
				next = removeRows(next, op.rowIds);
				break;
			case 'columns':
				next = { ...next, schema: applyLocalColumnChanges(next.schema, op.changes) };
				break;
		}
	}
	return next;
}

/** Rewrites pending ops after the server assigned a real id to a temp row. */
export function remapPendingRowId(ops: PendingOp[], fromId: string, toId: string): PendingOp[] {
	const swap = (id: string) => (id === fromId ? toId : id);
	return ops.map((op) => {
		if (op.kind === 'edit') {
			return { ...op, edits: op.edits.map((edit) => ({ ...edit, rowId: swap(edit.rowId) })) };
		}
		if (op.kind === 'delete') return { ...op, rowIds: op.rowIds.map(swap) };
		if (op.kind === 'insert' && op.afterRowId)
			return { ...op, afterRowId: swap(op.afterRowId) };
		return op;
	});
}

export interface InsertHint {
	tempId: string;
	cells: Record<string, TableCellValue>;
	afterRowId?: string | null;
}

/**
 * Merges an apply result into the server copy. Returns `needsRefresh` when a
 * result can't be reconstructed locally (restore/move), and the temp → real id
 * pairs for inserted rows.
 */
export function applyApplyResult(
	table: LoadedTable,
	apply: TableApplyResult,
	insertHints: Record<string, InsertHint> = {}
): { table: LoadedTable; needsRefresh: boolean; idMap: Array<[string, string]> } {
	let rows = [...table.rows];
	let needsRefresh = false;
	const idMap: Array<[string, string]> = [];

	for (const result of apply.results ?? []) {
		if (result.op === 'insert') {
			const hint = result.ref ? insertHints[result.ref] : undefined;
			const row: TableRow = {
				id: result.row_id,
				row_number: result.row_number,
				position: result.after?.position ?? Number.MAX_SAFE_INTEGER,
				cells: { ...(result.after?.cells ?? hint?.cells ?? {}) },
				cell_meta: { ...(result.after?.cell_meta ?? {}) },
				version: result.version,
				created_by: null,
				updated_by: null,
				created_at: apply.updated_at,
				updated_at: apply.updated_at
			};
			for (const [key, value] of Object.entries(row.cells)) {
				if (isEmptyCell(value)) delete row.cells[key];
			}
			const existing = rows.findIndex((candidate) => candidate.id === row.id);
			if (existing !== -1) rows[existing] = row;
			else rows = insertRowAt(rows, row, hint?.afterRowId ?? null);
			if (hint) idMap.push([hint.tempId, row.id]);
		} else if (result.op === 'update') {
			const index = rows.findIndex((candidate) => candidate.id === result.row_id);
			if (index === -1) {
				needsRefresh = true;
				continue;
			}
			const row = rows[index]!;
			const touched = new Set([
				...Object.keys(result.after?.cells ?? {}),
				...Object.keys(result.before?.cells ?? {})
			]);
			const cells = { ...row.cells };
			const meta: Record<string, TableCellMeta> = { ...row.cell_meta };
			for (const key of touched) {
				const value = result.after?.cells?.[key];
				if (value === undefined || isEmptyCell(value)) delete cells[key];
				else cells[key] = value;
				const nextMeta = result.after?.cell_meta?.[key];
				if (nextMeta) meta[key] = nextMeta;
				else delete meta[key];
			}
			rows[index] = {
				...row,
				cells,
				cell_meta: meta,
				version: result.version,
				updated_at: apply.updated_at
			};
		} else if (result.op === 'delete') {
			rows = rows.filter((candidate) => candidate.id !== result.row_id);
		} else {
			needsRefresh = true;
		}
	}

	return {
		table: {
			...table,
			document: {
				...table.document,
				updated_at: apply.updated_at ?? table.document.updated_at
			},
			schema: {
				...table.schema,
				revision: apply.revision ?? table.schema.revision,
				row_count: apply.row_count ?? rows.length
			},
			rows
		},
		needsRefresh,
		idMap
	};
}

// ---------------------------------------------------------------------------
// AI provenance
// ---------------------------------------------------------------------------

export function cellKey(rowId: string, columnId: string): string {
	return `${rowId}:${columnId}`;
}

export function countPendingAiCells(table: LoadedTable | null): number {
	if (!table) return 0;
	let count = 0;
	for (const row of table.rows) {
		for (const meta of Object.values(row.cell_meta ?? {})) {
			if (meta?.state === 'pending') count += 1;
		}
	}
	return count;
}

/** Cells that were pending in `prev` and are now filled in `next` (for the fill flash). */
export function newlyFilledCells(prev: LoadedTable | null, next: LoadedTable): string[] {
	if (!prev) return [];
	const previous = new Map(prev.rows.map((row) => [row.id, row]));
	const keys: string[] = [];
	for (const row of next.rows) {
		const before = previous.get(row.id);
		if (!before) continue;
		for (const [columnId, meta] of Object.entries(row.cell_meta ?? {})) {
			if (meta?.state !== 'filled' && meta?.state !== undefined) continue;
			const was = before.cell_meta?.[columnId];
			if (was?.state === 'pending') keys.push(cellKey(row.id, columnId));
		}
	}
	return keys;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface BoardLane {
	/** Choice value; null = the "No value" lane. */
	key: string | null;
	label: string;
	color: TableChoiceColor;
	rows: TableRow[];
}

export function buildBoardLanes(column: TableColumn, rows: readonly TableRow[]): BoardLane[] {
	const lanes = new Map<string, BoardLane>();
	for (const choice of column.options?.choices ?? []) {
		lanes.set(choice.value.trim().toLowerCase(), {
			key: choice.value,
			label: choice.value,
			color: choice.color ?? 'gray',
			rows: []
		});
	}
	const empty: BoardLane = { key: null, label: `No ${column.name}`, color: 'gray', rows: [] };
	for (const row of rows) {
		const [value] = selectValues(row.cells[column.id]);
		if (!value) {
			empty.rows.push(row);
			continue;
		}
		const lookup = value.trim().toLowerCase();
		let lane = lanes.get(lookup);
		if (!lane) {
			lane = {
				key: value,
				label: value,
				color: choiceFor(column, value)?.color ?? 'gray',
				rows: []
			};
			lanes.set(lookup, lane);
		}
		lane.rows.push(row);
	}
	return [...lanes.values(), empty];
}

// ---------------------------------------------------------------------------
// Footer totals
// ---------------------------------------------------------------------------

export interface FooterCell {
	text: string;
	title: string;
}

function totalFor(
	totals: Record<string, TableAggregateValue>,
	column: TableColumn
): TableAggregateValue | undefined {
	if (column.id in totals) return totals[column.id];
	if (column.name in totals) return totals[column.name];
	return undefined;
}

export function computeTotals(
	schema: TableSchema,
	rows: TableRow[]
): Record<string, TableAggregateValue> {
	try {
		return computeColumnTotals(schema, rows);
	} catch {
		return {};
	}
}

/** One calm line per column: sums for numbers, counts for the rest. */
export function footerCells(
	columns: readonly TableColumn[],
	rows: readonly TableRow[],
	totals: Record<string, TableAggregateValue>,
	opts: { primaryColumnId: string | null; matched: number; total: number }
): Record<string, FooterCell> {
	const cells: Record<string, FooterCell> = {};
	const count = rows.length;
	for (const column of columns) {
		if (column.id === opts.primaryColumnId) {
			const text =
				opts.matched === opts.total
					? `${opts.total} ${opts.total === 1 ? 'row' : 'rows'}`
					: `${opts.matched} of ${opts.total} rows`;
			cells[column.id] = { text, title: text };
			continue;
		}
		if (column.type === 'number') {
			const total = totalFor(totals, column);
			const text = formatAggregate(column, total);
			cells[column.id] = { text: text ? `Σ ${text}` : '', title: text ? `Sum: ${text}` : '' };
			continue;
		}
		if (column.type === 'checkbox') {
			const checked = rows.filter((row) => row.cells[column.id] === true).length;
			cells[column.id] = {
				text: count ? `${checked} of ${count}` : '',
				title: `${checked} checked`
			};
			continue;
		}
		const filled = rows.filter((row) => !isEmptyCell(row.cells[column.id])).length;
		cells[column.id] =
			count && filled < count
				? { text: `${filled} filled`, title: `${filled} of ${count} filled` }
				: { text: '', title: count ? 'All filled' : '' };
	}
	return cells;
}
