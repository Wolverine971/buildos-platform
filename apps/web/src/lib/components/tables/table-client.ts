// apps/web/src/lib/components/tables/table-client.ts
//
// Thin fetch wrappers for the Tables endpoints (docs/specs/tables/CONTRACT.md
// "Web API"). Every JSON endpoint answers with the shared ApiResponse envelope
// ({success, data} | {success:false, error, code?, details?}); these helpers
// unwrap `data` and turn failures into a TableClientError that carries the HTTP
// status and the table error code (ROW_CONFLICT, TABLE_CONFLICT, …).
import type {
	LoadedTable,
	TableAggregateValue,
	TableApplyResult,
	TableChangeReceipt,
	TableColumnChange,
	TableColumnInput,
	TableRowOp,
	TableSchema,
	TableView
} from '@buildos/shared-agent-ops/tables';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TableClientError extends Error {
	readonly status: number;
	readonly code: string | null;
	readonly details: unknown;

	constructor(message: string, status: number, code: string | null, details?: unknown) {
		super(message);
		this.name = 'TableClientError';
		this.status = status;
		this.code = code;
		this.details = details;
	}

	/** The row or table moved on since the client last read it. */
	get isConflict(): boolean {
		return (
			this.status === 409 || this.code === 'ROW_CONFLICT' || this.code === 'TABLE_CONFLICT'
		);
	}
}

export function isTableConflict(error: unknown): boolean {
	return error instanceof TableClientError && error.isConflict;
}

export interface CreateTableInput {
	project_id: string;
	title: string;
	description?: string | null;
	columns?: TableColumnInput[];
	rows?: Record<string, unknown>[];
	csv?: string;
	markdown?: string;
	parent_id?: string | null;
	source?: TableSchema['source'];
}

export interface PatchTableInput {
	title?: string;
	description?: string | null;
	column_changes?: TableColumnChange[];
	views?: TableView[];
	primary_column_id?: string;
	expected_revision?: number;
}

export interface ApplyRowsInput {
	ops: TableRowOp[];
	expected_revision?: number;
}

export interface CreateTaskFromRowInput {
	title?: string;
	link_column?: string;
}

export interface StartAiFillInput {
	column: string;
	row_ids?: string[];
	only_empty?: boolean;
}

export type AiFillStatus = 'queued' | 'running' | 'done' | 'error';

export interface AiFillStatusResult {
	status: AiFillStatus;
	filled: number;
	failed: number;
	total: number;
}

export interface CreatedTaskSummary {
	id: string;
	title?: string;
	project_id?: string;
	[key: string]: unknown;
}

export interface TableClient {
	createTable(input: CreateTableInput): Promise<{ table: LoadedTable; warnings: string[] }>;
	getTable(
		documentId: string
	): Promise<{ table: LoadedTable; totals: Record<string, TableAggregateValue> }>;
	patchTable(
		documentId: string,
		input: PatchTableInput
	): Promise<{ table: LoadedTable; receipt: TableChangeReceipt | null }>;
	applyRows(
		documentId: string,
		input: ApplyRowsInput
	): Promise<{ apply: TableApplyResult; receipt: TableChangeReceipt | null }>;
	revertChange(
		documentId: string,
		receipt: TableChangeReceipt
	): Promise<{ apply: TableApplyResult | null; table: LoadedTable }>;
	exportCsvUrl(documentId: string): string;
	createTaskFromRow(
		documentId: string,
		rowId: string,
		input?: CreateTaskFromRowInput
	): Promise<{ task: CreatedTaskSummary; apply: TableApplyResult | null }>;
	startAiFill(
		documentId: string,
		input: StartAiFillInput
	): Promise<{ run_id: string; row_count: number }>;
	getAiFillStatus(documentId: string, runId: string): Promise<AiFillStatusResult>;
}

const BASE = '/api/onto/tables';

function tablePath(documentId: string, ...rest: string[]): string {
	const parts = [BASE, encodeURIComponent(documentId), ...rest.map(encodeURIComponent)];
	return parts.join('/');
}

function readErrorCode(body: Record<string, unknown> | null): string | null {
	if (!body) return null;
	const candidates = [
		body.code,
		(body.details as Record<string, unknown> | undefined)?.code,
		(body.data as Record<string, unknown> | undefined)?.code
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate) return candidate;
	}
	return null;
}

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
	const text = await response.text();
	if (!text) return null;
	try {
		const parsed = JSON.parse(text) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Fetch one ApiResponse endpoint and return its `data`. */
export async function requestTableApi<T>(
	fetcher: FetchLike,
	path: string,
	init?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(path, {
			method: init?.method ?? 'GET',
			headers:
				init?.body === undefined
					? { Accept: 'application/json' }
					: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: init?.body === undefined ? undefined : JSON.stringify(init.body),
			signal: init?.signal
		});
	} catch (error) {
		throw new TableClientError(
			error instanceof Error && error.message ? error.message : 'Network error',
			0,
			'NETWORK_ERROR',
			error
		);
	}

	const body = await readBody(response);
	if (!response.ok || body?.success === false) {
		const message =
			(typeof body?.error === 'string' && body.error) ||
			(typeof body?.message === 'string' && body.message) ||
			`Request failed (${response.status})`;
		throw new TableClientError(message, response.status, readErrorCode(body), body?.details);
	}

	// ApiResponse puts the payload under `data`; tolerate a bare payload too.
	const data = body && 'data' in body ? body.data : body;
	return data as T;
}

export function createTableClient(fetcher: FetchLike = (input, init) => fetch(input, init)) {
	const client: TableClient = {
		createTable: (input) =>
			requestTableApi<{ table: LoadedTable; warnings?: string[] }>(fetcher, BASE, {
				method: 'POST',
				body: input
			}).then((data) => ({
				table: data.table,
				warnings: data.warnings ?? []
			})),
		getTable: (documentId) =>
			requestTableApi<{ table: LoadedTable; totals?: Record<string, TableAggregateValue> }>(
				fetcher,
				tablePath(documentId)
			).then((data) => ({ table: data.table, totals: data.totals ?? {} })),
		patchTable: (documentId, input) =>
			requestTableApi<{ table: LoadedTable; receipt?: TableChangeReceipt | null }>(
				fetcher,
				tablePath(documentId),
				{ method: 'PATCH', body: input }
			).then((data) => ({ table: data.table, receipt: data.receipt ?? null })),
		applyRows: (documentId, input) =>
			requestTableApi<{ apply: TableApplyResult; receipt?: TableChangeReceipt | null }>(
				fetcher,
				tablePath(documentId, 'rows'),
				{ method: 'POST', body: input }
			).then((data) => ({ apply: data.apply, receipt: data.receipt ?? null })),
		revertChange: (documentId, receipt) =>
			requestTableApi<{ apply?: TableApplyResult | null; table: LoadedTable }>(
				fetcher,
				tablePath(documentId, 'revert-change'),
				{ method: 'POST', body: { receipt } }
			).then((data) => ({ apply: data.apply ?? null, table: data.table })),
		exportCsvUrl: (documentId) => tablePath(documentId, 'export.csv'),
		createTaskFromRow: (documentId, rowId, input = {}) =>
			requestTableApi<{ task: CreatedTaskSummary; apply?: TableApplyResult | null }>(
				fetcher,
				tablePath(documentId, 'rows', rowId, 'task'),
				{ method: 'POST', body: input }
			).then((data) => ({ task: data.task, apply: data.apply ?? null })),
		startAiFill: (documentId, input) =>
			requestTableApi<{ run_id: string; row_count: number }>(
				fetcher,
				tablePath(documentId, 'ai-fill'),
				{ method: 'POST', body: input }
			),
		getAiFillStatus: (documentId, runId) =>
			requestTableApi<AiFillStatusResult>(fetcher, tablePath(documentId, 'ai-fill', runId))
	};
	return client;
}

/** Default browser client (uses the global fetch at call time). */
export const tableClient: TableClient = createTableClient();

export const createTable = (input: CreateTableInput) => tableClient.createTable(input);
export const getTable = (documentId: string) => tableClient.getTable(documentId);
export const patchTable = (documentId: string, input: PatchTableInput) =>
	tableClient.patchTable(documentId, input);
export const applyRows = (documentId: string, input: ApplyRowsInput) =>
	tableClient.applyRows(documentId, input);
export const revertChange = (documentId: string, receipt: TableChangeReceipt) =>
	tableClient.revertChange(documentId, receipt);
export const exportCsvUrl = (documentId: string) => tableClient.exportCsvUrl(documentId);
export const createTaskFromRow = (
	documentId: string,
	rowId: string,
	input?: CreateTaskFromRowInput
) => tableClient.createTaskFromRow(documentId, rowId, input);
export const startAiFill = (documentId: string, input: StartAiFillInput) =>
	tableClient.startAiFill(documentId, input);
export const getAiFillStatus = (documentId: string, runId: string) =>
	tableClient.getAiFillStatus(documentId, runId);
