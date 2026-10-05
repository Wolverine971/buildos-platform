// packages/shared-agent-ops/src/tables/table-ai-fill.test.ts
import { describe, expect, it } from 'vitest';
import {
	TABLE_AI_FILL_JOB_TYPE,
	TableAiFillError,
	enqueueTableAiFill,
	getTableAiFillStatus,
	isTableAiFillTarget,
	parseTableAiFillJobMetadata,
	selectTableAiFillRows,
	tableAiFillDedupKey,
	type TableAiFillClient,
	type TableAiFillRowCell
} from './table-ai-fill';
import type { TableCellMeta, TableColumn } from './table-types';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-04T12:00:00.000Z');

const question: TableColumn = {
	id: 'c_hm000001',
	name: 'Hiring manager',
	type: 'text',
	ai: { prompt: 'Who is the hiring manager for this role?', research: true }
};
const company: TableColumn = { id: 'c_co000001', name: 'Company', type: 'text' };

const filledMeta = (at: string): TableCellMeta => ({ by: 'ai_column', state: 'filled', at });

describe('isTableAiFillTarget', () => {
	it('asks empty cells and skips cells with a value', () => {
		expect(isTableAiFillTarget({ value: undefined, meta: null }, question)).toBe(true);
		expect(isTableAiFillTarget({ value: '  ', meta: null }, question)).toBe(true);
		expect(isTableAiFillTarget({ value: [], meta: null }, question)).toBe(true);
		expect(isTableAiFillTarget({ value: 'Dana Ruiz', meta: null }, question)).toBe(false);
		expect(isTableAiFillTarget({ value: 0, meta: null }, question)).toBe(false);
		expect(isTableAiFillTarget({ value: false, meta: null }, question)).toBe(false);
	});

	it('treats a "nothing found" answer as answered until the question changes', () => {
		const answered = { value: undefined, meta: filledMeta('2026-10-03T00:00:00.000Z') };
		expect(isTableAiFillTarget(answered, question)).toBe(false);
		const reworded = {
			...question,
			ai: { ...question.ai!, updated_at: '2026-10-04T00:00:00.000Z' }
		};
		expect(isTableAiFillTarget(answered, reworded)).toBe(true);
	});

	it('asks again after errors and dead pending marks', () => {
		const error: TableCellMeta = { by: 'ai_column', state: 'error', error: 'x', at: 'now' };
		const pending: TableCellMeta = { by: 'ai_column', state: 'pending', at: 'now' };
		expect(isTableAiFillTarget({ value: undefined, meta: error }, question)).toBe(true);
		expect(isTableAiFillTarget({ value: undefined, meta: pending }, question)).toBe(true);
	});
});

describe('selectTableAiFillRows', () => {
	const rows: TableAiFillRowCell[] = [
		{ id: 'a', value: undefined, meta: null },
		{ id: 'b', value: 'Filled', meta: null },
		{ id: 'c', value: undefined, meta: null },
		{ id: 'd', value: undefined, meta: filledMeta('2026-10-01T00:00:00Z') }
	];

	it('defaults to rows without an answer, in table order', () => {
		const selection = selectTableAiFillRows(rows, question);
		expect(selection.rows.map((row) => row.id)).toEqual(['a', 'c']);
		expect(selection.skipped_filled).toBe(2);
		expect(selection.remaining).toBe(0);
	});

	it('refills every requested row when onlyEmpty is false', () => {
		const selection = selectTableAiFillRows(rows, question, {
			rowIds: ['d', 'b', 'zzz'],
			onlyEmpty: false
		});
		expect(selection.rows.map((row) => row.id)).toEqual(['b', 'd']);
		expect(selection.unknown_row_ids).toEqual(['zzz']);
	});

	it('caps a run and reports the rest as remaining', () => {
		const many = Array.from({ length: 7 }, (_, index) => ({
			id: `r${index}`,
			value: undefined,
			meta: null
		}));
		const selection = selectTableAiFillRows(many, question, { maxRows: 5 });
		expect(selection.rows).toHaveLength(5);
		expect(selection.remaining).toBe(2);
	});
});

describe('parseTableAiFillJobMetadata', () => {
	it('accepts the enqueued shape and rejects junk', () => {
		const parsed = parseTableAiFillJobMetadata({
			documentId: DOC_ID,
			columnId: 'c_hm000001',
			runId: RUN_ID,
			rowIds: ['a', 7, 'b'],
			userId: USER_ID,
			actorId: null,
			onlyEmpty: true,
			requestedAt: NOW.toISOString(),
			correlationId: 'x'
		});
		expect(parsed).toMatchObject({ rowIds: ['a', 'b'], actorId: null, onlyEmpty: true });
		expect(parseTableAiFillJobMetadata({ documentId: DOC_ID })).toBeNull();
		expect(parseTableAiFillJobMetadata(null)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// A tiny PostgREST stand-in: records every query and RPC, answers from fixtures.
// ---------------------------------------------------------------------------

type Query = { table: string; select?: string; filters: Array<[string, string, unknown]> };
type Fixture = (query: Query) => { data: unknown; error: unknown };

function fakeClient(fixtures: Record<string, Fixture>, rpcs: Record<string, Fixture> = {}) {
	const queries: Query[] = [];
	const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
	const client: TableAiFillClient = {
		from(table: string) {
			const query: Query = { table, filters: [] };
			queries.push(query);
			const resolve = () => (fixtures[table] ?? (() => ({ data: null, error: null })))(query);
			const builder: Record<string, unknown> = {
				select(columns: string) {
					query.select = columns;
					return builder;
				},
				then(
					onFulfilled: (value: unknown) => unknown,
					onRejected?: (e: unknown) => unknown
				) {
					return Promise.resolve(resolve()).then(onFulfilled, onRejected);
				},
				maybeSingle: () => Promise.resolve(resolve())
			};
			for (const op of ['eq', 'is', 'in', 'order', 'range', 'limit']) {
				builder[op] = (column: string, value: unknown) => {
					query.filters.push([op, column, value]);
					return builder;
				};
			}
			return builder;
		},
		rpc(fn: string, args: Record<string, unknown> = {}) {
			rpcCalls.push({ fn, args });
			const fixture = rpcs[fn] ?? (() => ({ data: null, error: null }));
			return Promise.resolve(fixture({ table: fn, filters: [] }));
		}
	};
	return { client, queries, rpcCalls };
}

const tableDoc = (columns: TableColumn[] = [company, question]) => ({
	id: DOC_ID,
	project_id: 'p1',
	type_key: 'document.table',
	props: { table: { format: 1, columns, revision: 3, row_count: 3 } }
});

const rowCells = [
	{ id: 'row-1', value: null, meta: null },
	{ id: 'row-2', value: 'Already known', meta: null },
	{ id: 'row-3', value: null, meta: { by: 'ai_column', state: 'error', error: 'x', at: 't' } }
];

function enqueueFixtures(
	opts: {
		activeJob?: unknown;
		queuedRunId?: string;
		queueError?: unknown;
		doc?: unknown;
	} = {}
) {
	return fakeClient(
		{
			onto_documents: () => ({
				data: opts.doc === undefined ? tableDoc() : opts.doc,
				error: null
			}),
			onto_document_rows: () => ({ data: rowCells, error: null }),
			queue_jobs: (query) => {
				const byId = query.filters.find(([op, column]) => op === 'eq' && column === 'id');
				if (byId) {
					return {
						data: { id: 'queue-row', metadata: { runId: opts.queuedRunId ?? RUN_ID } },
						error: null
					};
				}
				return { data: opts.activeJob ?? null, error: null };
			}
		},
		{
			onto_document_table_apply: () => ({
				data: {
					document_id: DOC_ID,
					revision: 4,
					row_count: 3,
					updated_at: NOW.toISOString(),
					results: [
						{
							op: 'update',
							row_id: 'row-1',
							row_number: 1,
							version: 2,
							before: { cell_meta: { c_hm000001: null } },
							after: null
						},
						{
							op: 'update',
							row_id: 'row-3',
							row_number: 3,
							version: 5,
							before: {
								cell_meta: {
									c_hm000001: { by: 'ai_column', state: 'error', at: 't' }
								}
							},
							after: null
						}
					]
				},
				error: null
			}),
			add_queue_job: () =>
				opts.queueError
					? { data: null, error: opts.queueError }
					: { data: 'queue-row', error: null }
		}
	);
}

const enqueueArgs = {
	documentId: DOC_ID,
	column: 'hiring MANAGER',
	userId: USER_ID,
	actorId: ACTOR_ID
};
const enqueueOptions = { now: () => NOW, createRunId: () => RUN_ID };

describe('enqueueTableAiFill', () => {
	it('marks only empty target cells pending and queues one job', async () => {
		const { client, rpcCalls, queries } = enqueueFixtures();
		const result = await enqueueTableAiFill(client, enqueueArgs, enqueueOptions);

		expect(result).toEqual({
			run_id: RUN_ID,
			row_count: 2,
			column_id: 'c_hm000001',
			column_name: 'Hiring manager',
			research: true,
			remaining: 0,
			skipped_filled: 1
		});
		const rowQuery = queries.find((query) => query.table === 'onto_document_rows')!;
		expect(rowQuery.select).toBe('id, value:cells->c_hm000001, meta:cell_meta->c_hm000001');

		const apply = rpcCalls.find((call) => call.fn === 'onto_document_table_apply')!;
		expect(apply.args).toMatchObject({ p_document_id: DOC_ID, p_actor_id: ACTOR_ID });
		expect(apply.args.p_ops).toEqual([
			{
				op: 'update',
				row_id: 'row-1',
				cell_meta: {
					c_hm000001: {
						by: 'ai_column',
						state: 'pending',
						run_id: RUN_ID,
						at: NOW.toISOString()
					}
				}
			},
			expect.objectContaining({ row_id: 'row-3' })
		]);
		// Pending marks never touch the value.
		expect((apply.args.p_ops as Array<Record<string, unknown>>)[0]).not.toHaveProperty('cells');

		const queue = rpcCalls.find((call) => call.fn === 'add_queue_job')!;
		expect(queue.args).toMatchObject({
			p_user_id: USER_ID,
			p_job_type: TABLE_AI_FILL_JOB_TYPE,
			p_dedup_key: tableAiFillDedupKey(DOC_ID, 'c_hm000001'),
			p_metadata: {
				documentId: DOC_ID,
				columnId: 'c_hm000001',
				runId: RUN_ID,
				rowIds: ['row-1', 'row-3'],
				userId: USER_ID,
				actorId: ACTOR_ID,
				onlyEmpty: true
			}
		});
	});

	it('uses the queue client for queue rows and the caller client for the table', async () => {
		const table = enqueueFixtures();
		const queue = enqueueFixtures();
		await enqueueTableAiFill(table.client, enqueueArgs, {
			...enqueueOptions,
			queueClient: queue.client
		});
		expect(table.rpcCalls.map((call) => call.fn)).toEqual(['onto_document_table_apply']);
		expect(queue.rpcCalls.map((call) => call.fn)).toEqual(['add_queue_job']);
		expect(table.queries.some((query) => query.table === 'queue_jobs')).toBe(false);
	});

	it('refuses while the column is already filling', async () => {
		const { client, rpcCalls } = enqueueFixtures({
			activeJob: { id: 'old', metadata: { runId: 'old-run' } }
		});
		await expect(enqueueTableAiFill(client, enqueueArgs, enqueueOptions)).rejects.toMatchObject(
			{
				code: 'RUN_ACTIVE',
				details: { run_id: 'old-run' }
			}
		);
		expect(rpcCalls).toHaveLength(0);
	});

	it('refuses when every chosen row already has an answer', async () => {
		const { client, rpcCalls } = enqueueFixtures();
		await expect(
			enqueueTableAiFill(client, { ...enqueueArgs, rowIds: ['row-2'] }, enqueueOptions)
		).rejects.toMatchObject({ code: 'NOTHING_TO_FILL' });
		expect(rpcCalls).toHaveLength(0);
	});

	it('refills requested rows that have answers when only_empty is false', async () => {
		const { client, rpcCalls } = enqueueFixtures();
		const result = await enqueueTableAiFill(
			client,
			{ ...enqueueArgs, rowIds: ['row-2'], onlyEmpty: false },
			enqueueOptions
		);
		expect(result.row_count).toBe(1);
		const apply = rpcCalls.find((call) => call.fn === 'onto_document_table_apply')!;
		expect((apply.args.p_ops as Array<{ row_id: string }>).map((op) => op.row_id)).toEqual([
			'row-2'
		]);
	});

	it('rejects columns that are not questions, link columns, and missing columns', async () => {
		const plain = enqueueFixtures({ doc: tableDoc([company]) });
		await expect(
			enqueueTableAiFill(plain.client, { ...enqueueArgs, column: 'Company' }, enqueueOptions)
		).rejects.toMatchObject({ code: 'NOT_A_QUESTION_COLUMN' });
		await expect(
			enqueueTableAiFill(plain.client, { ...enqueueArgs, column: 'Nope' }, enqueueOptions)
		).rejects.toMatchObject({ code: 'COLUMN_NOT_FOUND' });

		const link = enqueueFixtures({
			doc: tableDoc([{ ...question, type: 'link' }])
		});
		await expect(
			enqueueTableAiFill(link.client, enqueueArgs, enqueueOptions)
		).rejects.toMatchObject({ code: 'UNSUPPORTED_COLUMN_TYPE' });
	});

	it('rejects non-tables and missing documents', async () => {
		const notTable = enqueueFixtures({ doc: { ...tableDoc(), type_key: 'document.spec' } });
		await expect(
			enqueueTableAiFill(notTable.client, enqueueArgs, enqueueOptions)
		).rejects.toMatchObject({ code: 'NOT_A_TABLE' });
		const missing = enqueueFixtures({ doc: null });
		await expect(
			enqueueTableAiFill(missing.client, enqueueArgs, enqueueOptions)
		).rejects.toBeInstanceOf(TableAiFillError);
	});

	it('restores provenance when the queue insert fails', async () => {
		const { client, rpcCalls } = enqueueFixtures({ queueError: { message: 'boom' } });
		await expect(enqueueTableAiFill(client, enqueueArgs, enqueueOptions)).rejects.toMatchObject(
			{
				code: 'QUEUE_FAILED'
			}
		);
		const applies = rpcCalls.filter((call) => call.fn === 'onto_document_table_apply');
		expect(applies).toHaveLength(2);
		expect(applies[1]!.args.p_ops).toEqual([
			{ op: 'update', row_id: 'row-1', cell_meta: { c_hm000001: null } },
			{
				op: 'update',
				row_id: 'row-3',
				cell_meta: { c_hm000001: { by: 'ai_column', state: 'error', at: 't' } }
			}
		]);
	});

	it('backs out when a racing Fill took the dedup slot', async () => {
		const { client, rpcCalls } = enqueueFixtures({ queuedRunId: 'other-run' });
		await expect(enqueueTableAiFill(client, enqueueArgs, enqueueOptions)).rejects.toMatchObject(
			{
				code: 'RUN_ACTIVE',
				details: { run_id: 'other-run' }
			}
		);
		expect(rpcCalls.filter((call) => call.fn === 'onto_document_table_apply')).toHaveLength(2);
	});
});

describe('getTableAiFillStatus', () => {
	const jobMetadata = {
		documentId: DOC_ID,
		columnId: 'c_hm000001',
		runId: RUN_ID,
		rowIds: ['a', 'b', 'c', 'd', 'e'],
		userId: USER_ID,
		actorId: null,
		onlyEmpty: true,
		requestedAt: NOW.toISOString()
	};
	const runRows = [
		{ id: 'a', deleted_at: null, meta: { state: 'filled' } },
		{ id: 'b', deleted_at: null, meta: { state: 'error' } },
		{ id: 'c', deleted_at: null, meta: { state: 'pending' } },
		{ id: 'd', deleted_at: '2026-10-04T00:00:00Z', meta: { state: 'pending' } }
	];
	const statusClient = (job: Record<string, unknown> | null) =>
		fakeClient({
			queue_jobs: () => ({ data: job, error: null }),
			onto_document_rows: () => ({ data: runRows, error: null })
		});

	it('counts this run’s cells while it is running', async () => {
		const { client, queries } = statusClient({
			id: 'q',
			status: 'processing',
			metadata: jobMetadata,
			error_message: null
		});
		const status = await getTableAiFillStatus(client, { documentId: DOC_ID, runId: RUN_ID });
		expect(status).toEqual({
			status: 'running',
			filled: 1,
			failed: 1,
			pending: 1,
			skipped: 2,
			total: 5,
			column_id: 'c_hm000001'
		});
		const rowQuery = queries.find((query) => query.table === 'onto_document_rows')!;
		expect(rowQuery.filters).toContainEqual(['eq', 'cell_meta->c_hm000001->>run_id', RUN_ID]);
	});

	it('folds unreached cells into failed once the job is over', async () => {
		const { client } = statusClient({
			id: 'q',
			status: 'failed',
			metadata: jobMetadata,
			error_message: 'Worker timed out'
		});
		const status = await getTableAiFillStatus(client, { documentId: DOC_ID, runId: RUN_ID });
		expect(status).toMatchObject({
			status: 'error',
			filled: 1,
			failed: 2,
			pending: 0,
			error: 'Worker timed out'
		});
	});

	it('reports queued before any cell finished', async () => {
		const { client } = fakeClient({
			queue_jobs: () => ({
				data: { id: 'q', status: 'pending', metadata: jobMetadata },
				error: null
			}),
			onto_document_rows: () => ({ data: [], error: null })
		});
		const status = await getTableAiFillStatus(client, { documentId: DOC_ID, runId: RUN_ID });
		expect(status.status).toBe('queued');
	});

	it('hides runs of other documents', async () => {
		const { client } = statusClient({
			id: 'q',
			status: 'completed',
			metadata: { ...jobMetadata, documentId: 'someone-else' }
		});
		await expect(
			getTableAiFillStatus(client, { documentId: DOC_ID, runId: RUN_ID })
		).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
	});
});
