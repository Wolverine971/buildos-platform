// packages/shared-agent-ops/src/tables/table-repository.ts
// Supabase access for BuildOS Tables. Takes the caller's client as an
// argument (user-scoped from the web so RLS decides; admin from the gateway,
// which passes actorId) and never reads env. All row writes go through the
// onto_document_table_apply RPC (supabase/migrations/20261004230000).
//
// NOT browser-safe (document versions hash with node:crypto). The browser
// entry (`./browser.ts`) leaves this module out.
//
// Generated DB types do not know onto_document_rows / the apply RPC until the
// migration is applied and `pnpm gen:all` runs, so the client is typed loosely
// here and only here (CONTRACT.md "Storage").
import { addDocumentToTree } from '../ontology/doc-structure.service';
import { createOrMergeDocumentVersion, toDocumentSnapshot } from '../ontology/versioning.service';
import { TableServiceError } from './table-errors';
import {
	buildTableSchema,
	coerceRowInput,
	isRecord,
	normalizeTableSchema,
	withNewChoices
} from './table-schema';
import {
	TABLE_DOCUMENT_TYPE_KEY,
	TABLE_LIMITS,
	isTableTypeKey,
	type LoadedTable,
	type TableApplyResult,
	type TableCellMeta,
	type TableCellValue,
	type TableColumnInput,
	type TableDocumentSummary,
	type TableErrorCode,
	type TableRow,
	type TableRowOp,
	type TableRowOpResult,
	type TableSchema
} from './table-types';

export { TableServiceError } from './table-errors';

/**
 * Any Supabase client (typed or not). Method shorthand keeps the parameter
 * check loose so `SupabaseClient<Database>` from web or worker is accepted.
 */
export interface TableDataClient {
	from(relation: any): any;
	rpc(fn: any, args?: any, options?: any): any;
}

export type TableListItem = TableDocumentSummary & { row_count: number; columns: string[] };

const DOCUMENT_SUMMARY_COLUMNS =
	'id, project_id, title, description, type_key, state_key, props, updated_at, archived_at, deleted_at';
const DOCUMENT_FULL_COLUMNS =
	'id, project_id, title, description, type_key, state_key, content, props, children, created_by, created_at, updated_at, archived_at, deleted_at';
const ROW_COLUMNS =
	'id, row_number, position, cells, cell_meta, version, created_by, updated_by, created_at, updated_at, deleted_at';
/** PostgREST caps responses at 1,000 rows by default; page under it. */
const ROW_PAGE_SIZE = 1_000;
const MAX_WARNINGS = 50;

const TABLE_ERROR_CODES = new Set<TableErrorCode>([
	'TABLE_NOT_FOUND',
	'NOT_A_TABLE',
	'TABLE_CONFLICT',
	'ROW_NOT_FOUND',
	'ROW_CONFLICT',
	'INVALID_OP',
	'VALIDATION_ERROR',
	'LIMIT_EXCEEDED'
]);

type DatabaseError = { message?: string; code?: string; details?: string; hint?: string };

/**
 * RPC/PostgREST error → TableServiceError when the message carries a known
 * prefix ("ROW_CONFLICT: …"); otherwise a plain Error that keeps the SQLSTATE
 * on `.code` so callers can tell transient rollbacks apart.
 */
function tableErrorFromDatabase(error: unknown, fallback: string): Error {
	const dbError = (isRecord(error) ? error : {}) as DatabaseError;
	const message =
		typeof dbError.message === 'string' && dbError.message ? dbError.message : fallback;
	const prefix = /^([A-Z_]+):\s*/.exec(message);
	const details = { database_code: dbError.code ?? null };
	if (prefix && TABLE_ERROR_CODES.has(prefix[1] as TableErrorCode)) {
		return new TableServiceError(
			prefix[1] as TableErrorCode,
			message.slice(prefix[0].length) || message,
			details
		);
	}
	if (dbError.code === '22P02') {
		return new TableServiceError('VALIDATION_ERROR', message, details);
	}
	if (dbError.code === '23505') {
		// Two writers allocated the same row number; the batch rolled back.
		return new TableServiceError('TABLE_CONFLICT', message, details);
	}
	return Object.assign(new Error(message), { code: dbError.code });
}

function toSummary(raw: Record<string, unknown>): TableDocumentSummary {
	return {
		id: String(raw.id),
		project_id: String(raw.project_id),
		title: typeof raw.title === 'string' ? raw.title : '',
		description: typeof raw.description === 'string' ? raw.description : null,
		type_key: typeof raw.type_key === 'string' ? raw.type_key : TABLE_DOCUMENT_TYPE_KEY,
		state_key: typeof raw.state_key === 'string' ? raw.state_key : null,
		updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
		archived_at: typeof raw.archived_at === 'string' ? raw.archived_at : null
	};
}

function toTableRow(raw: Record<string, unknown>): TableRow {
	return {
		id: String(raw.id),
		row_number: Number(raw.row_number),
		position: Number(raw.position),
		cells: isRecord(raw.cells) ? (raw.cells as Record<string, TableCellValue>) : {},
		cell_meta: isRecord(raw.cell_meta) ? (raw.cell_meta as Record<string, TableCellMeta>) : {},
		version: typeof raw.version === 'number' ? raw.version : Number(raw.version ?? 1),
		created_by: typeof raw.created_by === 'string' ? raw.created_by : null,
		updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : null,
		created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
		updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
		deleted_at: typeof raw.deleted_at === 'string' ? raw.deleted_at : null
	};
}

function compareRows(a: TableRow, b: TableRow): number {
	if (a.position !== b.position) return a.position - b.position;
	return a.row_number - b.row_number;
}

async function loadTableRows(
	client: TableDataClient,
	documentId: string,
	includeDeleted: boolean
): Promise<TableRow[]> {
	const rows: TableRow[] = [];
	// Deleted rows are kept for undo, so cap the scan at twice the live limit.
	const ceiling = TABLE_LIMITS.maxRows * 2;
	for (let from = 0; from < ceiling; from += ROW_PAGE_SIZE) {
		let query = client
			.from('onto_document_rows' as never)
			.select(ROW_COLUMNS)
			.eq('document_id', documentId);
		if (!includeDeleted) query = query.is('deleted_at', null);
		const { data, error } = await query
			.order('position', { ascending: true })
			.order('row_number', { ascending: true })
			.range(from, from + ROW_PAGE_SIZE - 1);
		if (error) throw tableErrorFromDatabase(error, 'Failed to load table rows');
		const page = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
		rows.push(...page.map(toTableRow));
		if (page.length < ROW_PAGE_SIZE) break;
	}
	return rows.sort(compareRows);
}

/**
 * The table document, its normalized schema, and its rows in display order.
 * Throws TableServiceError TABLE_NOT_FOUND (missing, deleted, or not visible
 * to this client) or NOT_A_TABLE.
 */
export async function loadTable(
	client: TableDataClient,
	documentId: string,
	opts: { includeDeleted?: boolean } = {}
): Promise<LoadedTable> {
	if (typeof documentId !== 'string' || !documentId.trim()) {
		throw new TableServiceError('TABLE_NOT_FOUND', 'Table not found');
	}
	const { data, error } = await client
		.from('onto_documents')
		.select(DOCUMENT_SUMMARY_COLUMNS)
		.eq('id', documentId)
		.maybeSingle();
	if (error) {
		const mapped = tableErrorFromDatabase(error, 'Failed to load table');
		if (mapped instanceof TableServiceError && mapped.code === 'VALIDATION_ERROR') {
			throw new TableServiceError('TABLE_NOT_FOUND', 'Table not found');
		}
		throw mapped;
	}
	const document = isRecord(data) ? data : null;
	if (!document || typeof document.deleted_at === 'string') {
		throw new TableServiceError('TABLE_NOT_FOUND', 'Table not found');
	}
	if (!isTableTypeKey(typeof document.type_key === 'string' ? document.type_key : null)) {
		throw new TableServiceError('NOT_A_TABLE', 'This document is not a table');
	}
	const props = isRecord(document.props) ? document.props : {};
	const rows = await loadTableRows(client, String(document.id), opts.includeDeleted === true);
	return { document: toSummary(document), schema: normalizeTableSchema(props.table), rows };
}

/** Live (not archived, not deleted) tables of a project, newest first. */
export async function listProjectTables(
	client: TableDataClient,
	projectId: string
): Promise<TableListItem[]> {
	const { data, error } = await client
		.from('onto_documents')
		.select(DOCUMENT_SUMMARY_COLUMNS)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.is('archived_at', null)
		.or(`type_key.eq.${TABLE_DOCUMENT_TYPE_KEY},type_key.like.${TABLE_DOCUMENT_TYPE_KEY}.*`)
		.order('updated_at', { ascending: false });
	if (error) throw tableErrorFromDatabase(error, 'Failed to list tables');
	return (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])
		.filter((row) => isTableTypeKey(typeof row.type_key === 'string' ? row.type_key : null))
		.filter((row) => row.state_key !== 'archived')
		.map((row) => {
			const schema = normalizeTableSchema(isRecord(row.props) ? row.props.table : null);
			return {
				...toSummary(row),
				row_count: schema.row_count,
				columns: schema.columns.map((column) => column.name)
			};
		});
}

/** Mirrors onto_table_cell_text() for a header-only projection. */
function projectionCellText(value: string): string {
	let text = value.replace(/[\r\n\t]+/g, ' ').replace(/\|/g, '\\|');
	if (text.length > 300) text = `${text.slice(0, 299)}…`;
	return text;
}

/** What onto_document_table_render_markdown() renders for a table with no rows. */
function renderHeaderOnlyMarkdown(schema: TableSchema): string {
	const visible = schema.columns.filter((column) => !column.hidden);
	if (visible.length === 0) return '';
	const header = `| ${visible.map((column) => projectionCellText(column.name)).join(' | ')} |`;
	const separator = `|${visible.map(() => ' --- ').join('|')}|`;
	return `${header}\n${separator}`;
}

function stripNullCells(cells: Record<string, TableCellValue>): Record<string, TableCellValue> {
	const out: Record<string, TableCellValue> = {};
	for (const [key, value] of Object.entries(cells)) {
		if (value !== null && value !== undefined) out[key] = value;
	}
	return out;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Creates a table document: inserts it with props.table, applies the initial
 * rows (lenient: unreadable cells are skipped and reported in `warnings`),
 * records the first document version, and files it in the project's document
 * tree. Version and tree failures do not fail the create; they are warnings.
 * If the initial rows fail to apply, the new document is soft-deleted and the
 * error is rethrown.
 */
export async function createTableDocument(
	client: TableDataClient,
	args: {
		projectId: string;
		actorId: string | null;
		title: string;
		description?: string | null;
		columns: TableColumnInput[];
		rows?: Record<string, unknown>[];
		parentId?: string | null;
		position?: number | null;
		source?: TableSchema['source'];
		typeKey?: string;
	}
): Promise<{ table: LoadedTable; apply: TableApplyResult | null; warnings: string[] }> {
	const warnings: string[] = [];
	const warn = (message: string) => {
		if (warnings.length < MAX_WARNINGS) warnings.push(message);
	};
	const title = typeof args.title === 'string' ? args.title.replace(/\s+/g, ' ').trim() : '';
	if (!title) throw new TableServiceError('VALIDATION_ERROR', 'A table needs a title.');
	const typeKey =
		typeof args.typeKey === 'string' && args.typeKey.trim()
			? args.typeKey.trim()
			: TABLE_DOCUMENT_TYPE_KEY;
	if (!isTableTypeKey(typeKey)) {
		throw new TableServiceError(
			'VALIDATION_ERROR',
			`type_key must be "${TABLE_DOCUMENT_TYPE_KEY}" or start with "${TABLE_DOCUMENT_TYPE_KEY}.".`
		);
	}

	let schema = buildTableSchema(args.columns ?? [], {
		source: args.source ?? { kind: 'blank', created_at: new Date().toISOString() }
	});
	const inputRows = Array.isArray(args.rows) ? args.rows : [];
	if (inputRows.length > TABLE_LIMITS.maxRows) {
		throw new TableServiceError(
			'LIMIT_EXCEEDED',
			`A table can hold at most ${TABLE_LIMITS.maxRows} rows (got ${inputRows.length}).`
		);
	}
	const ops: TableRowOp[] = [];
	const newChoices: Record<string, string[]> = {};
	inputRows.forEach((row, index) => {
		if (!isRecord(row)) {
			warn(`Row ${index + 1} was not an object and was skipped.`);
			return;
		}
		const coerced = coerceRowInput(schema, row);
		for (const error of coerced.errors) warn(`Row ${index + 1}: ${error}`);
		for (const [columnId, values] of Object.entries(coerced.newChoices)) {
			const list = (newChoices[columnId] ??= []);
			for (const value of values) {
				if (!list.some((entry) => entry.toLowerCase() === value.toLowerCase()))
					list.push(value);
			}
		}
		ops.push({ op: 'insert', cells: stripNullCells(coerced.cells) });
	});
	schema = withNewChoices(schema, newChoices);

	const description =
		typeof args.description === 'string' && args.description.trim()
			? args.description.trim()
			: null;
	const { data: inserted, error: insertError } = await client
		.from('onto_documents')
		.insert({
			project_id: args.projectId,
			title,
			description,
			type_key: typeKey,
			state_key: 'draft',
			content: renderHeaderOnlyMarkdown(schema),
			props: { table: schema },
			created_by: args.actorId
		})
		.select(DOCUMENT_FULL_COLUMNS)
		.single();
	if (insertError || !isRecord(inserted)) {
		throw tableErrorFromDatabase(insertError, 'Failed to create table');
	}
	const documentId = String(inserted.id);

	let apply: TableApplyResult | null = null;
	if (ops.length > 0) {
		try {
			apply = await applyTableChanges(client, { documentId, ops, actorId: args.actorId });
		} catch (error) {
			try {
				await client
					.from('onto_documents')
					.update({ deleted_at: new Date().toISOString() })
					.eq('id', documentId);
			} catch {
				/* best effort: the original error is what the caller needs */
			}
			throw error;
		}
	}

	let document: Record<string, unknown> = inserted;
	let rows: TableRow[] = [];
	if (apply) {
		const [fresh, loadedRows] = await Promise.all([
			client
				.from('onto_documents')
				.select(DOCUMENT_FULL_COLUMNS)
				.eq('id', documentId)
				.maybeSingle(),
			loadTableRows(client, documentId, false)
		]);
		if (isRecord(fresh?.data)) document = fresh.data;
		rows = loadedRows;
	}

	const placement = async () => {
		try {
			await addDocumentToTree(
				client as never,
				args.projectId,
				documentId,
				{
					parentId: args.parentId ?? null,
					...(typeof args.position === 'number' ? { position: args.position } : {}),
					title,
					description
				},
				args.actorId ?? undefined
			);
		} catch (error) {
			warn(
				`The table was saved but could not be placed in the document tree: ${errorMessage(error)}`
			);
		}
	};
	const version = async () => {
		if (!args.actorId) return;
		try {
			await createOrMergeDocumentVersion({
				supabase: client as never,
				documentId,
				actorId: args.actorId,
				snapshot: toDocumentSnapshot(document),
				changeSource: 'api'
			});
		} catch (error) {
			warn(
				`The table was saved but its first version could not be recorded: ${errorMessage(error)}`
			);
		}
	};
	await Promise.all([placement(), version()]);

	const props = isRecord(document.props) ? document.props : {};
	return {
		table: {
			document: toSummary(document),
			schema: normalizeTableSchema(props.table ?? schema),
			rows
		},
		apply,
		warnings
	};
}

function normalizeOpResult(raw: unknown): TableRowOpResult | null {
	if (!isRecord(raw)) return null;
	const op = raw.op;
	if (
		op !== 'insert' &&
		op !== 'update' &&
		op !== 'delete' &&
		op !== 'restore' &&
		op !== 'move'
	) {
		return null;
	}
	const side = (value: unknown) => {
		if (!isRecord(value)) return null;
		const out: Record<string, unknown> = {};
		if (isRecord(value.cells)) out.cells = value.cells;
		if (isRecord(value.cell_meta)) out.cell_meta = value.cell_meta;
		if (value.position !== undefined && value.position !== null)
			out.position = Number(value.position);
		return out;
	};
	return {
		op,
		ref: typeof raw.ref === 'string' ? raw.ref : null,
		row_id: String(raw.row_id),
		row_number: Number(raw.row_number),
		version: Number(raw.version),
		before: side(raw.before) as TableRowOpResult['before'],
		after: side(raw.after) as TableRowOpResult['after']
	};
}

function normalizeApplyResult(raw: unknown, documentId: string): TableApplyResult {
	const record = isRecord(raw) ? raw : {};
	return {
		document_id: typeof record.document_id === 'string' ? record.document_id : documentId,
		revision: Number(record.revision ?? 0),
		row_count: Number(record.row_count ?? 0),
		updated_at:
			typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString(),
		results: (Array.isArray(record.results) ? record.results : [])
			.map(normalizeOpResult)
			.filter((result): result is TableRowOpResult => result !== null)
	};
}

/**
 * Applies row ops (and optionally a full replacement schema) through the
 * onto_document_table_apply RPC. More than TABLE_LIMITS.maxOpsPerApply ops are
 * split into sequential batches only when no expectedRevision is given (a
 * guarded save must be one atomic batch); the schema rides with the first
 * batch. If a later batch fails, earlier batches stay applied and the error's
 * details say how many did.
 */
export async function applyTableChanges(
	client: TableDataClient,
	args: {
		documentId: string;
		ops: TableRowOp[];
		schema?: TableSchema | null;
		expectedRevision?: number | null;
		actorId?: string | null;
	}
): Promise<TableApplyResult> {
	const ops = Array.isArray(args.ops) ? args.ops : [];
	const expectedRevision =
		typeof args.expectedRevision === 'number' && Number.isInteger(args.expectedRevision)
			? args.expectedRevision
			: null;
	const max = TABLE_LIMITS.maxOpsPerApply;
	if (ops.length > max && expectedRevision !== null) {
		throw new TableServiceError(
			'LIMIT_EXCEEDED',
			`A guarded save can change at most ${max} rows at once (got ${ops.length}).`
		);
	}
	const batches: TableRowOp[][] = [];
	for (let index = 0; index < ops.length; index += max)
		batches.push(ops.slice(index, index + max));
	if (batches.length === 0) batches.push([]);
	const schemaPayload = args.schema ? JSON.parse(JSON.stringify(args.schema)) : null;

	let merged: TableApplyResult | null = null;
	for (let index = 0; index < batches.length; index += 1) {
		const { data, error } = await client.rpc('onto_document_table_apply' as never, {
			p_document_id: args.documentId,
			p_ops: batches[index],
			p_table: index === 0 ? schemaPayload : null,
			p_expected_revision: index === 0 ? expectedRevision : null,
			p_actor_id: args.actorId ?? null
		});
		if (error) {
			const mapped = tableErrorFromDatabase(error, 'Failed to apply table changes');
			if (index > 0 && mapped instanceof TableServiceError) {
				throw new TableServiceError(mapped.code, mapped.message, {
					...(isRecord(mapped.details) ? mapped.details : {}),
					applied_batches: index,
					total_batches: batches.length
				});
			}
			throw mapped;
		}
		const result = normalizeApplyResult(data, args.documentId);
		merged = merged ? { ...result, results: [...merged.results, ...result.results] } : result;
	}
	return merged!;
}
