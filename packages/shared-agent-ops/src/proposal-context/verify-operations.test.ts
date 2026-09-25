// packages/shared-agent-ops/src/proposal-context/verify-operations.test.ts
import { describe, expect, it } from 'vitest';
import type { LoopOperation } from '@buildos/shared-types';
import { verifyProjectSuggestionIntegrity } from './verify-operations';
import { decodeLoopOperation } from './decode-operations';
import { buildScopedSuggestionFingerprint } from '../project-loops';

type Row = Record<string, unknown>;

function createSupabaseMock(tables: Record<string, Row[]>) {
	return {
		from(table: string) {
			const equals: Array<[string, unknown]> = [];
			const memberships: Array<[string, unknown[]]> = [];
			const matches = (row: Row) =>
				equals.every(([field, value]) => row[field] === value) &&
				memberships.every(([field, values]) => values.includes(row[field]));
			const builder = {
				select() {
					return builder;
				},
				eq(field: string, value: unknown) {
					equals.push([field, value]);
					return builder;
				},
				in(field: string, values: unknown[]) {
					memberships.push([field, values]);
					return builder;
				},
				async maybeSingle() {
					return {
						data: (tables[table] ?? []).find(matches) ?? null,
						error: null
					};
				},
				then(resolve: (value: { data: Row[]; error: null }) => unknown) {
					return Promise.resolve(
						resolve({ data: (tables[table] ?? []).filter(matches), error: null })
					);
				}
			};
			return builder;
		}
	};
}

const projectId = 'project-1';
const targetId = 'document-target';
const destinationId = 'document-destination';

function baseTables(overrides: { target?: Row; destination?: Row; docStructure?: unknown } = {}) {
	return {
		onto_projects: [
			{
				id: projectId,
				deleted_at: null,
				archived_at: null,
				doc_structure: overrides.docStructure ?? {
					root: [
						{ id: targetId, children: [] },
						{ id: destinationId, children: [] }
					]
				}
			}
		],
		onto_documents: [
			{
				id: targetId,
				project_id: projectId,
				title: 'The Mirror Moment — Carousel Structure & Perspective Bridge',
				state_key: 'active',
				deleted_at: null,
				archived_at: null,
				...overrides.target
			},
			{
				id: destinationId,
				project_id: projectId,
				title: 'Mood Board Carousel Strategy — Perspective Depth as Growth Engine',
				state_key: 'active',
				deleted_at: null,
				archived_at: null,
				...overrides.destination
			}
		],
		onto_tasks: []
	};
}

function moveOperation(overrides: Partial<LoopOperation> = {}): LoopOperation {
	return {
		tool: 'move_document_in_tree',
		args: {
			project_id: projectId,
			document_id: targetId,
			new_parent_id: destinationId,
			new_position: 0
		},
		label: 'Move The Mirror Moment under Mood Board Carousel Strategy',
		...overrides
	};
}

describe('verifyProjectSuggestionIntegrity', () => {
	it('resolves the current target and destination titles into canonical display truth', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(baseTables()), {
			projectId,
			operations: [moveOperation()],
			title: 'Group The Mirror Moment under Mood Board Carousel Strategy',
			preview: {
				summary: 'Move The Mirror Moment under Mood Board Carousel Strategy.',
				impact: '1 move'
			}
		});

		expect(result).toMatchObject({
			ok: true,
			summary: {
				operation_count: 1,
				operations: [
					{
						target: 'The Mirror Moment — Carousel Structure & Perspective Bridge',
						changes: expect.arrayContaining([
							{
								label: 'New location',
								value: 'Mood Board Carousel Strategy — Perspective Depth as Growth Engine'
							}
						])
					}
				]
			}
		});
	});

	it('quarantines a label/ID mismatch', async () => {
		const tables = baseTables({
			target: { title: '03 — Quality Contract & Failure Recovery' }
		});
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [moveOperation()],
			title: 'Move The Mirror Moment',
			preview: { summary: 'Move The Mirror Moment under Mood Board Carousel Strategy.' }
		});

		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'MODEL_ENTITY_MISMATCH', entity_id: targetId }
		});
	});

	it('does not let an aggregate preview hide swapped IDs in a multi-operation proposal', async () => {
		const otherId = 'document-other';
		const tables = baseTables();
		tables.onto_projects[0].doc_structure = {
			root: [
				{ id: targetId, children: [] },
				{ id: otherId, children: [] },
				{ id: destinationId, children: [] }
			]
		};
		tables.onto_documents.push({
			id: otherId,
			project_id: projectId,
			title: 'Instagram Saves Engine — Architecture',
			state_key: 'active',
			deleted_at: null,
			archived_at: null
		});
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [
				moveOperation({
					args: {
						project_id: projectId,
						document_id: otherId,
						new_parent_id: destinationId,
						new_position: 0
					},
					label: 'Move The Mirror Moment under Mood Board Carousel Strategy'
				}),
				moveOperation({
					args: {
						project_id: projectId,
						document_id: targetId,
						new_parent_id: destinationId,
						new_position: 1
					},
					label: 'Move Instagram Saves Engine under Mood Board Carousel Strategy'
				})
			],
			title: 'Group The Mirror Moment and Instagram Saves Engine',
			preview: {
				summary:
					'Move The Mirror Moment and Instagram Saves Engine under Mood Board Carousel Strategy.',
				impact: '2 moves'
			}
		});

		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'MODEL_ENTITY_MISMATCH', entity_id: otherId }
		});
	});

	it('uses a post-generation renamed entity as current display truth after initial verification', async () => {
		const tables = baseTables({ target: { title: 'The Mirror Moment — Renamed Today' } });
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [moveOperation()],
			title: 'Old title that no longer matches',
			preview: { summary: 'Old title that no longer matches' },
			checkModelAlignment: false
		});

		expect(result).toMatchObject({
			ok: true,
			summary: {
				operations: [{ target: 'The Mirror Moment — Renamed Today' }]
			}
		});
	});

	it('rejects archived targets and cross-project targets', async () => {
		const archived = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(baseTables({ target: { state_key: 'archived' } })),
			{
				projectId,
				operations: [moveOperation()],
				title: 'Move The Mirror Moment under Mood Board Carousel Strategy'
			}
		);
		expect(archived).toMatchObject({
			ok: false,
			diagnostic: { code: 'ENTITY_INACTIVE', entity_id: targetId }
		});

		const crossProject = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(baseTables({ target: { project_id: 'project-2' } })),
			{
				projectId,
				operations: [moveOperation()],
				title: 'Move The Mirror Moment under Mood Board Carousel Strategy'
			}
		);
		expect(crossProject).toMatchObject({
			ok: false,
			diagnostic: {
				code: 'ENTITY_PROJECT_MISMATCH',
				entity_id: targetId,
				actual_project_id: 'project-2'
			}
		});
	});

	it('blocks approval when the verified document-tree state changed', async () => {
		const original = await verifyProjectSuggestionIntegrity(createSupabaseMock(baseTables()), {
			projectId,
			operations: [moveOperation()],
			title: 'Move The Mirror Moment under Mood Board Carousel Strategy'
		});
		if (!original.ok) throw new Error('Fixture should verify');

		const changedTree = {
			root: [
				{
					id: 'other-parent',
					children: [{ id: targetId, children: [] }]
				},
				{ id: destinationId, children: [] }
			]
		};
		const tables = baseTables({ docStructure: changedTree });
		tables.onto_documents.push({
			id: 'other-parent',
			project_id: projectId,
			title: 'Other Parent',
			state_key: 'active',
			deleted_at: null,
			archived_at: null
		});
		const changed = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [moveOperation()],
			checkModelAlignment: false,
			expectedStructuralFingerprint: original.summary.structural_fingerprint
		});

		expect(changed).toMatchObject({
			ok: false,
			diagnostic: { code: 'EXPECTED_STATE_CHANGED' }
		});
	});

	it('blocks approval when verified update arguments are changed', async () => {
		const taskId = 'task-1';
		const tables = baseTables();
		(tables.onto_tasks as Row[]).push({
			id: taskId,
			project_id: projectId,
			title: 'Resolve launch conflict',
			state_key: 'active',
			deleted_at: null,
			archived_at: null
		});
		const originalOperation: LoopOperation = {
			tool: 'update_onto_task',
			args: {
				project_id: projectId,
				task_id: taskId,
				props: { loop_flagged_conflict: true }
			},
			label: 'Flag Resolve launch conflict'
		};
		const original = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [originalOperation],
			title: 'Flag Resolve launch conflict'
		});
		if (!original.ok) throw new Error('Fixture should verify');

		const changed = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations: [
				{
					...originalOperation,
					args: { ...originalOperation.args, props: { loop_flagged_conflict: false } }
				}
			],
			checkModelAlignment: false,
			expectedStructuralFingerprint: original.summary.structural_fingerprint
		});

		expect(changed).toMatchObject({
			ok: false,
			diagnostic: { code: 'EXPECTED_STATE_CHANGED' }
		});
	});
});

// ---------------------------------------------------------------------------
// Golden structural fingerprints (Tasker 88 H3)
//
// Pending verified suggestions store `proposal_verified:<fingerprint>` and are
// re-verified on inbox sync and on approve with expectedStructuralFingerprint.
// If the fingerprint of an EXISTING op shape changes, every such suggestion in
// production is quarantined with EXPECTED_STATE_CHANGED. These values were
// captured from the pre-Tasker-88 verifier and must never change.
// ---------------------------------------------------------------------------

const GOLDEN_FINGERPRINTS = {
	single_move: 'c65a5649f49b0e3f7f3be3baaefcb334e2caf31a60ca437db60dcc02644ca283',
	two_moves_top_level: '7a7d55f9ee769d50109eebe2e22e0fd0e24ee10e7f9b00dc536d56977812bfe0',
	document_outdated_flag: 'b15c61b74abf24e5da6b0e55b882c6dc350eca96003b0eb8c3fc35f23d7a9a1f',
	task_conflict_flag: '4c4da4ca3ee35ea8e01e1d6ee557e82615791203673b0c942a217a86f2c1c0c3',
	task_props_only: '6a1f75e18b2d6267c14d86d04b186a83dde24395264dc886b875204669b0b882'
} as const;

function goldenTables() {
	const tables = baseTables();
	tables.onto_projects[0].doc_structure = {
		root: [
			{ id: targetId, children: [] },
			{ id: destinationId, children: [{ id: 'document-child', children: [] }] }
		]
	};
	tables.onto_documents.push({
		id: 'document-child',
		project_id: projectId,
		title: 'Carousel Hooks Library',
		state_key: 'draft',
		deleted_at: null,
		archived_at: null
	});
	(tables.onto_tasks as Row[]).push(
		{
			id: 'task-1',
			project_id: projectId,
			title: 'Resolve launch conflict',
			state_key: 'todo',
			due_at: '2026-09-25T04:00:00.000Z',
			start_at: null,
			deleted_at: null,
			archived_at: null
		},
		{
			id: 'task-2',
			project_id: projectId,
			title: 'Schedule launch webinar',
			state_key: 'in_progress',
			due_at: null,
			start_at: null,
			deleted_at: null,
			archived_at: null
		}
	);
	return tables;
}

const goldenCases: Array<{ name: keyof typeof GOLDEN_FINGERPRINTS; operations: LoopOperation[] }> =
	[
		{ name: 'single_move', operations: [moveOperation()] },
		{
			name: 'two_moves_top_level',
			operations: [
				moveOperation({
					args: {
						project_id: projectId,
						document_id: targetId,
						new_parent_id: null,
						new_position: 2
					},
					label: 'Move The Mirror Moment to the top level'
				}),
				moveOperation({
					args: {
						project_id: projectId,
						document_id: 'document-child',
						new_parent_id: targetId,
						new_position: 0
					},
					label: 'Move Carousel Hooks Library under The Mirror Moment'
				})
			]
		},
		{
			name: 'document_outdated_flag',
			operations: [
				{
					tool: 'update_onto_document',
					args: {
						project_id: projectId,
						document_id: 'document-child',
						props: {
							loop_flagged_outdated: true,
							loop_outdated_reason: 'Hooks predate the rebrand'
						}
					},
					label: 'Mark Carousel Hooks Library as outdated'
				}
			]
		},
		{
			name: 'task_conflict_flag',
			operations: [
				{
					tool: 'update_onto_task',
					args: {
						task_id: 'task-1',
						project_id: projectId,
						props: {
							loop_flagged_conflict: true,
							loop_conflict_kind: 'duplicate',
							loop_conflict_with_task_id: 'task-2',
							loop_conflict_reason: 'Both schedule the launch'
						}
					},
					label: 'Flag Resolve launch conflict against Schedule launch webinar'
				}
			]
		},
		{
			name: 'task_props_only',
			operations: [
				{
					tool: 'update_onto_task',
					args: {
						project_id: projectId,
						task_id: 'task-2',
						props: { loop_flagged_conflict: false }
					},
					label: 'Clear flag on Schedule launch webinar'
				}
			]
		}
	];

describe('golden structural fingerprints for existing op shapes', () => {
	it.each(goldenCases)(
		'$name keeps its pre-Tasker-88 fingerprint',
		async ({ name, operations }) => {
			const result = await verifyProjectSuggestionIntegrity(
				createSupabaseMock(goldenTables()),
				{
					projectId,
					operations,
					checkModelAlignment: false
				}
			);
			if (!result.ok)
				throw new Error(`Golden fixture ${name} failed: ${result.diagnostic.code}`);
			expect(result.summary.structural_fingerprint).toBe(GOLDEN_FINGERPRINTS[name]);
		}
	);

	it.each(goldenCases)(
		'$name still re-verifies against its stored fingerprint',
		async ({ name, operations }) => {
			const result = await verifyProjectSuggestionIntegrity(
				createSupabaseMock(goldenTables()),
				{
					projectId,
					operations,
					checkModelAlignment: false,
					expectedStructuralFingerprint: GOLDEN_FINGERPRINTS[name]
				}
			);
			expect(result.ok).toBe(true);
		}
	);
});

describe('golden scoped freshness fingerprint for task and document suggestions', () => {
	it('keeps the pre-Tasker-88 hash for task and document entities', () => {
		expect(
			buildScopedSuggestionFingerprint([
				{
					kind: 'task',
					id: 'task-1',
					title: 'Resolve launch conflict',
					state_key: 'todo',
					updated_at: '2026-09-01T10:00:00.000Z',
					parent_id: null
				},
				{
					kind: 'document',
					id: 'doc-1',
					title: 'Launch plan',
					state_key: 'draft',
					updated_at: '2026-09-02T10:00:00.000Z',
					parent_id: 'doc-root'
				}
			])
		).toBe('816ef2165a00470cf3b5b81497d885400130159c015559602c88b8b3984c86a5');
	});
});

// ---------------------------------------------------------------------------
// Scalar task, goal and milestone operations (Tasker 88 H3)
// ---------------------------------------------------------------------------

function scalarTables() {
	const tables = goldenTables() as Record<string, Row[]>;
	tables.onto_goals = [
		{
			id: 'goal-1',
			project_id: projectId,
			name: 'Launch the paid beta',
			state_key: 'active',
			target_date: '2026-10-31T04:00:00.000Z',
			deleted_at: null,
			archived_at: null
		},
		{
			id: 'goal-other',
			project_id: 'project-2',
			name: 'Someone else goal',
			state_key: 'active',
			target_date: null,
			deleted_at: null,
			archived_at: null
		}
	];
	tables.onto_milestones = [
		{
			id: 'milestone-1',
			project_id: projectId,
			title: 'Shed weather-tight',
			state_key: 'pending',
			due_at: '2026-10-15T04:00:00.000Z',
			deleted_at: null,
			archived_at: null
		}
	];
	return tables;
}

function taskOp(args: Record<string, unknown>, label = 'Resolve launch conflict'): LoopOperation {
	return {
		tool: 'update_onto_task',
		args: { project_id: projectId, task_id: 'task-1', ...args },
		label
	};
}

describe('scalar operations', () => {
	it('decodes a task state change with before and after values', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [taskOp({ state_key: 'done' }, 'Mark Resolve launch conflict done')]
		});
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Mark task "Resolve launch conflict" as done.',
				operations: [
					{
						entityLabel: 'task',
						target: 'Resolve launch conflict',
						changes: [{ label: 'Status', value: 'Done', before: 'To do' }]
					}
				]
			}
		});
	});

	it('decodes a civil due date and a cleared start date', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [taskOp({ due_at: '2026-10-03', calendar_sync: 'none' })]
		});
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Change the due date of task "Resolve launch conflict" to 2026-10-03.',
				operations: [
					{
						changes: [
							{
								label: 'Due date',
								value: '2026-10-03',
								before: '2026-09-25T04:00:00.000Z'
							}
						]
					}
				]
			}
		});
	});

	it('decodes goal state and target date, and milestone state and due date', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [
				{
					tool: 'update_onto_goal',
					args: { project_id: projectId, goal_id: 'goal-1', target_date: '2026-11-30' },
					label: 'Retarget Launch the paid beta'
				},
				{
					tool: 'update_onto_milestone',
					args: {
						project_id: projectId,
						milestone_id: 'milestone-1',
						state_key: 'in_progress',
						due_at: '2026-10-22'
					},
					label: 'Move Shed weather-tight'
				}
			],
			preview: { summary: 'Update 2 out-of-date items' }
		});
		expect(result).toMatchObject({
			ok: true,
			summary: {
				operation_count: 2,
				headline: 'Apply 2 verified changes.',
				operations: [
					{
						entityLabel: 'goal',
						target: 'Launch the paid beta',
						summary:
							'Change the target date of goal "Launch the paid beta" to 2026-11-30.',
						changes: [
							{
								label: 'Target date',
								value: '2026-11-30',
								before: '2026-10-31T04:00:00.000Z'
							}
						]
					},
					{
						entityLabel: 'milestone',
						target: 'Shed weather-tight',
						summary: 'Update milestone "Shed weather-tight".',
						changes: [
							{ label: 'Status', value: 'In progress', before: 'Pending' },
							{
								label: 'Due date',
								value: '2026-10-22',
								before: '2026-10-15T04:00:00.000Z'
							}
						]
					}
				]
			}
		});
	});

	it.each([
		['a title rename', { title: 'Renamed task' }],
		['a priority change', { priority: 'high' }],
		['a goal link', { goal_id: 'goal-1' }],
		['an assignee change', { assignee_actor_ids: ['actor-2'] }],
		['calendar sync other than none', { calendar_sync: 'auto' }],
		['a description rewrite', { description: 'New words' }],
		['non-object props', { props: 'loop_flagged_conflict' }]
	])('fails closed on %s riding along with a displayed change', async (_label, extra) => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [taskOp({ props: { loop_flagged_conflict: true }, ...extra })],
			checkModelAlignment: false
		});
		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'INVALID_OPERATION', entity_id: 'task-1' }
		});
	});

	it('fails closed on undecoded document and goal writes', async () => {
		const documentContent = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [
					{
						tool: 'update_onto_document',
						args: {
							project_id: projectId,
							document_id: 'document-child',
							props: { loop_flagged_outdated: true },
							content: 'Replaced body'
						},
						label: 'Mark Carousel Hooks Library as outdated'
					}
				]
			}
		);
		expect(documentContent).toMatchObject({
			ok: false,
			diagnostic: { code: 'INVALID_OPERATION' }
		});

		const goalRename = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [
					{
						tool: 'update_onto_goal',
						args: {
							project_id: projectId,
							goal_id: 'goal-1',
							state_key: 'achieved',
							measurement_criteria: 'Revenue'
						},
						label: 'Launch the paid beta achieved'
					}
				]
			}
		);
		expect(goalRename).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('tolerates a title echo that matches the current title exactly', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [taskOp({ title: 'Resolve launch conflict', state_key: 'blocked' })]
		});
		expect(result).toMatchObject({
			ok: true,
			summary: { operations: [{ changes: [{ label: 'Status', value: 'Blocked' }] }] }
		});
	});

	it.each([
		['an unknown task state', taskOp({ state_key: 'finished' })],
		['a task state from another entity kind', taskOp({ state_key: 'achieved' })],
		['an impossible civil date', taskOp({ due_at: '2026-02-30' })],
		['a relative date', taskOp({ due_at: 'next friday' })],
		['a numeric date', taskOp({ due_at: '10/3' })]
	])('rejects %s', async (_label, operation) => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [operation]
		});
		expect(result).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('reports NO_OP_OPERATION when the proposed value is already current', async () => {
		const sameState = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [taskOp({ state_key: 'todo' })]
			}
		);
		expect(sameState).toMatchObject({
			ok: false,
			diagnostic: { code: 'NO_OP_OPERATION', entity_id: 'task-1' }
		});

		const sameInstant = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [taskOp({ due_at: '2026-09-25T00:00:00-04:00' })]
			}
		);
		expect(sameInstant).toMatchObject({ ok: false, diagnostic: { code: 'NO_OP_OPERATION' } });

		const sameCivilDayInZone = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [taskOp({ due_at: '2026-09-25' })],
				timezone: 'America/New_York'
			}
		);
		expect(sameCivilDayInZone).toMatchObject({
			ok: false,
			diagnostic: { code: 'NO_OP_OPERATION' }
		});

		// Without a timezone a civil date is never assumed to match a timestamp.
		const noTimezone = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [taskOp({ due_at: '2026-09-25' })]
			}
		);
		expect(noTimezone.ok).toBe(true);

		const alreadyCleared = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{ projectId, operations: [taskOp({ start_at: null })] }
		);
		expect(alreadyCleared).toMatchObject({
			ok: false,
			diagnostic: { code: 'NO_OP_OPERATION' }
		});
	});

	it('blocks approval with EXPECTED_STATE_CHANGED after the entity state changed', async () => {
		const operations = [taskOp({ state_key: 'done' })];
		const original = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations
			}
		);
		if (!original.ok) throw new Error('Fixture should verify');

		const moved = scalarTables();
		moved.onto_tasks[0].state_key = 'in_progress';
		const changed = await verifyProjectSuggestionIntegrity(createSupabaseMock(moved), {
			projectId,
			operations,
			checkModelAlignment: false,
			expectedStructuralFingerprint: original.summary.structural_fingerprint
		});
		expect(changed).toMatchObject({
			ok: false,
			diagnostic: { code: 'EXPECTED_STATE_CHANGED' }
		});

		const unchanged = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations,
				checkModelAlignment: false,
				expectedStructuralFingerprint: original.summary.structural_fingerprint
			}
		);
		expect(unchanged.ok).toBe(true);
	});

	it('blocks approval after a milestone due date changed underneath the draft', async () => {
		const operations: LoopOperation[] = [
			{
				tool: 'update_onto_milestone',
				args: { project_id: projectId, milestone_id: 'milestone-1', due_at: '2026-10-22' },
				label: 'Reschedule Shed weather-tight'
			}
		];
		const original = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations
			}
		);
		if (!original.ok) throw new Error('Fixture should verify');
		const tables = scalarTables();
		tables.onto_milestones[0].due_at = '2026-10-18T04:00:00.000Z';
		const changed = await verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
			projectId,
			operations,
			checkModelAlignment: false,
			expectedStructuralFingerprint: original.summary.structural_fingerprint
		});
		expect(changed).toMatchObject({
			ok: false,
			diagnostic: { code: 'EXPECTED_STATE_CHANGED' }
		});
	});

	it('gives scalar shapes their own fingerprint without moving props-only fingerprints', async () => {
		const propsOnly = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: goldenCases.find((c) => c.name === 'task_conflict_flag')!.operations,
				checkModelAlignment: false
			}
		);
		const withScalar = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [
					{
						...goldenCases.find((c) => c.name === 'task_conflict_flag')!.operations[0],
						args: {
							...goldenCases.find((c) => c.name === 'task_conflict_flag')!
								.operations[0].args,
							state_key: 'blocked'
						}
					}
				],
				checkModelAlignment: false
			}
		);
		if (!propsOnly.ok || !withScalar.ok) throw new Error('Fixtures should verify');
		expect(propsOnly.summary.structural_fingerprint).toBe(
			GOLDEN_FINGERPRINTS.task_conflict_flag
		);
		expect(withScalar.summary.structural_fingerprint).not.toBe(
			GOLDEN_FINGERPRINTS.task_conflict_flag
		);
	});

	it('resolves goals and milestones against the project', async () => {
		const missing = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [
				{
					tool: 'update_onto_milestone',
					args: {
						project_id: projectId,
						milestone_id: 'milestone-gone',
						state_key: 'completed'
					},
					label: 'Complete a milestone'
				}
			]
		});
		expect(missing).toMatchObject({
			ok: false,
			diagnostic: { code: 'ENTITY_NOT_FOUND', entity_kind: 'milestone' }
		});

		const foreign = await verifyProjectSuggestionIntegrity(createSupabaseMock(scalarTables()), {
			projectId,
			operations: [
				{
					tool: 'update_onto_goal',
					args: { project_id: projectId, goal_id: 'goal-other', state_key: 'achieved' },
					label: 'Someone else goal achieved'
				}
			]
		});
		expect(foreign).toMatchObject({
			ok: false,
			diagnostic: { code: 'ENTITY_PROJECT_MISMATCH', entity_kind: 'goal' }
		});

		const misaligned = await verifyProjectSuggestionIntegrity(
			createSupabaseMock(scalarTables()),
			{
				projectId,
				operations: [
					{
						tool: 'update_onto_goal',
						args: { project_id: projectId, goal_id: 'goal-1', state_key: 'achieved' },
						label: 'Mark the hiring plan achieved'
					}
				]
			}
		);
		expect(misaligned).toMatchObject({
			ok: false,
			diagnostic: { code: 'MODEL_ENTITY_MISMATCH', entity_kind: 'goal' }
		});
	});
});

describe('decodeLoopOperation scalar arguments', () => {
	it('surfaces top-level scalar writes on update operations', () => {
		expect(
			decodeLoopOperation({
				tool: 'update_onto_milestone',
				args: { milestone_id: 'm', state_key: 'completed', due_at: '2026-10-22' }
			})
		).toMatchObject({
			action: 'update',
			entityLabel: 'milestone',
			changes: [
				{ label: 'Status', value: 'completed' },
				{ label: 'Due date', value: '2026-10-22' }
			]
		});
	});
});

describe('document text edits', () => {
	const body = [
		'# AI Pillar',
		'## Open questions',
		'- **Name of the move** — not settled.',
		"- **AI's role** — one pillar, or the why-now?"
	].join('\n');
	const tables = (content = body) =>
		baseTables({ target: { title: 'AI Pillar — Working Doc', content } });
	const editOperation = (edits: unknown, extra: Record<string, unknown> = {}): LoopOperation => ({
		tool: 'update_onto_document',
		args: { project_id: projectId, document_id: targetId, edits, ...extra },
		label: 'Edit "AI Pillar — Working Doc"'
	});
	const verify = (operation: LoopOperation, content?: string) =>
		verifyProjectSuggestionIntegrity(createSupabaseMock(tables(content)), {
			projectId,
			operations: [operation],
			title: 'AI Pillar — Working Doc still lists decided questions as open',
			checkModelAlignment: true
		});

	it('shows each edit as before and after, resolved against the live body', async () => {
		const result = await verify(
			editOperation([
				{ old_text: '- **Name of the move** — not settled.', new_text: '' },
				{
					old_text: "- **AI's role** — one pillar, or the why-now?",
					new_text: "- **AI's role** — decided: the why-now (see Card 9)."
				}
			])
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [operation] = result.summary.operations;
		expect(operation?.summary).toBe('Edit "AI Pillar — Working Doc" (2 changes).');
		expect(operation?.changes).toEqual([
			{
				label: 'Remove',
				format: 'text_edit',
				before: '- **Name of the move** — not settled.',
				value: '(removed)'
			},
			{
				label: 'Change',
				format: 'text_edit',
				before: "- **AI's role** — one pillar, or the why-now?",
				value: "- **AI's role** — decided: the why-now (see Card 9)."
			}
		]);
	});

	it('rejects edits whose text no longer matches the document', async () => {
		const result = await verify(
			editOperation([{ old_text: '- **Name of the move** — not settled.', new_text: '' }]),
			'# AI Pillar\n## Open questions\n(none)'
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.diagnostic.code).toBe('DOCUMENT_EDIT_UNRESOLVED');
	});

	it('fails closed on replace_all, section edits, and whole-body writes', async () => {
		for (const operation of [
			editOperation([{ old_text: 'not settled', new_text: 'settled', replace_all: true }]),
			editOperation([{ old_text: 'not settled', new_text: 'settled' }], {
				section_edits: [{ action: 'delete', section: 'Open questions' }]
			}),
			editOperation([{ old_text: 'not settled', new_text: 'settled' }], { content: 'x' }),
			editOperation([])
		]) {
			const result = await verify(operation);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.diagnostic.code).toBe('INVALID_OPERATION');
		}
	});

	it('binds the approval fingerprint to the exact edits', async () => {
		const first = await verify(
			editOperation([{ old_text: 'not settled', new_text: 'settled: The Reindex' }])
		);
		const second = await verify(
			editOperation([{ old_text: 'not settled', new_text: 'settled: The Life Audit' }])
		);
		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(first.summary.structural_fingerprint).not.toBe(
			second.summary.structural_fingerprint
		);
	});
});
