// packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.ts
//
// Gateway handlers for BuildOS Tables (docs/specs/tables/CONTRACT.md): the one
// implementation behind the chat table tools (via the worker) and the MCP /
// agent-call table tools.
//
// A table is an onto_documents row (type_key document.table); its rows live in
// onto_document_rows and change only through onto_document_table_apply. These
// handlers use the admin client after the gateway's usual project visibility
// and write checks, and pass the caller's actor id to the RPC.
//
// Agents address rows by handle ("r12") and columns by name. Reads return
// model-ready text that fits itself by dropping whole rows; writes return a
// `table_change` receipt with inverse ops for the chat card's Undo.
import type { AgentCallScope, BuildosAgentAllowedOp } from '@buildos/shared-types';
import { logCreateAsync, logUpdateAsync } from '../ops/async-activity-logger';
import { updateDocNodeMetadata } from '../ontology/doc-structure.service';
import { writeDocumentHeadAndVersion } from '../ontology/document-write.service';
import { toDocumentSnapshot } from '../ontology/versioning.service';
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { TableServiceError } from '../tables/table-errors';
import { applyTableChanges, createTableDocument, loadTable } from '../tables/table-repository';
import { enqueueTableAiFill, TableAiFillError } from '../tables/table-ai-fill';
import {
	applyColumnChanges,
	buildTableSchema,
	coerceRowInput,
	isRecord,
	normalizeUrlText,
	resolveColumn,
	withNewChoices
} from '../tables/table-schema';
import { computeColumnTotals, queryTable } from '../tables/table-query';
import { inferColumns, parseDelimitedText, tableToCsv } from '../tables/table-csv';
import {
	describeTableSchemaForModel,
	formatTableForModelDetailed
} from '../tables/table-llm-format';
import { buildTableChangeReceipt, previewTableRowChanges } from '../tables/table-change';
import {
	TABLE_LIMITS,
	isTableTypeKey,
	parseRowHandle,
	rowHandle,
	type LoadedTable,
	type TableAggregateValue,
	type TableApplyResult,
	type TableCellMeta,
	type TableCellValue,
	type TableColumnChange,
	type TableColumnInput,
	type TableQuery,
	type TableRow,
	type TableRowOp,
	type TableSchema
} from '../tables/table-types';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	contextActorId,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import { ONTO_DOCUMENT_SELECT } from './op-execution-gateway.config';
import { assertValidId } from './op-execution-gateway.ids';
import { requireTrimmedString } from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import {
	ExternalToolGatewayError,
	normalizeGatewayError,
	rolledBackWriteDetails
} from './op-execution-gateway.responses';
import type { GatewayLookupMemo, ToolExecutionContext } from './op-execution-gateway.types';
import { normalizeAndValidateGatewayWriteArgs } from './op-execution-gateway.validation';

/** Target size of one table read result (the chat worker caps tool payloads at 6,000 chars). */
const READ_PAYLOAD_TARGET_CHARS = 5_400;
const MIN_ROWS_TEXT_CHARS = 600;
const MAX_REPORTED_ERRORS = 12;
const LARGE_DELETION_MIN_ROWS = 10;
const LARGE_DELETION_FRACTION = 0.3;
const MAX_CSV_TEXT_BYTES = 200 * 1024;
const MAX_CSV_EXPORT_CHARS = 500_000;
const MAX_SOURCE_URLS = 10;
const MAX_SOURCE_NOTE_CHARS = 1_000;
const MAX_GROUPS_RETURNED = 50;
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

type TableAccess = {
	table: LoadedTable;
	project: OntologyProjectSummary;
	archived: boolean;
};

export function tableCsvPath(tableId: string): string {
	return `/api/onto/tables/${tableId}/export.csv`;
}

function tableUrl(projectId: string, tableId: string): string {
	return `/projects/${projectId}/documents/${tableId}`;
}

/** Tables errors → the gateway's error vocabulary, with model-actionable wording. */
export function tableErrorToGatewayError(error: unknown): ExternalToolGatewayError {
	if (error instanceof ExternalToolGatewayError) return error;
	if (error instanceof TableServiceError) {
		switch (error.code) {
			case 'TABLE_NOT_FOUND':
				return new ExternalToolGatewayError('NOT_FOUND', 'Table not found');
			case 'NOT_A_TABLE':
				return new ExternalToolGatewayError(
					'VALIDATION_ERROR',
					'That document is not a table. Use the document tools (get_onto_document_details) for it.'
				);
			case 'TABLE_CONFLICT':
			case 'ROW_CONFLICT':
			case 'ROW_NOT_FOUND':
				return new ExternalToolGatewayError(
					'CONFLICT',
					`The table changed while the agent was editing it. Read it again and retry. (${error.message})`,
					{ reason: error.code }
				);
			default:
				return new ExternalToolGatewayError('VALIDATION_ERROR', error.message, {
					reason: error.code
				});
		}
	}
	if (error instanceof TableAiFillError) {
		const conflict = error.code === 'RUN_ACTIVE';
		const internal = error.code === 'DATABASE_ERROR' || error.code === 'QUEUE_FAILED';
		return new ExternalToolGatewayError(
			conflict ? 'CONFLICT' : internal ? 'INTERNAL' : 'VALIDATION_ERROR',
			error.message,
			{ reason: error.code }
		);
	}
	const normalized = normalizeGatewayError(error);
	const rolledBack = rolledBackWriteDetails(error as { code?: string | null } | null);
	return rolledBack
		? new ExternalToolGatewayError(normalized.code, normalized.message, {
				...(normalized.details ?? {}),
				...rolledBack
			})
		: normalized;
}

function validationError(message: string, errors?: string[]): ExternalToolGatewayError {
	if (!errors || errors.length === 0)
		return new ExternalToolGatewayError('VALIDATION_ERROR', message);
	const shown = errors.slice(0, MAX_REPORTED_ERRORS);
	const more = errors.length - shown.length;
	return new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		`${message}\n- ${shown.join('\n- ')}${more > 0 ? `\n- …and ${more} more` : ''}`,
		{ errors: errors.slice(0, 50) }
	);
}

async function loadTableForAccess(
	context: ToolExecutionContext,
	tableIdArg: unknown,
	access: 'read' | 'write'
): Promise<TableAccess> {
	const tableId = assertValidId(tableIdArg, 'table_id');
	const visible = await loadVisibleProjects(context);
	let table: LoadedTable;
	try {
		table = await loadTable(context.admin, tableId);
	} catch (error) {
		throw tableErrorToGatewayError(error);
	}
	// Same rule as document reads: a table outside the caller's visible
	// projects does not exist for this caller.
	const project = visible.projects.find((entry) => entry.id === table.document.project_id);
	if (!project) throw new ExternalToolGatewayError('NOT_FOUND', 'Table not found');
	if (access === 'write') assertProjectWriteAccess(project, context.scope);
	const archived = Boolean(table.document.archived_at) || table.document.state_key === 'archived';
	return { table, project, archived };
}

function assertNotArchivedForWrite(access: TableAccess): void {
	if (access.archived) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'This table is archived. Restore it with update_onto_table {archived: false} before changing it.'
		);
	}
}

function tableSummary(
	table: LoadedTable,
	project: OntologyProjectSummary,
	overrides: { revision?: number; row_count?: number; archived?: boolean } = {}
) {
	const { document, schema } = table;
	return {
		id: document.id,
		project_id: document.project_id,
		project_name: project.name,
		title: document.title,
		description: document.description,
		type_key: document.type_key,
		state_key: document.state_key,
		updated_at: document.updated_at,
		archived:
			overrides.archived ??
			(Boolean(document.archived_at) || document.state_key === 'archived'),
		revision: overrides.revision ?? schema.revision,
		row_count: overrides.row_count ?? table.rows.length,
		columns: schema.columns.map((column) => column.name),
		url: tableUrl(document.project_id, document.id),
		csv_path: tableCsvPath(document.id)
	};
}

/** Footer totals keyed for a model: "Salary (sum)", "Remote (checked)", "Company (filled)". */
function totalsForModel(
	schema: TableSchema,
	rows: TableRow[]
): Record<string, TableAggregateValue> {
	const totals = computeColumnTotals(schema, rows);
	const out: Record<string, TableAggregateValue> = {};
	for (const column of schema.columns) {
		if (column.hidden) continue;
		const label =
			column.type === 'number' ? 'sum' : column.type === 'checkbox' ? 'checked' : 'filled';
		out[`${column.name} (${label})`] = totals[column.id] ?? null;
	}
	return out;
}

function rowsBudget(otherParts: unknown): number {
	return Math.max(
		MIN_ROWS_TEXT_CHARS,
		READ_PAYLOAD_TARGET_CHARS - JSON.stringify(otherParts).length
	);
}

/** CSV of the whole table, trimmed by whole rows to stay under the export cap. */
function boundedCsv(schema: TableSchema, rows: TableRow[]): { csv: string; truncated: boolean } {
	let count = rows.length;
	let csv = tableToCsv(schema, rows);
	while (csv.length > MAX_CSV_EXPORT_CHARS && count > 0) {
		count = Math.floor(count * 0.8);
		csv = tableToCsv(schema, rows.slice(0, count));
	}
	return { csv, truncated: count < rows.length };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTable(context: ToolExecutionContext, args: Record<string, unknown>) {
	const { table, project, archived } = await loadTableForAccess(context, args.table_id, 'read');
	const rowLimit = clampLimit(args.row_limit, 15, 0, 50);
	const summary = tableSummary(table, project);
	const schemaText = describeTableSchemaForModel(table.schema);
	const totals = totalsForModel(table.schema, table.rows);
	const base = {
		table: summary,
		schema_text: schemaText,
		row_count: table.rows.length,
		totals,
		csv_path: tableCsvPath(table.document.id),
		...(archived ? { note: 'This table is archived.' } : {})
	};
	const formatted =
		rowLimit > 0
			? formatTableForModelDetailed(table.schema, table.rows.slice(0, rowLimit), {
					offset: 0,
					totalMatched: table.rows.length,
					maxChars: rowsBudget(base)
				})
			: {
					text: `${table.rows.length} rows (none requested).`,
					rows_shown: 0,
					next_offset: table.rows.length > 0 ? 0 : null
				};
	const result: Record<string, unknown> = {
		...base,
		rows_text: formatted.text,
		rows_shown: formatted.rows_shown,
		next_offset: formatted.next_offset
	};
	if (args.format === 'csv') {
		const { csv, truncated } = boundedCsv(table.schema, table.rows);
		result.table = {
			...summary,
			content: csv,
			...(truncated ? { content_truncated: true } : {})
		};
	}
	return result;
}

function optionalArray(value: unknown, field: string): unknown[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${field} must be an array`);
	}
	return value;
}

export async function queryTableRows(context: ToolExecutionContext, args: Record<string, unknown>) {
	const { table, project, archived } = await loadTableForAccess(context, args.table_id, 'read');
	const limit = clampLimit(
		args.limit,
		TABLE_LIMITS.defaultAgentReadRows,
		1,
		TABLE_LIMITS.maxAgentReadRows
	);
	const offset =
		typeof args.offset === 'number' && Number.isFinite(args.offset)
			? Math.min(TABLE_LIMITS.maxRows, Math.max(0, Math.floor(args.offset)))
			: 0;
	const query: TableQuery = {
		filters: optionalArray(args.filters, 'filters') as TableQuery['filters'],
		match: args.match === 'any' ? 'any' : 'all',
		search: typeof args.search === 'string' ? args.search : undefined,
		sort: optionalArray(args.sort, 'sort') as TableQuery['sort'],
		columns: optionalArray(args.columns, 'columns') as TableQuery['columns'],
		group_by: typeof args.group_by === 'string' ? args.group_by : undefined,
		aggregates: optionalArray(args.aggregates, 'aggregates') as TableQuery['aggregates'],
		limit,
		offset
	};
	const result = queryTable(table, query);
	const groups = result.groups?.slice(0, MAX_GROUPS_RETURNED).map((group) => ({
		label: group.label,
		count: group.count,
		...(Object.keys(group.aggregates).length > 0 ? { aggregates: group.aggregates } : {})
	}));
	const base = {
		table: {
			id: table.document.id,
			project_id: table.document.project_id,
			project_name: project.name,
			title: table.document.title,
			revision: table.schema.revision,
			row_count: result.total_rows,
			...(archived ? { archived: true } : {})
		},
		matched_rows: result.matched_rows,
		offset: result.offset,
		...(groups
			? {
					groups,
					...(result.groups!.length > groups.length
						? { groups_truncated: result.groups!.length - groups.length }
						: {})
				}
			: {}),
		...(result.aggregates ? { aggregates: result.aggregates } : {}),
		...(result.warnings ? { warnings: result.warnings } : {}),
		csv_path: tableCsvPath(table.document.id)
	};
	const formatted = formatTableForModelDetailed(table.schema, result.rows, {
		columns: result.columns.map((column) => column.id),
		offset: result.offset,
		totalMatched: result.matched_rows,
		maxChars: rowsBudget(base)
	});
	return {
		...base,
		rows_shown: formatted.rows_shown,
		next_offset: formatted.next_offset,
		row_handles: result.rows
			.slice(0, formatted.rows_shown)
			.map((row) => rowHandle(row.row_number)),
		rows_text: formatted.text
	};
}

export async function listTables(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	let projectIds = visible.projects.map((project) => project.id);
	if (args.project_id !== undefined && args.project_id !== null) {
		projectIds = [assertAccessibleProject(visible.projectMap, args.project_id).id];
	}
	if (projectIds.length === 0) {
		return { tables: [], total: 0, pagination: buildPaginationForRows(offset, limit, 0, 0) };
	}
	const { data, error, count } = await context.admin
		.from('onto_documents')
		.select('id, project_id, title, description, type_key, state_key, props, updated_at', {
			count: 'exact'
		})
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.is('archived_at', null)
		.or('type_key.eq.document.table,type_key.like.document.table.*')
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to list tables');
	}
	const tables = ((data ?? []) as Array<Record<string, unknown>>)
		.filter((row) => row.state_key !== 'archived')
		.map((row) => {
			const props = isRecord(row.props) ? row.props : {};
			const schema = isRecord(props.table) ? props.table : {};
			const columns = Array.isArray(schema.columns)
				? schema.columns
						.filter((column): column is Record<string, unknown> => isRecord(column))
						.map((column) => String(column.name ?? ''))
						.filter(Boolean)
				: [];
			const id = String(row.id);
			const projectId = String(row.project_id);
			return {
				id,
				project_id: projectId,
				project_name: visible.projectMap.get(projectId)?.name ?? null,
				title: typeof row.title === 'string' ? row.title : '',
				description: typeof row.description === 'string' ? row.description : null,
				row_count: typeof schema.row_count === 'number' ? schema.row_count : 0,
				columns: columns.slice(0, 15),
				column_count: columns.length,
				updated_at: row.updated_at ?? null,
				url: tableUrl(projectId, id),
				csv_path: tableCsvPath(id)
			};
		});
	const total = count ?? tables.length;
	return {
		tables,
		total,
		pagination: buildPaginationForRows(offset, limit, total, tables.length),
		message: `Found ${total} table${total === 1 ? '' : 's'}.`
	};
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function readColumnInputs(raw: unknown, field: string): TableColumnInput[] {
	const list = optionalArray(raw, field) ?? [];
	return list.map((entry, index) => {
		if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`${field}[${index}] needs a name, e.g. {"name": "Company", "type": "text"}`
			);
		}
		return entry as unknown as TableColumnInput;
	});
}

/** CSV-inferred columns, with the caller's column hints (matched by name) taking precedence. */
function mergeColumnHints(
	inferred: TableColumnInput[],
	hints: TableColumnInput[]
): TableColumnInput[] {
	if (hints.length === 0) return inferred;
	const byName = new Map(hints.map((hint) => [hint.name.trim().toLowerCase(), hint]));
	const merged = inferred.map((column) => {
		const hint = byName.get(column.name.trim().toLowerCase());
		if (!hint) return column;
		byName.delete(column.name.trim().toLowerCase());
		return { ...column, ...hint, name: column.name };
	});
	return [...merged, ...byName.values()];
}

function rowErrors(schema: TableSchema, rows: unknown[], label: string): string[] {
	const errors: string[] = [];
	rows.forEach((row, index) => {
		if (!isRecord(row)) {
			errors.push(`${label}[${index}] must be an object keyed by column name`);
			return;
		}
		for (const error of coerceRowInput(schema, row).errors) {
			errors.push(`${label}[${index}]: ${error}`);
		}
	});
	return errors;
}

export async function createTable(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	// Without allowNull, requireTrimmedString returns a string or throws.
	const title = requireTrimmedString(args.title, 'title') as string;
	const description =
		args.description === undefined || args.description === null
			? null
			: requireTrimmedString(args.description, 'description', { allowEmpty: true }) || null;
	const parentId =
		args.parent_id === undefined || args.parent_id === null
			? null
			: assertValidId(args.parent_id, 'parent_id');

	const hints = readColumnInputs(args.columns, 'columns');
	const csvText = typeof args.csv === 'string' && args.csv.trim() ? args.csv : null;
	if (csvText && args.rows !== undefined && args.rows !== null) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'Pass rows or csv, not both.');
	}

	let columns: TableColumnInput[];
	let rows: unknown[];
	if (csvText) {
		const bytes = new TextEncoder().encode(csvText).length;
		if (bytes > MAX_CSV_TEXT_BYTES) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`csv exceeds the 200 KB limit (${Math.round(bytes / 1024)} KB). Create the table with fewer rows, then add the rest with update_onto_table_rows.`
			);
		}
		const parsed = parseDelimitedText(csvText);
		if (parsed.headers.length === 0) {
			throw new ExternalToolGatewayError('VALIDATION_ERROR', 'csv needs a header row.');
		}
		if (parsed.rows.length > TABLE_LIMITS.maxOpsPerApply) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`csv has ${parsed.rows.length} rows; one call can import at most ${TABLE_LIMITS.maxOpsPerApply}.`
			);
		}
		columns = mergeColumnHints(inferColumns(parsed.headers, parsed.rows), hints);
		rows = parsed.rows.map((values) =>
			Object.fromEntries(parsed.headers.map((header, index) => [header, values[index] ?? '']))
		);
	} else {
		if (hints.length === 0) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'columns is required (or pass csv): e.g. columns: [{"name": "Company"}, {"name": "Stage", "type": "select"}].'
			);
		}
		columns = hints;
		rows = optionalArray(args.rows, 'rows') ?? [];
		if (rows.length > TABLE_LIMITS.maxAgentRowsPerCall) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`rows has ${rows.length} entries; one call can add at most ${TABLE_LIMITS.maxAgentRowsPerCall}. Create the table with the first ${TABLE_LIMITS.maxAgentRowsPerCall}, then add the rest with update_onto_table_rows.`
			);
		}
	}

	let previewSchema: TableSchema;
	try {
		previewSchema = buildTableSchema(columns);
	} catch (error) {
		throw tableErrorToGatewayError(error);
	}
	const errors = rowErrors(previewSchema, rows, 'rows');
	if (errors.length > 0) {
		throw validationError('Some values do not fit their columns; nothing was created.', errors);
	}

	if (parentId) {
		const { data: parent, error: parentError } = await context.admin
			.from('onto_documents')
			.select('id')
			.eq('id', parentId)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.maybeSingle();
		if (parentError) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				parentError.message || 'Failed to load parent document'
			);
		}
		if (!parent)
			throw new ExternalToolGatewayError(
				'NOT_FOUND',
				'Parent document not found in this project'
			);
	}

	const actorId = await contextActorId(context);
	let created: Awaited<ReturnType<typeof createTableDocument>>;
	try {
		created = await createTableDocument(context.admin, {
			projectId: project.id,
			actorId,
			title,
			description,
			columns,
			rows: rows as Record<string, unknown>[],
			parentId,
			source: {
				kind: csvText ? 'csv' : 'agent',
				created_at: new Date().toISOString(),
				origin_entity: context.chatSessionId
					? { kind: 'chat_session', id: context.chatSessionId }
					: null
			}
		});
	} catch (error) {
		throw tableErrorToGatewayError(error);
	}

	const { table } = created;
	await logCreateAsync(
		context.admin,
		project.id,
		'document',
		table.document.id,
		{
			title: table.document.title,
			type_key: table.document.type_key,
			state_key: table.document.state_key,
			table: { columns: table.schema.columns.length, rows: table.rows.length }
		},
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	const apply: TableApplyResult = created.apply ?? {
		document_id: table.document.id,
		revision: table.schema.revision,
		row_count: table.rows.length,
		updated_at: table.document.updated_at,
		results: []
	};
	return {
		table: tableSummary(table, project, {
			revision: apply.revision,
			row_count: apply.row_count
		}),
		table_change: buildTableChangeReceipt({ table, apply }),
		rows_added: table.rows.length,
		...(created.warnings.length > 0 ? { warnings: created.warnings } : {}),
		message: `Created table "${table.document.title}" with ${table.rows.length} row${table.rows.length === 1 ? '' : 's'} and ${table.schema.columns.length} column${table.schema.columns.length === 1 ? '' : 's'}.`
	};
}

// ---------------------------------------------------------------------------
// Update (title, description, columns, AI fills, archive)
// ---------------------------------------------------------------------------

function readColumnChanges(raw: unknown): TableColumnChange[] | undefined {
	const list = optionalArray(raw, 'column_changes');
	if (!list) return undefined;
	return list.map((entry, index) => {
		if (!isRecord(entry) || typeof entry.action !== 'string') {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`column_changes[${index}] needs an action (add, rename, retype, update, delete, move)`
			);
		}
		return entry as unknown as TableColumnChange;
	});
}

function readStringList(raw: unknown, field: string): string[] | undefined {
	const list = optionalArray(raw, field);
	if (!list) return undefined;
	return list.map((entry, index) => {
		if (typeof entry !== 'string' || !entry.trim()) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`${field}[${index}] must be a column name`
			);
		}
		return entry.trim();
	});
}

function readArchived(value: unknown): boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'archived must be true or false');
	}
	return value;
}

export async function updateTable(context: ToolExecutionContext, args: Record<string, unknown>) {
	const access = await loadTableForAccess(context, args.table_id, 'write');
	const { project } = access;
	const archived = readArchived(args.archived);
	if (access.archived && archived !== false) assertNotArchivedForWrite(access);

	const title =
		args.title === undefined
			? undefined
			: (requireTrimmedString(args.title, 'title') as string);
	const description =
		args.description === undefined
			? undefined
			: args.description === null
				? null
				: requireTrimmedString(args.description, 'description', { allowEmpty: true }) ||
					null;
	const columnChanges = readColumnChanges(args.column_changes);
	const fillColumns = readStringList(args.fill_ai_columns, 'fill_ai_columns') ?? [];
	const hasColumnChanges = Boolean(columnChanges && columnChanges.length > 0);
	if (
		title === undefined &&
		description === undefined &&
		!hasColumnChanges &&
		fillColumns.length === 0 &&
		archived === undefined
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Pass at least one change: title, description, column_changes, fill_ai_columns, or archived.'
		);
	}

	const plan = (table: LoadedTable) => {
		if (!hasColumnChanges) return null;
		try {
			return applyColumnChanges(table.schema, table.rows, columnChanges!);
		} catch (error) {
			throw tableErrorToGatewayError(error);
		}
	};

	// Validate everything before the first write so a bad change writes nothing.
	let table = access.table;
	let columnPlan = plan(table);
	const schemaAfter = columnPlan?.schema ?? table.schema;
	for (const ref of fillColumns) {
		const column = resolveColumn(schemaAfter, ref);
		if (!column) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`fill_ai_columns: unknown column "${ref}". Columns: ${schemaAfter.columns.map((entry) => entry.name).join(', ')}.`
			);
		}
		if (!column.ai?.prompt) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`"${column.name}" is not a question column. Give it a question first: column_changes [{action: "update", column: "${column.name}", ai: {prompt: "…", research: true}}].`
			);
		}
	}

	const actorId = await contextActorId(context);
	const warnings: string[] = [];
	let apply: TableApplyResult | null = null;
	let receipt: ReturnType<typeof buildTableChangeReceipt> | null = null;

	if (columnPlan) {
		for (let attempt = 0; ; attempt += 1) {
			try {
				apply = await applyTableChanges(context.admin, {
					documentId: table.document.id,
					ops: columnPlan.rowOps,
					schema: columnPlan.schema,
					expectedRevision:
						columnPlan.rowOps.length <= TABLE_LIMITS.maxOpsPerApply
							? table.schema.revision
							: null,
					actorId
				});
				break;
			} catch (error) {
				const retry =
					attempt === 0 &&
					error instanceof TableServiceError &&
					(error.code === 'TABLE_CONFLICT' || error.code === 'ROW_CONFLICT');
				if (!retry) throw tableErrorToGatewayError(error);
				table = (await loadTableForAccess(context, table.document.id, 'write')).table;
				columnPlan = plan(table)!;
			}
		}
		receipt = buildTableChangeReceipt({
			table: { document: table.document, schema: columnPlan.schema },
			apply,
			previousSchema: table.schema
		});
		warnings.push(...columnPlan.warnings);
	}

	let document = table.document;
	if (title !== undefined || description !== undefined || archived !== undefined) {
		const { data: head, error: headError } = await context.admin
			.from('onto_documents')
			.select(ONTO_DOCUMENT_SELECT)
			.eq('id', table.document.id)
			.maybeSingle();
		if (headError) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				headError.message || 'Failed to load table'
			);
		}
		if (!head) throw new ExternalToolGatewayError('NOT_FOUND', 'Table not found');
		const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (title !== undefined) update.title = title;
		if (description !== undefined) update.description = description;
		if (archived !== undefined) update.archived_at = archived ? new Date().toISOString() : null;
		const write = await writeDocumentHeadAndVersion({
			supabase: context.admin,
			documentId: table.document.id,
			projectId: project.id,
			update,
			expectedUpdatedAt: head.updated_at,
			actorId,
			previousSnapshot: toDocumentSnapshot(head),
			changeSource: 'api'
		});
		if (write.status === 'conflict') {
			throw new ExternalToolGatewayError(
				'CONFLICT',
				`The table changed while the agent was editing it. Read it again and retry.${receipt ? ' (Column changes were saved.)' : ''}`
			);
		}
		if (write.status === 'error') {
			const message =
				isRecord(write.error) && typeof write.error.message === 'string'
					? write.error.message
					: 'Failed to update table';
			throw new ExternalToolGatewayError('INTERNAL', message);
		}
		const saved = write.document as Record<string, unknown>;
		document = {
			...document,
			title: typeof saved.title === 'string' ? saved.title : document.title,
			description: typeof saved.description === 'string' ? saved.description : null,
			updated_at:
				typeof saved.updated_at === 'string' ? saved.updated_at : document.updated_at,
			archived_at: typeof saved.archived_at === 'string' ? saved.archived_at : null
		};
		if (title !== undefined || description !== undefined) {
			try {
				await updateDocNodeMetadata(
					context.admin,
					project.id,
					table.document.id,
					{ title: document.title, description: document.description },
					actorId
				);
			} catch (treeError) {
				console.warn(
					'[External Tool Gateway] Failed to sync table tree metadata:',
					treeError
				);
			}
		}
	}

	const fills: Array<Record<string, unknown>> = [];
	const fillErrors: Array<{ column: string; code: string; message: string }> = [];
	for (const ref of fillColumns) {
		try {
			const run = await enqueueTableAiFill(context.admin, {
				documentId: table.document.id,
				column: ref,
				onlyEmpty: true,
				userId: context.userId,
				actorId
			});
			fills.push({
				column: run.column_name,
				run_id: run.run_id,
				row_count: run.row_count,
				remaining: run.remaining,
				research: run.research
			});
		} catch (error) {
			const mapped = tableErrorToGatewayError(error);
			fillErrors.push({
				column: ref,
				code: String(
					(mapped.details as { reason?: unknown } | undefined)?.reason ?? mapped.code
				),
				message: mapped.message
			});
		}
	}
	const onlyFills =
		!columnPlan && title === undefined && description === undefined && archived === undefined;
	if (onlyFills && fills.length === 0 && fillErrors.length > 0) {
		throw tableErrorToGatewayError(
			new TableAiFillError(
				fillErrors[0]!.code as never,
				fillErrors.map((entry) => `${entry.column}: ${entry.message}`).join(' ')
			)
		);
	}

	const schema = columnPlan?.schema ?? table.schema;
	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		table.document.id,
		{
			title: access.table.document.title,
			archived: access.archived,
			columns: access.table.schema.columns.map((column) => column.name)
		},
		{
			title: document.title,
			archived: archived ?? access.archived,
			columns: schema.columns.map((column) => column.name),
			...(receipt ? { columns_changed: receipt.columns_changed } : {}),
			...(fills.length > 0 ? { ai_fill_runs: fills.map((fill) => fill.column) } : {})
		},
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	const changed: string[] = [];
	if (title !== undefined) changed.push('title');
	if (description !== undefined) changed.push('description');
	if (receipt && receipt.columns_changed.length > 0) {
		changed.push(`columns (${receipt.columns_changed.join(', ')})`);
	}
	if (archived !== undefined) changed.push(archived ? 'archived' : 'restored');
	if (fills.length > 0) changed.push(`filling ${fills.map((fill) => fill.column).join(', ')}`);

	return {
		table: tableSummary({ document, schema, rows: table.rows }, project, {
			revision: apply?.revision ?? table.schema.revision,
			row_count: apply?.row_count ?? table.rows.length,
			archived: archived ?? access.archived
		}),
		...(receipt ? { table_change: receipt } : {}),
		...(fills.length > 0 ? { ai_fill_runs: fills } : {}),
		...(fillErrors.length > 0 ? { ai_fill_errors: fillErrors } : {}),
		...(warnings.length > 0 ? { warnings } : {}),
		message: `Updated table "${document.title}": ${changed.join('; ') || 'no changes'}.`
	};
}

// ---------------------------------------------------------------------------
// Rows (add / update / delete by handle)
// ---------------------------------------------------------------------------

type RowPlan = {
	ops: TableRowOp[];
	schema: TableSchema;
	schemaChanged: boolean;
	counts: { add: number; update: number; delete: number };
};

function sourcesToMeta(
	schema: TableSchema,
	sources: unknown,
	cells: Record<string, TableCellValue>,
	label: string,
	errors: string[],
	at: string
): Record<string, TableCellMeta> | undefined {
	if (sources === undefined || sources === null) return undefined;
	if (!isRecord(sources)) {
		errors.push(`${label}.sources must be an object keyed by column name`);
		return undefined;
	}
	const meta: Record<string, TableCellMeta> = {};
	for (const [key, raw] of Object.entries(sources)) {
		const column = resolveColumn(schema, key);
		if (!column) {
			errors.push(`${label}.sources: unknown column "${key}"`);
			continue;
		}
		if (!(column.id in cells)) {
			errors.push(
				`${label}.sources["${key}"]: sources can only describe cells written in the same entry`
			);
			continue;
		}
		if (cells[column.id] === null) continue;
		if (!isRecord(raw)) {
			errors.push(`${label}.sources["${key}"] must be {urls?, note?, confidence?}`);
			continue;
		}
		const urls = (Array.isArray(raw.urls) ? raw.urls : [])
			.filter((url): url is string => typeof url === 'string')
			.map((url) => normalizeUrlText(url))
			.filter((url): url is string => url !== null)
			.slice(0, MAX_SOURCE_URLS);
		const note =
			typeof raw.note === 'string' && raw.note.trim()
				? raw.note.trim().slice(0, MAX_SOURCE_NOTE_CHARS)
				: undefined;
		const confidence =
			typeof raw.confidence === 'string' && CONFIDENCE_LEVELS.has(raw.confidence)
				? (raw.confidence as TableCellMeta['confidence'])
				: undefined;
		meta[column.id] = {
			by: 'agent',
			state: 'filled',
			at,
			...(urls.length > 0 ? { source_urls: urls } : {}),
			...(note ? { note } : {}),
			...(confidence ? { confidence } : {})
		};
	}
	return Object.keys(meta).length > 0 ? meta : undefined;
}

function stripNulls(cells: Record<string, TableCellValue>): Record<string, TableCellValue> {
	const out: Record<string, TableCellValue> = {};
	for (const [key, value] of Object.entries(cells)) if (value !== null) out[key] = value;
	return out;
}

/**
 * The row ops an update_onto_table_rows call stands for, validated against the
 * table as loaded. Throws VALIDATION_ERROR listing every problem; nothing is
 * written by a call that has any.
 */
function planAgentRowChanges(
	table: LoadedTable,
	args: Record<string, unknown>,
	at: string
): RowPlan {
	const add = optionalArray(args.add, 'add') ?? [];
	const update = optionalArray(args.update, 'update') ?? [];
	const remove = optionalArray(args.delete, 'delete') ?? [];
	const total = add.length + update.length + remove.length;
	if (total === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Pass at least one of add, update, or delete.'
		);
	}
	if (total > TABLE_LIMITS.maxAgentRowsPerCall) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`One call can change at most ${TABLE_LIMITS.maxAgentRowsPerCall} rows (got ${total}). Split the change into several calls.`
		);
	}

	const schema = table.schema;
	const errors: string[] = [];
	const newChoices: Record<string, string[]> = {};
	const mergeChoices = (choices: Record<string, string[]>) => {
		for (const [columnId, values] of Object.entries(choices)) {
			const list = (newChoices[columnId] ??= []);
			for (const value of values) {
				if (!list.some((entry) => entry.toLowerCase() === value.toLowerCase()))
					list.push(value);
			}
		}
	};
	const rowsByNumber = new Map(table.rows.map((row) => [row.row_number, row]));
	const lastHandle = table.rows.reduce((max, row) => Math.max(max, row.row_number), 0);
	const findRow = (handle: unknown, label: string): TableRow | null => {
		const rowNumber =
			typeof handle === 'string' || typeof handle === 'number'
				? parseRowHandle(handle)
				: null;
		const row = rowNumber === null ? undefined : rowsByNumber.get(rowNumber);
		if (!row) {
			errors.push(
				`${label}: row "${String(handle)}" not found${table.rows.length > 0 ? ` (live rows go up to r${lastHandle}; read the table for handles)` : ' (the table has no rows)'}`
			);
			return null;
		}
		return row;
	};

	const ops: TableRowOp[] = [];
	add.forEach((entry, index) => {
		const label = `add[${index}]`;
		if (!isRecord(entry) || !isRecord(entry.values)) {
			errors.push(`${label} needs values: {<column>: value}`);
			return;
		}
		const coerced = coerceRowInput(schema, entry.values);
		errors.push(...coerced.errors.map((error) => `${label}: ${error}`));
		mergeChoices(coerced.newChoices);
		const meta = sourcesToMeta(schema, entry.sources, coerced.cells, label, errors, at);
		ops.push({
			op: 'insert',
			ref: `add-${index}`,
			cells: stripNulls(coerced.cells),
			...(meta ? { cell_meta: meta } : {})
		});
	});

	const updates = new Map<
		string,
		{
			row: TableRow;
			cells: Record<string, TableCellValue>;
			meta: Record<string, TableCellMeta>;
		}
	>();
	update.forEach((entry, index) => {
		const label = `update[${index}]`;
		if (!isRecord(entry)) {
			errors.push(`${label} must be {row: "r12", values: {<column>: value}}`);
			return;
		}
		const row = findRow(entry.row, label);
		if (!row) return;
		if (!isRecord(entry.values) || Object.keys(entry.values).length === 0) {
			errors.push(`${label} (${rowHandle(row.row_number)}) needs values: {<column>: value}`);
			return;
		}
		const coerced = coerceRowInput(schema, entry.values);
		errors.push(
			...coerced.errors.map((error) => `${label} (${rowHandle(row.row_number)}): ${error}`)
		);
		mergeChoices(coerced.newChoices);
		const meta = sourcesToMeta(schema, entry.sources, coerced.cells, label, errors, at) ?? {};
		const existing = updates.get(row.id);
		if (existing) {
			// Two entries for one row merge (later values win) into one op, so
			// the row's version guard stays valid.
			Object.assign(existing.cells, coerced.cells);
			for (const key of Object.keys(coerced.cells)) delete existing.meta[key];
			Object.assign(existing.meta, meta);
		} else {
			updates.set(row.id, { row, cells: { ...coerced.cells }, meta: { ...meta } });
		}
	});

	const deletes = new Map<string, TableRow>();
	remove.forEach((handle, index) => {
		const row = findRow(handle, `delete[${index}]`);
		if (!row) return;
		if (updates.has(row.id)) {
			errors.push(
				`delete[${index}]: ${rowHandle(row.row_number)} is also in update; pick one`
			);
			return;
		}
		deletes.set(row.id, row);
	});

	for (const { row, cells, meta } of updates.values()) {
		ops.push({
			op: 'update',
			row_id: row.id,
			cells,
			cell_meta: meta,
			expected_version: row.version
		});
	}
	for (const row of deletes.values()) {
		ops.push({ op: 'delete', row_id: row.id, expected_version: row.version });
	}

	const liveRows = table.rows.length;
	if (
		args.allow_large_deletion !== true &&
		liveRows > LARGE_DELETION_MIN_ROWS &&
		deletes.size > liveRows * LARGE_DELETION_FRACTION
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`This would delete ${deletes.size} of ${liveRows} rows (more than 30%). Confirm with the user, then retry with allow_large_deletion: true.`,
			{ reason: 'large_deletion', rows_deleted: deletes.size, row_count: liveRows }
		);
	}
	if (liveRows + add.length - deletes.size > TABLE_LIMITS.maxRows) {
		errors.push(`a table can hold at most ${TABLE_LIMITS.maxRows} rows`);
	}
	if (errors.length > 0) {
		throw validationError('Nothing was changed. Fix these and retry:', errors);
	}
	const nextSchema = withNewChoices(schema, newChoices);
	return {
		ops,
		schema: nextSchema,
		schemaChanged: nextSchema !== schema,
		counts: { add: add.length, update: updates.size, delete: deletes.size }
	};
}

function describeRowCounts(counts: { add: number; update: number; delete: number }): string {
	const parts: string[] = [];
	if (counts.add) parts.push(`+${counts.add} row${counts.add === 1 ? '' : 's'}`);
	if (counts.update) parts.push(`${counts.update} row${counts.update === 1 ? '' : 's'} changed`);
	if (counts.delete) parts.push(`${counts.delete} row${counts.delete === 1 ? '' : 's'} deleted`);
	return parts.join(', ') || 'no changes';
}

export async function updateTableRows(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const access = await loadTableForAccess(context, args.table_id, 'write');
	assertNotArchivedForWrite(access);
	const { project } = access;
	const actorId = await contextActorId(context);
	const at = new Date().toISOString();

	let table = access.table;
	let plan = planAgentRowChanges(table, args, at);
	let apply: TableApplyResult;
	for (let attempt = 0; ; attempt += 1) {
		try {
			apply = await applyTableChanges(context.admin, {
				documentId: table.document.id,
				ops: plan.ops,
				schema: plan.schemaChanged ? plan.schema : null,
				// Row ops carry per-row versions; the table-wide guard only protects a
				// schema replacement (new select options) from a concurrent column edit.
				expectedRevision: plan.schemaChanged ? table.schema.revision : null,
				actorId
			});
			break;
		} catch (error) {
			const retry =
				attempt === 0 &&
				error instanceof TableServiceError &&
				(error.code === 'TABLE_CONFLICT' ||
					error.code === 'ROW_CONFLICT' ||
					error.code === 'ROW_NOT_FOUND');
			if (!retry) throw tableErrorToGatewayError(error);
			table = (await loadTableForAccess(context, table.document.id, 'write')).table;
			plan = planAgentRowChanges(table, args, at);
		}
	}

	const receipt = buildTableChangeReceipt({
		table: { document: table.document, schema: plan.schema },
		apply,
		previousSchema: plan.schemaChanged ? table.schema : null
	});
	const addedRows = apply.results
		.filter((result) => result.op === 'insert')
		.map((result) => rowHandle(result.row_number));

	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		table.document.id,
		{ row_count: table.rows.length },
		{
			row_count: apply.row_count,
			table_rows: {
				added: receipt.rows_added,
				updated: receipt.rows_updated,
				deleted: receipt.rows_deleted,
				cells_changed: receipt.cells_changed,
				row_handles: apply.results
					.slice(0, 50)
					.map((result) => rowHandle(result.row_number))
			}
		},
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	return {
		table: tableSummary({ ...table, schema: plan.schema }, project, {
			revision: apply.revision,
			row_count: apply.row_count
		}),
		table_change: receipt,
		rows_added: receipt.rows_added,
		rows_updated: receipt.rows_updated,
		rows_deleted: receipt.rows_deleted,
		cells_changed: receipt.cells_changed,
		...(addedRows.length > 0 ? { added_rows: addedRows } : {}),
		message: `Updated table "${table.document.title}": ${describeRowCounts(plan.counts)}.`
	};
}

/**
 * Dry run of onto.table.rows.update: the same access checks and validation as
 * the write, without writing. The chat worker runs it before review so a bad
 * handle or value goes straight back to the acting model and the reviewer
 * judges a server-verified summary.
 */
export async function previewTableRowsUpdate(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const access = await loadTableForAccess(context, args.table_id, 'write');
	assertNotArchivedForWrite(access);
	const { table, project } = access;
	const plan = planAgentRowChanges(table, args, new Date().toISOString());
	const preview = previewTableRowChanges(table, plan.ops);
	if (preview.errors.length > 0) {
		throw validationError('Nothing would change. Fix these and retry:', preview.errors);
	}
	const newOptions = plan.schemaChanged
		? plan.schema.columns
				.map((column) => {
					const before = table.schema.columns.find((entry) => entry.id === column.id);
					const known = new Set(
						(before?.options?.choices ?? []).map((choice) => choice.value)
					);
					const added = (column.options?.choices ?? [])
						.map((choice) => choice.value)
						.filter((value) => !known.has(value));
					return added.length > 0 ? { column: column.name, added } : null;
				})
				.filter((entry): entry is { column: string; added: string[] } => entry !== null)
		: [];
	return {
		table_id: table.document.id,
		project_id: project.id,
		title: table.document.title,
		revision: table.schema.revision,
		row_count: table.rows.length,
		preview: {
			rows_added: preview.rows_added,
			rows_updated: preview.rows_updated,
			rows_deleted: preview.rows_deleted,
			cells_changed: preview.cells_changed,
			sample: preview.sample
		},
		...(newOptions.length > 0 ? { new_options: newOptions } : {}),
		summary: `${describeRowCounts(plan.counts)} · ${preview.cells_changed} cell${preview.cells_changed === 1 ? '' : 's'}`
	};
}

export type GatewayTableRowsPreviewResult =
	| { ok: true; data: Awaited<ReturnType<typeof previewTableRowsUpdate>> }
	| {
			ok: false;
			error: {
				code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
				message: string;
				details?: Record<string, unknown>;
			};
	  };

/**
 * Dry run of an update_onto_table_rows call under the same argument
 * validation, scope, and access checks as runGatewayWriteOp (mirrors
 * previewGatewayDocumentUpdate). Accepts either `({admin, userId, scope,
 * args})` or `(context, args)`. Nothing is written.
 */
export async function previewGatewayTableRowsUpdate(
	params: {
		admin: any;
		userId: string;
		scope: AgentCallScope;
		args?: Record<string, unknown>;
		chatSessionId?: string;
		memo?: GatewayLookupMemo;
	},
	args?: Record<string, unknown>
): Promise<GatewayTableRowsPreviewResult> {
	const prepared = normalizeAndValidateGatewayWriteArgs(
		'onto.table.rows.update' as BuildosAgentAllowedOp,
		args ?? params.args
	);
	if (!prepared.ok) return { ok: false, error: prepared.error };
	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		scope: params.scope,
		...(params.chatSessionId ? { chatSessionId: params.chatSessionId } : {}),
		...(params.memo ? { memo: params.memo } : {})
	};
	try {
		return { ok: true, data: await previewTableRowsUpdate(context, prepared.args) };
	} catch (error) {
		const normalized = tableErrorToGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				...(normalized.details ? { details: normalized.details } : {})
			}
		};
	}
}

// ---------------------------------------------------------------------------
// Document-op guards (table bodies are a projection of the rows)
// ---------------------------------------------------------------------------

const DOCUMENT_BODY_ARGS = ['content', 'body_markdown', 'edits', 'section_edits'] as const;

/**
 * onto.document.update must not edit a table's body: `content` is regenerated
 * from the rows on every row write, so a text edit would be silently lost.
 * Also refuses props.table patches and type changes across the table boundary.
 */
export function assertDocumentUpdateAllowedForTable(
	existingTypeKey: unknown,
	args: Record<string, unknown>,
	nextTypeKey: unknown
): void {
	const isTable = typeof existingTypeKey === 'string' && isTableTypeKey(existingTypeKey);
	const becomesTable = typeof nextTypeKey === 'string' && isTableTypeKey(nextTypeKey);
	if (isTable) {
		if (DOCUMENT_BODY_ARGS.some((key) => args[key] !== undefined)) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'This document is a table; its text is generated from its rows. Change rows with update_onto_table_rows, and columns, title, or description with update_onto_table.',
				{ reason: 'table_document' }
			);
		}
		if (isRecord(args.props) && 'table' in args.props) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				"A table's columns change only through update_onto_table.",
				{ reason: 'table_document' }
			);
		}
		if (args.type_key !== undefined && !becomesTable) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'A table cannot be turned into a plain document.',
				{ reason: 'table_document' }
			);
		}
	} else if (args.type_key !== undefined && becomesTable) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'A document cannot be turned into a table. Create one with create_onto_table (it accepts csv text).',
			{ reason: 'table_document' }
		);
	}
}

/** Refuses creating a table through the plain document ops (it would have no columns). */
export function assertNotTableTypeForDocumentCreate(typeKey: unknown): void {
	if (typeof typeKey === 'string' && isTableTypeKey(typeKey.trim())) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Create tables with create_onto_table (columns + rows, or csv text).',
			{ reason: 'table_document' }
		);
	}
}
