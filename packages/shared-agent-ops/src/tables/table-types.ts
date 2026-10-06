// packages/shared-agent-ops/src/tables/table-types.ts
// Shared contract for BuildOS Tables (docs/specs/tables/CONTRACT.md).
//
// A table is an onto_documents row with type_key 'document.table' (or
// 'document.table.<flavor>'). Its column schema lives at
// onto_documents.props.table (TableSchema); its records live in
// public.onto_document_rows (TableRow), written only through the
// onto_document_table_apply RPC (TableRowOp batches).
//
// Browser-safe: no Node or Supabase imports in this file.

export const TABLE_DOCUMENT_TYPE_KEY = 'document.table';

export function isTableTypeKey(typeKey: string | null | undefined): boolean {
	return (
		typeof typeKey === 'string' &&
		(typeKey === TABLE_DOCUMENT_TYPE_KEY || typeKey.startsWith(`${TABLE_DOCUMENT_TYPE_KEY}.`))
	);
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const TABLE_LIMITS = {
	/** Live rows per table. */
	maxRows: 10_000,
	/** Columns per table. */
	maxColumns: 50,
	/** Ops per onto_document_table_apply call from the web/gateway. */
	maxOpsPerApply: 1_000,
	/** Rows an agent may add/update/delete in one tool call. */
	maxAgentRowsPerCall: 200,
	/** Rows returned by one agent read. */
	maxAgentReadRows: 100,
	defaultAgentReadRows: 25,
	/** Characters per text cell. */
	maxCellChars: 10_000,
	/** Characters per cell when shown to a model (longer cells get "…[+N chars]"). */
	modelCellChars: 300,
	/** Rows rendered into onto_documents.content by the RPC projection. */
	projectionRows: 500
} as const;

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const TABLE_COLUMN_TYPES = [
	'text',
	'long_text',
	'number',
	'date',
	'select',
	'multi_select',
	'checkbox',
	'url',
	'email',
	'link'
] as const;
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export const TABLE_CHOICE_COLORS = [
	'gray',
	'blue',
	'green',
	'yellow',
	'orange',
	'red',
	'purple',
	'pink',
	'teal'
] as const;
export type TableChoiceColor = (typeof TABLE_CHOICE_COLORS)[number];

export interface TableSelectChoice {
	value: string;
	color?: TableChoiceColor;
}

export type TableNumberFormat = 'number' | 'currency' | 'percent' | 'hours';

export interface TableColumnOptions {
	/** select / multi_select */
	choices?: TableSelectChoice[];
	/** number */
	format?: TableNumberFormat;
	/** number with format 'currency' (ISO 4217, default 'USD') */
	currency?: string;
	/** number */
	decimals?: number;
	/** link: which BuildOS kinds this column may point at (default: all) */
	link_kinds?: TableLinkKind[];
}

/**
 * A "question column": one prompt that runs per row (Clay/Elicit pattern).
 * The worker fills each cell and records sources in cell_meta.
 */
export interface TableColumnAiConfig {
	/** What to find or work out for each row, e.g. "Who is the hiring manager?" */
	prompt: string;
	/** true = may search the web for each row; false = reason over the row only. */
	research: boolean;
	updated_at?: string;
}

export interface TableColumn {
	/** Stable id, 'c_' + 8 base36 chars. Never reused; cells are keyed by it. */
	id: string;
	/** Display name; unique (case-insensitive) within the table. Agents address columns by name. */
	name: string;
	type: TableColumnType;
	/** Guidance for humans and the agent about what belongs here. */
	description?: string;
	options?: TableColumnOptions;
	ai?: TableColumnAiConfig | null;
	/** UI-only. */
	width?: number;
	hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Views + query DSL (shared by agent reads, saved views and the grid)
// ---------------------------------------------------------------------------

export const TABLE_FILTER_OPS = [
	'eq',
	'neq',
	'contains',
	'not_contains',
	'gt',
	'gte',
	'lt',
	'lte',
	'in',
	'not_in',
	'is_empty',
	'is_not_empty'
] as const;
export type TableFilterOp = (typeof TABLE_FILTER_OPS)[number];

export interface TableFilter {
	/** Column name (case-insensitive) or column id. */
	column: string;
	op: TableFilterOp;
	/** Omitted for is_empty / is_not_empty; an array for in / not_in. */
	value?: TableCellValue | TableCellValue[];
}

export interface TableSort {
	/** Column name or id. 'row' sorts by row number. */
	column: string;
	direction: 'asc' | 'desc';
}

export const TABLE_AGGREGATE_FNS = [
	'count',
	'count_empty',
	'count_filled',
	'sum',
	'avg',
	'min',
	'max',
	'distinct'
] as const;
export type TableAggregateFn = (typeof TABLE_AGGREGATE_FNS)[number];

export interface TableAggregate {
	fn: TableAggregateFn;
	/** Required for everything except 'count'. Column name or id. */
	column?: string;
}

export interface TableQuery {
	filters?: TableFilter[];
	/** How filters combine (default 'all'). */
	match?: 'all' | 'any';
	/** Case-insensitive substring match across all visible cells. */
	search?: string;
	sort?: TableSort[];
	/** Columns to return (names or ids); default all non-hidden. */
	columns?: string[];
	/** Column name or id to group by; groups carry counts + aggregates. */
	group_by?: string;
	aggregates?: TableAggregate[];
	limit?: number;
	offset?: number;
}

export type TableViewLayout = 'grid' | 'board';

export interface TableView {
	id: string;
	name: string;
	layout: TableViewLayout;
	filters?: TableFilter[];
	match?: 'all' | 'any';
	sort?: TableSort[];
	/** board: the select column whose choices become lanes. grid: optional grouping. */
	group_by?: string;
	hidden_column_ids?: string[];
}

// ---------------------------------------------------------------------------
// Schema stored at onto_documents.props.table
// ---------------------------------------------------------------------------

export type TableSourceKind = 'blank' | 'csv' | 'paste' | 'markdown' | 'chat' | 'agent';

export interface TableSchema {
	format: 1;
	columns: TableColumn[];
	views?: TableView[];
	/** Column shown as the row's title on cards, links and receipts (default: first column). */
	primary_column_id?: string;
	/** Bumped by every onto_document_table_apply call (maintained by the RPC). */
	revision: number;
	/** Live rows (maintained by the RPC). Lets the doc tree show a count without loading rows. */
	row_count: number;
	source?: {
		kind: TableSourceKind;
		filename?: string;
		/** e.g. the chat session or document the table came from */
		origin_entity?: { kind: string; id: string } | null;
		created_at?: string;
	};
}

// ---------------------------------------------------------------------------
// Cells + rows
// ---------------------------------------------------------------------------

export const TABLE_LINK_KINDS = [
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk',
	'project'
] as const;
export type TableLinkKind = (typeof TABLE_LINK_KINDS)[number];

export interface TableLinkValue {
	kind: TableLinkKind;
	id: string;
	/** Cached display label (refreshed on read when cheap). */
	label?: string;
}

/**
 * Cell value by column type:
 * text/long_text/url/email/select → string; number → number;
 * date → 'YYYY-MM-DD' (or full ISO datetime); multi_select → string[];
 * checkbox → boolean; link → TableLinkValue. Empty cells are absent (never null in storage).
 */
export type TableCellValue = string | number | boolean | string[] | TableLinkValue | null;

export type TableCellAuthor = 'agent' | 'ai_column' | 'import';

/** Provenance for a cell a human did not type. Cleared automatically when a human edits the cell. */
export interface TableCellMeta {
	by: TableCellAuthor;
	state?: 'pending' | 'filled' | 'error';
	source_urls?: string[];
	/** Short reasoning / quote supporting the value. */
	note?: string;
	confidence?: 'low' | 'medium' | 'high';
	error?: string;
	/** ai_column fill job id */
	run_id?: string;
	at: string;
}

export interface TableRow {
	id: string;
	/** Agent-facing handle is `r${row_number}`. Never reused within a table. */
	row_number: number;
	position: number;
	cells: Record<string, TableCellValue>;
	cell_meta: Record<string, TableCellMeta>;
	version: number;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
	deleted_at?: string | null;
}

export function rowHandle(rowNumber: number): string {
	return `r${rowNumber}`;
}

/**
 * A task made from a row links to the table with a `task_has_document` edge
 * whose props carry `role: 'table_row'` and the row's `row_id`/`row_number`.
 * The task's own `props.table_row` repeats the anchor.
 */
export const TABLE_ROW_EDGE_ROLE = 'table_row';

/** A follow-up task made from a row, as the table shows it. */
export interface TableRowTask {
	id: string;
	title: string;
	state_key: string;
}

/** 'r12' / 'R12' / '12' → 12; anything else → null. */
export function parseRowHandle(handle: string | number): number | null {
	if (typeof handle === 'number') {
		return Number.isInteger(handle) && handle > 0 ? handle : null;
	}
	const match = /^r?(\d{1,9})$/i.exec(handle.trim());
	if (!match) return null;
	const value = Number(match[1]);
	return value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Row ops (p_ops of onto_document_table_apply) + results
// ---------------------------------------------------------------------------

export type TableRowOp =
	| {
			op: 'insert';
			/** Caller correlation id, echoed in the result. */
			ref?: string;
			cells: Record<string, TableCellValue>;
			cell_meta?: Record<string, TableCellMeta>;
			position?: number;
			after_row_id?: string;
	  }
	| {
			op: 'update';
			row_id: string;
			/** Merged into the row; null clears that cell. */
			cells?: Record<string, TableCellValue>;
			/** Provenance for touched cells; omitted keys are cleared for every touched cell. */
			cell_meta?: Record<string, TableCellMeta | null>;
			expected_version?: number;
	  }
	| { op: 'delete'; row_id: string; expected_version?: number }
	| { op: 'restore'; row_id: string }
	| { op: 'move'; row_id: string; position?: number; after_row_id?: string | null };

export type TableRowOpKind = TableRowOp['op'];

export interface TableRowOpResult {
	op: TableRowOpKind;
	ref?: string | null;
	row_id: string;
	row_number: number;
	version: number;
	/** update: previous values of touched keys (null = was empty); delete: full row. */
	before: {
		cells?: Record<string, TableCellValue>;
		cell_meta?: Record<string, TableCellMeta | null>;
		position?: number;
	} | null;
	after: {
		cells?: Record<string, TableCellValue>;
		cell_meta?: Record<string, TableCellMeta>;
		position?: number;
	} | null;
}

export interface TableApplyResult {
	document_id: string;
	revision: number;
	row_count: number;
	updated_at: string;
	results: TableRowOpResult[];
}

/** Error codes raised by the RPC (message prefix) and surfaced by services. */
export type TableErrorCode =
	| 'TABLE_NOT_FOUND'
	| 'NOT_A_TABLE'
	| 'TABLE_CONFLICT'
	| 'ROW_NOT_FOUND'
	| 'ROW_CONFLICT'
	| 'INVALID_OP'
	| 'VALIDATION_ERROR'
	| 'LIMIT_EXCEEDED';

// ---------------------------------------------------------------------------
// Column changes (schema edits by humans or agents)
// ---------------------------------------------------------------------------

export interface TableColumnInput {
	name: string;
	type?: TableColumnType;
	description?: string;
	options?: TableColumnOptions;
	ai?: TableColumnAiConfig | null;
}

export type TableColumnChange =
	| ({ action: 'add'; after?: string | null } & TableColumnInput)
	| { action: 'rename'; column: string; name: string }
	| { action: 'retype'; column: string; type: TableColumnType; options?: TableColumnOptions }
	| {
			action: 'update';
			column: string;
			description?: string;
			options?: TableColumnOptions;
			ai?: TableColumnAiConfig | null;
			width?: number;
			hidden?: boolean;
	  }
	| { action: 'delete'; column: string }
	| { action: 'move'; column: string; after?: string | null };

// ---------------------------------------------------------------------------
// Loaded table + query results
// ---------------------------------------------------------------------------

export interface TableDocumentSummary {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	state_key: string | null;
	updated_at: string;
	archived_at?: string | null;
}

export interface LoadedTable {
	document: TableDocumentSummary;
	schema: TableSchema;
	/** Live rows in display order (position, then row_number). */
	rows: TableRow[];
}

export type TableAggregateValue = number | string | null;

export interface TableQueryGroup {
	key: TableCellValue;
	label: string;
	count: number;
	aggregates: Record<string, TableAggregateValue>;
}

export interface TableQueryResult {
	/** Columns returned, in order. */
	columns: TableColumn[];
	/** The requested page of matching rows. */
	rows: TableRow[];
	total_rows: number;
	matched_rows: number;
	offset: number;
	next_offset: number | null;
	groups?: TableQueryGroup[];
	/** Keyed `${fn}:${columnName}` (or 'count'). */
	aggregates?: Record<string, TableAggregateValue>;
	/** Non-fatal problems, e.g. "unknown column 'Stage' ignored". */
	warnings?: string[];
}

// ---------------------------------------------------------------------------
// Change receipts (chat card + undo)
// ---------------------------------------------------------------------------

export interface TableChangeSample {
	row: string;
	column: string;
	before: string;
	after: string;
}

export interface TableChangeReceipt {
	kind: 'table_change';
	document_id: string;
	project_id: string;
	title: string;
	revision: number;
	rows_added: number;
	rows_updated: number;
	rows_deleted: number;
	cells_changed: number;
	columns_changed: string[];
	/** Up to 8 human-readable cell diffs. */
	sample: TableChangeSample[];
	/** Ops that undo this change (applied by POST /api/onto/tables/[id]/revert-change). */
	inverse_ops: TableRowOp[];
	/** Schema before the change, when columns changed. */
	inverse_schema?: TableSchema | null;
	/** Revision right after this change; undo refuses if the table moved on and conflicts. */
	applied_revision: number;
}
