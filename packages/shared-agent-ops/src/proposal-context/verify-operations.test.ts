// packages/shared-agent-ops/src/proposal-context/verify-operations.test.ts
import { describe, expect, it } from 'vitest';
import type { LoopOperation } from '@buildos/shared-types';
import { verifyProjectSuggestionIntegrity } from './verify-operations';

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

	it('quarantines an explicit preview/operation count mismatch', async () => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(baseTables()), {
			projectId,
			operations: [moveOperation()],
			title: 'Move The Mirror Moment under Mood Board Carousel Strategy',
			preview: {
				summary: 'Move The Mirror Moment under Mood Board Carousel Strategy.',
				impact: '2 moves: 2 documents change parents.'
			}
		});

		expect(result).toMatchObject({
			ok: false,
			diagnostic: {
				code: 'PREVIEW_OPERATION_COUNT_MISMATCH',
				expected_operation_count: 1,
				preview_operation_count: 2
			}
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
