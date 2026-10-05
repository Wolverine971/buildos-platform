// apps/worker/src/workers/tables/tableAiFillWorker.ts
//
// table_ai_fill: answers an AI question column row by row (docs/specs/tables/CONTRACT.md,
// "AI question columns"). enqueueTableAiFill (packages/shared-agent-ops/src/tables/
// table-ai-fill.ts) marked each target cell {by:'ai_column', state:'pending', run_id} and
// queued this job. For each of those rows, three at a time:
//   1. research columns search the web through the same port Agentic Chat's web_search uses
//      (createAgentRunWebResearchPort: Tavily, shared result cache, durable cache when enabled);
//   2. the model reads the table, the row's other cells and the evidence, and answers
//      {value, note, source_urls, confidence} on SmartLLM's code-default cheap JSON lane
//      ('fast': DeepSeek V4 Flash first, with fallbacks);
//   3. the answer is converted to the column's type and written with provenance, a few rows
//      per onto_document_table_apply call, so the grid fills while the job runs.
// Failures are written too ({state:'error', error}), never left silent.
//
// State lives in cell_meta, so a retried job resumes: it only answers cells still pending for
// this run. A cell someone edited meanwhile lost its pending mark and is left alone.
import {
	type TableCellMeta,
	type TableColumn,
	type TableDataClient,
	type TableRow,
	type TableRowOp,
	type TableSchema,
	applyTableChanges,
	isEmptyCellValue,
	isTableTypeKey,
	normalizeTableSchema
} from '@buildos/shared-agent-ops/tables';
import {
	type NativeSearchCacheRpcClient,
	createSupabaseNativeSearchDiscoveryCacheStore
} from '@buildos/shared-agent-ops/web/native-search';
import { type JSONRequestOptions, LLMUsageLogger } from '@buildos/smart-llm';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { PermanentQueueError } from '../../lib/queueErrors';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import {
	createAgentRunWebResearchPort,
	readPaidToolCharge,
	resolveTavilyCreditCostUsd
} from '../agent-run/webResearchPort';
import {
	TABLE_AI_FILL_PROMPT_VERSION,
	type TableAiFillAnswer,
	type TableAiFillEvidence,
	buildTableAiFillPrompt,
	buildTableAiFillSearchQuery,
	coerceTableAiFillValue,
	normalizeTableAiFillAnswer,
	readTableAiFillEvidence,
	tableAiFillAllowedUrls
} from './table-ai-fill-prompt';

export const TABLE_AI_FILL_JOB_TYPE = 'table_ai_fill';
export const TABLE_AI_FILL_OPERATION = 'table_ai_fill';
export const TABLE_AI_FILL_SEARCH_OPERATION = 'table_ai_fill_web_search';
/** Rows answered at once (contract: ≤3). */
export const TABLE_AI_FILL_CONCURRENCY = 3;
/**
 * Queue timeout for one run. 200 research rows at ~10 s each, three at a time, take ~11 min;
 * the default 10 min queue timeout would cut big runs off. A timeout still resumes on retry.
 */
export const TABLE_AI_FILL_WORKER_TIMEOUT_MS = 30 * 60 * 1000;

/** SmartLLM's code-default cheap JSON lane (DeepSeek V4 Flash → GPT-6 Luna → …). No env pin. */
const LLM_PROFILE = 'fast' as const;
const LLM_MAX_TOKENS = 1_500;
const LLM_TIMEOUT_MS = 60_000;
/**
 * Same default depth as Agentic Chat's web_search. Advanced = 2 Tavily credits (≈ $0.016),
 * basic = 1; advanced returns the page passages that answer entity questions.
 */
const SEARCH_DEPTH = 'advanced' as const;
const SEARCH_MAX_RESULTS = 5;
const STOP_AFTER_CONSECUTIVE_FAILURES = 5;
const MIN_WRITE_INTERVAL_MS = 1_000;
const MAX_OPS_PER_WRITE = 50;
const ROW_LOAD_CHUNK = 100;
const PROGRESS_EVERY_ROWS = 10;
const DEFAULT_MAX_ATTEMPTS = 3;

const SEARCH_FAILED = 'Web search failed. Try again later.';
const MODEL_FAILED = "The AI couldn't answer this row. Try again later.";
const KEPT_EXISTING = 'No answer found, so the existing value was kept.';
const NO_ANSWER_NOTE = 'No answer found.';

// ---------------------------------------------------------------------------
// Job metadata
// ---------------------------------------------------------------------------

export interface TableAiFillJob {
	documentId: string;
	columnId: string;
	runId: string;
	rowIds: string[];
	userId: string;
	actorId: string | null;
}

/** Validates the metadata written by enqueueTableAiFill (an independent copy by design). */
export function readTableAiFillJob(data: unknown): TableAiFillJob {
	const record =
		data && typeof data === 'object' && !Array.isArray(data)
			? (data as Record<string, unknown>)
			: {};
	const str = (key: string) =>
		typeof record[key] === 'string' && (record[key] as string).trim()
			? (record[key] as string).trim()
			: null;
	const documentId = str('documentId');
	const columnId = str('columnId');
	const runId = str('runId');
	const userId = str('userId');
	const rowIds = Array.isArray(record.rowIds)
		? record.rowIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
		: [];
	if (!documentId || !columnId || !runId || !userId || rowIds.length === 0) {
		throw new PermanentQueueError(
			'invalid_metadata',
			'table_ai_fill needs documentId, columnId, runId, userId and rowIds'
		);
	}
	return { documentId, columnId, runId, rowIds, userId, actorId: str('actorId') };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface TableAiFillTable {
	document: { id: string; project_id: string; title: string; description: string | null };
	schema: Pick<TableSchema, 'columns' | 'primary_column_id'>;
}

/** onto_document_table_apply error code ("CODE: detail" message prefix). */
export class TableAiFillWriteError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'TableAiFillWriteError';
	}
}

export interface TableAiFillStore {
	loadTable(documentId: string): Promise<TableAiFillTable | null>;
	/** Live rows among `rowIds` (any order). */
	loadRows(documentId: string, rowIds: string[]): Promise<TableRow[]>;
	/** One atomic onto_document_table_apply call; throws TableAiFillWriteError on RPC errors. */
	apply(documentId: string, ops: TableRowOp[], actorId: string | null): Promise<void>;
}

export interface TableAiFillJsonCaller {
	getJSONResponse<T>(options: JSONRequestOptions): Promise<T>;
}

export interface TableAiFillSearch {
	search(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

export interface TableAiFillDeps {
	store: TableAiFillStore;
	llm: TableAiFillJsonCaller;
	/** null = web research isn't configured (no search key). */
	search: TableAiFillSearch | null;
	usage: Pick<LLMUsageLogger, 'logUsageToDatabase'>;
	now: () => Date;
	concurrency: number;
	minWriteIntervalMs: number;
	sleep: (ms: number) => Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function toRow(raw: Record<string, unknown>): TableRow {
	return {
		id: String(raw.id),
		row_number: Number(raw.row_number) || 0,
		position: Number(raw.position) || 0,
		cells: (asRecord(raw.cells) ?? {}) as TableRow['cells'],
		cell_meta: (asRecord(raw.cell_meta) ?? {}) as TableRow['cell_meta'],
		version: Number(raw.version) || 1,
		created_by: (raw.created_by as string | null) ?? null,
		updated_by: (raw.updated_by as string | null) ?? null,
		created_at: String(raw.created_at ?? ''),
		updated_at: String(raw.updated_at ?? '')
	};
}

const ROW_COLUMNS =
	'id, row_number, position, cells, cell_meta, version, created_by, updated_by, created_at, updated_at';

/**
 * Admin-client store. Loads only the run's rows (core's loadTable reads every row) and writes
 * through the shared applyTableChanges.
 */
export function createSupabaseTableAiFillStore(client: TableDataClient): TableAiFillStore {
	return {
		async loadTable(documentId) {
			const { data, error } = await client
				.from('onto_documents')
				.select('id, project_id, title, description, type_key, props')
				.eq('id', documentId)
				.is('deleted_at', null)
				.maybeSingle();
			if (error) throw new Error(`Could not load table ${documentId}: ${error.message}`);
			if (!data || !isTableTypeKey(data.type_key)) return null;
			const schema = normalizeTableSchema(asRecord(data.props)?.table);
			return {
				document: {
					id: String(data.id),
					project_id: String(data.project_id),
					title: typeof data.title === 'string' ? data.title : '',
					description: typeof data.description === 'string' ? data.description : null
				},
				schema: { columns: schema.columns, primary_column_id: schema.primary_column_id }
			};
		},
		async loadRows(documentId, rowIds) {
			const rows: TableRow[] = [];
			for (let index = 0; index < rowIds.length; index += ROW_LOAD_CHUNK) {
				const { data, error } = await client
					.from('onto_document_rows')
					.select(ROW_COLUMNS)
					.eq('document_id', documentId)
					.is('deleted_at', null)
					.in('id', rowIds.slice(index, index + ROW_LOAD_CHUNK));
				if (error) throw new Error(`Could not load table rows: ${error.message}`);
				for (const raw of Array.isArray(data) ? data : []) {
					const record = asRecord(raw);
					if (record) rows.push(toRow(record));
				}
			}
			return rows;
		},
		async apply(documentId, ops, actorId) {
			try {
				await applyTableChanges(client, { documentId, ops, actorId });
			} catch (error) {
				// TableServiceError carries the RPC's code (ROW_CONFLICT, ROW_NOT_FOUND, …).
				const code = asRecord(error)?.code;
				throw new TableAiFillWriteError(
					typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'DATABASE_ERROR',
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	};
}

function createDefaultSearch(): TableAiFillSearch | null {
	const durable = ['1', 'true', 'yes'].includes(
		(process.env.NATIVE_SEARCH_DURABLE_CACHE_ENABLED ?? '').trim().toLowerCase()
	);
	const port = createAgentRunWebResearchPort({
		tavilyCreditCostUsd: resolveTavilyCreditCostUsd(),
		searchCacheStore: durable
			? createSupabaseNativeSearchDiscoveryCacheStore(
					defaultSupabase as unknown as NativeSearchCacheRpcClient
				)
			: undefined
	});
	const search = port.search;
	return search ? { search: (args, signal) => search(args, signal) } : null;
}

let sharedLlm: SmartLLMService | null = null;
let sharedUsage: LLMUsageLogger | null = null;

function resolveDeps(deps: Partial<TableAiFillDeps>, research: boolean): TableAiFillDeps {
	return {
		store:
			deps.store ??
			createSupabaseTableAiFillStore(defaultSupabase as unknown as TableDataClient),
		llm: deps.llm ?? (sharedLlm ??= new SmartLLMService()),
		search: deps.search !== undefined ? deps.search : research ? createDefaultSearch() : null,
		usage: deps.usage ?? (sharedUsage ??= new LLMUsageLogger({ supabase: defaultSupabase })),
		now: deps.now ?? (() => new Date()),
		concurrency: Math.max(
			1,
			Math.min(TABLE_AI_FILL_CONCURRENCY, deps.concurrency ?? TABLE_AI_FILL_CONCURRENCY)
		),
		minWriteIntervalMs: deps.minWriteIntervalMs ?? MIN_WRITE_INTERVAL_MS,
		sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
	};
}

// ---------------------------------------------------------------------------
// Cell writes
// ---------------------------------------------------------------------------

type WriteKind = 'filled' | 'failed';

export interface TableAiFillCellWrite {
	rowId: string;
	op: Extract<TableRowOp, { op: 'update' }>;
	kind: WriteKind;
	/** A search/model failure (feeds the stop-after-repeated-failures breaker). */
	systemFailure: boolean;
}

export function isPendingForRun(row: TableRow, columnId: string, runId: string): boolean {
	const meta = row.cell_meta?.[columnId];
	return meta?.by === 'ai_column' && meta.state === 'pending' && meta.run_id === runId;
}

function compactMeta(meta: TableCellMeta): TableCellMeta {
	const out: TableCellMeta = { by: meta.by, at: meta.at };
	if (meta.state) out.state = meta.state;
	if (meta.run_id) out.run_id = meta.run_id;
	if (meta.source_urls?.length) out.source_urls = meta.source_urls;
	if (meta.note) out.note = meta.note;
	if (meta.confidence) out.confidence = meta.confidence;
	if (meta.error) out.error = meta.error;
	return out;
}

function errorWrite(
	row: TableRow,
	columnId: string,
	runId: string,
	at: string,
	error: string,
	opts: { note?: string; sourceUrls?: string[]; systemFailure?: boolean } = {}
): TableAiFillCellWrite {
	return {
		rowId: row.id,
		kind: 'failed',
		systemFailure: opts.systemFailure ?? false,
		op: {
			op: 'update',
			row_id: row.id,
			expected_version: row.version,
			// No `cells`: a failed answer never erases what the cell had.
			cell_meta: {
				[columnId]: compactMeta({
					by: 'ai_column',
					state: 'error',
					run_id: runId,
					error,
					note: opts.note,
					source_urls: opts.sourceUrls,
					at
				})
			}
		}
	};
}

/** Answer → the write for its cell (typed value + provenance, or an error that keeps data). */
export function buildTableAiFillWrite(
	row: TableRow,
	column: TableColumn,
	runId: string,
	at: string,
	answer: TableAiFillAnswer
): TableAiFillCellWrite {
	const coerced = coerceTableAiFillValue(column, answer.value);
	if (coerced.error) {
		return errorWrite(row, column.id, runId, at, coerced.error, {
			note: answer.note,
			sourceUrls: answer.source_urls
		});
	}
	if (coerced.value === null) {
		if (!isEmptyCellValue(row.cells[column.id])) {
			return errorWrite(row, column.id, runId, at, KEPT_EXISTING, {
				note: answer.note,
				sourceUrls: answer.source_urls
			});
		}
		// "Nothing found" is an answer: no value, but the note says why, and a later Fill
		// won't re-bill it until the question changes.
		return {
			rowId: row.id,
			kind: 'filled',
			systemFailure: false,
			op: {
				op: 'update',
				row_id: row.id,
				expected_version: row.version,
				cell_meta: {
					[column.id]: compactMeta({
						by: 'ai_column',
						state: 'filled',
						run_id: runId,
						note: answer.note ?? NO_ANSWER_NOTE,
						source_urls: answer.source_urls,
						confidence: answer.confidence,
						at
					})
				}
			}
		};
	}
	const note = [answer.note, coerced.warning ? `(${coerced.warning})` : null]
		.filter(Boolean)
		.join(' ');
	return {
		rowId: row.id,
		kind: 'filled',
		systemFailure: false,
		op: {
			op: 'update',
			row_id: row.id,
			expected_version: row.version,
			cells: { [column.id]: coerced.value },
			cell_meta: {
				[column.id]: compactMeta({
					by: 'ai_column',
					state: 'filled',
					run_id: runId,
					note: note || undefined,
					source_urls: answer.source_urls,
					confidence: answer.confidence,
					at
				})
			}
		}
	};
}

/**
 * Serializes cell writes: one apply call at a time, at most one per `minIntervalMs`, taking
 * every answer that finished meanwhile. Each write regenerates the table's markdown (and its
 * embedding), so grouping answers keeps that churn down without making the grid wait.
 */
class CellWriter {
	readonly counts = { filled: 0, failed: 0, skipped: 0 };
	private queue: TableAiFillCellWrite[] = [];
	private running: Promise<void> | null = null;
	private lastWriteAt = Number.NEGATIVE_INFINITY;
	private failure: unknown = null;

	constructor(
		private readonly ctx: {
			store: TableAiFillStore;
			job: TableAiFillJob;
			signal: AbortSignal;
			minIntervalMs: number;
			sleep: (ms: number) => Promise<void>;
			onWritten: () => Promise<void>;
		}
	) {}

	get failed(): boolean {
		return this.failure !== null;
	}

	get written(): number {
		return this.counts.filled + this.counts.failed + this.counts.skipped;
	}

	add(write: TableAiFillCellWrite): void {
		this.queue.push(write);
		this.kick();
	}

	async drain(): Promise<void> {
		this.kick();
		while (this.running) await this.running;
		if (this.failure) throw this.failure;
	}

	private kick(): void {
		if (this.running || this.failure || this.queue.length === 0) return;
		this.running = this.pump().then(() => {
			this.running = null;
			this.kick();
		});
	}

	private async pump(): Promise<void> {
		try {
			while (this.queue.length > 0) {
				if (this.ctx.signal.aborted) {
					// No longer our job: a retry may already own these cells.
					this.queue = [];
					return;
				}
				const wait = this.lastWriteAt + this.ctx.minIntervalMs - Date.now();
				if (wait > 0) await this.ctx.sleep(wait);
				const batch = this.queue.splice(0, MAX_OPS_PER_WRITE);
				await this.writeBatch(batch);
				this.lastWriteAt = Date.now();
				await this.ctx.onWritten();
			}
		} catch (error) {
			this.failure = error;
			this.queue = [];
		}
	}

	private async writeBatch(batch: TableAiFillCellWrite[]): Promise<void> {
		if (this.ctx.signal.aborted) return;
		const { store, job } = this.ctx;
		try {
			await store.apply(
				job.documentId,
				batch.map((write) => write.op),
				job.actorId
			);
			for (const write of batch) this.counts[write.kind] += 1;
			return;
		} catch (error) {
			if (!isRowLevelWriteError(error)) throw error;
		}
		// Someone touched one of these rows meanwhile: write them one by one.
		for (const write of batch) await this.writeOne(write);
	}

	private async writeOne(write: TableAiFillCellWrite): Promise<void> {
		const { store, job } = this.ctx;
		for (let attempt = 0; attempt < 3; attempt++) {
			if (this.ctx.signal.aborted) return;
			try {
				await store.apply(job.documentId, [write.op], job.actorId);
				this.counts[write.kind] += 1;
				return;
			} catch (error) {
				if (!isRowLevelWriteError(error)) throw error;
				if (error.code === 'ROW_NOT_FOUND') break;
				const [fresh] = await store.loadRows(job.documentId, [write.rowId]);
				// Edited by a person (provenance cleared) or taken by another run: leave it.
				if (!fresh || !isPendingForRun(fresh, job.columnId, job.runId)) break;
				write.op = { ...write.op, expected_version: fresh.version };
			}
		}
		this.counts.skipped += 1;
	}
}

function isRowLevelWriteError(error: unknown): error is TableAiFillWriteError {
	return (
		error instanceof TableAiFillWriteError &&
		(error.code === 'ROW_CONFLICT' || error.code === 'ROW_NOT_FOUND')
	);
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export interface TableAiFillJobResult {
	success: boolean;
	documentId: string;
	columnId: string;
	runId: string;
	total: number;
	filled: number;
	failed: number;
	skipped: number;
	/** Why the run stopped early, when it did. */
	stopped?: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function processTableAiFillJob(
	job: ProcessingJob<unknown>,
	deps: Partial<TableAiFillDeps> = {}
): Promise<TableAiFillJobResult> {
	const spec = readTableAiFillJob(job.data);
	const { signal } = job;
	const result: TableAiFillJobResult = {
		success: true,
		documentId: spec.documentId,
		columnId: spec.columnId,
		runId: spec.runId,
		total: spec.rowIds.length,
		filled: 0,
		failed: 0,
		skipped: 0
	};
	const store =
		deps.store ?? createSupabaseTableAiFillStore(defaultSupabase as unknown as TableDataClient);

	const table = await store.loadTable(spec.documentId);
	if (!table) {
		await job.log('Table is gone; nothing to fill');
		return { ...result, skipped: result.total, stopped: 'Table not found' };
	}
	const column = table.schema.columns.find((candidate) => candidate.id === spec.columnId);
	const research = column?.ai?.research === true;
	const resolved = resolveDeps({ ...deps, store }, research);
	const now = () => resolved.now().toISOString();

	const loaded = await store.loadRows(spec.documentId, spec.rowIds);
	const byId = new Map(loaded.map((row) => [row.id, row]));
	const targets = spec.rowIds
		.map((id) => byId.get(id))
		.filter(
			(row): row is TableRow =>
				Boolean(row) && isPendingForRun(row!, spec.columnId, spec.runId)
		);
	const leftRun = result.total - targets.length;
	if (targets.length === 0) {
		await job.log('No cells are still waiting for this run');
		return { ...result, skipped: leftRun };
	}

	let progressAt = 0;
	const writer = new CellWriter({
		store,
		job: spec,
		signal,
		minIntervalMs: resolved.minWriteIntervalMs,
		sleep: resolved.sleep,
		onWritten: async () => {
			if (writer.written - progressAt < PROGRESS_EVERY_ROWS) return;
			progressAt = writer.written;
			try {
				await job.updateProgress({
					current: writer.written,
					total: targets.length,
					message: `Filled ${writer.counts.filled}, failed ${writer.counts.failed}`
				});
			} catch {
				// Progress is cosmetic; cell_meta is the source of truth.
			}
		}
	});
	const finish = async (stopped?: string): Promise<TableAiFillJobResult> => {
		await writer.drain();
		if (signal.aborted) throw new Error('table_ai_fill aborted (timeout or shutdown)');
		const summary = {
			...result,
			filled: writer.counts.filled,
			failed: writer.counts.failed,
			skipped: writer.counts.skipped + leftRun,
			...(stopped ? { stopped } : {})
		};
		await job.log(
			`Filled ${summary.filled}, failed ${summary.failed}, skipped ${summary.skipped} of ${summary.total}${stopped ? ` (stopped: ${stopped})` : ''}`
		);
		return summary;
	};
	const failAll = (rows: TableRow[], reason: string) => {
		for (const row of rows)
			writer.add(errorWrite(row, spec.columnId, spec.runId, now(), reason));
	};

	try {
		if (!column?.ai?.prompt?.trim() || column.type === 'link') {
			const reason = !column
				? 'The column was deleted.'
				: column.type === 'link'
					? "AI can't fill link columns."
					: 'This column no longer has a question.';
			failAll(targets, reason);
			return await finish(reason);
		}
		const search = resolved.search;
		if (research && !search) {
			const reason = "Web research isn't set up on this server.";
			failAll(targets, reason);
			return await finish(reason);
		}

		await job.log(
			`Filling ${targets.length} rows of "${column.name}"${research ? ' with web research' : ''}`
		);

		const fillRow = async (row: TableRow): Promise<TableAiFillCellWrite | null> => {
			let evidence: TableAiFillEvidence | null = null;
			if (research && search) {
				const query = buildTableAiFillSearchQuery(table.schema, column, row);
				const startedAt = Date.now();
				try {
					const payload = await search.search(
						{ query, search_depth: SEARCH_DEPTH, max_results: SEARCH_MAX_RESULTS },
						signal
					);
					evidence = readTableAiFillEvidence(query, payload);
					await logSearchCharge(resolved, payload, {
						spec,
						projectId: table.document.project_id,
						rowId: row.id,
						startedAt
					});
				} catch (error) {
					if (signal.aborted) return null;
					await job.log(`Search failed for r${row.row_number}: ${errorMessage(error)}`);
					return errorWrite(row, spec.columnId, spec.runId, now(), SEARCH_FAILED, {
						systemFailure: true
					});
				}
			}
			const prompt = buildTableAiFillPrompt({
				table: table.document,
				schema: table.schema,
				column,
				row,
				evidence
			});
			let raw: unknown;
			try {
				raw = await resolved.llm.getJSONResponse<unknown>({
					systemPrompt: prompt.systemPrompt,
					userPrompt: prompt.userPrompt,
					userId: spec.userId,
					profile: LLM_PROFILE,
					maxTokens: LLM_MAX_TOKENS,
					temperature: 0.1,
					timeoutMs: LLM_TIMEOUT_MS,
					signal,
					operationType: TABLE_AI_FILL_OPERATION,
					projectId: table.document.project_id,
					metadata: {
						documentId: spec.documentId,
						columnId: spec.columnId,
						runId: spec.runId,
						rowId: row.id,
						research,
						promptVersion: TABLE_AI_FILL_PROMPT_VERSION
					}
				});
			} catch (error) {
				if (signal.aborted) return null;
				await job.log(`Model failed for r${row.row_number}: ${errorMessage(error)}`);
				return errorWrite(row, spec.columnId, spec.runId, now(), MODEL_FAILED, {
					systemFailure: true
				});
			}
			const normalized = normalizeTableAiFillAnswer(
				raw,
				tableAiFillAllowedUrls(table.schema, row, evidence)
			);
			if (!normalized.ok) {
				return errorWrite(row, spec.columnId, spec.runId, now(), normalized.error);
			}
			return buildTableAiFillWrite(row, column, spec.runId, now(), normalized.answer);
		};

		let next = 0;
		let consecutiveFailures = 0;
		let stopReason: string | null = null;
		const lane = async () => {
			while (!signal.aborted && !stopReason && !writer.failed) {
				const row = targets[next];
				if (!row) return;
				next += 1;
				const write = await fillRow(row);
				if (!write || signal.aborted) return;
				consecutiveFailures = write.systemFailure ? consecutiveFailures + 1 : 0;
				if (consecutiveFailures >= STOP_AFTER_CONSECUTIVE_FAILURES && !stopReason) {
					stopReason = `Stopped after ${STOP_AFTER_CONSECUTIVE_FAILURES} rows failed in a row. Try again later.`;
				}
				writer.add(write);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(resolved.concurrency, targets.length) }, lane)
		);
		if (stopReason && !signal.aborted) failAll(targets.slice(next), stopReason);
		return await finish(stopReason ?? undefined);
	} catch (error) {
		if (
			!signal.aborted &&
			(job.attempts ?? 0) + 1 >= (job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
		) {
			// Last attempt: say so in the cells instead of leaving them pending forever.
			await markStillPendingAsFailed(
				store,
				spec,
				now(),
				`Fill stopped: ${errorMessage(error)}`
			);
		}
		throw error;
	}
}

async function markStillPendingAsFailed(
	store: TableAiFillStore,
	spec: TableAiFillJob,
	at: string,
	reason: string
): Promise<void> {
	try {
		const rows = await store.loadRows(spec.documentId, spec.rowIds);
		const ops = rows
			.filter((row) => isPendingForRun(row, spec.columnId, spec.runId))
			.map((row) => errorWrite(row, spec.columnId, spec.runId, at, reason.slice(0, 300)).op);
		if (ops.length > 0) await store.apply(spec.documentId, ops, spec.actorId);
	} catch {
		// Best effort; the status read reports unreached cells as failed once the job is over.
	}
}

async function logSearchCharge(
	deps: TableAiFillDeps,
	payload: unknown,
	ctx: { spec: TableAiFillJob; projectId: string; rowId: string; startedAt: number }
): Promise<void> {
	// Present only when the search reached the provider (cache hits are free).
	const charge = readPaidToolCharge(payload);
	if (!charge) return;
	const completedAt = Date.now();
	const resource = charge.credits === 1 ? 'basic' : 'advanced';
	try {
		await deps.usage.logUsageToDatabase({
			userId: ctx.spec.userId,
			operationType: TABLE_AI_FILL_SEARCH_OPERATION,
			modelRequested: `tavily/search-${resource}`,
			modelUsed: `tavily/search-${resource}`,
			provider: 'tavily',
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
			inputCost: 0,
			outputCost: 0,
			totalCost: charge.cost_usd,
			responseTimeMs: completedAt - ctx.startedAt,
			requestStartedAt: new Date(ctx.startedAt),
			requestCompletedAt: new Date(completedAt),
			status: 'success',
			projectId: ctx.projectId,
			metadata: {
				document_id: ctx.spec.documentId,
				column_id: ctx.spec.columnId,
				run_id: ctx.spec.runId,
				row_id: ctx.rowId,
				tavily_credits: charge.credits,
				provider_request_id: charge.provider_request_id ?? null,
				charge_source: charge.source
			}
		});
	} catch (error) {
		console.warn('[tableAiFill] failed to log web-search usage:', errorMessage(error));
	}
}
