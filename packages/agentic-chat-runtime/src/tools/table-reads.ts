// packages/agentic-chat-runtime/src/tools/table-reads.ts
//
// Chat reads for BuildOS Tables (docs/specs/tables/CONTRACT.md): get_onto_table_details
// and read_table_rows. A table is a document (type document.table) whose rows live in
// onto_document_rows. Loading, querying, and model formatting are single-sourced in
// `@buildos/shared-agent-ops/tables` (the same core the gateway/MCP ops call); this
// module only adds the chat access check and fits the result to the model budget.
//
// Fit rule: rows are dropped whole, never trimmed. The shared formatter drops rows to
// fit a character budget and reports rows_shown + next_offset; this module sizes that
// budget so the whole serialized payload fits TABLE_READ_MODEL_PAYLOAD_CHARS (JSON
// escaping included). The generic tool payload guard shrinks long strings, which would
// silently corrupt cell values, so these payloads must arrive already inside the budget.

import {
	TABLE_LIMITS,
	computeColumnTotals,
	describeTableSchemaForModel,
	formatTableForModelDetailed,
	isTableTypeKey,
	loadTable,
	queryTable,
	type LoadedTable,
	type TableAggregate,
	type TableCellValue,
	type TableFilter,
	type TableQuery,
	type TableQueryResult,
	type TableRow,
	type TableSchema,
	type TableSort
} from '@buildos/shared-agent-ops/tables';
import { isValidUUID } from '@buildos/shared-agent-ops/utils/validation-utils';
import { buildDetailNotFoundPayload, type AgenticChatSharedReadContextV1 } from './ontology-reads';

/**
 * Serialized-payload budget for a table read. The compaction layer gives these two
 * tools the 12K extended budget (a 25-row page of an 8-column table is ~6K), and
 * keeps ~1.2K for the untrusted-content notice wrapper.
 */
export const TABLE_READ_MODEL_PAYLOAD_CHARS = 10_800;
/** Room left for the `message` line both reads add after fitting (longest is ~110 chars). */
const TABLE_READ_MESSAGE_RESERVE_CHARS = 160;
const TABLE_DETAILS_DEFAULT_ROWS = 15;
const TABLE_DETAILS_MAX_ROWS = 50;
const TABLE_READ_MAX_GROUPS = 60;
const TABLE_READ_MAX_WARNINGS = 8;

export interface SharedGetOntoTableDetailsArgs {
	table_id: string;
	row_limit?: number;
}

export interface SharedReadTableRowsFilterArg {
	column: string;
	op: TableFilter['op'];
	value?: string | number | boolean | null;
	/** in / not_in list (kept apart from `value` so the schema needs no array union). */
	values?: Array<string | number>;
}

export interface SharedReadTableRowsArgs {
	table_id: string;
	filters?: SharedReadTableRowsFilterArg[];
	match?: 'all' | 'any';
	search?: string;
	sort?: TableSort[];
	columns?: string[];
	group_by?: string;
	aggregates?: TableAggregate[];
	limit?: number;
	offset?: number;
}

type TableDocumentRef = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	updated_at: string;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
	const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : NaN;
	if (Number.isNaN(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

function tableNotFound(tableId: string, reason?: string): Record<string, unknown> {
	return buildDetailNotFoundPayload(
		{
			entityType: 'table',
			idKey: 'table_id',
			id: tableId,
			searchTool: 'search_project'
		},
		reason ? { reason } : {}
	);
}

function errorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object') return null;
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' ? code : null;
}

/**
 * Resolve the table's project and assert read access BEFORE loading rows, so a
 * service-role host (the worker) never pulls rows the actor cannot read. Mirrors
 * the document detail read.
 */
async function loadAccessibleTable(
	context: AgenticChatSharedReadContextV1,
	tableId: string
): Promise<{ ok: true; table: LoadedTable } | { ok: false; payload: Record<string, unknown> }> {
	if (typeof tableId !== 'string' || !isValidUUID(tableId.trim())) {
		return { ok: false, payload: tableNotFound(String(tableId ?? '')) };
	}
	const id = tableId.trim();
	const { data: ref, error: refError } = await (context.client as any)
		.from('onto_documents')
		.select('id, project_id, type_key')
		.eq('id', id)
		.is('deleted_at', null)
		.maybeSingle();
	if (refError) throw refError;
	if (!ref) return { ok: false, payload: tableNotFound(id) };
	await context.access.assertProjectAccess(ref.project_id, 'read');
	if (!isTableTypeKey(ref.type_key)) {
		return {
			ok: false,
			payload: {
				status: 'not_a_table',
				found: false,
				table_id: id,
				document: { id, project_id: ref.project_id, type_key: ref.type_key },
				message:
					'This document is not a table. Read it with get_onto_document_details instead.'
			}
		};
	}
	try {
		return { ok: true, table: await loadTable(context.client as never, id) };
	} catch (error) {
		const code = errorCode(error);
		if (code === 'TABLE_NOT_FOUND' || code === 'NOT_A_TABLE') {
			return { ok: false, payload: tableNotFound(id) };
		}
		throw error;
	}
}

function documentRef(table: LoadedTable): TableDocumentRef {
	return {
		id: table.document.id,
		project_id: table.document.project_id,
		title: table.document.title,
		description: table.document.description ?? null,
		type_key: table.document.type_key,
		updated_at: table.document.updated_at
	};
}

/** Column totals keyed by column name, empty totals dropped. */
function totalsByName(schema: TableSchema, rows: TableRow[]): Record<string, number | string> {
	const totals = computeColumnTotals(schema, rows);
	const named: Record<string, number | string> = {};
	for (const column of schema.columns) {
		const value = totals[column.id];
		if (value === null || value === undefined) continue;
		named[column.name] = value;
	}
	return named;
}

function serializedLength(value: unknown): number {
	try {
		return JSON.stringify(value).length;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

/**
 * Format `rows` into `base` so the serialized payload fits the budget. The
 * formatter drops whole rows to meet its character cap; JSON escaping (newlines,
 * quotes) makes the payload a little longer than the text, so the cap is
 * corrected from the measured overshoot (at most four passes).
 */
function fitFormattedRows<TBase extends Record<string, unknown>>(
	base: TBase,
	format: (maxChars: number) => { text: string; rows_shown: number; next_offset: number | null },
	rowCount: number,
	startOffset = 0,
	budget = TABLE_READ_MODEL_PAYLOAD_CHARS - TABLE_READ_MESSAGE_RESERVE_CHARS
): TBase & { rows?: string; rows_returned: number; next_offset: number | null } {
	// Not even one row fits (a very wide row): page from here with fewer columns.
	const empty = { ...base, rows_returned: 0, next_offset: rowCount > 0 ? startOffset : null };
	if (rowCount === 0) return { ...base, rows_returned: 0, next_offset: null };
	let maxChars = budget - serializedLength(empty) - 120;
	for (let attempt = 0; attempt < 4 && maxChars >= 300; attempt += 1) {
		const formatted = format(maxChars);
		const payload = {
			...base,
			rows: formatted.text,
			rows_returned: formatted.rows_shown,
			next_offset: formatted.next_offset
		};
		const length = serializedLength(payload);
		if (length <= budget) return payload;
		maxChars -= length - budget + 60;
	}
	return empty;
}

export async function getOntoTableDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoTableDetailsArgs
): Promise<Record<string, unknown>> {
	const loaded = await loadAccessibleTable(context, args.table_id);
	if (!loaded.ok) return loaded.payload;
	const { table } = loaded;
	const rowLimit = clampInteger(
		args.row_limit,
		TABLE_DETAILS_DEFAULT_ROWS,
		0,
		TABLE_DETAILS_MAX_ROWS
	);
	const rowCount = table.rows.length;
	const sample = table.rows.slice(0, rowLimit);
	const base = {
		document: documentRef(table),
		table: {
			row_count: rowCount,
			column_count: table.schema.columns.length,
			revision: table.schema.revision
		},
		columns: describeTableSchemaForModel(table.schema),
		totals: totalsByName(table.schema, table.rows),
		csv_path: `/api/onto/tables/${table.document.id}/export.csv`
	};
	const payload =
		sample.length > 0
			? fitFormattedRows(
					base,
					(maxChars) =>
						formatTableForModelDetailed(table.schema, sample, {
							offset: 0,
							totalMatched: rowCount,
							maxChars
						}),
					sample.length
				)
			: { ...base, rows_returned: 0, next_offset: rowCount > 0 ? 0 : null };
	const shown = payload.rows_returned;
	return {
		...payload,
		message:
			rowCount === 0
				? 'Table loaded; it has no rows yet.'
				: shown < rowCount
					? `Table loaded: first ${shown} of ${rowCount} rows. Use read_table_rows to filter, group, total, or page from next_offset.`
					: `Table loaded: all ${rowCount} rows are shown.`
	};
}

/** `values` carries in / not_in lists; everything else is one scalar `value`. */
function normalizeFilters(filters: SharedReadTableRowsArgs['filters']): TableFilter[] | undefined {
	if (!Array.isArray(filters) || filters.length === 0) return undefined;
	return filters
		.filter((filter) => filter && typeof filter.column === 'string' && filter.op)
		.map((filter) => {
			const list = Array.isArray(filter.values) ? filter.values : null;
			const value: TableCellValue | TableCellValue[] | undefined =
				list && (filter.op === 'in' || filter.op === 'not_in')
					? list
					: list && filter.value === undefined
						? list
						: (filter.value ?? undefined);
			return {
				column: filter.column,
				op: filter.op,
				...(value !== undefined ? { value } : {})
			};
		});
}

function buildTableQuery(args: SharedReadTableRowsArgs): TableQuery {
	const query: TableQuery = {
		limit: clampInteger(
			args.limit,
			TABLE_LIMITS.defaultAgentReadRows,
			0,
			TABLE_LIMITS.maxAgentReadRows
		),
		offset: clampInteger(args.offset, 0, 0, Number.MAX_SAFE_INTEGER)
	};
	const filters = normalizeFilters(args.filters);
	if (filters?.length) query.filters = filters;
	if (args.match === 'any' || args.match === 'all') query.match = args.match;
	if (typeof args.search === 'string' && args.search.trim()) query.search = args.search.trim();
	if (Array.isArray(args.sort) && args.sort.length > 0) query.sort = args.sort;
	if (Array.isArray(args.columns) && args.columns.length > 0) query.columns = args.columns;
	if (typeof args.group_by === 'string' && args.group_by.trim()) {
		query.group_by = args.group_by.trim();
	}
	if (Array.isArray(args.aggregates) && args.aggregates.length > 0) {
		query.aggregates = args.aggregates;
	}
	return query;
}

function compactGroups(groups: TableQueryResult['groups']): {
	groups?: Array<Record<string, unknown>>;
	groups_omitted?: number;
} {
	if (!groups?.length) return {};
	const shown = groups.slice(0, TABLE_READ_MAX_GROUPS).map((group) => ({
		group: group.label,
		count: group.count,
		...(Object.keys(group.aggregates ?? {}).length > 0 ? { aggregates: group.aggregates } : {})
	}));
	return {
		groups: shown,
		...(groups.length > shown.length ? { groups_omitted: groups.length - shown.length } : {})
	};
}

export async function readTableRows(
	context: AgenticChatSharedReadContextV1,
	args: SharedReadTableRowsArgs
): Promise<Record<string, unknown>> {
	const loaded = await loadAccessibleTable(context, args.table_id);
	if (!loaded.ok) return loaded.payload;
	const { table } = loaded;
	const query = buildTableQuery(args);
	const result = queryTable(table, query);
	const columnIds = result.columns.map((column) => column.id);
	const warnings = (result.warnings ?? []).slice(0, TABLE_READ_MAX_WARNINGS);
	const base = {
		document: documentRef(table),
		total_rows: result.total_rows,
		matched_rows: result.matched_rows,
		offset: result.offset,
		...compactGroups(result.groups),
		...(result.aggregates && Object.keys(result.aggregates).length > 0
			? { aggregates: result.aggregates }
			: {}),
		...(warnings.length > 0 ? { warnings } : {})
	};
	const pageRows = result.rows;
	const payload =
		pageRows.length > 0
			? fitFormattedRows(
					base,
					(maxChars) =>
						formatTableForModelDetailed(table.schema, pageRows, {
							columns: columnIds,
							offset: result.offset,
							totalMatched: result.matched_rows,
							maxChars
						}),
					pageRows.length,
					result.offset
				)
			: { ...base, rows_returned: 0, next_offset: result.next_offset ?? null };
	const shown = payload.rows_returned;
	const nextOffset = payload.next_offset;
	return {
		...payload,
		message:
			result.matched_rows === 0
				? 'No rows match.'
				: shown === 0 && query.limit === 0
					? `${result.matched_rows} matching rows; groups and aggregates only.`
					: shown === 0
						? 'A row is too wide to show; read again with fewer columns (columns: [...]).'
						: nextOffset !== null
							? `Showing ${shown} of ${result.matched_rows} matching rows; read again with offset ${nextOffset} for more.`
							: `Showing ${shown === result.matched_rows ? 'all ' : ''}${shown} matching rows.`
	};
}
