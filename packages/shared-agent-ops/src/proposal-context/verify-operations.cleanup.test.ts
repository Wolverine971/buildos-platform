// packages/shared-agent-ops/src/proposal-context/verify-operations.cleanup.test.ts
// Project cleanup operations (Tasker 112): archive a document (with its subtree),
// archive a task, update the project, and rename a goal.
import { describe, expect, it } from 'vitest';
import type { LoopOperation } from '@buildos/shared-types';
import {
	PROJECT_CLEANUP_OPERATION_TOOLS,
	PROJECT_REVIEW_VERIFIABLE_OPERATION_TOOLS,
	isProjectCleanupOperationTool,
	readDocumentArchiveChildrenMode,
	verifyProjectSuggestionIntegrity
} from './verify-operations';
import * as proposalContext from './index';

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
					return { data: (tables[table] ?? []).find(matches) ?? null, error: null };
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

function doc(id: string, title: string, overrides: Row = {}): Row {
	return {
		id,
		project_id: projectId,
		title,
		state_key: 'draft',
		deleted_at: null,
		archived_at: null,
		...overrides
	};
}

function task(id: string, title: string, overrides: Row = {}): Row {
	return {
		id,
		project_id: projectId,
		title,
		state_key: 'todo',
		due_at: null,
		start_at: null,
		deleted_at: null,
		archived_at: null,
		...overrides
	};
}

/**
 * Rod folder
 *   Rod Exit Plan
 *     Rod Valuation Notes
 *   Rod Buyer List
 * Political Analysis
 */
function cleanupTables(overrides: { documents?: Row[]; tree?: unknown; project?: Row } = {}) {
	return {
		onto_projects: [
			{
				id: projectId,
				name: 'Wayne Strategies',
				description: 'Consulting for Maryland businesses.',
				type_key: 'project.business.consulting',
				deleted_at: null,
				archived_at: null,
				doc_structure: overrides.tree ?? {
					version: 3,
					root: [
						{
							id: 'doc-rod',
							children: [
								{ id: 'doc-rod-plan', children: [{ id: 'doc-rod-valuation' }] },
								{ id: 'doc-rod-buyers', children: [] }
							]
						},
						{ id: 'doc-political', children: [] }
					]
				},
				...overrides.project
			}
		],
		onto_documents: overrides.documents ?? [
			doc('doc-rod', 'Rod Chamberlin'),
			doc('doc-rod-plan', 'Rod Exit Plan'),
			doc('doc-rod-valuation', 'Rod Valuation Notes'),
			doc('doc-rod-buyers', 'Rod Buyer List'),
			doc('doc-political', 'Political Analysis')
		],
		onto_tasks: [
			task('task-referral', 'Build referral pipeline'),
			task('task-expo', 'Book Biz Expo booth'),
			task('task-webinar', 'Host county webinar'),
			task('task-done', 'Call Rebecca', {
				deleted_at: '2026-07-02T00:00:00.000Z',
				archived_at: '2026-07-02T00:00:00.000Z'
			}),
			task('task-connector', 'Podcaster outreach', {
				archived_at: '2026-07-02T00:00:00.000Z'
			}),
			task('task-deleted', 'Old draft', { deleted_at: '2026-07-02T00:00:00.000Z' }),
			task('task-other', 'Someone else task', { project_id: 'project-2' })
		],
		onto_goals: [
			{
				id: 'goal-1',
				project_id: projectId,
				name: 'Maryland Content Authority',
				description: 'Become the go-to voice for Maryland business content.',
				state_key: 'active',
				target_date: null,
				deleted_at: null,
				archived_at: null
			}
		],
		onto_public_pages: [] as Row[]
	};
}

function archiveDoc(documentId: string, label: string, children?: unknown): LoopOperation {
	return {
		tool: 'archive_onto_document',
		args: {
			project_id: projectId,
			document_id: documentId,
			...(children !== undefined ? { children } : {})
		},
		label
	};
}

function archiveTask(taskId: string, label: string): LoopOperation {
	return { tool: 'archive_onto_task', args: { project_id: projectId, task_id: taskId }, label };
}

function projectUpdate(args: Record<string, unknown>, label = 'Update the project'): LoopOperation {
	return { tool: 'update_onto_project', args: { project_id: projectId, ...args }, label };
}

async function verify(
	tables: ReturnType<typeof cleanupTables>,
	operations: LoopOperation[],
	extra: Record<string, unknown> = {}
) {
	return verifyProjectSuggestionIntegrity(createSupabaseMock(tables), {
		projectId,
		operations,
		...extra
	});
}

describe('cleanup tool exports', () => {
	it('lists the cleanup tools and exposes them through the proposal-context entry', () => {
		expect([...PROJECT_CLEANUP_OPERATION_TOOLS]).toEqual([
			'archive_onto_document',
			'archive_onto_task',
			'update_onto_project'
		]);
		expect(PROJECT_REVIEW_VERIFIABLE_OPERATION_TOOLS).toEqual(
			expect.arrayContaining([
				'move_document_in_tree',
				'update_onto_goal',
				...PROJECT_CLEANUP_OPERATION_TOOLS
			])
		);
		expect(isProjectCleanupOperationTool('archive_onto_task')).toBe(true);
		expect(isProjectCleanupOperationTool('delete_onto_task')).toBe(false);
		expect(proposalContext.PROJECT_CLEANUP_OPERATION_TOOLS).toBe(
			PROJECT_CLEANUP_OPERATION_TOOLS
		);
	});

	it('reads the archive children mode, defaulting to archive_children', () => {
		expect(readDocumentArchiveChildrenMode(undefined)).toBe('archive_children');
		expect(readDocumentArchiveChildrenMode(null)).toBe('archive_children');
		expect(readDocumentArchiveChildrenMode('promote_children')).toBe('promote_children');
		expect(readDocumentArchiveChildrenMode('unlink_children')).toBeNull();
	});
});

describe('archive_onto_document', () => {
	it('archives the document with every descendant and lists them', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-rod', 'Archive the Rod Chamberlin folder')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Archive "Rod Chamberlin" and the 3 documents inside it.',
				operation_count: 1,
				operations: [
					{
						action: 'other',
						actionLabel: 'Archive',
						entityLabel: 'document',
						target: 'Rod Chamberlin',
						changes: [
							{ label: 'Archive', value: 'Rod Chamberlin' },
							{ label: 'Also archives', value: 'Rod Exit Plan' },
							{ label: 'Also archives', value: 'Rod Valuation Notes' },
							{ label: 'Also archives', value: 'Rod Buyer List' }
						]
					}
				]
			}
		});
		if (!result.ok) throw new Error('expected ok');
		expect(result.summary.cautions).toBeUndefined();
	});

	it('promotes only the direct children in promote_children mode', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-rod', 'Archive the Rod Chamberlin hub', 'promote_children')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Archive "Rod Chamberlin" and move its 2 documents up a level.',
				operations: [
					{
						changes: [
							{ label: 'Archive', value: 'Rod Chamberlin' },
							{ label: 'Moves up a level', value: 'Rod Exit Plan' },
							{ label: 'Moves up a level', value: 'Rod Buyer List' }
						]
					}
				]
			}
		});
	});

	it('reads a leaf document as a plain archive', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-political', 'Archive Political Analysis')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: { headline: 'Archive "Political Analysis".' }
		});
	});

	it('caps the displayed child names and counts the rest', async () => {
		const children = Array.from({ length: 15 }, (_, index) => ({ id: `doc-child-${index}` }));
		const tables = cleanupTables({
			tree: { root: [{ id: 'doc-rod', children }] },
			documents: [
				doc('doc-rod', 'Rod Chamberlin'),
				...children.map((child, index) => doc(child.id, `Rod note ${index + 1}`))
			]
		});
		const result = await verify(tables, [archiveDoc('doc-rod', 'Archive Rod Chamberlin')]);
		if (!result.ok) throw new Error(result.diagnostic.message);
		const [operation] = result.summary.operations;
		expect(result.summary.headline).toBe(
			'Archive "Rod Chamberlin" and the 15 documents inside it.'
		);
		expect(operation!.changes).toHaveLength(1 + 12 + 1);
		expect(operation!.changes.at(-1)).toEqual({ label: 'Also archives', value: 'and 3 more' });
	});

	it.each([
		['state_key archived', { state_key: 'archived' }],
		['archived_at (connector archive)', { archived_at: '2026-07-02T00:00:00.000Z' }]
	])('reports an already archived target (%s) as NO_OP_OPERATION', async (_label, patch) => {
		const tables = cleanupTables();
		Object.assign(tables.onto_documents.find((row) => row.id === 'doc-political')!, patch);
		const result = await verify(tables, [
			archiveDoc('doc-political', 'Archive Political Analysis')
		]);
		expect(result).toMatchObject({
			ok: false,
			diagnostic: {
				code: 'NO_OP_OPERATION',
				entity_id: 'doc-political',
				resolved_entity_title: 'Political Analysis'
			}
		});
	});

	it('rejects deleted, missing and cross-project targets', async () => {
		const tables = cleanupTables();
		Object.assign(tables.onto_documents.find((row) => row.id === 'doc-political')!, {
			deleted_at: '2026-09-01T00:00:00.000Z',
			state_key: 'archived'
		});
		tables.onto_documents.push(doc('doc-foreign', 'Foreign Doc', { project_id: 'project-2' }));

		expect(
			await verify(tables, [archiveDoc('doc-political', 'Archive Political Analysis')])
		).toMatchObject({ ok: false, diagnostic: { code: 'ENTITY_INACTIVE' } });
		expect(await verify(tables, [archiveDoc('doc-missing', 'Archive it')])).toMatchObject({
			ok: false,
			diagnostic: { code: 'ENTITY_NOT_FOUND' }
		});
		expect(
			await verify(tables, [archiveDoc('doc-foreign', 'Archive Foreign Doc')])
		).toMatchObject({ ok: false, diagnostic: { code: 'ENTITY_PROJECT_MISMATCH' } });
	});

	it('fails closed when a descendant in the tree no longer exists', async () => {
		const tables = cleanupTables();
		tables.onto_documents = tables.onto_documents.filter(
			(row) => row.id !== 'doc-rod-valuation'
		);
		const result = await verify(tables, [archiveDoc('doc-rod', 'Archive Rod Chamberlin')]);
		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'ENTITY_NOT_FOUND', entity_id: 'doc-rod-valuation' }
		});
	});

	it('fails closed on unknown arguments and children modes', async () => {
		const extraArg = await verify(cleanupTables(), [
			{
				tool: 'archive_onto_document',
				args: { project_id: projectId, document_id: 'doc-political', delete: true },
				label: 'Archive Political Analysis'
			}
		]);
		expect(extraArg).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });

		const badMode = await verify(cleanupTables(), [
			archiveDoc('doc-political', 'Archive Political Analysis', 'unlink_children')
		]);
		expect(badMode).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('quarantines a label that names a different document', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-political', 'Archive the Book Research document')
		]);
		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'MODEL_ENTITY_MISMATCH', entity_id: 'doc-political' }
		});
	});

	it('adds a caution for each archived document with a live public page', async () => {
		const tables = cleanupTables();
		tables.onto_public_pages = [
			{ document_id: 'doc-rod-valuation', status: 'published', deleted_at: null },
			{ document_id: 'doc-rod-buyers', status: 'unpublished', deleted_at: null },
			{
				document_id: 'doc-rod-plan',
				status: 'published',
				deleted_at: '2026-09-01T00:00:00.000Z'
			}
		];
		const result = await verify(tables, [archiveDoc('doc-rod', 'Archive Rod Chamberlin')]);
		if (!result.ok) throw new Error(result.diagnostic.message);
		expect(result.summary.cautions).toEqual([
			expect.stringContaining('"Rod Valuation Notes" has a live public page')
		]);

		// Promoted children are not archived, so their pages are not at risk.
		const promoted = await verify(tables, [
			archiveDoc('doc-rod', 'Archive Rod Chamberlin', 'promote_children')
		]);
		if (!promoted.ok) throw new Error(promoted.diagnostic.message);
		expect(promoted.summary.cautions).toBeUndefined();
	});

	it('keeps a stable fingerprint that binds the archived ids, the mode and public pages', async () => {
		const operations = [archiveDoc('doc-rod', 'Archive Rod Chamberlin')];
		const first = await verify(cleanupTables(), operations);
		const second = await verify(cleanupTables(), operations);
		if (!first.ok || !second.ok) throw new Error('expected ok');
		const fingerprint = first.summary.structural_fingerprint;
		expect(second.summary.structural_fingerprint).toBe(fingerprint);
		expect(
			await verify(cleanupTables(), operations, {
				expectedStructuralFingerprint: fingerprint
			})
		).toMatchObject({ ok: true });

		// The default mode spelled out is the same change.
		const explicit = await verify(cleanupTables(), [
			archiveDoc('doc-rod', 'Archive Rod Chamberlin', 'archive_children')
		]);
		expect(explicit.ok && explicit.summary.structural_fingerprint).toBe(fingerprint);

		const promoted = await verify(cleanupTables(), [
			archiveDoc('doc-rod', 'Archive Rod Chamberlin', 'promote_children')
		]);
		expect(promoted.ok && promoted.summary.structural_fingerprint).not.toBe(fingerprint);

		// A document filed into the folder after display would be archived unseen.
		const grown = cleanupTables({
			tree: {
				root: [
					{
						id: 'doc-rod',
						children: [
							{ id: 'doc-rod-plan', children: [{ id: 'doc-rod-valuation' }] },
							{ id: 'doc-rod-buyers', children: [] },
							{ id: 'doc-political', children: [] }
						]
					}
				]
			}
		});
		expect(
			await verify(grown, operations, { expectedStructuralFingerprint: fingerprint })
		).toMatchObject({ ok: false, diagnostic: { code: 'EXPECTED_STATE_CHANGED' } });

		const published = cleanupTables();
		published.onto_public_pages = [
			{ document_id: 'doc-rod-plan', status: 'published', deleted_at: null }
		];
		expect(
			await verify(published, operations, { expectedStructuralFingerprint: fingerprint })
		).toMatchObject({ ok: false, diagnostic: { code: 'EXPECTED_STATE_CHANGED' } });
	});
});

describe('archive_onto_task', () => {
	it('archives a live task', async () => {
		const result = await verify(cleanupTables(), [
			archiveTask('task-referral', 'Archive Build referral pipeline')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Archive task "Build referral pipeline".',
				operations: [
					{
						action: 'other',
						actionLabel: 'Archive',
						entityLabel: 'task',
						target: 'Build referral pipeline',
						changes: [{ label: 'Archive', value: 'Build referral pipeline' }]
					}
				]
			}
		});
	});

	it.each([
		['board archive (deleted_at + archived_at)', 'task-done', 'Call Rebecca'],
		['connector archive (archived_at only)', 'task-connector', 'Podcaster outreach']
	])('reports an already archived task (%s) as NO_OP_OPERATION', async (_label, id, title) => {
		const result = await verify(cleanupTables(), [archiveTask(id, `Archive ${title}`)]);
		expect(result).toMatchObject({
			ok: false,
			diagnostic: { code: 'NO_OP_OPERATION', entity_id: id, resolved_entity_title: title }
		});
	});

	it('rejects deleted, cross-project and mislabeled tasks and extra arguments', async () => {
		expect(
			await verify(cleanupTables(), [archiveTask('task-deleted', 'Archive Old draft')])
		).toMatchObject({ ok: false, diagnostic: { code: 'ENTITY_INACTIVE' } });
		expect(
			await verify(cleanupTables(), [archiveTask('task-other', 'Archive Someone else task')])
		).toMatchObject({ ok: false, diagnostic: { code: 'ENTITY_PROJECT_MISMATCH' } });
		expect(
			await verify(cleanupTables(), [
				archiveTask('task-referral', 'Archive Book Biz Expo booth')
			])
		).toMatchObject({ ok: false, diagnostic: { code: 'MODEL_ENTITY_MISMATCH' } });
		expect(
			await verify(cleanupTables(), [
				{
					tool: 'archive_onto_task',
					args: {
						project_id: projectId,
						task_id: 'task-referral',
						delete_linked_events: true
					},
					label: 'Archive Build referral pipeline'
				}
			])
		).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('fingerprints the task state', async () => {
		const operations = [archiveTask('task-referral', 'Archive Build referral pipeline')];
		const first = await verify(cleanupTables(), operations);
		if (!first.ok) throw new Error('expected ok');
		const moved = cleanupTables();
		moved.onto_tasks.find((row) => row.id === 'task-referral')!.state_key = 'in_progress';
		expect(
			await verify(moved, operations, {
				expectedStructuralFingerprint: first.summary.structural_fingerprint
			})
		).toMatchObject({ ok: false, diagnostic: { code: 'EXPECTED_STATE_CHANGED' } });
	});
});

describe('multi-archive headlines', () => {
	it('names up to four archive targets', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-political', 'Archive Political Analysis'),
			archiveDoc('doc-rod-buyers', 'Archive Rod Buyer List'),
			archiveTask('task-expo', 'Archive Book Biz Expo booth')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline:
					'Archive "Political Analysis", "Rod Buyer List", and "Book Biz Expo booth".',
				operation_count: 3
			}
		});
	});

	it('counts documents (subtrees included) and tasks past four targets', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-rod', 'Archive Rod Chamberlin'),
			archiveDoc('doc-political', 'Archive Political Analysis'),
			archiveTask('task-expo', 'Archive Book Biz Expo booth'),
			archiveTask('task-referral', 'Archive Build referral pipeline'),
			archiveTask('task-webinar', 'Archive Host county webinar')
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: { headline: 'Archive 5 documents and 3 tasks.' }
		});
	});

	it('keeps the generic headline for a mix of archives and other changes', async () => {
		const result = await verify(cleanupTables(), [
			archiveDoc('doc-political', 'Archive Political Analysis'),
			projectUpdate({ description: 'Consulting for Maryland creators.' })
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: { headline: 'Apply 2 verified changes.' }
		});
	});
});

describe('update_onto_project', () => {
	it('shows a description rewrite as before and after text', async () => {
		const result = await verify(cleanupTables(), [
			projectUpdate({ description: '  Consulting for Maryland creators.  ' })
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Update the project description.',
				operations: [
					{
						action: 'update',
						entityLabel: 'project',
						target: 'Wayne Strategies',
						changes: [
							{
								label: 'Description',
								format: 'text_edit',
								before: 'Consulting for Maryland businesses.',
								value: 'Consulting for Maryland creators.'
							}
						]
					}
				]
			}
		});
	});

	it('headlines a rename and a type change', async () => {
		expect(
			await verify(cleanupTables(), [projectUpdate({ name: 'Wayne Strategies MD' })])
		).toMatchObject({
			ok: true,
			summary: {
				headline: 'Rename the project to "Wayne Strategies MD".',
				operations: [
					{
						changes: [
							{
								label: 'Name',
								before: 'Wayne Strategies',
								value: 'Wayne Strategies MD'
							}
						]
					}
				]
			}
		});
		expect(
			await verify(cleanupTables(), [projectUpdate({ type_key: 'Project.Business.Agency' })])
		).toMatchObject({
			ok: true,
			summary: {
				headline: 'Change the project type to "project.business.agency".',
				operations: [
					{
						changes: [
							{
								label: 'Type',
								before: 'project.business.consulting',
								value: 'project.business.agency'
							}
						]
					}
				]
			}
		});
		expect(
			await verify(cleanupTables(), [
				projectUpdate({ name: 'Wayne Strategies MD', description: 'New words.' })
			])
		).toMatchObject({
			ok: true,
			summary: { headline: 'Update the project name and description.' }
		});
	});

	it('reports NO_OP_OPERATION when every field already matches', async () => {
		const result = await verify(cleanupTables(), [
			projectUpdate({
				name: 'Wayne Strategies',
				description: 'Consulting for Maryland businesses.',
				type_key: 'project.business.consulting'
			})
		]);
		expect(result).toMatchObject({ ok: false, diagnostic: { code: 'NO_OP_OPERATION' } });
	});

	it('shows only the changed fields when some fields echo the current values', async () => {
		const result = await verify(cleanupTables(), [
			projectUpdate({ name: 'Wayne Strategies', description: 'New words.' })
		]);
		if (!result.ok) throw new Error(result.diagnostic.message);
		expect(result.summary.headline).toBe('Update the project description.');
		expect(result.summary.operations[0]!.changes).toHaveLength(1);
	});

	it.each([
		['a state change', { state_key: 'paused' }],
		['props', { props: { facet_stage: 'late' } }],
		['archiving', { archived: true }],
		['an invalid type_key', { type_key: 'consulting' }],
		['a type_key from another scope', { type_key: 'task.business.consulting' }],
		['an empty name', { name: '   ' }],
		['no fields at all', {}]
	])('fails closed on %s', async (_label, args) => {
		const result = await verify(cleanupTables(), [projectUpdate(args)]);
		expect(result).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('blocks approval when the project changed after display', async () => {
		const operations = [projectUpdate({ description: 'Consulting for Maryland creators.' })];
		const first = await verify(cleanupTables(), operations);
		if (!first.ok) throw new Error('expected ok');
		const fingerprint = first.summary.structural_fingerprint;
		expect(
			await verify(cleanupTables(), operations, {
				expectedStructuralFingerprint: fingerprint
			})
		).toMatchObject({ ok: true });
		expect(
			await verify(
				cleanupTables({ project: { description: 'Edited by DJ meanwhile.' } }),
				operations,
				{ expectedStructuralFingerprint: fingerprint }
			)
		).toMatchObject({ ok: false, diagnostic: { code: 'EXPECTED_STATE_CHANGED' } });
	});
});

describe('update_onto_goal renames', () => {
	function goalOp(args: Record<string, unknown>, label: string): LoopOperation {
		return {
			tool: 'update_onto_goal',
			args: { project_id: projectId, goal_id: 'goal-1', ...args },
			label
		};
	}

	it('shows a rename with before and after values', async () => {
		const result = await verify(cleanupTables(), [
			goalOp(
				{ name: 'Work with local MD creators' },
				'Rename Maryland Content Authority to Work with local MD creators'
			)
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline:
					'Rename goal "Maryland Content Authority" to "Work with local MD creators".',
				operations: [
					{
						entityLabel: 'goal',
						target: 'Maryland Content Authority',
						changes: [
							{
								label: 'Name',
								before: 'Maryland Content Authority',
								value: 'Work with local MD creators'
							}
						]
					}
				]
			}
		});
	});

	it('shows a description rewrite and keeps state changes alongside', async () => {
		const result = await verify(cleanupTables(), [
			goalOp(
				{
					name: 'Work with local MD creators',
					description: 'A side goal: partner with local creators.',
					state_key: 'draft'
				},
				'Retitle Maryland Content Authority as a side goal'
			)
		]);
		expect(result).toMatchObject({
			ok: true,
			summary: {
				headline: 'Update goal "Maryland Content Authority".',
				operations: [
					{
						changes: [
							{ label: 'Name', value: 'Work with local MD creators' },
							{
								label: 'Description',
								format: 'text_edit',
								before: 'Become the go-to voice for Maryland business content.',
								value: 'A side goal: partner with local creators.'
							},
							{ label: 'Status', before: 'Active', value: 'Draft' }
						]
					}
				]
			}
		});
	});

	it('treats a rename to the current name as already done', async () => {
		const result = await verify(cleanupTables(), [
			goalOp({ name: 'Maryland Content Authority' }, 'Rename Maryland Content Authority')
		]);
		expect(result).toMatchObject({ ok: false, diagnostic: { code: 'NO_OP_OPERATION' } });
	});

	it('rejects an empty name', async () => {
		const result = await verify(cleanupTables(), [
			goalOp({ name: '  ' }, 'Rename Maryland Content Authority')
		]);
		expect(result).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_OPERATION' } });
	});

	it('binds the approval fingerprint to the current and proposed name', async () => {
		const operations = [
			goalOp({ name: 'Work with local MD creators' }, 'Rename Maryland Content Authority')
		];
		const first = await verify(cleanupTables(), operations);
		if (!first.ok) throw new Error('expected ok');
		const renamed = cleanupTables();
		renamed.onto_goals[0]!.name = 'Maryland Content Hub';
		expect(
			await verify(renamed, operations, {
				expectedStructuralFingerprint: first.summary.structural_fingerprint
			})
		).toMatchObject({ ok: false, diagnostic: { code: 'EXPECTED_STATE_CHANGED' } });
	});
});

// Captured from the pre-Tasker-112 verifier: goal shapes without a displayed
// rename or description must keep these exact fingerprints.
describe('golden goal fingerprints', () => {
	const goldenTables = () => ({
		onto_projects: [
			{ id: projectId, deleted_at: null, archived_at: null, doc_structure: { root: [] } }
		],
		onto_goals: [
			{
				id: 'goal-1',
				project_id: projectId,
				name: 'Launch the paid beta',
				description: 'Old words',
				state_key: 'active',
				target_date: '2026-10-31T04:00:00.000Z',
				deleted_at: null,
				archived_at: null
			}
		]
	});
	it.each([
		[
			'state only',
			{ state_key: 'achieved' },
			'a0102253761acb69d001cf4a58a0b4615786057d1ecf93c5cdf8ad12a3e6413f'
		],
		[
			'state with a name echo',
			{ state_key: 'achieved', name: 'Launch the paid beta' },
			'a0102253761acb69d001cf4a58a0b4615786057d1ecf93c5cdf8ad12a3e6413f'
		],
		[
			'target date with props',
			{ target_date: '2026-11-30', props: { loop_flag: true } },
			'2889c3d57bbba14576ecf285629cf703286b96402876bc007778f2e350b13410'
		]
	])('%s', async (_label, extra, expected) => {
		const result = await verifyProjectSuggestionIntegrity(createSupabaseMock(goldenTables()), {
			projectId,
			checkModelAlignment: false,
			operations: [
				{
					tool: 'update_onto_goal',
					args: { project_id: projectId, goal_id: 'goal-1', ...extra },
					label: 'x'
				}
			]
		});
		if (!result.ok) throw new Error(result.diagnostic.message);
		expect(result.summary.structural_fingerprint).toBe(expected);
	});
});

describe('decodeLoopOperation for cleanup tools', () => {
	it('labels archives and project updates in the unverified fallback', async () => {
		const { decodeLoopOperation } = await import('./decode-operations');
		expect(decodeLoopOperation(archiveDoc('doc-rod', 'Archive Rod Chamberlin'))).toMatchObject({
			action: 'other',
			actionLabel: 'Archive',
			entityLabel: 'document'
		});
		expect(
			decodeLoopOperation(archiveTask('task-expo', 'Archive Book Biz Expo booth'))
		).toMatchObject({ action: 'other', actionLabel: 'Archive', entityLabel: 'task' });
		expect(decodeLoopOperation(projectUpdate({ name: 'X' }))).toMatchObject({
			action: 'update',
			actionLabel: 'Update',
			entityLabel: 'project'
		});
	});
});
