// apps/web/src/lib/server/project-cleanup-undo.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	runGatewayWriteOp: vi.fn(),
	restoreDocumentInTree: vi.fn(),
	logUpdateAsync: vi.fn(),
	replayLoopOperations: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	runGatewayWriteOp: mocks.runGatewayWriteOp
}));
vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	restoreDocumentInTree: mocks.restoreDocumentInTree
}));
vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: mocks.logUpdateAsync
}));
vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	replayLoopOperations: mocks.replayLoopOperations
}));

import {
	UNDO_AUTO_APPLY_REASON,
	UNDO_CHANGED_MESSAGE,
	parseCleanupUndoSteps,
	treeParentById,
	undoAutoAppliedCleanup
} from './project-cleanup-undo.service';

const P = '00000000-0000-4000-8000-000000000001';
const DOC = '00000000-0000-4000-8000-000000000101';
const FOLDER = '00000000-0000-4000-8000-000000000110';
const ARCHIVE = '00000000-0000-4000-8000-000000000111';
const TASK = '00000000-0000-4000-8000-000000000201';

type Row = Record<string, unknown>;
type Filter = [string, string, unknown];

function fakeSupabase(state: {
	suggestion: Row | null;
	documents?: Row[];
	tasks?: Row[];
	docStructure?: unknown;
}) {
	const updates: Array<{ values: Row; filters: Filter[] }> = [];
	const resolve = (table: string, op: string, values: Row | null, filters: Filter[]) => {
		const eq = (column: string) =>
			filters.find(([kind, col]) => kind === 'eq' && col === column)?.[2];
		if (table === 'project_suggestions' && op === 'select') {
			return { data: state.suggestion ? { ...state.suggestion } : null, error: null };
		}
		if (table === 'project_suggestions' && op === 'update') {
			updates.push({ values: values!, filters });
			const status = eq('status');
			if (!state.suggestion || (status !== undefined && state.suggestion.status !== status)) {
				return { data: null, error: null };
			}
			Object.assign(state.suggestion, values);
			return { data: { ...state.suggestion }, error: null };
		}
		if (table === 'onto_documents') return { data: state.documents ?? [], error: null };
		if (table === 'onto_tasks') return { data: state.tasks ?? [], error: null };
		if (table === 'onto_projects') {
			return { data: { doc_structure: state.docStructure ?? { root: [] } }, error: null };
		}
		return { data: null, error: null };
	};
	return {
		updates,
		state,
		from(table: string) {
			let op = 'select';
			let values: Row | null = null;
			const filters: Filter[] = [];
			const builder: Record<string, unknown> = {};
			const chain = (kind: string) => (column: string, arg: unknown) => {
				filters.push([kind, column, arg]);
				return builder;
			};
			Object.assign(builder, {
				select: () => builder,
				update: (next: Row) => {
					op = 'update';
					values = next;
					return builder;
				},
				eq: chain('eq'),
				in: chain('in'),
				maybeSingle: () => Promise.resolve(resolve(table, op, values, filters)),
				then: (onFulfilled: (value: unknown) => unknown) =>
					Promise.resolve(resolve(table, op, values, filters)).then(onFulfilled)
			});
			return builder;
		}
	};
}

function appliedRow(undo: unknown[], overrides: Row = {}): Row {
	return {
		id: 'sug-1',
		project_id: P,
		kind: 'doc_outdated',
		status: 'applied',
		decided_at: '2026-10-29T10:00:00.000Z',
		user_feedback: null,
		result: {
			ok: true,
			applied_via: 'auto',
			headline: 'Archive "Old draft"',
			auto_apply: { reason: 'Fits the project and nothing is lost; you can undo it' }
		},
		undo_operations: undo,
		...overrides
	};
}

const archiveUndo = [
	{
		tool: 'restore_onto_document',
		args: { project_id: P, document_id: DOC, restore_state_key: 'ready' },
		label: 'Restore'
	},
	{
		tool: 'move_document_in_tree',
		args: { project_id: P, document_id: DOC, new_parent_id: FOLDER, new_position: 2 },
		label: 'Put back'
	}
];

function undo(supabase: ReturnType<typeof fakeSupabase>) {
	return undoAutoAppliedCleanup({
		supabase,
		userId: 'user-1',
		actorId: 'actor-1',
		projectId: P,
		suggestionId: 'sug-1',
		now: () => new Date('2026-10-29T12:00:00.000Z')
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.restoreDocumentInTree.mockResolvedValue({
		document: { id: DOC, title: 'Old draft', state_key: 'ready', type_key: 'document.default' },
		structure: { version: 2, root: [] }
	});
	mocks.replayLoopOperations.mockResolvedValue({ appliedCount: 1, errors: [], outcomes: [true] });
	mocks.runGatewayWriteOp.mockResolvedValue({ ok: true, data: {} });
});

describe('undoAutoAppliedCleanup', () => {
	it('restores an archived document, puts it back, and records the undo as the user decision', async () => {
		const supabase = fakeSupabase({
			suggestion: appliedRow(archiveUndo),
			documents: [
				{
					id: DOC,
					project_id: P,
					state_key: 'archived',
					updated_at: '2026-10-29T10:00:00.000Z',
					deleted_at: null
				}
			]
		});
		const outcome = await undo(supabase);
		expect(outcome).toMatchObject({ ok: true, undoneSteps: 2 });
		expect(mocks.restoreDocumentInTree).toHaveBeenCalledWith(
			supabase,
			P,
			DOC,
			{ restoreStateKey: 'ready', expectedUpdatedAt: '2026-10-29T10:00:00.000Z' },
			'actor-1'
		);
		expect(mocks.replayLoopOperations).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase,
				userId: 'user-1',
				projectId: P,
				operations: [
					{
						tool: 'move_document_in_tree',
						args: {
							project_id: P,
							document_id: DOC,
							new_parent_id: FOLDER,
							new_position: 2
						}
					}
				]
			})
		);
		// Claimed on 'applied' first, then stamped undone.
		expect(supabase.updates[0]?.filters).toContainEqual(['eq', 'status', 'applied']);
		expect(supabase.state.suggestion).toMatchObject({
			status: 'rejected',
			decided_at: '2026-10-29T12:00:00.000Z',
			user_feedback: {
				reason: UNDO_AUTO_APPLY_REASON,
				note: 'Undone from Done for you',
				created_at: '2026-10-29T12:00:00.000Z'
			},
			result: {
				applied_via: 'auto',
				headline: 'Archive "Old draft"',
				undone_at: '2026-10-29T12:00:00.000Z'
			}
		});
	});

	it('restores an archived task through the gateway without touching its calendar', async () => {
		const supabase = fakeSupabase({
			suggestion: appliedRow([
				{ tool: 'restore_onto_task', args: { project_id: P, task_id: TASK }, label: 'x' }
			]),
			tasks: [{ id: TASK, project_id: P, archived_at: '2026-10-29T10:00:00.000Z' }]
		});
		expect((await undo(supabase)).ok).toBe(true);
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				admin: supabase,
				userId: 'user-1',
				op: 'onto.task.update',
				args: { task_id: TASK, archived: false, calendar_sync: 'none' },
				scope: expect.objectContaining({ mode: 'read_write', project_ids: [P] })
			})
		);
	});

	it('refuses rows that were not auto-applied, are undone, are not applied, or have no undo', async () => {
		const cases: Array<[Row, number]> = [
			[appliedRow(archiveUndo, { result: { ok: true } }), 400],
			[
				appliedRow(archiveUndo, {
					result: { applied_via: 'auto', undone_at: '2026-10-29T11:00:00.000Z' }
				}),
				409
			],
			[appliedRow(archiveUndo, { status: 'failed' }), 409],
			[appliedRow([]), 422],
			// Every step must name this project.
			[
				appliedRow([
					{
						tool: 'restore_onto_task',
						args: { project_id: 'other', task_id: TASK }
					}
				]),
				422
			],
			[appliedRow([{ tool: 'delete_onto_document', args: { project_id: P } }]), 422]
		];
		for (const [suggestion, status] of cases) {
			const supabase = fakeSupabase({ suggestion });
			expect(await undo(supabase)).toMatchObject({ ok: false, status });
			expect(supabase.updates).toEqual([]);
		}
		expect(await undo(fakeSupabase({ suggestion: null }))).toMatchObject({ status: 404 });
	});

	it('refuses before writing when something changed since', async () => {
		// Restored by hand already.
		const restored = fakeSupabase({
			suggestion: appliedRow(archiveUndo),
			documents: [
				{ id: DOC, project_id: P, state_key: 'draft', updated_at: 'x', deleted_at: null }
			]
		});
		expect(await undo(restored)).toMatchObject({
			ok: false,
			status: 409,
			message: UNDO_CHANGED_MESSAGE
		});

		// Moved again after the change.
		const moved = fakeSupabase({
			suggestion: appliedRow([
				{
					tool: 'move_document_in_tree',
					args: {
						project_id: P,
						document_id: DOC,
						new_parent_id: FOLDER,
						new_position: 0,
						expected_parent_id: ARCHIVE
					}
				}
			]),
			docStructure: { version: 4, root: [{ id: DOC }, { id: FOLDER }, { id: ARCHIVE }] }
		});
		expect(await undo(moved)).toMatchObject({ ok: false, status: 409 });

		expect(restored.updates).toEqual([]);
		expect(moved.updates).toEqual([]);
		expect(mocks.restoreDocumentInTree).not.toHaveBeenCalled();
		expect(mocks.replayLoopOperations).not.toHaveBeenCalled();
	});

	it('moves a document back when it is still where the change left it', async () => {
		const supabase = fakeSupabase({
			suggestion: appliedRow([
				{
					tool: 'move_document_in_tree',
					args: {
						project_id: P,
						document_id: DOC,
						new_parent_id: FOLDER,
						new_position: 1,
						expected_parent_id: ARCHIVE
					}
				}
			]),
			docStructure: {
				version: 4,
				root: [{ id: FOLDER }, { id: ARCHIVE, children: [{ id: DOC }] }]
			}
		});
		expect(await undo(supabase)).toMatchObject({ ok: true, undoneSteps: 1 });
	});

	it('keeps the change applied when the first step fails, so Undo stays on the card', async () => {
		mocks.restoreDocumentInTree.mockRejectedValueOnce(
			new Error('Document version conflict: the document changed before restore')
		);
		const supabase = fakeSupabase({
			suggestion: appliedRow(archiveUndo),
			documents: [
				{ id: DOC, project_id: P, state_key: 'archived', updated_at: 't', deleted_at: null }
			]
		});
		const outcome = await undo(supabase);
		expect(outcome).toMatchObject({ ok: false, status: 500 });
		expect(supabase.state.suggestion).toMatchObject({
			status: 'applied',
			decided_at: '2026-10-29T10:00:00.000Z',
			user_feedback: null
		});
		expect((supabase.state.suggestion?.result as Row).undo_started_at).toBeUndefined();
		expect(mocks.replayLoopOperations).not.toHaveBeenCalled();
	});

	it('lets only one of two taps undo', async () => {
		const supabase = fakeSupabase({
			suggestion: appliedRow([
				{ tool: 'restore_onto_task', args: { project_id: P, task_id: TASK } }
			]),
			tasks: [{ id: TASK, project_id: P, archived_at: 'yes' }]
		});
		// The other tap claimed it between this one's checks and its claim.
		const original = supabase.from.bind(supabase);
		let claimCount = 0;
		supabase.from = (table: string) => {
			const builder = original(table) as Record<string, any>;
			if (table !== 'project_suggestions') return builder;
			const update = builder.update;
			builder.update = (values: Row) => {
				claimCount += 1;
				if (claimCount === 1) supabase.state.suggestion!.status = 'rejected';
				return update(values);
			};
			return builder;
		};
		expect(await undo(supabase)).toMatchObject({ ok: false, status: 409 });
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
	});
});

describe('parseCleanupUndoSteps and treeParentById', () => {
	it('keeps expected_parent_id only when the step carries one', () => {
		const steps = parseCleanupUndoSteps(
			[
				...archiveUndo,
				{
					tool: 'move_document_in_tree',
					args: {
						project_id: P,
						document_id: DOC,
						new_parent_id: null,
						new_position: 0,
						expected_parent_id: null
					}
				}
			],
			P
		);
		expect(steps).toEqual([
			{ tool: 'restore_onto_document', documentId: DOC, restoreStateKey: 'ready' },
			{ tool: 'move_document_in_tree', documentId: DOC, newParentId: FOLDER, newPosition: 2 },
			{
				tool: 'move_document_in_tree',
				documentId: DOC,
				newParentId: null,
				newPosition: 0,
				expectedParentId: null
			}
		]);
		expect(
			parseCleanupUndoSteps(
				[
					{
						tool: 'move_document_in_tree',
						args: { project_id: P, document_id: DOC, new_parent_id: 'Research' }
					}
				],
				P
			)
		).toBeNull();
	});

	it('reads parents from the canonical tree', () => {
		const parents = treeParentById({
			root: [{ id: FOLDER, children: [{ id: DOC }] }, { id: ARCHIVE }]
		});
		expect(parents.get(DOC)).toBe(FOLDER);
		expect(parents.get(ARCHIVE)).toBeNull();
		expect(parents.has(TASK)).toBe(false);
	});
});
