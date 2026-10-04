// apps/web/src/lib/server/consolidation/consolidation.apply.test.ts
// Apply and Undo against an in-memory database: what reaches Organize, what is
// archived or created, and what Undo puts back, in which order.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];

vi.mock('$lib/services/smart-llm-service', () => ({ SmartLLMService: class {} }));
vi.mock('$lib/server/queue-job-id', () => ({ addQueueJobWithPublicId: vi.fn() }));
vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(async () => undefined),
	toDocumentSnapshot: vi.fn(() => ({}))
}));
vi.mock('$lib/server/organize/organize-service', () => ({
	previewOrApplyOrganize: vi.fn(),
	undoOrganize: vi.fn(),
	OrganizeError: class extends Error {
		constructor(
			message: string,
			readonly status = 409
		) {
			super(message);
		}
	}
}));
vi.mock('$lib/services/ontology/doc-structure.service', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/services/ontology/doc-structure.service')>();
	return {
		...original,
		archiveDocumentInTree: vi.fn(async (_s: unknown, _p: string, id: string) => {
			calls.push(`archive:${id}`);
			const doc = db.onto_documents.find((row) => row.id === id)!;
			doc.state_key = 'archived';
			doc.updated_at = tick();
		}),
		restoreDocumentInTree: vi.fn(
			async (_s: unknown, _p: string, id: string, options: { restoreStateKey: string }) => {
				calls.push(`restore:${id}`);
				const doc = db.onto_documents.find((row) => row.id === id)!;
				doc.state_key = options.restoreStateKey;
				doc.updated_at = tick();
			}
		),
		addDocumentToTree: vi.fn(async () => undefined),
		moveDocument: vi.fn(async () => undefined)
	};
});

import {
	previewOrApplyOrganize,
	undoOrganize,
	OrganizeError
} from '$lib/server/organize/organize-service';
import {
	applyConsolidationRun,
	changeCount,
	undoConsolidationRun,
	withoutHidden,
	type ConsolidationRunView
} from './consolidation.service';

type Row = Record<string, any>;
type Table =
	| 'consolidation_runs'
	| 'consolidation_questions'
	| 'consolidation_merges'
	| 'onto_documents'
	| 'onto_tasks'
	| 'onto_projects'
	| 'onto_organize_batches';
let db: Record<Table, Row[]>;
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 9, 4, 12, 0, clock++)).toISOString();

/** Just enough of the Supabase query builder for the service's calls. */
function fakeClient() {
	return {
		from(table: Table) {
			const filters: Array<(row: Row) => boolean> = [];
			let mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
			let payload: Row | null = null;
			const rows = () => db[table];
			const run = () => {
				if (mode === 'insert') {
					const row = {
						id: `new-${clock}`,
						deleted_at: null,
						state_key: 'draft',
						...payload,
						updated_at: tick()
					};
					rows().push(row);
					return [row];
				}
				if (mode === 'upsert') {
					const existing = rows().find(
						(row) =>
							row.run_id === payload!.run_id &&
							row.cluster_key === payload!.cluster_key
					);
					if (existing) Object.assign(existing, payload);
					else rows().push({ ...payload });
					return [payload];
				}
				const matched = rows().filter((row) => filters.every((test) => test(row)));
				if (mode === 'update') for (const row of matched) Object.assign(row, payload);
				return matched;
			};
			const builder: any = {
				select: () => builder,
				order: () => builder,
				limit: () => builder,
				eq: (column: string, value: unknown) => (
					filters.push((row) => row[column] === value),
					builder
				),
				neq: (column: string, value: unknown) => (
					filters.push((row) => row[column] !== value),
					builder
				),
				in: (column: string, values: unknown[]) => (
					filters.push((row) => values.includes(row[column])),
					builder
				),
				is: (column: string, value: unknown) => (
					filters.push((row) => (row[column] ?? null) === value),
					builder
				),
				like: (column: string, pattern: string) => (
					filters.push((row) =>
						String(row[column]).startsWith(pattern.replace(/%$/, ''))
					),
					builder
				),
				update: (patch: Row) => ((mode = 'update'), (payload = patch), builder),
				insert: (row: Row) => ((mode = 'insert'), (payload = row), builder),
				upsert: (row: Row) => ((mode = 'upsert'), (payload = row), builder),
				maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
				single: async () => ({ data: run()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
					Promise.resolve({ data: run(), error: null }).then(resolve, reject)
			};
			return builder;
		}
	};
}

const USER = 'user-1';
const RUN = '00000000-0000-4000-8000-000000000001';
const [WAYNE, BEYOND] = ['p-wayne', 'p-beyond'];

function doc(id: string, project_id = WAYNE, extra: Row = {}): Row {
	return {
		id,
		project_id,
		title: id.toUpperCase(),
		updated_at: '2026-10-01T00:00:00.000Z',
		state_key: 'draft',
		deleted_at: null,
		...extra
	};
}

function seed(clusters: Row[], extra: { merges?: Row[]; docs?: Row[] } = {}) {
	db = {
		consolidation_runs: [
			{
				id: RUN,
				user_id: USER,
				root_project_id: WAYNE,
				project_ids: [WAYNE, BEYOND],
				status: 'review',
				progress: {},
				plan: {
					version: 1,
					clusters: clusters.map((cluster, index) => ({
						key: `c${index + 1}`,
						kind: 'misfiled',
						title: `Group ${index + 1}`,
						reason: null,
						document_ids: [],
						question_id: null,
						vetoed: false,
						...cluster
					})),
					documents: {},
					projects: {
						[WAYNE]: { name: 'Wayne', parent: true },
						[BEYOND]: { name: 'Beyond', parent: false }
					}
				},
				receipt: null,
				cost_usd: 0,
				error: null,
				created_at: '2026-10-04T00:00:00.000Z',
				updated_at: '2026-10-04T00:00:00.000Z',
				finished_at: null
			}
		],
		consolidation_questions: [],
		consolidation_merges: extra.merges ?? [],
		onto_documents: extra.docs ?? [],
		onto_tasks: [],
		onto_projects: [WAYNE, BEYOND].map((id) => ({
			id,
			doc_structure: { version: 3, root: [] }
		})),
		onto_organize_batches: []
	};
}

const client = () => fakeClient() as never;
const params = (extra: Row = {}) => ({
	session: client(),
	admin: client(),
	userId: USER,
	actorId: 'actor-1',
	runId: RUN,
	...extra
});
const runRow = () => db.consolidation_runs[0]!;
const preview = vi.mocked(previewOrApplyOrganize);
const organizeUndo = vi.mocked(undoOrganize);
const TOKEN = 'a'.repeat(32);
const impact = (extra: Row = {}) => ({
	source_project_id: WAYNE,
	destination_project_id: BEYOND,
	blockers: [],
	relationships_to_detach: 0,
	task_links_to_clear: 0,
	assignees_to_remove: 0,
	finished_proposals_to_remove: 0,
	...extra
});

beforeEach(() => {
	calls.length = 0;
	preview.mockReset();
	organizeUndo.mockReset();
});

describe('applyConsolidationRun', () => {
	it('sets a blocked move aside and applies the rest', async () => {
		seed([{ ops: [{ op: 'move', document_ids: ['a', 'b'], target_project_id: BEYOND }] }], {
			docs: [doc('a'), doc('b')]
		});
		preview.mockImplementation(async ({ request, apply }: any) => {
			if (apply) {
				calls.push(`organize:${request.moves.map((move: Row) => move.id).join(',')}`);
				return { status: 'applied' };
			}
			const blocked = request.moves.some((move: Row) => move.id === 'b');
			// Organize still hands out a token for a blocked batch.
			return {
				confirmation_token: TOKEN,
				impact: [impact({ blockers: blocked ? ['calendar_sync_not_deployed'] : [] })]
			};
		});
		const result = await applyConsolidationRun(params());
		expect(calls).toEqual(['organize:a']);
		expect('receipt' in result && result.receipt.moved.map((item) => item.id)).toEqual(['a']);
		expect('receipt' in result && result.receipt.failures[0]).toMatchObject({
			id: 'b',
			message: expect.stringContaining('scheduled tasks')
		});
		expect(runRow().status).toBe('applied');
	});

	it('asks before moves that unlink things, and changes nothing until told', async () => {
		seed([{ ops: [{ op: 'move', document_ids: ['a'], target_project_id: BEYOND }] }], {
			docs: [doc('a')]
		});
		preview.mockImplementation(async ({ apply }: any) =>
			apply
				? (calls.push('organize'), { status: 'applied' })
				: {
						confirmation_token: TOKEN,
						impact: [impact({ relationships_to_detach: 2 })]
					}
		);
		const first = await applyConsolidationRun(params());
		expect(first).toEqual({ confirm: ['2 relationships unlinked'] });
		expect(calls).toEqual([]);
		expect(runRow().status).toBe('review');
		const second = await applyConsolidationRun(params({ acceptSideEffects: true }));
		expect('receipt' in second).toBe(true);
		expect(calls).toEqual(['organize']);
	});

	it('refuses a merge whose source changed after its draft, and archives nothing', async () => {
		seed(
			[
				{
					ops: [
						{
							op: 'merge',
							document_ids: ['a', 'b'],
							target_project_id: WAYNE,
							title: 'AB'
						}
					]
				}
			],
			{
				docs: [doc('a'), doc('b', WAYNE, { updated_at: '2026-10-03T00:00:00.000Z' })],
				merges: [
					{
						run_id: RUN,
						cluster_key: 'c1',
						status: 'ready',
						title: 'AB',
						target_project_id: WAYNE,
						source_ids: ['a', 'b'],
						markdown: '# AB',
						ledger: {
							facts: [],
							fates: [],
							sections: [],
							flags: [],
							unverified: [],
							source_versions: {
								a: '2026-10-01T00:00:00.000Z',
								b: '2026-10-01T00:00:00.000Z'
							},
							written_for: '[]'
						},
						coverage: null,
						error: null,
						created_document_id: null,
						updated_at: '2026-10-04T00:00:00.000Z'
					}
				]
			}
		);
		const result = await applyConsolidationRun(params());
		expect(calls).toEqual([]);
		expect('receipt' in result && result.receipt.created).toEqual([]);
		expect(db.consolidation_merges[0]).toMatchObject({ status: 'failed' });
		expect(db.onto_documents.every((row) => row.state_key === 'draft')).toBe(true);
	});

	it('holds a draft written before the latest answer to its cards', async () => {
		seed(
			[
				{
					ops: [
						{
							op: 'merge',
							document_ids: ['a', 'b'],
							target_project_id: WAYNE,
							title: 'AB'
						}
					]
				}
			],
			{
				docs: [doc('a'), doc('b')],
				merges: [
					{
						run_id: RUN,
						cluster_key: 'c1',
						status: 'ready',
						title: 'AB',
						target_project_id: WAYNE,
						source_ids: ['a', 'b'],
						markdown: '# AB',
						ledger: {
							facts: [],
							fates: [],
							sections: [],
							flags: [],
							unverified: [],
							source_versions: {
								a: '2026-10-01T00:00:00.000Z',
								b: '2026-10-01T00:00:00.000Z'
							},
							// Written before any card was answered.
							written_for: '[]'
						},
						coverage: null,
						error: null,
						created_document_id: null,
						updated_at: '2026-10-04T00:00:00.000Z'
					}
				]
			}
		);
		// Merge cards only ever keep; their real effect is the fact edits.
		const CARD_DOC = '00000000-0000-4000-8000-0000000000bb';
		db.consolidation_questions.push({
			id: '00000000-0000-4000-8000-0000000000aa',
			run_id: RUN,
			piece: 'merge:c1:1',
			header: 'Which date?',
			question: 'The sources disagree on the date.',
			evidence: [],
			options: [
				{
					id: 'o1',
					label: 'Keep both',
					description: '',
					ops: [{ op: 'keep', document_ids: [CARD_DOC] }]
				},
				{
					id: 'later',
					label: 'Decide later',
					description: '',
					ops: [{ op: 'keep', document_ids: [CARD_DOC] }]
				}
			],
			recommended_option_id: 'o1',
			skip_option_id: 'later',
			priority: 40,
			status: 'answered',
			answer: { via: 'option', option_id: 'o1' },
			answered_at: '2026-10-04T00:00:01.000Z',
			draft: null,
			created_at: '2026-10-04T00:00:00.000Z',
			updated_at: '2026-10-04T00:00:01.000Z'
		});
		const result = await applyConsolidationRun(params());
		expect(calls).toEqual([]);
		expect('receipt' in result && result.receipt.created).toEqual([]);
		expect('receipt' in result && result.receipt.unanswered).toEqual(['c1']);
	});

	it('never archives both copies of a pair in favor of each other', async () => {
		seed(
			[
				{ ops: [{ op: 'archive', document_ids: ['a'], replaced_by_id: 'b' }] },
				{ ops: [{ op: 'archive', document_ids: ['b'], replaced_by_id: 'a' }] }
			],
			{ docs: [doc('a'), doc('b')] }
		);
		const result = await applyConsolidationRun(params());
		expect(calls).toEqual([]);
		expect('receipt' in result && result.receipt.failures.map((item) => item.id)).toEqual([
			'a',
			'b'
		]);
	});

	it('leaves a doc moved out of the run’s projects where it is', async () => {
		seed([{ ops: [{ op: 'archive', document_ids: ['a'], replaced_by_id: null }] }], {
			docs: [doc('a', 'p-elsewhere')]
		});
		const result = await applyConsolidationRun(params());
		expect(calls).toEqual([]);
		expect('receipt' in result && result.receipt.failures[0]?.message).toMatch(/Moved out/);
	});
});

describe('undoConsolidationRun', () => {
	function appliedRun(receipt: Row) {
		seed([]);
		Object.assign(runRow(), {
			status: 'applied',
			receipt: {
				applied_at: '2026-10-04T00:00:00.000Z',
				organize_batch_id: 'batch-1',
				moved: [{ id: 'm', title: 'Moved', from_project_id: WAYNE, to_project_id: BEYOND }],
				archived: [],
				created: [],
				failures: [],
				unanswered: [],
				...receipt
			}
		});
	}

	it('puts archives back first, then merged docs, then the moves', async () => {
		appliedRun({
			archived: [
				{
					id: 's',
					title: 'Source',
					project_id: WAYNE,
					previous_state: 'draft',
					replaced_by_id: 'new'
				}
			],
			created: [{ id: 'new', title: 'Merged', project_id: BEYOND, cluster_key: 'c1' }]
		});
		db.onto_documents.push(
			doc('s', WAYNE, { state_key: 'archived' }),
			doc('new', BEYOND),
			doc('m', BEYOND)
		);
		organizeUndo.mockImplementation(async ({ confirmationToken }) => {
			calls.push(confirmationToken ? 'organize-undo' : 'organize-preview');
			return confirmationToken
				? { status: 'applied', skipped: [] }
				: { confirmation_token: TOKEN, skipped: [] };
		});
		const receipt = await undoConsolidationRun(params());
		expect(calls).toEqual(['restore:s', 'archive:new', 'organize-preview', 'organize-undo']);
		expect(runRow().status).toBe('undone');
		expect(receipt.undo?.left).toEqual([]);
	});

	it('lists what Organize could not put back instead of claiming it', async () => {
		appliedRun({});
		organizeUndo.mockImplementation(async ({ confirmationToken }) =>
			confirmationToken
				? {
						status: 'applied',
						skipped: [
							{
								id: 'm',
								kind: 'document',
								reason: 'The document was moved or reordered after this batch.'
							}
						]
					}
				: { confirmation_token: TOKEN, skipped: [] }
		);
		const receipt = await undoConsolidationRun(params());
		expect(receipt.undo?.left).toEqual([
			'Moved: The document was moved or reordered after this batch.'
		]);
	});

	it('counts a doc restored by hand as back, and a batch that never landed as nothing to undo', async () => {
		appliedRun({
			archived: [
				{
					id: 's',
					title: 'Source',
					project_id: WAYNE,
					previous_state: 'draft',
					replaced_by_id: null
				}
			]
		});
		db.onto_documents.push(doc('s'));
		organizeUndo.mockRejectedValue(new OrganizeError('Organize batch not found.', 404));
		const receipt = await undoConsolidationRun(params());
		expect(calls).toEqual([]);
		expect(receipt.undo?.restored).toEqual(['s']);
		expect(runRow().status).toBe('undone');
	});
});

describe('view helpers', () => {
	it('counts docs and tasks, not operations', () => {
		expect(
			changeCount([
				{ op: 'move', document_ids: ['a', 'b', 'c'], target_project_id: BEYOND },
				{ op: 'move_tasks', task_ids: ['t1', 't2'], target_project_id: BEYOND },
				{ op: 'keep', document_ids: ['d'] }
			])
		).toBe(5);
	});

	it('hides what the run copied from a project the owner can no longer see', () => {
		seed([]);
		const plan = {
			...runRow().plan,
			documents: {
				a: { title: 'Secret', project_id: BEYOND },
				b: { title: 'Open', project_id: WAYNE }
			}
		};
		const view = {
			run: { ...runRow(), plan },
			questions: [
				{
					evidence: [
						{ document_id: 'a', source: 'Secret', quote: 'hidden words' },
						{ document_id: 'b', source: 'Open', quote: 'fine' }
					]
				}
			],
			merges: [
				{ target_project_id: WAYNE, source_ids: ['a', 'b'], ledger: {}, markdown: 'x' }
			],
			ready_count: 0,
			waiting: []
		} as unknown as ConsolidationRunView;
		const hidden = withoutHidden(view, new Set([WAYNE]));
		expect(hidden.run.plan?.documents.a?.title).toBe('A doc you can no longer see');
		expect(hidden.questions[0]!.evidence.map((item) => item.quote)).toEqual(['fine']);
		expect(hidden.merges[0]).toMatchObject({ ledger: null, markdown: null });
	});
});
