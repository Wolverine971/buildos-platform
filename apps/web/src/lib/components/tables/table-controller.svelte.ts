// apps/web/src/lib/components/tables/table-controller.svelte.ts
//
// TableController — the state behind TableWorkspace.
//
// The table on screen is always `serverTable` (last copy the server confirmed)
// with every unacknowledged optimistic op replayed on top (`pending`). A write
// that fails simply drops its op, so the screen rolls back by itself; a 409
// refetches and tells the user gently. All network calls run through one
// queue, so per-row `expected_version`s are read right before each send and a
// slow refresh can never land on top of a newer write.
import {
	TABLE_LIMITS,
	type LoadedTable,
	type TableApplyResult,
	type TableCellValue,
	type TableChangeReceipt,
	type TableColumnChange,
	type TableRowOp,
	type TableRowTask,
	type TableView
} from '@buildos/shared-agent-ops/tables';
import {
	tableClient as defaultClient,
	isTableConflict,
	TableClientError,
	type AiFillStatus,
	type CreatedTaskSummary,
	type TableClient
} from './table-client';
import {
	applyApplyResult,
	applyPendingOps,
	countPendingAiCells,
	groupEditsByRow,
	isTempRowId,
	newlyFilledCells,
	remapPendingRowId,
	tempRowId,
	type CellEdit,
	type InsertHint,
	type PendingOp
} from './table-view-model';
import { isEmptyCell } from './table-cell-format';

export interface NotifyAction {
	label: string;
	onClick: () => void;
}

export interface TableNotifier {
	success(message: string, action?: NotifyAction): void;
	info(message: string, action?: NotifyAction): void;
	warning(message: string, action?: NotifyAction): void;
	error(message: string, action?: NotifyAction): void;
}

export interface AiFillState {
	runId: string;
	columnId: string;
	status: AiFillStatus;
	filled: number;
	failed: number;
	total: number;
}

export interface TableControllerOptions {
	documentId: string;
	projectId: string;
	initialTable?: LoadedTable | null;
	client?: TableClient;
	notify?: TableNotifier;
	onChanged?: (table: LoadedTable) => void;
	/** AI fill status poll interval. */
	aiPollMs?: number;
	/** Refresh interval while cells are pending from a fill started elsewhere (chat). */
	pendingPollMs?: number;
	/** How long freshly filled cells glow. */
	flashMs?: number;
}

const silentNotifier: TableNotifier = {
	success: () => undefined,
	info: () => undefined,
	warning: () => undefined,
	error: () => undefined
};

const MAX_UNDO = 20;
const MAX_PENDING_POLLS = 150;

export function friendlyTableError(
	error: unknown,
	fallback = "Couldn't save that change."
): string {
	if (error instanceof TableClientError) {
		switch (error.code) {
			case 'NETWORK_ERROR':
				return "Couldn't reach BuildOS. Your change wasn't saved.";
			case 'ROW_NOT_FOUND':
				return 'That row was deleted somewhere else.';
			case 'LIMIT_EXCEEDED':
				return `That's more than one table holds (${TABLE_LIMITS.maxRows.toLocaleString()} rows, ${TABLE_LIMITS.maxColumns} columns).`;
			case 'TABLE_NOT_FOUND':
				return 'This table no longer exists.';
			case 'NOT_A_TABLE':
				return 'This document is not a table.';
			default:
				break;
		}
		const message = error.message.replace(/^[A-Z_]+:\s*/, '').trim();
		return message || fallback;
	}
	return fallback;
}

function hasChanges(receipt: TableChangeReceipt | null | undefined): receipt is TableChangeReceipt {
	if (!receipt) return false;
	return (
		receipt.rows_added > 0 ||
		receipt.rows_updated > 0 ||
		receipt.rows_deleted > 0 ||
		receipt.cells_changed > 0 ||
		(receipt.columns_changed?.length ?? 0) > 0 ||
		(receipt.inverse_ops?.length ?? 0) > 0 ||
		!!receipt.inverse_schema
	);
}

function cleanCells(cells: Record<string, TableCellValue>): Record<string, TableCellValue> {
	const out: Record<string, TableCellValue> = {};
	for (const [key, value] of Object.entries(cells)) {
		if (!isEmptyCell(value)) out[key] = value;
	}
	return out;
}

interface RowWrite {
	edits?: CellEdit[];
	inserts?: Array<{ cells: Record<string, TableCellValue>; afterRowId?: string | null }>;
	deletes?: string[];
}

export class TableController {
	readonly documentId: string;
	readonly projectId: string;

	serverTable = $state.raw<LoadedTable | null>(null);
	pending = $state.raw<PendingOp[]>([]);
	table = $derived(this.serverTable ? applyPendingOps(this.serverTable, this.pending) : null);

	loading = $state(false);
	loadError = $state<string | null>(null);
	inflight = $state(0);
	undoStack = $state.raw<TableChangeReceipt[]>([]);
	aiFill = $state.raw<AiFillState | null>(null);
	flashKeys = $state.raw<ReadonlySet<string>>(new Set());
	lastSavedAt = $state<number | null>(null);
	/** Tasks made from rows, by row id (from the last full load, plus tasks made here). */
	rowTasks = $state.raw<Record<string, TableRowTask[]>>({});

	canUndo = $derived(this.undoStack.length > 0);
	saving = $derived(this.inflight > 0);
	pendingAiCells = $derived(countPendingAiCells(this.table));

	#client: TableClient;
	#notify: TableNotifier;
	#onChanged?: (table: LoadedTable) => void;
	#aiPollMs: number;
	#pendingPollMs: number;
	#flashMs: number;
	#queue: Promise<unknown> = Promise.resolve();
	#nextOpId = 1;
	#nextRef = 1;
	#idMap = new Map<string, string>();
	#timers = new Map<string, ReturnType<typeof setTimeout>>();
	#pendingPolls = 0;
	#aiErrors = 0;
	#disposed = false;

	constructor(options: TableControllerOptions) {
		this.documentId = options.documentId;
		this.projectId = options.projectId;
		this.#client = options.client ?? defaultClient;
		this.#notify = options.notify ?? silentNotifier;
		this.#onChanged = options.onChanged;
		this.#aiPollMs = options.aiPollMs ?? 2500;
		this.#pendingPollMs = options.pendingPollMs ?? 4000;
		this.#flashMs = options.flashMs ?? 1800;
		if (options.initialTable) this.serverTable = options.initialTable;
	}

	// -------------------------------------------------------------------------
	// Loading
	// -------------------------------------------------------------------------

	/** First load: uses the initial table when given, otherwise fetches. */
	async load(): Promise<void> {
		if (this.serverTable) {
			this.#maybeSchedulePendingPoll();
			return;
		}
		this.loading = true;
		this.loadError = null;
		try {
			await this.#enqueue(() => this.#fetchServer());
		} catch (error) {
			this.loadError = friendlyTableError(error, "Couldn't open this table.");
		} finally {
			this.loading = false;
		}
	}

	/** Refetch the table (queued behind any writes). */
	refresh(): Promise<void> {
		return this.#enqueue(async () => {
			try {
				await this.#fetchServer();
			} catch (error) {
				if (!this.serverTable)
					this.loadError = friendlyTableError(error, "Couldn't open this table.");
			}
		});
	}

	/** Swap in a table loaded elsewhere (e.g. the host refetched). */
	replaceTable(table: LoadedTable): void {
		this.#setServer(table, true);
	}

	resolveRowId(rowId: string): string {
		return this.#idMap.get(rowId) ?? rowId;
	}

	// -------------------------------------------------------------------------
	// Row writes
	// -------------------------------------------------------------------------

	editCells(edits: CellEdit[], opts: { undoToast?: string } = {}): Promise<void> {
		const clean = edits.filter((edit) => !!edit.rowId && !!edit.columnId);
		if (!clean.length) return Promise.resolve();
		return this.#writeRows({ edits: clean }, opts);
	}

	/** Adds a row and returns its temporary id (stable until the server answers). */
	insertRow(cells: Record<string, TableCellValue> = {}, afterRowId?: string | null): string {
		const [tempId] = this.#writeRowsSync({ inserts: [{ cells, afterRowId }] }, {});
		return tempId ?? '';
	}

	/** One write for a paste: cell edits plus new rows (one undo step). */
	applyPaste(
		edits: CellEdit[],
		inserts: Array<Record<string, TableCellValue>>,
		opts: { undoToast?: string } = {}
	): Promise<void> {
		if (!edits.length && !inserts.length) return Promise.resolve();
		return this.#writeRows({ edits, inserts: inserts.map((cells) => ({ cells })) }, opts);
	}

	appendRows(
		rows: Array<Record<string, TableCellValue>>,
		opts: { undoToast?: string } = {}
	): Promise<void> {
		if (!rows.length) return Promise.resolve();
		return this.#writeRows({ inserts: rows.map((cells) => ({ cells })) }, opts);
	}

	deleteRows(rowIds: string[]): Promise<void> {
		const ids = rowIds.map((id) => this.resolveRowId(id)).filter((id) => !isTempRowId(id));
		if (!ids.length) return Promise.resolve();
		const label = ids.length === 1 ? 'Row deleted' : `${ids.length} rows deleted`;
		return this.#writeRows({ deletes: ids }, { undoToast: label });
	}

	#writeRows(write: RowWrite, opts: { undoToast?: string }): Promise<void> {
		const [, done] = this.#startRowWrite(write, opts);
		return done;
	}

	#writeRowsSync(write: RowWrite, opts: { undoToast?: string }): string[] {
		const [tempIds] = this.#startRowWrite(write, opts);
		return tempIds;
	}

	#startRowWrite(write: RowWrite, opts: { undoToast?: string }): [string[], Promise<void>] {
		if (!this.serverTable) return [[], Promise.resolve()];
		const ops: PendingOp[] = [];
		const tempIds: string[] = [];
		const refs: string[] = [];
		if (write.edits?.length) {
			ops.push({ id: this.#nextOpId++, kind: 'edit', edits: write.edits });
		}
		for (const insert of write.inserts ?? []) {
			const ref = `n${Date.now().toString(36)}${(this.#nextRef++).toString(36)}`;
			refs.push(ref);
			tempIds.push(tempRowId(ref));
			ops.push({
				id: this.#nextOpId++,
				kind: 'insert',
				ref,
				cells: insert.cells,
				afterRowId: insert.afterRowId ?? null
			});
		}
		if (write.deletes?.length) {
			ops.push({ id: this.#nextOpId++, kind: 'delete', rowIds: write.deletes });
		}
		if (!ops.length) return [[], Promise.resolve()];

		const opIds = new Set(ops.map((op) => op.id));
		this.pending = [...this.pending, ...ops];

		const done = this.#runWrite(opIds, async () => {
			const current = this.pending.filter((op) => opIds.has(op.id));
			const rowOps: TableRowOp[] = [];
			const hints: Record<string, InsertHint> = {};
			for (const op of current) {
				if (op.kind === 'edit') {
					for (const group of groupEditsByRow(op.edits)) {
						if (isTempRowId(group.rowId)) continue;
						const version = this.#versionOf(group.rowId);
						rowOps.push({
							op: 'update',
							row_id: group.rowId,
							cells: group.cells,
							...(version !== null ? { expected_version: version } : {})
						});
					}
				} else if (op.kind === 'insert') {
					const after =
						op.afterRowId && !isTempRowId(op.afterRowId) ? op.afterRowId : undefined;
					rowOps.push({
						op: 'insert',
						ref: op.ref,
						cells: cleanCells(op.cells),
						...(after ? { after_row_id: after } : {})
					});
					hints[op.ref] = {
						tempId: tempRowId(op.ref),
						cells: op.cells,
						afterRowId: after
					};
				} else if (op.kind === 'delete') {
					for (const rowId of op.rowIds) {
						if (isTempRowId(rowId)) continue;
						const version = this.#versionOf(rowId);
						rowOps.push({
							op: 'delete',
							row_id: rowId,
							...(version !== null ? { expected_version: version } : {})
						});
					}
				}
			}
			if (!rowOps.length) {
				this.pending = this.pending.filter((op) => !opIds.has(op.id));
				return;
			}

			const chunks: TableRowOp[][] = [];
			for (let i = 0; i < rowOps.length; i += TABLE_LIMITS.maxOpsPerApply) {
				chunks.push(rowOps.slice(i, i + TABLE_LIMITS.maxOpsPerApply));
			}
			for (const [index, chunk] of chunks.entries()) {
				const response = await this.#client.applyRows(this.documentId, { ops: chunk });
				const last = index === chunks.length - 1;
				this.#ackApply(last ? opIds : new Set(), response.apply, hints);
				this.#pushReceipt(response.receipt);
			}
			if (opts.undoToast && this.canUndo) {
				this.#notify.info(opts.undoToast, {
					label: 'Undo',
					onClick: () => void this.undo()
				});
			}
		});
		return [tempIds, done];
	}

	// -------------------------------------------------------------------------
	// Columns + document
	// -------------------------------------------------------------------------

	changeColumns(changes: TableColumnChange[], opts: { undoToast?: string } = {}): Promise<void> {
		if (!changes.length || !this.serverTable) return Promise.resolve();
		const op: PendingOp = { id: this.#nextOpId++, kind: 'columns', changes };
		this.pending = [...this.pending, op];
		const ids = new Set([op.id]);
		return this.#runWrite(ids, async () => {
			const response = await this.#client.patchTable(this.documentId, {
				column_changes: changes
			});
			this.pending = this.pending.filter((pending) => pending.id !== op.id);
			this.#setServer(response.table, false);
			this.#pushReceipt(response.receipt);
			if (opts.undoToast && this.canUndo) {
				this.#notify.info(opts.undoToast, {
					label: 'Undo',
					onClick: () => void this.undo()
				});
			}
		});
	}

	updateDocument(input: {
		title?: string;
		description?: string | null;
		views?: TableView[];
		primary_column_id?: string;
	}): Promise<void> {
		if (!this.serverTable) return Promise.resolve();
		const previous = this.serverTable;
		this.serverTable = {
			...previous,
			document: {
				...previous.document,
				...(input.title !== undefined ? { title: input.title } : {}),
				...(input.description !== undefined ? { description: input.description } : {})
			},
			schema: {
				...previous.schema,
				...(input.views !== undefined ? { views: input.views } : {}),
				...(input.primary_column_id !== undefined
					? { primary_column_id: input.primary_column_id }
					: {})
			}
		};
		return this.#runWrite(new Set(), async () => {
			const response = await this.#client.patchTable(this.documentId, input);
			this.#setServer(response.table, false);
		});
	}

	// -------------------------------------------------------------------------
	// Undo
	// -------------------------------------------------------------------------

	undo(): Promise<void> {
		const receipt = this.undoStack.at(-1);
		if (!receipt) return Promise.resolve();
		this.undoStack = this.undoStack.slice(0, -1);
		this.inflight += 1;
		return this.#enqueue(async () => {
			try {
				const response = await this.#client.revertChange(this.documentId, receipt);
				this.#setServer(response.table, false);
				this.#notify.info('Change undone');
			} catch (error) {
				if (isTableConflict(error)) {
					this.#notify.warning("Couldn't undo — those rows changed since.");
				} else {
					this.#notify.error(friendlyTableError(error, "Couldn't undo that change."));
				}
				await this.#fetchServer().catch(() => undefined);
			} finally {
				this.inflight -= 1;
			}
		});
	}

	// -------------------------------------------------------------------------
	// Row → task
	// -------------------------------------------------------------------------

	async makeTask(
		rowId: string,
		input: { title?: string; linkColumnId?: string | null } = {}
	): Promise<CreatedTaskSummary | null> {
		const id = this.resolveRowId(rowId);
		if (isTempRowId(id)) return null;
		this.inflight += 1;
		try {
			return await this.#enqueue(async () => {
				const response = await this.#client.createTaskFromRow(this.documentId, id, {
					...(input.title ? { title: input.title } : {}),
					...(input.linkColumnId ? { link_column: input.linkColumnId } : {})
				});
				if (response.apply) this.#ackApply(new Set(), response.apply, {});
				const made: TableRowTask = {
					id: response.task.id,
					title: response.task.title ?? '',
					state_key:
						typeof response.task.state_key === 'string'
							? response.task.state_key
							: 'todo'
				};
				this.rowTasks = { ...this.rowTasks, [id]: [...(this.rowTasks[id] ?? []), made] };
				return response.task;
			});
		} catch (error) {
			this.#notify.error(friendlyTableError(error, "Couldn't make a task from that row."));
			return null;
		} finally {
			this.inflight -= 1;
		}
	}

	// -------------------------------------------------------------------------
	// AI question columns
	// -------------------------------------------------------------------------

	async startAiFill(
		columnId: string,
		opts: { rowIds?: string[]; onlyEmpty?: boolean } = {}
	): Promise<boolean> {
		try {
			// A question saved a moment ago is still in the queue; let it land first.
			await this.settled();
			const rowIds = opts.rowIds
				?.map((id) => this.resolveRowId(id))
				.filter((id) => !isTempRowId(id));
			const response = await this.#client.startAiFill(this.documentId, {
				column: columnId,
				...(rowIds?.length ? { row_ids: rowIds } : {}),
				only_empty: opts.onlyEmpty ?? true
			});
			this.#aiErrors = 0;
			if (!response.row_count) {
				this.aiFill = null;
				this.#notify.info('Every row already has an answer in that column.');
				return false;
			}
			this.aiFill = {
				runId: response.run_id,
				columnId,
				status: 'queued',
				filled: 0,
				failed: 0,
				total: response.row_count
			};
			await this.refresh();
			this.#schedule('ai', this.#aiPollMs, () => void this.#pollAiFill());
			return true;
		} catch (error) {
			this.#notify.error(friendlyTableError(error, "Couldn't start filling that column."));
			return false;
		}
	}

	/** Hides the progress banner; cells still pending keep refreshing in the background. */
	dismissAiFill(): void {
		this.#clearTimer('ai');
		this.#clearTimer('ai-clear');
		this.aiFill = null;
		this.#maybeSchedulePendingPoll();
	}

	async #pollAiFill(): Promise<void> {
		const fill = this.aiFill;
		if (this.#disposed || !fill || fill.status === 'done' || fill.status === 'error') return;
		try {
			const status = await this.#client.getAiFillStatus(this.documentId, fill.runId);
			if (this.#disposed || this.aiFill?.runId !== fill.runId) return;
			this.aiFill = { ...fill, ...status };
			if (this.inflight === 0) await this.refresh();
			if (status.status === 'done' || status.status === 'error') {
				const missed = status.failed > 0 ? ` · ${status.failed} couldn't be found` : '';
				if (status.status === 'error' && status.filled === 0) {
					this.#notify.error('The fill stopped before it found any answers.');
				} else {
					this.#notify.success(`Filled ${status.filled} of ${status.total}${missed}`);
				}
				this.#schedule('ai-clear', 6000, () => {
					if (this.aiFill?.runId === fill.runId) this.aiFill = null;
				});
				return;
			}
		} catch {
			this.#aiErrors += 1;
			if (this.#aiErrors > 5) {
				this.#notify.warning(
					'Lost track of the fill. It may still be running — refresh to check.'
				);
				this.aiFill = null;
				return;
			}
		}
		this.#schedule('ai', this.#aiPollMs, () => void this.#pollAiFill());
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	dispose(): void {
		this.#disposed = true;
		for (const timer of this.#timers.values()) clearTimeout(timer);
		this.#timers.clear();
	}

	/** Resolves once every queued call has settled (tests, and before navigating away). */
	settled(): Promise<void> {
		return this.#queue.then(() => undefined);
	}

	// -------------------------------------------------------------------------
	// Internals
	// -------------------------------------------------------------------------

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#queue.then(task, task);
		this.#queue = run.catch(() => undefined);
		return run;
	}

	#runWrite(opIds: Set<number>, task: () => Promise<void>): Promise<void> {
		this.inflight += 1;
		return this.#enqueue(async () => {
			try {
				await task();
			} catch (error) {
				this.pending = this.pending.filter((op) => !opIds.has(op.id));
				await this.#handleWriteError(error);
			} finally {
				this.inflight -= 1;
			}
		});
	}

	async #handleWriteError(error: unknown): Promise<void> {
		if (isTableConflict(error)) {
			this.#notify.warning(
				'This table changed somewhere else, so that edit was not saved. Showing the latest.'
			);
		} else {
			this.#notify.error(friendlyTableError(error));
		}
		try {
			await this.#fetchServer();
		} catch {
			// Keep the last copy on screen; the next action will retry.
		}
	}

	async #fetchServer(): Promise<void> {
		if (this.#disposed) return;
		const { table, rowTasks } = await this.#client.getTable(this.documentId);
		if (this.#disposed) return;
		this.loadError = null;
		this.rowTasks = rowTasks;
		this.#setServer(table, true);
	}

	#setServer(table: LoadedTable, detectFlash: boolean): void {
		const previous = this.serverTable;
		this.serverTable = table;
		if (detectFlash) {
			const keys = newlyFilledCells(previous, table);
			if (keys.length) {
				this.flashKeys = new Set(keys);
				this.#schedule('flash', this.#flashMs, () => {
					this.flashKeys = new Set();
				});
			}
		}
		this.#emitChanged();
		this.#maybeSchedulePendingPoll();
	}

	#ackApply(
		opIds: Set<number>,
		apply: TableApplyResult,
		hints: Record<string, InsertHint>
	): void {
		if (!this.serverTable) return;
		const merged = applyApplyResult(this.serverTable, apply, hints);
		let pending = this.pending.filter((op) => !opIds.has(op.id));
		for (const [tempId, realId] of merged.idMap) {
			this.#idMap.set(tempId, realId);
			pending = remapPendingRowId(pending, tempId, realId);
		}
		this.serverTable = merged.table;
		this.pending = pending;
		this.lastSavedAt = Date.now();
		this.#emitChanged();
		if (merged.needsRefresh) {
			// Queued (not awaited) so it lands after the write that triggered it.
			void this.refresh();
		}
	}

	#pushReceipt(receipt: TableChangeReceipt | null | undefined): void {
		if (!hasChanges(receipt)) return;
		this.undoStack = [...this.undoStack, receipt].slice(-MAX_UNDO);
	}

	#versionOf(rowId: string): number | null {
		const row = this.serverTable?.rows.find((candidate) => candidate.id === rowId);
		return row ? row.version : null;
	}

	#emitChanged(): void {
		if (this.serverTable) this.#onChanged?.(this.serverTable);
	}

	#maybeSchedulePendingPoll(): void {
		if (this.#disposed) return;
		if (this.aiFill && this.aiFill.status !== 'done' && this.aiFill.status !== 'error') return;
		if (countPendingAiCells(this.serverTable) === 0) {
			this.#pendingPolls = 0;
			this.#clearTimer('pending');
			return;
		}
		if (this.#timers.has('pending') || this.#pendingPolls >= MAX_PENDING_POLLS) return;
		this.#schedule('pending', this.#pendingPollMs, () => {
			this.#pendingPolls += 1;
			if (this.inflight > 0) {
				this.#maybeSchedulePendingPoll();
				return;
			}
			void this.refresh();
		});
	}

	#schedule(name: string, ms: number, fn: () => void): void {
		if (this.#disposed) return;
		this.#clearTimer(name);
		this.#timers.set(
			name,
			setTimeout(() => {
				this.#timers.delete(name);
				if (!this.#disposed) fn();
			}, ms)
		);
	}

	#clearTimer(name: string): void {
		const timer = this.#timers.get(name);
		if (timer) clearTimeout(timer);
		this.#timers.delete(name);
	}
}

export function createTableController(options: TableControllerOptions): TableController {
	return new TableController(options);
}
