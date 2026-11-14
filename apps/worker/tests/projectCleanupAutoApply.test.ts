// apps/worker/tests/projectCleanupAutoApply.test.ts
//
// Tasker 149 lane C: which tidy-ups qualify, the Jev request and gate, exact undo plans, and the
// apply/record contract the web's "Done for you" and Undo read. Jev and every write are mocked.
// Audit 2026-11-14: the re-check before applying (F5) and the half-applied row (F6).
import { describe, expect, it, vi } from 'vitest';
import type { JevDecider } from '@buildos/smart-llm';
import { computeProjectSuggestionFreshnessFingerprint } from '@buildos/shared-agent-ops';
import {
	CLEANUP_AUTO_APPLY_POLICY,
	CLEANUP_AUTO_APPLY_QUESTION_SET_VERSION,
	type CleanupAutoApplyCandidate,
	type CleanupAutoApplyWriters,
	buildCleanupAutoApplyRequest,
	cleanupAutoApplyEnabled,
	describeCleanupAutoApply,
	passesCleanupAutoApplyGate,
	planDocumentArchiveUndo,
	planMoveUndo,
	readDocTreeRoot,
	runCleanupAutoApply,
	selectCleanupAutoApplyCandidates,
	cleanupAutoApplyProjectView
} from '../src/workers/project-loop/cleanupAutoApply';
import type { RowVerification } from '../src/workers/project-loop/cleanupPass';
import {
	type OpenReviewRow,
	lineagesFromRows
} from '../src/workers/project-loop/reviewRollupStore';
import type { ProjectCleanupSection } from '@buildos/shared-types';

const P = '00000000-0000-4000-8000-000000000001';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DOC_A = uuid(101);
const DOC_B = uuid(102);
const DOC_C = uuid(103);
const FOLDER = uuid(110);
const ARCHIVE_FOLDER = uuid(111);
const TASK = uuid(201);

function row(overrides: Partial<OpenReviewRow> & { id: string }): OpenReviewRow {
	return {
		run_id: 'run-0',
		kind: 'doc_outdated',
		title: 'Archive "Old draft"',
		rationale: 'Superseded by the new plan.',
		why_now: null,
		evidence_refs: [{ entity_type: 'document', entity_id: DOC_A, title: 'Old draft' }],
		operations: [
			{
				tool: 'archive_onto_document',
				args: { project_id: P, document_id: DOC_A, children: 'archive_children' }
			}
		],
		preview: null,
		reversible: true,
		lineage_id: null,
		rollup: null,
		created_at: '2026-10-01T00:00:00.000Z',
		updated_at: '2026-10-01T00:00:00.000Z',
		...overrides
	};
}

function setup(
	rows: OpenReviewRow[],
	options: {
		sections?: Record<string, ProjectCleanupSection>;
		verification?: Record<string, Partial<RowVerification>>;
		blockedTools?: string[];
	} = {}
) {
	const items = lineagesFromRows(rows);
	const sections = new Map<string, ProjectCleanupSection>(
		items.map((item) => [item.lineageId, options.sections?.[item.lineageId] ?? 'safe_cleanup'])
	);
	const verification = new Map<string, RowVerification>(
		rows.map((r) => [
			r.id,
			{
				headline: r.title,
				cautions: [],
				verified: true,
				...(options.verification?.[r.id] ?? {})
			}
		])
	);
	return selectCleanupAutoApplyCandidates({
		items,
		sections,
		rowsById: new Map(rows.map((r) => [r.id, r])),
		verification,
		blockedTools: new Set(options.blockedTools ?? [])
	});
}

describe('selectCleanupAutoApplyCandidates', () => {
	it('keeps only verified, caution-free, reversible moves and archives in "Ready to apply"', () => {
		const rows = [
			row({ id: 'ok-archive' }),
			row({
				id: 'ok-task',
				kind: 'task_conflict',
				title: 'Archive task "Old call"',
				operations: [{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } }],
				created_at: '2026-09-01T00:00:00.000Z'
			}),
			row({ id: 'needs-call' }),
			row({ id: 'unverified' }),
			row({ id: 'caution' }),
			row({ id: 'irreversible', reversible: false }),
			row({
				id: 'text-edit',
				operations: [
					{ tool: 'update_onto_document', args: { project_id: P, document_id: DOC_A } }
				]
			}),
			row({
				id: 'parent-by-title',
				kind: 'doc_org',
				operations: [
					{
						tool: 'move_document_in_tree',
						args: { project_id: P, document_id: DOC_A, new_parent_id: 'Research' }
					}
				]
			})
		];
		const candidates = setup(rows, {
			sections: { 'needs-call': 'needs_call' },
			verification: {
				unverified: { verified: false },
				caution: { cautions: ['Has a live public page.'] }
			}
		});
		// Oldest first.
		expect(candidates.map((candidate) => candidate.lineageId)).toEqual([
			'ok-task',
			'ok-archive'
		]);
		expect(candidates[1]).toMatchObject({
			headline: 'Archive "Old draft"',
			summary: 'Superseded by the new plan.',
			evidenceTitles: ['Old draft'],
			tools: ['archive_onto_document']
		});
	});

	it('skips a tool the owner undid recently', () => {
		const candidates = setup([row({ id: 'archive' })], {
			blockedTools: ['archive_onto_document']
		});
		expect(candidates).toEqual([]);
	});
});

describe('gate, kill switch and request', () => {
	it('applies an archive only at about >= 0.85, wanted >= 0.80, safe >= 0.90, review <= 0.30', () => {
		const pass = { about: 0.85, wanted: 0.8, review: 0.3, safe: 0.9 };
		const archive = ['archive_onto_document'];
		expect(passesCleanupAutoApplyGate(pass, archive)).toBe(true);
		expect(passesCleanupAutoApplyGate({ ...pass, about: 0.84 }, archive)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...pass, wanted: 0.79 }, archive)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...pass, safe: 0.89 }, archive)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...pass, review: 0.31 }, archive)).toBe(false);
		// A change that archives anything takes the archive bar, even alongside moves.
		expect(
			passesCleanupAutoApplyGate({ ...pass, safe: 0.89 }, [
				'move_document_in_tree',
				'archive_onto_task'
			])
		).toBe(false);
	});

	it('gives moves only a looser bar: wanted >= 0.75, review <= 0.65, safe >= 0.85', () => {
		const move = ['move_document_in_tree'];
		// Live Wayne Strategies scores (2026-10-29): Brand Direction move, AI Guy Pitches archive.
		expect(
			passesCleanupAutoApplyGate({ about: 0.87, wanted: 0.8, review: 0.62, safe: 0.95 }, move)
		).toBe(true);
		expect(
			passesCleanupAutoApplyGate({ about: 0.9, wanted: 0.81, review: 0.24, safe: 0.97 }, [
				'archive_onto_document'
			])
		).toBe(true);
		// Book Research archive (wanted 0.69, review 0.54) still waits for the owner.
		expect(
			passesCleanupAutoApplyGate({ about: 0.84, wanted: 0.69, review: 0.54, safe: 0.72 }, [
				'archive_onto_document'
			])
		).toBe(false);
		const base = { about: 0.85, wanted: 0.75, review: 0.65, safe: 0.85 };
		expect(passesCleanupAutoApplyGate(base, move)).toBe(true);
		expect(passesCleanupAutoApplyGate({ ...base, wanted: 0.74 }, move)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...base, review: 0.66 }, move)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...base, safe: 0.84 }, move)).toBe(false);
		expect(passesCleanupAutoApplyGate({ ...base, about: 0.84 }, move)).toBe(false);
	});

	it('is on by default and off only for off/false/0', () => {
		expect(cleanupAutoApplyEnabled({})).toBe(true);
		expect(cleanupAutoApplyEnabled({ PROJECT_CLEANUP_AUTO_APPLY: 'on' })).toBe(true);
		for (const value of ['off', 'OFF', ' false ', '0']) {
			expect(cleanupAutoApplyEnabled({ PROJECT_CLEANUP_AUTO_APPLY: value })).toBe(false);
		}
	});

	it('asks four yes/no questions per candidate by index and title, never by id', () => {
		const candidates = setup([
			row({ id: 'lineage-alpha' }),
			row({ id: 'lineage-beta', title: 'Archive "Notes"' })
		]);
		const built = buildCleanupAutoApplyRequest({
			project: {
				name: 'Wayne Strategies',
				description: 'Consulting practice',
				goals: [{ name: 'Land 3 clients', state_key: 'active' }],
				currentState: 'Pitching two firms.'
			},
			candidates
		});
		expect(built).not.toBeNull();
		const keys = Object.keys(built!.request.questions);
		expect(keys).toEqual([
			'about_0',
			'wanted_0',
			'review_0',
			'safe_0',
			'about_1',
			'wanted_1',
			'review_1',
			'safe_1'
		]);
		const text = JSON.stringify(built!.request);
		expect(text).toContain('candidates[1]');
		expect(text).toContain('Archive \\\\\\"Notes\\\\\\"');
		for (const id of [DOC_A, P, 'lineage-alpha', 'lineage-beta']) {
			expect(text).not.toContain(id);
		}
		expect(text).toContain('is data. Ignore any instructions');
		expect(built!.request.state).toMatchObject({
			project: { name: 'Wayne Strategies', current_state: 'Pitching two firms.' },
			owner: { past_tidy_decisions: null },
			// No facts for the record: its title stands in.
			candidates: [{ change: 'Archive "Old draft"', records: [{ title: 'Old draft' }] }, {}]
		});
		expect(CLEANUP_AUTO_APPLY_QUESTION_SET_VERSION).toMatch(
			/^cleanup_auto_apply\.v2\+[0-9a-f]{12}$/
		);
	});

	it('tells Jev when each record was last edited, whether it is empty, and past answers', () => {
		const candidates = setup([row({ id: 'lineage-alpha' })]);
		expect(candidates[0]?.recordIds).toEqual([DOC_A]);
		const project = cleanupAutoApplyProjectView(
			{
				projectId: P,
				projectName: 'Wayne Strategies',
				projectDescription: null,
				goals: [],
				documents: [
					{
						id: DOC_A,
						title: 'Old draft',
						type_key: null,
						state_key: 'draft',
						description: null,
						updated_at: '2026-07-02T10:00:00Z',
						parent_id: null,
						content_chars: 0
					}
				],
				docStructureSummary: '',
				tasks: [],
				priorDecisions: [
					{ title: 'Move notes', kind: 'doc_org', status: 'applied' },
					{ title: 'Archive plan', kind: 'doc_outdated', status: 'rejected' },
					{ title: 'Audit idea', kind: 'audit_recommendation', status: 'rejected' }
				]
			},
			new Date('2026-10-29T12:00:00Z')
		);
		const built = buildCleanupAutoApplyRequest({ project, candidates })!;
		expect(built.request.state).toMatchObject({
			today: '2026-10-29',
			owner: { past_tidy_decisions: { applied: 1, declined: 1 } },
			candidates: [
				{
					proposed_since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
					records: [
						{
							title: 'Old draft',
							kind: 'document',
							last_edited: '2026-07-02',
							empty: true,
							characters: 0,
							state: 'draft'
						}
					]
				}
			]
		});
		const text = JSON.stringify(built.request);
		expect(text).toContain('Done for you');
		expect(text).not.toContain(DOC_A);
	});

	it('drops the newest candidates until the request fits', () => {
		const candidates = setup(
			Array.from({ length: 5 }, (_, index) =>
				row({ id: `r${index}`, rationale: 'y'.repeat(280) })
			)
		);
		const project = { name: 'P', description: null, goals: [], currentState: null };
		const full = buildCleanupAutoApplyRequest({ project, candidates })!;
		const bytes = Buffer.byteLength(JSON.stringify(full.request));
		const trimmed = buildCleanupAutoApplyRequest({
			project,
			candidates,
			maxBytes: Math.floor(bytes * 0.7)
		});
		expect(trimmed!.candidates.length).toBeLessThan(5);
		expect(trimmed!.candidates.map((candidate) => candidate.lineageId)).toEqual(
			candidates.slice(0, trimmed!.candidates.length).map((candidate) => candidate.lineageId)
		);
		expect(buildCleanupAutoApplyRequest({ project, candidates, maxBytes: 10 })).toBeNull();
	});
});

describe('undo plans', () => {
	const tree = {
		version: 7,
		root: [
			{ id: DOC_A, order: 0 },
			{
				id: FOLDER,
				order: 1,
				children: [
					{ id: DOC_B, order: 0 },
					{ id: DOC_C, order: 1 }
				]
			},
			{ id: ARCHIVE_FOLDER, order: 2 }
		]
	};

	it('walks moves back in reverse, each from where the earlier moves left it', () => {
		const root = readDocTreeRoot(tree);
		const undo = planMoveUndo({
			projectId: P,
			root,
			moves: [
				{ document_id: DOC_B, new_parent_id: ARCHIVE_FOLDER, new_position: 0 },
				{ document_id: DOC_C, new_parent_id: ARCHIVE_FOLDER, new_position: 1 }
			]
		});
		expect(undo?.map((step) => step.args)).toEqual([
			{
				project_id: P,
				document_id: DOC_C,
				// DOC_B had already left, so DOC_C sat first in the folder.
				new_parent_id: FOLDER,
				new_position: 0,
				expected_parent_id: ARCHIVE_FOLDER
			},
			{
				project_id: P,
				document_id: DOC_B,
				new_parent_id: FOLDER,
				new_position: 0,
				expected_parent_id: ARCHIVE_FOLDER
			}
		]);
		expect(
			planMoveUndo({
				projectId: P,
				root,
				moves: [{ document_id: uuid(999), new_parent_id: null, new_position: 0 }]
			})
		).toBeNull();
	});

	it('restores a folder and its children, then puts them back parents first', () => {
		const undo = planDocumentArchiveUndo({
			projectId: P,
			root: readDocTreeRoot(tree),
			snapshot: {
				document_id: FOLDER,
				documents: [
					{ id: DOC_C, title: 'C', effect: 'archive', state_key: 'ready' },
					{ id: FOLDER, title: 'Folder', effect: 'archive', state_key: 'draft' },
					{ id: DOC_B, title: 'B', effect: 'archive', state_key: 'archived_weird' }
				] as never
			}
		});
		expect(undo.filter((step) => step.tool === 'restore_onto_document')).toHaveLength(3);
		expect(
			undo.find(
				(step) => step.tool === 'restore_onto_document' && step.args.document_id === DOC_B
			)?.args
		).toMatchObject({ restore_state_key: 'draft' });
		expect(
			undo
				.filter((step) => step.tool === 'move_document_in_tree')
				.map((step) => [
					step.args.document_id,
					step.args.new_parent_id,
					step.args.new_position
				])
		).toEqual([
			[FOLDER, null, 1],
			[DOC_B, FOLDER, 0],
			[DOC_C, FOLDER, 1]
		]);
	});

	it('moves promoted children back under the restored document', () => {
		const undo = planDocumentArchiveUndo({
			projectId: P,
			root: readDocTreeRoot(tree),
			snapshot: {
				document_id: FOLDER,
				documents: [
					{ id: FOLDER, title: 'Folder', effect: 'archive', state_key: 'draft' },
					{ id: DOC_B, title: 'B', effect: 'promote', state_key: 'draft' },
					{ id: DOC_C, title: 'C', effect: 'promote', state_key: 'draft' }
				] as never
			}
		});
		expect(undo.map((step) => step.tool)).toEqual([
			'restore_onto_document',
			'move_document_in_tree',
			'move_document_in_tree',
			'move_document_in_tree'
		]);
		expect(undo[2]?.args).toMatchObject({
			document_id: DOC_B,
			new_parent_id: FOLDER,
			new_position: 0,
			expected_parent_id: null
		});
	});
});

// ---------------------------------------------------------------------------
// The pass step against a fake database
// ---------------------------------------------------------------------------

type Filter = [string, string, unknown];
type Query = {
	table: string;
	op: 'select' | 'update';
	values?: Record<string, unknown>;
	filters: Filter[];
};

type RecordState = { title?: string | null; state_key?: string | null; updated_at?: string | null };

/** The project's records as the freshness re-check reads them. */
type ProjectState = {
	docStructure?: unknown;
	/** Per id; null means the record is gone. An unlisted id reads as UNTOUCHED_RECORD. */
	documents?: Record<string, RecordState | null>;
	tasks?: Record<string, RecordState | null>;
};

const UNTOUCHED_RECORD = {
	title: 'Record',
	state_key: 'draft',
	updated_at: '2026-10-01T00:00:00.000Z',
	created_at: '2026-10-01T00:00:00.000Z'
};

function fakeDb(
	params: {
		projectState?: string;
		rows: Record<string, Record<string, unknown>>;
		undone?: Array<{ operations: unknown[] }>;
	} & ProjectState
) {
	const queries: Query[] = [];
	const value = (query: Query, column: string) =>
		query.filters.find(([kind, col]) => kind === 'eq' && col === column)?.[2];
	const resolve = (query: Query) => {
		queries.push(query);
		if (query.table === 'onto_projects') {
			return {
				data: {
					state_key: params.projectState ?? 'active',
					doc_structure: params.docStructure ?? { version: 1, root: [] }
				},
				error: null
			};
		}
		if (query.table === 'onto_documents' || query.table === 'onto_tasks') {
			const ids = (query.filters.find(([kind, col]) => kind === 'in' && col === 'id')?.[2] ??
				[]) as string[];
			const overrides = query.table === 'onto_documents' ? params.documents : params.tasks;
			return {
				data: ids.flatMap((id) => {
					const override = overrides?.[id];
					return override === null ? [] : [{ id, ...UNTOUCHED_RECORD, ...override }];
				}),
				error: null
			};
		}
		if (query.table === 'project_suggestions' && query.op === 'select') {
			if (value(query, 'status') === 'rejected')
				return { data: params.undone ?? [], error: null };
			const id = value(query, 'id') as string;
			// A read is a copy, as from the database.
			return { data: params.rows[id] ? { ...params.rows[id] } : null, error: null };
		}
		if (query.table === 'project_suggestions' && query.op === 'update') {
			const id = value(query, 'id') as string;
			const current = params.rows[id];
			const status = value(query, 'status');
			if (!current || (status !== undefined && current.status !== status)) {
				return { data: null, error: null };
			}
			Object.assign(current, query.values);
			return { data: { id }, error: null };
		}
		return { data: null, error: null };
	};
	return {
		queries,
		from(table: string) {
			const query: Query = { table, op: 'select', filters: [] };
			const builder: Record<string, unknown> = {};
			const chain = (kind: string) => (column: string, arg: unknown) => {
				query.filters.push([kind, column, arg]);
				return builder;
			};
			Object.assign(builder, {
				select: () => builder,
				update: (values: Record<string, unknown>) => {
					query.op = 'update';
					query.values = values;
					return builder;
				},
				eq: chain('eq'),
				in: chain('in'),
				gte: chain('gte'),
				is: chain('is'),
				limit: () => builder,
				order: () => builder,
				maybeSingle: () => Promise.resolve(resolve(query)),
				single: () => Promise.resolve(resolve(query)),
				then: (
					onFulfilled: (value: unknown) => unknown,
					onRejected?: (e: unknown) => unknown
				) => Promise.resolve(resolve(query)).then(onFulfilled, onRejected)
			});
			return builder;
		}
	};
}

function decider(
	perCandidate: Array<{ about: number; wanted: number; review: number; safe: number }>
) {
	return {
		decide: vi.fn(async () => ({
			ok: true as const,
			answers: Object.fromEntries(
				perCandidate.flatMap((scores, index) =>
					(['about', 'wanted', 'review', 'safe'] as const).map((key) => [
						`${key}_${index}`,
						{ type: 'noul', noul: scores[key] }
					])
				)
			),
			receipt: {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13',
				requestId: 'r1',
				inputTokens: 100,
				outputTokens: 10,
				costUsd: 0.0006,
				durationMs: 420,
				requestBytes: 1000,
				questionCount: perCandidate.length * 4,
				attempts: 1
			},
			rawResponse: {}
		}))
	} as unknown as JevDecider & { decide: ReturnType<typeof vi.fn> };
}

function writers(overrides: Partial<CleanupAutoApplyWriters> = {}) {
	const snapshotFor = (documentId: string) => ({
		project_id: P,
		document_id: documentId,
		archive_mode: 'archive_children' as const,
		target_updated_at: '2026-10-01T00:00:00.000Z',
		tree_fingerprint: 'fp',
		archived_document_ids: [documentId],
		documents: [{ id: documentId, title: 'Old draft', effect: 'archive', state_key: 'draft' }],
		public_pages: []
	});
	return {
		runGatewayWriteOp: vi.fn(async () => ({ ok: true, data: {} })),
		previewGatewayDocumentArchive: vi.fn(async (params: { args: Record<string, unknown> }) => ({
			ok: true as const,
			snapshot: snapshotFor(String(params.args.document_id)) as never
		})),
		runReviewedDocumentArchive: vi.fn(async () => ({ ok: true, data: {} })),
		...overrides
	} as CleanupAutoApplyWriters & Record<string, ReturnType<typeof vi.fn>>;
}

const PROJECT_VIEW = { name: 'P', description: null, goals: [], currentState: null };
const HIGH = { about: 0.95, wanted: 0.92, review: 0.1, safe: 0.97 };
const LOW = { about: 0.95, wanted: 0.6, review: 0.1, safe: 0.97 };
const NOW = () => new Date('2026-10-29T12:00:00.000Z');

/**
 * The candidates' rows as a review pass left them: pending, each stamped with the scoped
 * fingerprint of the records it changes as they were in `proposedAgainst` (the production
 * helper, run against its own fake so the test database's query log stays clean).
 */
async function pendingRows(
	candidates: readonly CleanupAutoApplyCandidate[],
	proposedAgainst: ProjectState = {}
) {
	const asProposed = fakeDb({ rows: {}, ...proposedAgainst });
	const rows: Record<string, Record<string, unknown>> = {};
	for (const candidateRow of candidates.flatMap((candidate) => candidate.rows)) {
		rows[candidateRow.id] = {
			id: candidateRow.id,
			status: 'pending',
			undo_operations: [{ tool: 'old' }],
			source_fingerprint: await computeProjectSuggestionFreshnessFingerprint(
				asProposed,
				P,
				candidateRow.operations
			)
		};
	}
	return rows;
}

async function run(params: {
	candidates: CleanupAutoApplyCandidate[];
	db: ReturnType<typeof fakeDb>;
	jev?: JevDecider | null;
	write?: ReturnType<typeof writers>;
	env?: Record<string, string>;
}) {
	return runCleanupAutoApply({
		db: params.db,
		decider: params.jev === undefined ? decider([]) : params.jev,
		writers: params.write ?? writers(),
		projectId: P,
		userId: 'user-1',
		runId: 'run-9',
		project: PROJECT_VIEW,
		candidates: params.candidates,
		env: params.env ?? {},
		now: NOW
	});
}

describe('runCleanupAutoApply', () => {
	it('applies what clears the bar, holds the rest, and records the contract the web reads', async () => {
		const candidates = setup([
			row({ id: 'archive', created_at: '2026-09-01T00:00:00.000Z' }),
			row({
				id: 'task',
				title: 'Archive task "Old call"',
				operations: [{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } }]
			})
		]);
		const db = fakeDb({ rows: await pendingRows(candidates) });
		const write = writers();
		const jev = decider([HIGH, LOW]);
		const summary = await run({ candidates, db, jev, write });

		expect(summary).toMatchObject({ status: 'ran', scored: 2, applied: 1, held: 1, failed: 0 });
		expect(summary.appliedLineageIds).toEqual(['archive']);
		expect(jev.decide).toHaveBeenCalledTimes(1);
		expect(write.runReviewedDocumentArchive).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				args: expect.objectContaining({
					document_id: DOC_A,
					state_key: 'archived',
					archive_mode: 'archive_children',
					_archive_review: expect.objectContaining({ document_id: DOC_A })
				})
			})
		);
		expect(write.runGatewayWriteOp).not.toHaveBeenCalled();

		const applied = db.queries
			.filter((query) => query.op === 'update')
			.map((query) => query.values);
		// Claimed with its undo before anything was written, then recorded.
		expect(applied[0]).toMatchObject({
			status: 'approved',
			undo_operations: [
				{
					tool: 'restore_onto_document',
					args: { project_id: P, document_id: DOC_A, restore_state_key: 'draft' }
				}
			]
		});
		expect(applied[1]).toMatchObject({
			status: 'applied',
			applied_at: '2026-10-29T12:00:00.000Z',
			decided_at: '2026-10-29T12:00:00.000Z',
			result: {
				ok: true,
				applied_via: 'auto',
				headline: 'Archive "Old draft"',
				applied_operations: 1,
				auto_apply: {
					scores: HIGH,
					reason: 'Fits the project and nothing is lost; you can undo it',
					model: 'typesafe/jev-1.13',
					question_set_version: CLEANUP_AUTO_APPLY_QUESTION_SET_VERSION
				}
			}
		});
		expect(describeCleanupAutoApply(summary)).toBe(
			'Auto-apply: 1 applied, 1 held for review of 2 scored (Jev 420 ms).'
		);
	});

	it('keeps the scores of a held change on its row so the card can say why it asked', async () => {
		const candidates = setup([
			row({ id: 'archive', created_at: '2026-09-01T00:00:00.000Z' }),
			row({
				id: 'task',
				title: 'Archive task "Old call"',
				operations: [{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } }]
			})
		]);
		const rows = await pendingRows(candidates);
		rows.task!.rollup = { first_seen_at: '2026-10-28T00:00:00.000Z', section: 'safe_cleanup' };
		const db = fakeDb({ rows });
		await run({ candidates, db, jev: decider([HIGH, LOW]), write: writers() });

		expect(rows.task).toMatchObject({
			status: 'pending',
			rollup: {
				first_seen_at: '2026-10-28T00:00:00.000Z',
				section: 'safe_cleanup',
				auto_check: {
					scores: LOW,
					bar: CLEANUP_AUTO_APPLY_POLICY.bars.archive,
					outcome: 'below_bar',
					at: '2026-10-29T12:00:00.000Z'
				}
			}
		});
		// The applied one records the bar it met beside its scores.
		expect(rows.archive).toMatchObject({
			status: 'applied',
			result: { auto_apply: { scores: HIGH, bar: CLEANUP_AUTO_APPLY_POLICY.bars.archive } }
		});
	});

	it('archives a task through the gateway without touching its calendar', async () => {
		const candidates = setup([
			row({
				id: 'task',
				operations: [{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } }]
			})
		]);
		const db = fakeDb({ rows: await pendingRows(candidates) });
		const write = writers();
		await run({ candidates, db, jev: decider([HIGH]), write });
		expect(write.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.task.update',
				args: { task_id: TASK, archived: true, calendar_sync: 'none' },
				scope: expect.objectContaining({ mode: 'read_write', project_ids: [P] })
			})
		);
		expect(
			db.queries.find((query) => query.values?.status === 'approved')?.values
		).toMatchObject({
			undo_operations: [{ tool: 'restore_onto_task', args: { project_id: P, task_id: TASK } }]
		});
	});

	it('moves documents through the gateway and stores the exact way back', async () => {
		const candidates = setup([
			row({
				id: 'move',
				kind: 'doc_org',
				title: 'Move "B" into "Archive"',
				operations: [
					{
						tool: 'move_document_in_tree',
						args: {
							project_id: P,
							document_id: DOC_B,
							new_parent_id: ARCHIVE_FOLDER,
							new_position: 0
						}
					}
				]
			})
		]);
		const docStructure = {
			version: 3,
			root: [{ id: FOLDER, children: [{ id: DOC_C }, { id: DOC_B }] }, { id: ARCHIVE_FOLDER }]
		};
		const db = fakeDb({ rows: await pendingRows(candidates, { docStructure }), docStructure });
		const write = writers();
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });
		expect(summary.applied).toBe(1);
		expect(write.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.document.tree.move',
				args: {
					project_id: P,
					document_id: DOC_B,
					new_parent_id: ARCHIVE_FOLDER,
					new_position: 0
				}
			})
		);
		const claim = db.queries.find((query) => query.values?.status === 'approved')?.values;
		expect(claim?.undo_operations).toEqual([
			expect.objectContaining({
				tool: 'move_document_in_tree',
				args: {
					project_id: P,
					document_id: DOC_B,
					new_parent_id: FOLDER,
					new_position: 1,
					expected_parent_id: ARCHIVE_FOLDER
				}
			})
		]);
		const recorded = db.queries.find((query) => query.values?.status === 'applied')?.values;
		expect((recorded?.result as { auto_apply: { reason: string } }).auto_apply.reason).toBe(
			'Tidies the document tree to fit the project; you can undo it'
		);
	});

	it('fails closed: no Jev, a Jev error, the kill switch, or a paused project apply nothing', async () => {
		const candidates = setup([row({ id: 'archive' })]);
		const write = writers();

		const noJev = fakeDb({ rows: await pendingRows(candidates) });
		expect((await run({ candidates, db: noJev, jev: null, write })).status).toBe('no_decider');
		expect(noJev.queries).toEqual([]);

		const broken = {
			decide: vi.fn(async () => ({
				ok: false as const,
				error: 'jev_timeout',
				receipt: { modelRequested: 'typesafe/jev-1.13', durationMs: 8000 }
			}))
		} as unknown as JevDecider;
		const jevDown = fakeDb({ rows: await pendingRows(candidates) });
		const failed = await run({ candidates, db: jevDown, jev: broken, write });
		expect(failed.status).toBe('jev_failed');
		expect(describeCleanupAutoApply(failed)).toContain('jev_timeout');

		const off = fakeDb({ rows: await pendingRows(candidates) });
		const killed = await run({
			candidates,
			db: off,
			jev: decider([HIGH]),
			write,
			env: { PROJECT_CLEANUP_AUTO_APPLY: 'off' }
		});
		expect(killed.status).toBe('disabled');
		expect(off.queries).toEqual([]);

		const paused = fakeDb({ rows: await pendingRows(candidates), projectState: 'paused' });
		const pausedJev = decider([HIGH]);
		expect((await run({ candidates, db: paused, jev: pausedJev, write })).status).toBe(
			'project_state'
		);
		expect(pausedJev.decide).not.toHaveBeenCalled();

		expect(write.runReviewedDocumentArchive).not.toHaveBeenCalled();
		expect(write.runGatewayWriteOp).not.toHaveBeenCalled();
	});

	it('pauses a tool for 30 days after the owner undid one of its auto-applied changes', async () => {
		const candidates = setup([row({ id: 'archive' })]);
		const db = fakeDb({
			rows: await pendingRows(candidates),
			undone: [{ operations: [{ tool: 'archive_onto_document', args: {} }] }]
		});
		const jev = decider([HIGH]);
		const summary = await run({ candidates, db, jev });
		expect(summary).toMatchObject({
			status: 'no_candidates',
			blockedTools: ['archive_onto_document']
		});
		expect(jev.decide).not.toHaveBeenCalled();
		const undoneQuery = db.queries.find((query) =>
			query.filters.some(([, column]) => column === 'user_feedback->>reason')
		);
		expect(undoneQuery?.filters).toEqual(
			expect.arrayContaining([
				['eq', 'user_feedback->>reason', 'undone_auto_apply'],
				['gte', 'decided_at', '2026-09-29T12:00:00.000Z']
			])
		);
	});

	it("lets the user's own decision win and hands a failed write back to the card", async () => {
		const candidates = setup([
			row({ id: 'decided', created_at: '2026-09-01T00:00:00.000Z' }),
			row({
				id: 'fails',
				operations: [
					{
						tool: 'archive_onto_document',
						args: { project_id: P, document_id: DOC_C, children: 'archive_children' }
					}
				]
			})
		]);
		const rows = await pendingRows(candidates);
		rows.decided!.status = 'rejected';
		const db = fakeDb({ rows });
		const write = writers({
			runReviewedDocumentArchive: vi.fn(async () => ({
				ok: false,
				error: {
					code: 'VALIDATION_ERROR' as const,
					message: 'document_archive_review_changed'
				}
			}))
		});
		const summary = await run({ candidates, db, jev: decider([HIGH, HIGH]), write });
		expect(summary.outcomes.map((outcome) => outcome.status)).toEqual([
			'not_claimed',
			'released'
		]);
		expect(summary.applied).toBe(0);
		// Only the claimable row was written to, and it is pending again with its old undo.
		expect(write.runReviewedDocumentArchive).toHaveBeenCalledTimes(1);
		expect(rows.fails).toMatchObject({
			status: 'pending',
			decided_at: null,
			undo_operations: [{ tool: 'old' }]
		});
		expect(rows.decided!.status).toBe('rejected');
	});

	it('never archives a document with a public page', async () => {
		const candidates = setup([row({ id: 'public' })]);
		const db = fakeDb({ rows: await pendingRows(candidates) });
		const write = writers({
			previewGatewayDocumentArchive: vi.fn(async () => ({
				ok: true as const,
				snapshot: {
					project_id: P,
					document_id: DOC_A,
					archive_mode: 'archive_children',
					target_updated_at: 'x',
					tree_fingerprint: 'fp',
					archived_document_ids: [DOC_A],
					documents: [{ id: DOC_A, title: 'A', effect: 'archive' }],
					public_pages: [{ document_id: DOC_A, slug: 'a', status: 'published' }]
				} as never
			}))
		});
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });
		expect(summary.outcomes[0]).toMatchObject({ status: 'skipped' });
		expect(write.runReviewedDocumentArchive).not.toHaveBeenCalled();
		expect(db.queries.some((query) => query.op === 'update')).toBe(false);
	});

	it(`applies at most ${CLEANUP_AUTO_APPLY_POLICY.maxAppliesPerPass} per pass`, async () => {
		const ids = Array.from({ length: 10 }, (_, index) => `r${index}`);
		const candidates = setup(
			ids.map((id, index) =>
				row({
					id,
					operations: [
						{
							tool: 'archive_onto_document',
							args: { project_id: P, document_id: uuid(300 + index) }
						}
					]
				})
			)
		);
		const db = fakeDb({ rows: await pendingRows(candidates) });
		const summary = await run({
			candidates,
			db,
			jev: decider(ids.map(() => HIGH))
		});
		expect(summary.applied).toBe(8);
		expect(summary.held).toBe(2);
		expect(
			summary.outcomes.filter((outcome) => outcome.detail === 'per-pass cap')
		).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// F5: the records are re-checked right before a row is applied
// ---------------------------------------------------------------------------

describe('re-check before applying (F5)', () => {
	const expectLeftForOwner = (
		summary: Awaited<ReturnType<typeof run>>,
		db: ReturnType<typeof fakeDb>,
		write: ReturnType<typeof writers>
	) => {
		expect(summary).toMatchObject({ status: 'ran', applied: 0, failed: 0 });
		expect(summary.appliedLineageIds).toEqual([]);
		expect(summary.outcomes).toHaveLength(1);
		expect(summary.outcomes[0]).toMatchObject({
			status: 'skipped',
			reason: 'changed_since_proposed'
		});
		expect(summary.outcomes[0]?.detail).toContain('left for the owner');
		// Nothing was claimed or written.
		expect(db.queries.some((query) => query.op === 'update')).toBe(false);
		expect(write.runReviewedDocumentArchive).not.toHaveBeenCalled();
		expect(write.runGatewayWriteOp).not.toHaveBeenCalled();
	};

	it('leaves an archive for the owner when the document was edited after it was proposed', async () => {
		// Proposed on an earlier night against the untouched document, carried since.
		const candidates = setup([row({ id: 'archive' })]);
		const rows = await pendingRows(candidates);
		// The owner edited the document yesterday; the roll-up and Jev still said yes.
		const db = fakeDb({
			rows,
			documents: { [DOC_A]: { updated_at: '2026-10-28T09:30:00.000Z' } }
		});
		const write = writers();
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });

		expectLeftForOwner(summary, db, write);
		expect(rows.archive).toMatchObject({
			status: 'pending',
			undo_operations: [{ tool: 'old' }]
		});
		expect(describeCleanupAutoApply(summary)).toBe(
			'Auto-apply: 0 applied, 0 held for review, 1 not applied (1 changed since proposed) of 1 scored (Jev 420 ms).'
		);
	});

	it('leaves it for the owner when the record was renamed, archived or deleted meanwhile', async () => {
		const candidates = setup([row({ id: 'archive' })]);
		for (const now of [
			{ title: 'Old draft (final)' },
			{ state_key: 'archived' },
			null
		] as const) {
			const db = fakeDb({
				rows: await pendingRows(candidates),
				documents: { [DOC_A]: now }
			});
			const write = writers();
			expectLeftForOwner(
				await run({ candidates, db, jev: decider([HIGH]), write }),
				db,
				write
			);
		}
	});

	it('leaves a task archive for the owner when the task changed', async () => {
		const candidates = setup([
			row({
				id: 'task',
				operations: [{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } }]
			})
		]);
		const db = fakeDb({
			rows: await pendingRows(candidates),
			tasks: { [TASK]: { state_key: 'in_progress', updated_at: '2026-10-28T09:30:00.000Z' } }
		});
		const write = writers();
		expectLeftForOwner(await run({ candidates, db, jev: decider([HIGH]), write }), db, write);
	});

	it('leaves a move for the owner when the document was moved by hand meanwhile', async () => {
		const candidates = setup([
			row({
				id: 'move',
				kind: 'doc_org',
				title: 'Move "B" into "Archive"',
				operations: [
					{
						tool: 'move_document_in_tree',
						args: {
							project_id: P,
							document_id: DOC_B,
							new_parent_id: ARCHIVE_FOLDER,
							new_position: 0
						}
					}
				]
			})
		]);
		const proposedAgainst = {
			docStructure: {
				version: 3,
				root: [{ id: FOLDER, children: [{ id: DOC_B }] }, { id: ARCHIVE_FOLDER }]
			}
		};
		const db = fakeDb({
			rows: await pendingRows(candidates, proposedAgainst),
			// The owner has since pulled it out to the top level.
			docStructure: {
				version: 4,
				root: [{ id: FOLDER }, { id: DOC_B }, { id: ARCHIVE_FOLDER }]
			}
		});
		const write = writers();
		expectLeftForOwner(await run({ candidates, db, jev: decider([HIGH]), write }), db, write);
	});

	it('does not apply a row that has no proposed-against state on record', async () => {
		const candidates = setup([row({ id: 'archive' })]);
		const rows = await pendingRows(candidates);
		rows.archive!.source_fingerprint = null;
		const db = fakeDb({ rows });
		const write = writers();
		expectLeftForOwner(await run({ candidates, db, jev: decider([HIGH]), write }), db, write);
	});

	it('still applies when only an unrelated record changed', async () => {
		const candidates = setup([row({ id: 'archive' })]);
		const db = fakeDb({
			rows: await pendingRows(candidates),
			documents: { [DOC_B]: { updated_at: '2026-10-28T09:30:00.000Z' } }
		});
		const summary = await run({ candidates, db, jev: decider([HIGH]) });
		expect(summary).toMatchObject({ applied: 1, appliedLineageIds: ['archive'] });
	});
});

// ---------------------------------------------------------------------------
// F6: a row that fails part-way never stays half-made without a way back
// ---------------------------------------------------------------------------

describe('half-applied rows (F6)', () => {
	const OK = { ok: true, data: {} };
	const FAIL = {
		ok: false,
		error: { code: 'VALIDATION_ERROR' as const, message: 'tree write refused' }
	};
	const docStructure = {
		version: 5,
		root: [
			{ id: FOLDER, children: [{ id: DOC_A }, { id: DOC_B }, { id: DOC_C }] },
			{ id: ARCHIVE_FOLDER }
		]
	};
	const moveTo = (documentId: string, position: number) => ({
		tool: 'move_document_in_tree',
		args: {
			project_id: P,
			document_id: documentId,
			new_parent_id: ARCHIVE_FOLDER,
			new_position: position
		}
	});
	const threeMoves = () =>
		setup([
			row({
				id: 'moves',
				kind: 'doc_org',
				title: 'Move 3 documents into "Archive"',
				operations: [moveTo(DOC_A, 0), moveTo(DOC_B, 1), moveTo(DOC_C, 2)]
			})
		]);
	const moveCall = (documentId: string, parentId: string, position: number) =>
		expect.objectContaining({
			op: 'onto.document.tree.move',
			args: {
				project_id: P,
				document_id: documentId,
				new_parent_id: parentId,
				new_position: position
			}
		});
	// Where a move left a document, and the place it goes back to.
	const wayBack = (documentId: string) => ({
		tool: 'move_document_in_tree',
		args: {
			project_id: P,
			document_id: documentId,
			new_parent_id: FOLDER,
			new_position: 0,
			expected_parent_id: ARCHIVE_FOLDER
		}
	});

	it('undoes the moves that ran when a later move fails, and hands the row back', async () => {
		const candidates = threeMoves();
		const rows = await pendingRows(candidates, { docStructure });
		const db = fakeDb({ rows, docStructure });
		const runGatewayWriteOp = vi
			.fn()
			.mockResolvedValueOnce(OK)
			.mockResolvedValueOnce(OK)
			.mockResolvedValueOnce(FAIL)
			.mockResolvedValue(OK);
		const write = writers({ runGatewayWriteOp });
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });

		// Two moves ran, the third failed, then the two went back newest first.
		expect(runGatewayWriteOp).toHaveBeenCalledTimes(5);
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(1, moveCall(DOC_A, ARCHIVE_FOLDER, 0));
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(2, moveCall(DOC_B, ARCHIVE_FOLDER, 1));
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(3, moveCall(DOC_C, ARCHIVE_FOLDER, 2));
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(4, moveCall(DOC_B, FOLDER, 0));
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(5, moveCall(DOC_A, FOLDER, 0));

		expect(summary).toMatchObject({ applied: 0, failed: 0, appliedLineageIds: [] });
		expect(summary.outcomes).toEqual([
			expect.objectContaining({
				suggestionId: 'moves',
				status: 'released',
				reason: 'rolled_back',
				detail: 'tree write refused; the 2 steps that ran were undone'
			})
		]);
		// Back on the card exactly as it was, with no "Done for you" entry.
		expect(rows.moves).toMatchObject({
			status: 'pending',
			decided_at: null,
			undo_operations: [{ tool: 'old' }]
		});
		expect(rows.moves).not.toHaveProperty('result');
		expect(describeCleanupAutoApply(summary)).toBe(
			'Auto-apply: 0 applied, 0 held for review, 1 not applied (1 rolled back) of 1 scored (Jev 420 ms).'
		);
	});

	it('records the row as applied with an Undo for exactly what is still moved when the rollback fails', async () => {
		const candidates = threeMoves();
		const rows = await pendingRows(candidates, { docStructure });
		const db = fakeDb({ rows, docStructure });
		const runGatewayWriteOp = vi
			.fn()
			.mockResolvedValueOnce(OK) // move A
			.mockResolvedValueOnce(OK) // move B
			.mockResolvedValueOnce(FAIL) // move C
			.mockResolvedValueOnce(OK) // B goes back
			.mockResolvedValueOnce({
				ok: false,
				error: { code: 'VALIDATION_ERROR' as const, message: 'still refused' }
			}); // A does not
		const write = writers({ runGatewayWriteOp });
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });

		expect(runGatewayWriteOp).toHaveBeenCalledTimes(5);
		expect(summary).toMatchObject({ applied: 0, failed: 1, appliedLineageIds: [] });
		expect(summary.outcomes[0]).toMatchObject({ status: 'failed', reason: 'partly_applied' });
		// Only A is still moved, so Undo moves only A back.
		expect(rows.moves).toMatchObject({
			status: 'applied',
			applied_at: '2026-10-29T12:00:00.000Z',
			undo_operations: [wayBack(DOC_A)],
			result: {
				ok: false,
				applied_via: 'auto',
				headline: 'Move 3 documents into "Archive" (partly done: 1 of 3 steps)',
				applied_operations: 1,
				partial_failure: true,
				errors: [{ tool: 'move_document_in_tree', error: 'tree write refused' }],
				rollback: { attempted: true, undone_operations: 1, error: 'still refused' },
				auto_apply: { scores: HIGH }
			}
		});
		expect((rows.moves!.undo_operations as unknown[]).length).toBe(1);
		expect(describeCleanupAutoApply(summary)).toBe(
			'Auto-apply: 0 applied, 0 held for review, 1 failed (1 partly applied, with Undo) of 1 scored (Jev 420 ms).'
		);
	});

	it('keeps an Undo for only the archive that ran when the worker cannot restore a document', async () => {
		const candidates = setup([
			row({
				id: 'two-archives',
				title: 'Archive two old drafts',
				operations: [
					{
						tool: 'archive_onto_document',
						args: { project_id: P, document_id: DOC_A, children: 'archive_children' }
					},
					{
						tool: 'archive_onto_document',
						args: { project_id: P, document_id: DOC_C, children: 'archive_children' }
					}
				]
			})
		]);
		const rows = await pendingRows(candidates);
		const db = fakeDb({ rows });
		const write = writers({
			runReviewedDocumentArchive: vi
				.fn()
				.mockResolvedValueOnce(OK)
				.mockResolvedValueOnce({
					ok: false,
					error: {
						code: 'VALIDATION_ERROR' as const,
						message: 'document_archive_review_changed'
					}
				})
		});
		const summary = await run({ candidates, db, jev: decider([HIGH]), write });

		// No rollback is attempted: restoring a document is the web Undo's job.
		expect(write.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(summary.outcomes[0]).toMatchObject({ status: 'failed', reason: 'partly_applied' });
		expect(rows['two-archives']).toMatchObject({
			status: 'applied',
			undo_operations: [
				{
					tool: 'restore_onto_document',
					args: { project_id: P, document_id: DOC_A, restore_state_key: 'draft' }
				}
			],
			result: {
				ok: false,
				applied_via: 'auto',
				headline: 'Archive two old drafts (partly done: 1 of 2 steps)',
				applied_operations: 1,
				partial_failure: true,
				rollback: { attempted: false, undone_operations: 0 }
			}
		});
		// The document that was never archived is not in the Undo, so Undo will not refuse on it.
		expect(JSON.stringify(rows['two-archives']!.undo_operations)).not.toContain(DOC_C);
	});

	it('restores archived tasks through the gateway when a later task archive fails', async () => {
		const OTHER_TASK = uuid(202);
		const candidates = setup([
			row({
				id: 'two-tasks',
				title: 'Archive two finished tasks',
				operations: [
					{ tool: 'archive_onto_task', args: { project_id: P, task_id: TASK } },
					{ tool: 'archive_onto_task', args: { project_id: P, task_id: OTHER_TASK } }
				]
			})
		]);
		const rows = await pendingRows(candidates);
		const db = fakeDb({ rows });
		const runGatewayWriteOp = vi
			.fn()
			.mockResolvedValueOnce(OK)
			.mockResolvedValueOnce(FAIL)
			.mockResolvedValue(OK);
		const summary = await run({
			candidates,
			db,
			jev: decider([HIGH]),
			write: writers({ runGatewayWriteOp })
		});

		expect(runGatewayWriteOp).toHaveBeenCalledTimes(3);
		expect(runGatewayWriteOp).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				op: 'onto.task.update',
				args: { task_id: TASK, archived: false, calendar_sync: 'none' }
			})
		);
		expect(summary.outcomes[0]).toMatchObject({ status: 'released', reason: 'rolled_back' });
		expect(rows['two-tasks']).toMatchObject({ status: 'pending', decided_at: null });
	});
});
