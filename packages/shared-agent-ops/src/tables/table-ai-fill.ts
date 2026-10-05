// packages/shared-agent-ops/src/tables/table-ai-fill.ts
// AI question columns (docs/specs/tables/CONTRACT.md, "AI question columns").
//
// A column with `ai: {prompt, research}` is a question asked of every row ("Who is the hiring
// manager for this role?"). "Fill" queues one `table_ai_fill` job; the worker
// (apps/worker/src/workers/tables/) answers row by row and writes each answer with provenance
// in cell_meta: {by:'ai_column', state, run_id, source_urls, note, confidence, at}.
//
// This module is the one way to start a fill (web endpoint + gateway `fill_ai_columns`) and to
// read its progress:
//   enqueueTableAiFill   resolves the column, picks rows (default: only cells without an
//                        answer, so a second Fill never re-bills rows that already have one),
//                        marks their cells `pending` through onto_document_table_apply, and
//                        queues the job. One active run per column.
//   getTableAiFillStatus job state + per-cell counts for the grid's progress bar.
//
// Clients: pass the caller's Supabase client. From the web that is the user-scoped client, so
// RLS decides write access to the table; from the gateway it is the service-role client (pass
// actorId). Queue rows are server-only (add_queue_job is granted to service_role only, and
// users can read only their own queue rows), so a user-scoped caller also passes
// `options.queueClient` (service role) for the queue insert and run lookups.
//
// Browser-safe (it is re-exported from ./browser.ts): no Node imports, uuid via
// globalThis.crypto, and the apply RPC is called directly instead of through
// ./table-repository.

import { isEmptyCellValue, normalizeTableSchema, resolveColumn } from './table-schema';
import {
	TABLE_LIMITS,
	isTableTypeKey,
	type TableApplyResult,
	type TableCellMeta,
	type TableCellValue,
	type TableColumn,
	type TableRowOp
} from './table-types';

export const TABLE_AI_FILL_JOB_TYPE = 'table_ai_fill';
/** Rows one Fill may answer. A bigger table fills in batches: click Fill again for the rest. */
export const TABLE_AI_FILL_MAX_ROWS_PER_RUN = 200;
/** Queue priority (lower runs first): someone clicked Fill and is watching the grid. */
export const TABLE_AI_FILL_QUEUE_PRIORITY = 5;

const ACTIVE_QUEUE_STATUSES = ['pending', 'processing', 'retrying'] as const;
const ROW_PAGE_SIZE = 1_000;
/** Column ids are 'c_' + base36; anything else never reaches a PostgREST JSON path. */
const COLUMN_ID_FORMAT = /^[A-Za-z0-9_]{1,64}$/;

export type TableAiFillErrorCode =
	| 'TABLE_NOT_FOUND'
	| 'NOT_A_TABLE'
	| 'COLUMN_NOT_FOUND'
	| 'NOT_A_QUESTION_COLUMN'
	| 'UNSUPPORTED_COLUMN_TYPE'
	| 'ROW_NOT_FOUND'
	| 'NOTHING_TO_FILL'
	| 'RUN_ACTIVE'
	| 'RUN_NOT_FOUND'
	| 'VALIDATION_ERROR'
	| 'DATABASE_ERROR'
	| 'QUEUE_FAILED';

export class TableAiFillError extends Error {
	readonly code: TableAiFillErrorCode;
	readonly details?: unknown;

	constructor(code: TableAiFillErrorCode, message: string, details?: unknown) {
		super(message);
		this.name = 'TableAiFillError';
		this.code = code;
		this.details = details;
	}
}

/**
 * Any Supabase client (user-scoped or service role). Structural, with method shorthand, so the
 * web's SupabaseClient<Database> and the gateway/worker TypedSupabaseClient both fit. The table
 * rows and RPC are not in the generated types until the migration is applied and
 * `pnpm gen:all` runs, so this module reads them untyped.
 */
export interface TableAiFillClient {
	// Same loose shape as ./table-repository's TableDataClient (kept local: that file is
	// Node-only and this one is in the browser entry).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	from(relation: any): any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	rpc(fn: any, args?: any, options?: any): any;
}

/** queue_jobs.metadata for `table_ai_fill` (the worker validates it again). */
export interface TableAiFillJobMetadata {
	documentId: string;
	columnId: string;
	runId: string;
	/** Rows marked pending for this run, in table order. */
	rowIds: string[];
	userId: string;
	actorId: string | null;
	onlyEmpty: boolean;
	requestedAt: string;
}

export interface EnqueueTableAiFillArgs {
	documentId: string;
	/** Column name (case-insensitive) or id. */
	column: string;
	rowIds?: string[];
	/** Default true: skip rows whose cell already has an answer. */
	onlyEmpty?: boolean;
	userId: string;
	actorId: string | null;
}

export interface TableAiFillOptions {
	/** Service-role client for queue_jobs; defaults to `client`. */
	queueClient?: TableAiFillClient;
	now?: () => Date;
	maxRows?: number;
	/** Injected for tests. */
	createRunId?: () => string;
}

export interface EnqueueTableAiFillResult {
	run_id: string;
	row_count: number;
	column_id: string;
	column_name: string;
	research: boolean;
	/** Target rows left for a later Fill because of the per-run cap. */
	remaining: number;
	/** Rows skipped because they already have an answer (only_empty). */
	skipped_filled: number;
}

export type TableAiFillRunStatus = 'queued' | 'running' | 'done' | 'error';

export interface TableAiFillStatus {
	status: TableAiFillRunStatus;
	filled: number;
	failed: number;
	total: number;
	/** Cells still waiting (always 0 once the run is over). */
	pending: number;
	/** Rows that left the run: edited by someone meanwhile, or deleted. */
	skipped: number;
	column_id: string;
	/** Why the run stopped, when status is 'error'. */
	error?: string;
}

// ---------------------------------------------------------------------------
// Row selection (pure)
// ---------------------------------------------------------------------------

/** The two things selection needs to know about a row's target cell. */
export interface TableAiFillRowCell {
	id: string;
	value: TableCellValue | undefined;
	meta: TableCellMeta | null | undefined;
}

/**
 * True when Fill should (re)ask this row: the cell has no value and no current answer.
 * A "nothing found" answer (state 'filled' without a value) counts as an answer, so pressing
 * Fill again doesn't re-bill it, unless the question changed after it was answered
 * (`ai.updated_at` newer than the answer). Errors and pending cells left by a dead run are
 * asked again.
 */
export function isTableAiFillTarget(
	cell: Pick<TableAiFillRowCell, 'value' | 'meta'>,
	column: Pick<TableColumn, 'ai'>
): boolean {
	if (!isEmptyCellValue(cell.value)) return false;
	const meta = cell.meta;
	if (!meta || meta.by !== 'ai_column' || meta.state !== 'filled') return true;
	const askedAt = column.ai?.updated_at ? Date.parse(column.ai.updated_at) : NaN;
	const answeredAt = Date.parse(meta.at);
	if (Number.isFinite(askedAt) && Number.isFinite(answeredAt)) return answeredAt < askedAt;
	return false;
}

export interface TableAiFillSelection<T extends TableAiFillRowCell> {
	rows: T[];
	remaining: number;
	skipped_filled: number;
	unknown_row_ids: string[];
}

/**
 * Picks the rows a Fill will answer, in table order: the requested rows (or all), minus rows
 * that already have an answer when `onlyEmpty`, capped at `maxRows` (the rest is `remaining`).
 */
export function selectTableAiFillRows<T extends TableAiFillRowCell>(
	rows: readonly T[],
	column: Pick<TableColumn, 'ai'>,
	opts: { rowIds?: readonly string[] | null; onlyEmpty?: boolean; maxRows?: number } = {}
): TableAiFillSelection<T> {
	const onlyEmpty = opts.onlyEmpty ?? true;
	const maxRows = Math.max(1, Math.floor(opts.maxRows ?? TABLE_AI_FILL_MAX_ROWS_PER_RUN));
	let candidates: T[] = [...rows];
	let unknownRowIds: string[] = [];
	if (opts.rowIds && opts.rowIds.length > 0) {
		const wanted = new Set(opts.rowIds);
		const known = new Set(rows.map((row) => row.id));
		unknownRowIds = [...wanted].filter((id) => !known.has(id));
		candidates = candidates.filter((row) => wanted.has(row.id));
	}
	let skippedFilled = 0;
	if (onlyEmpty) {
		const before = candidates.length;
		candidates = candidates.filter((row) => isTableAiFillTarget(row, column));
		skippedFilled = before - candidates.length;
	}
	const picked = candidates.slice(0, maxRows);
	return {
		rows: picked,
		remaining: candidates.length - picked.length,
		skipped_filled: skippedFilled,
		unknown_row_ids: unknownRowIds
	};
}

/** Validates queue metadata (shared by the status read; the worker has its own copy). */
export function parseTableAiFillJobMetadata(value: unknown): TableAiFillJobMetadata | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const str = (key: string) =>
		typeof record[key] === 'string' && (record[key] as string).trim()
			? (record[key] as string).trim()
			: null;
	const documentId = str('documentId');
	const columnId = str('columnId');
	const runId = str('runId');
	const userId = str('userId');
	if (!documentId || !columnId || !runId || !userId || !Array.isArray(record.rowIds)) return null;
	const rowIds = record.rowIds.filter(
		(id): id is string => typeof id === 'string' && id.length > 0
	);
	return {
		documentId,
		columnId,
		runId,
		rowIds,
		userId,
		actorId: str('actorId'),
		onlyEmpty: record.onlyEmpty !== false,
		requestedAt: str('requestedAt') ?? ''
	};
}

export function tableAiFillDedupKey(documentId: string, columnId: string): string {
	return `${TABLE_AI_FILL_JOB_TYPE}:${documentId}:${columnId}`;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

interface LoadedFillTarget {
	projectId: string;
	column: TableColumn;
	cells: TableAiFillRowCell[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function dbError(message: string, error: unknown): TableAiFillError {
	const detail = asRecord(error)?.message;
	return new TableAiFillError(
		'DATABASE_ERROR',
		`${message}${typeof detail === 'string' ? `: ${detail}` : ''}`
	);
}

async function loadFillTarget(
	client: TableAiFillClient,
	documentId: string,
	columnRef: string
): Promise<LoadedFillTarget> {
	const { data: doc, error } = await client
		.from('onto_documents')
		.select('id, project_id, type_key, props')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();
	if (error) throw dbError('Could not load the table', error);
	if (!doc) throw new TableAiFillError('TABLE_NOT_FOUND', 'Table not found');
	if (!isTableTypeKey(doc.type_key)) {
		throw new TableAiFillError('NOT_A_TABLE', 'This document is not a table');
	}
	const column = resolveColumn(normalizeTableSchema(asRecord(doc.props)?.table), columnRef);
	if (!column || !COLUMN_ID_FORMAT.test(column.id)) {
		throw new TableAiFillError('COLUMN_NOT_FOUND', `No column named "${columnRef}"`);
	}
	if (!column.ai || typeof column.ai.prompt !== 'string' || !column.ai.prompt.trim()) {
		throw new TableAiFillError(
			'NOT_A_QUESTION_COLUMN',
			`"${column.name}" has no question to fill. Add a question to the column first.`
		);
	}
	if (column.type === 'link') {
		throw new TableAiFillError(
			'UNSUPPORTED_COLUMN_TYPE',
			`"${column.name}" links to BuildOS items, which AI can't fill. Use a text column.`
		);
	}

	// Only the target cell of each live row, paged past PostgREST's row cap.
	const cells: TableAiFillRowCell[] = [];
	for (let from = 0; from < TABLE_LIMITS.maxRows; from += ROW_PAGE_SIZE) {
		const { data: page, error: rowsError } = await client
			.from('onto_document_rows')
			.select(`id, value:cells->${column.id}, meta:cell_meta->${column.id}`)
			.eq('document_id', documentId)
			.is('deleted_at', null)
			.order('position', { ascending: true })
			.order('row_number', { ascending: true })
			.range(from, from + ROW_PAGE_SIZE - 1);
		if (rowsError) throw dbError('Could not load the table rows', rowsError);
		const list = Array.isArray(page) ? page : [];
		for (const row of list) {
			cells.push({
				id: row.id as string,
				value: (row.value ?? undefined) as TableCellValue | undefined,
				meta: (asRecord(row.meta) as TableCellMeta | null) ?? null
			});
		}
		if (list.length < ROW_PAGE_SIZE) break;
	}
	return { projectId: doc.project_id as string, column, cells };
}

async function findActiveRun(
	queueClient: TableAiFillClient,
	dedupKey: string
): Promise<{ id: string; runId: string | null } | null> {
	const { data, error } = await queueClient
		.from('queue_jobs')
		.select('id, metadata')
		.eq('dedup_key', dedupKey)
		.in('status', [...ACTIVE_QUEUE_STATUSES])
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw dbError('Could not check for a running fill', error);
	if (!data) return null;
	const runId = asRecord(data.metadata)?.runId;
	return { id: data.id as string, runId: typeof runId === 'string' ? runId : null };
}

/** onto_document_table_apply raises "CODE: detail"; map it to our errors. */
function applyError(error: unknown): TableAiFillError {
	const message = String(asRecord(error)?.message ?? 'Table update failed');
	if (message.startsWith('TABLE_NOT_FOUND')) {
		return new TableAiFillError('TABLE_NOT_FOUND', 'Table not found');
	}
	if (message.startsWith('ROW_NOT_FOUND')) {
		return new TableAiFillError('ROW_NOT_FOUND', 'A row changed while starting the fill');
	}
	return new TableAiFillError('DATABASE_ERROR', `Could not mark cells as filling: ${message}`);
}

async function applyOps(
	client: TableAiFillClient,
	documentId: string,
	ops: TableRowOp[],
	actorId: string | null
): Promise<TableApplyResult> {
	// Direct RPC rather than applyTableChanges: ./table-repository imports Node-only modules,
	// and this file is part of the browser entry (./browser.ts).
	const { data, error } = await client.rpc('onto_document_table_apply', {
		p_document_id: documentId,
		p_ops: ops,
		p_table: null,
		p_expected_revision: null,
		p_actor_id: actorId
	});
	if (error) throw applyError(error);
	return data as TableApplyResult;
}

/** Puts each touched cell's provenance back the way it was (best effort). */
async function restorePendingMarks(
	client: TableAiFillClient,
	documentId: string,
	columnId: string,
	apply: TableApplyResult | null,
	actorId: string | null
): Promise<void> {
	const results = apply?.results ?? [];
	if (results.length === 0) return;
	const ops: TableRowOp[] = results.map((result) => ({
		op: 'update',
		row_id: result.row_id,
		cell_meta: { [columnId]: result.before?.cell_meta?.[columnId] ?? null }
	}));
	try {
		await applyOps(client, documentId, ops, actorId);
	} catch {
		// The cells stay `pending` without a job; the next Fill picks them up (they're empty).
	}
}

function newRunId(): string {
	const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (!cryptoApi?.randomUUID) throw new Error('crypto.randomUUID is unavailable');
	return cryptoApi.randomUUID();
}

/**
 * Starts filling a question column: marks the chosen cells `pending` and queues one
 * `table_ai_fill` job. Throws TableAiFillError (RUN_ACTIVE when the column is already filling,
 * NOTHING_TO_FILL when every chosen row already has an answer).
 */
export async function enqueueTableAiFill(
	client: TableAiFillClient,
	args: EnqueueTableAiFillArgs,
	options: TableAiFillOptions = {}
): Promise<EnqueueTableAiFillResult> {
	const documentId = typeof args.documentId === 'string' ? args.documentId.trim() : '';
	const columnRef = typeof args.column === 'string' ? args.column.trim() : '';
	const userId = typeof args.userId === 'string' ? args.userId.trim() : '';
	if (!documentId) throw new TableAiFillError('VALIDATION_ERROR', 'documentId is required');
	if (!columnRef) throw new TableAiFillError('VALIDATION_ERROR', 'column is required');
	if (!userId) throw new TableAiFillError('VALIDATION_ERROR', 'userId is required');
	if (args.rowIds !== undefined && !Array.isArray(args.rowIds)) {
		throw new TableAiFillError('VALIDATION_ERROR', 'row_ids must be an array of row ids');
	}
	const rowIds = (args.rowIds ?? []).filter(
		(id): id is string => typeof id === 'string' && id.trim().length > 0
	);
	if (rowIds.length > TABLE_LIMITS.maxRows) {
		throw new TableAiFillError('VALIDATION_ERROR', 'Too many row ids');
	}
	const onlyEmpty = args.onlyEmpty ?? true;
	const actorId = args.actorId ?? null;
	const queueClient = options.queueClient ?? client;
	const now = options.now ?? (() => new Date());

	const target = await loadFillTarget(client, documentId, columnRef);
	const { column } = target;
	const dedupKey = tableAiFillDedupKey(documentId, column.id);

	const active = await findActiveRun(queueClient, dedupKey);
	if (active) {
		throw new TableAiFillError(
			'RUN_ACTIVE',
			`"${column.name}" is already filling. Wait for it to finish.`,
			{ run_id: active.runId }
		);
	}

	const selection = selectTableAiFillRows(target.cells, column, {
		rowIds: rowIds.length > 0 ? rowIds : null,
		onlyEmpty,
		maxRows: options.maxRows
	});
	if (rowIds.length > 0 && selection.unknown_row_ids.length === new Set(rowIds).size) {
		throw new TableAiFillError('ROW_NOT_FOUND', 'None of those rows are in this table');
	}
	if (selection.rows.length === 0) {
		throw new TableAiFillError(
			'NOTHING_TO_FILL',
			onlyEmpty
				? `Every chosen row already has an answer in "${column.name}". Refill to ask again.`
				: `There are no rows to fill in "${column.name}".`,
			{ skipped_filled: selection.skipped_filled }
		);
	}

	const runId = (options.createRunId ?? newRunId)();
	const at = now().toISOString();
	const pendingMeta: TableCellMeta = { by: 'ai_column', state: 'pending', run_id: runId, at };
	const ops: TableRowOp[] = selection.rows.map((row) => ({
		op: 'update',
		row_id: row.id,
		// No `cells` key: the value stays as it is until the answer arrives.
		cell_meta: { [column.id]: pendingMeta }
	}));
	const apply = await applyOps(client, documentId, ops, actorId);

	const metadata: TableAiFillJobMetadata = {
		documentId,
		columnId: column.id,
		runId,
		rowIds: selection.rows.map((row) => row.id),
		userId,
		actorId,
		onlyEmpty,
		requestedAt: at
	};
	const { data: queueRowId, error: queueError } = await queueClient.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: TABLE_AI_FILL_JOB_TYPE,
		p_metadata: metadata,
		p_priority: TABLE_AI_FILL_QUEUE_PRIORITY,
		p_scheduled_for: at,
		p_dedup_key: dedupKey
	});
	if (queueError || typeof queueRowId !== 'string' || !queueRowId) {
		await restorePendingMarks(client, documentId, column.id, apply, actorId);
		throw new TableAiFillError(
			'QUEUE_FAILED',
			`Could not start the fill${queueError?.message ? `: ${queueError.message}` : ''}`
		);
	}

	// add_queue_job returns the existing active job when the dedup slot is taken, which only
	// happens when two Fills of this column raced past the check above.
	const { data: queued, error: queuedError } = await queueClient
		.from('queue_jobs')
		.select('id, metadata')
		.eq('id', queueRowId)
		.maybeSingle();
	if (queuedError) throw dbError('Could not confirm the queued fill', queuedError);
	const queuedRunId = asRecord(queued?.metadata)?.runId;
	if (queuedRunId !== runId) {
		await restorePendingMarks(client, documentId, column.id, apply, actorId);
		throw new TableAiFillError(
			'RUN_ACTIVE',
			`"${column.name}" is already filling. Wait for it to finish.`,
			{ run_id: typeof queuedRunId === 'string' ? queuedRunId : null }
		);
	}

	return {
		run_id: runId,
		row_count: selection.rows.length,
		column_id: column.id,
		column_name: column.name,
		research: column.ai?.research === true,
		remaining: selection.remaining,
		skipped_filled: selection.skipped_filled
	};
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const ERROR_TEXT_CHARS = 300;

function runStatus(queueStatus: string, progressed: boolean): TableAiFillRunStatus {
	switch (queueStatus) {
		case 'processing':
			return 'running';
		case 'completed':
			return 'done';
		case 'failed':
		case 'cancelled':
			return 'error';
		default:
			// pending, or retrying after a failed attempt
			return progressed ? 'running' : 'queued';
	}
}

/**
 * Progress of one fill: the job's state plus how many of its cells are filled, failed, or
 * still pending. Cells someone edited mid-run (their provenance was cleared) count as skipped.
 * Once the job is over, cells it never reached count as failed.
 */
export async function getTableAiFillStatus(
	client: TableAiFillClient,
	args: { documentId: string; runId: string },
	options: Pick<TableAiFillOptions, 'queueClient'> = {}
): Promise<TableAiFillStatus> {
	const documentId = typeof args.documentId === 'string' ? args.documentId.trim() : '';
	const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
	if (!documentId || !runId) {
		throw new TableAiFillError('VALIDATION_ERROR', 'documentId and runId are required');
	}
	const queueClient = options.queueClient ?? client;

	const { data: job, error: jobError } = await queueClient
		.from('queue_jobs')
		.select('id, status, metadata, error_message')
		.eq('job_type', TABLE_AI_FILL_JOB_TYPE)
		.eq('metadata->>runId', runId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (jobError) throw dbError('Could not load the fill', jobError);
	const metadata = parseTableAiFillJobMetadata(job?.metadata);
	if (!job || !metadata || metadata.documentId !== documentId) {
		throw new TableAiFillError('RUN_NOT_FOUND', 'Fill not found');
	}
	if (!COLUMN_ID_FORMAT.test(metadata.columnId)) {
		throw new TableAiFillError('RUN_NOT_FOUND', 'Fill not found');
	}

	const { data: rows, error: rowsError } = await client
		.from('onto_document_rows')
		.select(`id, deleted_at, meta:cell_meta->${metadata.columnId}`)
		.eq('document_id', documentId)
		.eq(`cell_meta->${metadata.columnId}->>run_id`, runId)
		.limit(Math.max(metadata.rowIds.length, 1));
	if (rowsError) throw dbError('Could not load fill progress', rowsError);

	let filled = 0;
	let failed = 0;
	let pending = 0;
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.deleted_at) continue;
		const state = asRecord(row.meta)?.state;
		if (state === 'filled') filled += 1;
		else if (state === 'error') failed += 1;
		else if (state === 'pending') pending += 1;
	}
	const total = metadata.rowIds.length;
	const status = runStatus(String(job.status), filled + failed > 0);
	if (status === 'done' || status === 'error') {
		failed += pending;
		pending = 0;
	}
	const skipped = Math.max(0, total - filled - failed - pending);
	const errorText =
		status === 'error' && typeof job.error_message === 'string' && job.error_message.trim()
			? job.error_message.trim().slice(0, ERROR_TEXT_CHARS)
			: undefined;
	return {
		status,
		filled,
		failed,
		total,
		pending,
		skipped,
		column_id: metadata.columnId,
		...(status === 'error'
			? { error: errorText ?? (String(job.status) === 'cancelled' ? 'Cancelled' : 'Failed') }
			: {})
	};
}
