// apps/worker/src/workers/tables/tableAiFillWorker.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { TableColumn, TableRow, TableRowOp } from '@buildos/shared-agent-ops/tables';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));

import { PermanentQueueError } from '../../lib/queueErrors';
import {
	TABLE_AI_FILL_OPERATION,
	TABLE_AI_FILL_SEARCH_OPERATION,
	type TableAiFillDeps,
	type TableAiFillStore,
	type TableAiFillTable,
	TableAiFillWriteError,
	processTableAiFillJob
} from './tableAiFillWorker';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = 'run-1';
const AT = '2026-10-04T12:00:00.000Z';

const company: TableColumn = { id: 'c_company1', name: 'Company', type: 'text' };
const fit: TableColumn = {
	id: 'c_fit00001',
	name: 'Fit',
	type: 'number',
	ai: { prompt: 'Rate fit 1-5', research: false }
};
const manager: TableColumn = {
	id: 'c_manager1',
	name: 'Hiring manager',
	type: 'text',
	ai: { prompt: 'Who is the hiring manager?', research: true }
};

const pending = { by: 'ai_column' as const, state: 'pending' as const, run_id: RUN_ID, at: AT };

function makeRow(n: number, cells: TableRow['cells'], meta: TableRow['cell_meta']): TableRow {
	return {
		id: `row-${n}`,
		row_number: n,
		position: n * 1024,
		cells,
		cell_meta: meta,
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: AT,
		updated_at: AT
	};
}

/** In-memory onto_document_table_apply: merge cells, replace touched provenance, version checks. */
function memoryStore(
	columns: TableColumn[],
	rows: TableRow[],
	opts: { beforeApply?: (ops: TableRowOp[], call: number) => void } = {}
) {
	const state = new Map(rows.map((row) => [row.id, structuredClone(row)]));
	const applies: TableRowOp[][] = [];
	const table: TableAiFillTable = {
		document: {
			id: DOC_ID,
			project_id: 'project-1',
			title: 'Job applications',
			description: null
		},
		schema: { columns }
	};
	const store: TableAiFillStore = {
		loadTable: vi.fn().mockResolvedValue(table),
		loadRows: vi.fn((_doc: string, ids: string[]) =>
			Promise.resolve(
				ids.flatMap((id) => (state.has(id) ? [structuredClone(state.get(id)!)] : []))
			)
		),
		apply: vi.fn(
			(_doc: string, ops: TableRowOp[]) =>
				new Promise<void>((resolve) => {
					opts.beforeApply?.(ops, applies.length);
					const next = new Map([...state].map(([id, row]) => [id, structuredClone(row)]));
					for (const op of ops) {
						if (op.op !== 'update') throw new Error('unexpected op');
						const row = next.get(op.row_id);
						if (!row)
							throw new TableAiFillWriteError(
								'ROW_NOT_FOUND',
								`ROW_NOT_FOUND: ${op.row_id}`
							);
						if (
							op.expected_version !== undefined &&
							op.expected_version !== row.version
						) {
							throw new TableAiFillWriteError(
								'ROW_CONFLICT',
								`ROW_CONFLICT: ${op.row_id}`
							);
						}
						for (const [key, value] of Object.entries(op.cells ?? {})) {
							if (value === null) delete row.cells[key];
							else row.cells[key] = value;
							delete row.cell_meta[key];
						}
						for (const [key, meta] of Object.entries(op.cell_meta ?? {})) {
							if (meta === null) delete row.cell_meta[key];
							else row.cell_meta[key] = meta;
						}
						row.version += 1;
					}
					applies.push(ops);
					for (const [id, row] of next) state.set(id, row);
					resolve();
				})
		)
	};
	return { store, state, applies };
}

function job(data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	return {
		id: 'job-1',
		userId: USER_ID,
		data,
		attempts: 0,
		maxAttempts: 3,
		signal: new AbortController().signal,
		log: vi.fn().mockResolvedValue(undefined),
		updateProgress: vi.fn().mockResolvedValue(undefined),
		...extra
	} as never;
}

const jobData = (rowIds: string[], columnId = fit.id) => ({
	documentId: DOC_ID,
	columnId,
	runId: RUN_ID,
	rowIds,
	userId: USER_ID,
	actorId: ACTOR_ID,
	onlyEmpty: true,
	requestedAt: AT
});

function deps(overrides: Partial<TableAiFillDeps> = {}): Partial<TableAiFillDeps> {
	return {
		now: () => new Date(AT),
		minWriteIntervalMs: 0,
		sleep: () => Promise.resolve(),
		usage: { logUsageToDatabase: vi.fn().mockResolvedValue(undefined) },
		search: null,
		...overrides
	};
}

const llmReturning = (...answers: unknown[]) => {
	const getJSONResponse = vi.fn();
	for (const answer of answers) {
		if (answer instanceof Error) getJSONResponse.mockRejectedValueOnce(answer);
		else getJSONResponse.mockResolvedValueOnce(answer);
	}
	return { getJSONResponse };
};

describe('processTableAiFillJob', () => {
	it('answers each pending cell and writes it with provenance', async () => {
		const { store, state } = memoryStore(
			[company, fit],
			[
				makeRow(1, { c_company1: 'Stripe' }, { c_fit00001: pending }),
				makeRow(2, { c_company1: 'Ramp' }, { c_fit00001: pending }),
				// Edited by a person after enqueue: provenance cleared, so the run leaves it.
				makeRow(3, { c_company1: 'Notion', c_fit00001: 2 }, {})
			]
		);
		const llm = llmReturning(
			{ value: 4, note: 'Strong overlap.', confidence: 'medium', source_urls: [] },
			{ value: '5', note: 'Exact match.', confidence: 'high' }
		);
		const result = await processTableAiFillJob(
			job(jobData(['row-1', 'row-2', 'row-3'])),
			deps({ store, llm, concurrency: 1 })
		);

		expect(result).toMatchObject({ filled: 2, failed: 0, skipped: 1, total: 3 });
		expect(state.get('row-1')!.cells.c_fit00001).toBe(4);
		expect(state.get('row-1')!.cell_meta.c_fit00001).toEqual({
			by: 'ai_column',
			state: 'filled',
			run_id: RUN_ID,
			note: 'Strong overlap.',
			confidence: 'medium',
			at: AT
		});
		expect(state.get('row-2')!.cells.c_fit00001).toBe(5);
		expect(state.get('row-3')!.cells.c_fit00001).toBe(2);

		const call = llm.getJSONResponse.mock.calls[0]![0];
		expect(call).toMatchObject({
			profile: 'fast',
			userId: USER_ID,
			operationType: TABLE_AI_FILL_OPERATION,
			projectId: 'project-1',
			metadata: { documentId: DOC_ID, columnId: fit.id, runId: RUN_ID, rowId: 'row-1' }
		});
		expect(call.models).toBeUndefined();
		expect(call.userPrompt).toContain('- Company: Stripe');
		expect(llm.getJSONResponse).toHaveBeenCalledTimes(2);
		expect(store.apply).toHaveBeenCalledWith(DOC_ID, expect.any(Array), ACTOR_ID);
	});

	it('researches with the shared web search and logs the paid search', async () => {
		const { store, state } = memoryStore(
			[company, manager],
			[makeRow(1, { c_company1: 'Stripe' }, { c_manager1: pending })]
		);
		const search = {
			search: vi.fn().mockResolvedValue({
				results: [
					{
						title: 'Stripe FDE team',
						url: 'https://stripe.com/team',
						snippet: 'Dana Ruiz leads'
					}
				],
				info: {
					billing: {
						provider: 'tavily',
						credits: 2,
						unit_cost_usd: 0.008,
						cost_usd: 0.016,
						source: 'provider_reported'
					}
				}
			})
		};
		const usage = { logUsageToDatabase: vi.fn().mockResolvedValue(undefined) };
		const llm = llmReturning({
			value: 'Dana Ruiz',
			note: 'Team page names her.',
			source_urls: ['https://stripe.com/team', 'https://made-up.example'],
			confidence: 'high'
		});
		const result = await processTableAiFillJob(
			job(jobData(['row-1'], manager.id)),
			deps({ store, llm, search, usage })
		);

		expect(result).toMatchObject({ filled: 1, failed: 0 });
		expect(search.search).toHaveBeenCalledWith(
			{
				query: 'Who is the hiring manager? — Stripe',
				search_depth: 'advanced',
				max_results: 5
			},
			expect.anything()
		);
		expect(llm.getJSONResponse.mock.calls[0]![0].userPrompt).toContain(
			'[1] Stripe FDE team — https://stripe.com/team'
		);
		expect(state.get('row-1')!.cell_meta.c_manager1).toMatchObject({
			state: 'filled',
			source_urls: ['https://stripe.com/team']
		});
		expect(usage.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				operationType: TABLE_AI_FILL_SEARCH_OPERATION,
				provider: 'tavily',
				totalCost: 0.016,
				userId: USER_ID,
				projectId: 'project-1'
			})
		);
	});

	it('does not log a search served from cache', async () => {
		const { store } = memoryStore(
			[company, manager],
			[makeRow(1, { c_company1: 'Stripe' }, { c_manager1: pending })]
		);
		const usage = { logUsageToDatabase: vi.fn().mockResolvedValue(undefined) };
		await processTableAiFillJob(
			job(jobData(['row-1'], manager.id)),
			deps({
				store,
				usage,
				llm: llmReturning({ value: null, note: 'Not listed anywhere.' }),
				search: {
					search: vi
						.fn()
						.mockResolvedValue({ results: [], info: { cache_status: 'hit' } })
				}
			})
		);
		expect(usage.logUsageToDatabase).not.toHaveBeenCalled();
	});

	it('records "nothing found" as an answer, and never erases an existing value', async () => {
		const { store, state } = memoryStore(
			[company, fit],
			[
				makeRow(1, {}, { c_fit00001: pending }),
				makeRow(2, { c_fit00001: 3 }, { c_fit00001: pending }),
				makeRow(3, { c_fit00001: 1 }, { c_fit00001: pending })
			]
		);
		const llm = llmReturning(
			{ value: null, note: 'No resume notes in the row.' },
			{ value: null },
			{ value: 'great', note: 'Feels right.' }
		);
		const result = await processTableAiFillJob(
			job(jobData(['row-1', 'row-2', 'row-3'])),
			deps({ store, llm, concurrency: 1 })
		);

		expect(result).toMatchObject({ filled: 1, failed: 2 });
		expect(state.get('row-1')!.cells.c_fit00001).toBeUndefined();
		expect(state.get('row-1')!.cell_meta.c_fit00001).toMatchObject({
			state: 'filled',
			note: 'No resume notes in the row.'
		});
		expect(state.get('row-2')!.cells.c_fit00001).toBe(3);
		expect(state.get('row-2')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: 'No answer found, so the existing value was kept.'
		});
		expect(state.get('row-3')!.cells.c_fit00001).toBe(1);
		expect(state.get('row-3')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: expect.stringMatching(/^Couldn't use the answer: .*great.* is not a number$/),
			note: 'Feels right.'
		});
	});

	it('writes model failures and stops after five in a row', async () => {
		const rows = Array.from({ length: 8 }, (_, index) =>
			makeRow(index + 1, {}, { c_fit00001: pending })
		);
		const { store, state } = memoryStore([company, fit], rows);
		const llm = { getJSONResponse: vi.fn().mockRejectedValue(new Error('429 upstream')) };
		const result = await processTableAiFillJob(
			job(jobData(rows.map((row) => row.id))),
			deps({ store, llm, concurrency: 1 })
		);

		expect(llm.getJSONResponse).toHaveBeenCalledTimes(5);
		expect(result).toMatchObject({ filled: 0, failed: 8 });
		expect(result.stopped).toContain('Stopped after 5 rows failed in a row');
		expect(state.get('row-1')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: "The AI couldn't answer this row. Try again later."
		});
		expect(state.get('row-8')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: expect.stringContaining('Stopped after 5 rows')
		});
	});

	it('fails every cell clearly when web research is not configured', async () => {
		const { store, state } = memoryStore(
			[company, manager],
			[makeRow(1, { c_company1: 'Stripe' }, { c_manager1: pending })]
		);
		const llm = llmReturning();
		const result = await processTableAiFillJob(
			job(jobData(['row-1'], manager.id)),
			deps({ store, llm, search: null })
		);
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			failed: 1,
			stopped: "Web research isn't set up on this server."
		});
		expect(state.get('row-1')!.cell_meta.c_manager1).toMatchObject({ state: 'error' });
	});

	it('fails the cells when the column lost its question', async () => {
		const { store, state } = memoryStore(
			[company, { ...fit, ai: null }],
			[makeRow(1, {}, { c_fit00001: pending })]
		);
		const result = await processTableAiFillJob(
			job(jobData(['row-1'])),
			deps({ store, llm: llmReturning() })
		);
		expect(result.stopped).toBe('This column no longer has a question.');
		expect(state.get('row-1')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: 'This column no longer has a question.'
		});
	});

	it('groups answers that finish during a write, and handles edits made mid-run', async () => {
		let edited = false;
		const { store, state } = memoryStore(
			[company, fit],
			[
				makeRow(1, {}, { c_fit00001: pending }),
				makeRow(2, {}, { c_fit00001: pending }),
				makeRow(3, {}, { c_fit00001: pending })
			],
			{
				beforeApply: (_ops, call) => {
					if (call !== 1 || edited) return;
					edited = true;
					// A person types into row-2's Fit cell (clearing its AI mark) and edits
					// row-3's Company, so both rows' versions move on.
					const two = state.get('row-2')!;
					two.cells.c_fit00001 = 1;
					delete two.cell_meta.c_fit00001;
					two.version += 1;
					const three = state.get('row-3')!;
					three.cells.c_company1 = 'Edited';
					three.version += 1;
				}
			}
		);
		const llm = llmReturning({ value: 3 }, { value: 4 }, { value: 5 });
		// Hold the first write until rows 2 and 3 have answers, so they go out as one batch.
		const gate = { open: false };
		const slowStore: TableAiFillStore = {
			...store,
			apply: async (...args) => {
				while (!gate.open) await new Promise((resolve) => setTimeout(resolve, 1));
				return store.apply(...args);
			}
		};
		const run = processTableAiFillJob(
			job(jobData(['row-1', 'row-2', 'row-3'])),
			deps({ store: slowStore, llm, concurrency: 3 })
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		gate.open = true;
		const result = await run;

		const batchSizes = vi.mocked(store.apply).mock.calls.map(([, ops]) => ops.length);
		expect(batchSizes.slice(0, 2)).toEqual([1, 2]);
		expect(result).toMatchObject({ filled: 2, skipped: 1, failed: 0 });
		expect(state.get('row-1')!.cells.c_fit00001).toBe(3);
		expect(state.get('row-3')!.cells).toEqual({ c_company1: 'Edited', c_fit00001: 5 });
		// The person's value stands.
		expect(state.get('row-2')!.cells.c_fit00001).toBe(1);
		expect(state.get('row-2')!.cell_meta.c_fit00001).toBeUndefined();
	});

	it('rejects malformed metadata permanently', async () => {
		await expect(
			processTableAiFillJob(job({ documentId: DOC_ID }), deps())
		).rejects.toBeInstanceOf(PermanentQueueError);
	});

	it('marks still-pending cells failed when the last attempt dies', async () => {
		const { store, state } = memoryStore(
			[company, fit],
			[makeRow(1, {}, { c_fit00001: pending }), makeRow(2, {}, { c_fit00001: pending })]
		);
		let calls = 0;
		const flaky: TableAiFillStore = {
			...store,
			apply: (...args) => {
				calls += 1;
				if (calls === 1) return Promise.reject(new Error('connection reset'));
				return store.apply(...args);
			}
		};
		await expect(
			processTableAiFillJob(
				job(jobData(['row-1', 'row-2']), { attempts: 2, maxAttempts: 3 }),
				deps({
					store: flaky,
					llm: llmReturning({ value: 4 }, { value: 5 }),
					concurrency: 1
				})
			)
		).rejects.toThrow('connection reset');
		expect(state.get('row-1')!.cell_meta.c_fit00001).toMatchObject({
			state: 'error',
			error: 'Fill stopped: connection reset'
		});
	});

	it('leaves cells pending for the retry when an earlier attempt dies', async () => {
		const { store, state } = memoryStore(
			[company, fit],
			[makeRow(1, {}, { c_fit00001: pending })]
		);
		const failing: TableAiFillStore = {
			...store,
			apply: () => Promise.reject(new Error('connection reset'))
		};
		await expect(
			processTableAiFillJob(
				job(jobData(['row-1'])),
				deps({ store: failing, llm: llmReturning({ value: 4 }) })
			)
		).rejects.toThrow('connection reset');
		expect(state.get('row-1')!.cell_meta.c_fit00001).toEqual(pending);
	});

	it('stops without writing once the job is aborted', async () => {
		const { store, applies } = memoryStore(
			[company, fit],
			[makeRow(1, {}, { c_fit00001: pending })]
		);
		const controller = new AbortController();
		const llm = {
			getJSONResponse: vi.fn(() => {
				controller.abort(new Error('timeout'));
				return Promise.reject(new Error('cancelled'));
			})
		};
		await expect(
			processTableAiFillJob(
				job(jobData(['row-1']), { signal: controller.signal }),
				deps({ store, llm })
			)
		).rejects.toThrow('aborted');
		expect(applies).toHaveLength(0);
	});
});
