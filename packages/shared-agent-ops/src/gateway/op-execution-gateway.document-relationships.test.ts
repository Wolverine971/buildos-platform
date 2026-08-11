import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const EDGE_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';

const project = {
	id: PROJECT_ID,
	name: 'Fixture project',
	owner_actor_id: '77777777-7777-4777-8777-777777777777',
	access_level: 'admin',
	access_role: 'owner'
};

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-1'),
	loadVisibleProjects: vi.fn(),
	assertAccessibleProject: vi.fn(),
	assertProjectWriteAccess: vi.fn(),
	loadCoreEntityForAccess: vi.fn(),
	createEdge: vi.fn(),
	moveDocument: vi.fn(),
	logCreate: vi.fn(async () => undefined),
	logUpdate: vi.fn(async () => undefined)
}));

vi.mock('../ontology/ontology-projects.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('../ontology/ontology-projects.service')>()),
	ensureActorId: mocks.ensureActorId
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: mocks.logCreate,
	logUpdateAsync: mocks.logUpdate
}));

vi.mock('../ontology/doc-structure.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('../ontology/doc-structure.service')>()),
	moveDocument: mocks.moveDocument
}));

vi.mock('./op-execution-gateway.access', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.access')>()),
	loadVisibleProjects: mocks.loadVisibleProjects,
	assertAccessibleProject: mocks.assertAccessibleProject,
	assertProjectWriteAccess: mocks.assertProjectWriteAccess
}));

vi.mock('./op-execution-gateway.entity-access', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.entity-access')>()),
	loadCoreEntityForAccess: mocks.loadCoreEntityForAccess
}));

vi.mock('./op-execution-gateway.edges', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.edges')>()),
	createEdge: mocks.createEdge
}));

vi.mock('./op-execution-gateway.serializers', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.serializers')>()),
	serializeExternalEntity: vi.fn(
		(_kind: string, entity: Record<string, unknown>, projectName: string) => ({
			...entity,
			project_name: projectName
		})
	)
}));

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';

function context(admin: unknown = {}) {
	return {
		admin,
		userId: USER_ID,
		scope: {
			mode: 'read_write',
			allowed_ops: [],
			project_ids: [PROJECT_ID],
			write_project_ids: [PROJECT_ID]
		}
	} as never;
}

function moveAdmin() {
	let lookup = 0;
	return {
		from: vi.fn(() => {
			const builder = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				is: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => {
					lookup += 1;
					return {
						data: {
							id: lookup === 1 ? DOCUMENT_ID : PARENT_ID,
							project_id: PROJECT_ID
						},
						error: null
					};
				})
			};
			return builder;
		})
	};
}

describe('document relationship gateway handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadVisibleProjects.mockResolvedValue({
			projects: [project],
			projectMap: new Map([[PROJECT_ID, project]])
		});
		mocks.assertAccessibleProject.mockReturnValue(project);
		mocks.moveDocument.mockResolvedValue({
			version: 4,
			root: [
				{
					id: PARENT_ID,
					order: 0,
					children: [{ id: DOCUMENT_ID, order: 0 }]
				}
			]
		});
		mocks.loadCoreEntityForAccess.mockImplementation(
			async (_context: unknown, kind: string) => ({
				kind,
				entity:
					kind === 'task'
						? { id: TASK_ID, project_id: PROJECT_ID, title: 'Ship beta' }
						: {
								id: DOCUMENT_ID,
								project_id: PROJECT_ID,
								title: 'Launch notes',
								props: {}
							},
				project,
				projectId: PROJECT_ID
			})
		);
		mocks.createEdge.mockResolvedValue({
			created: 1,
			edge: {
				id: EDGE_ID,
				project_id: PROJECT_ID,
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'document',
				dst_id: DOCUMENT_ID,
				rel: 'task_has_document',
				props: { role: 'primary' }
			},
			project
		});
	});

	it('moves an exact document UUID through the canonical tree service', async () => {
		const admin = moveAdmin();
		const result = await EXTERNAL_OP_HANDLERS['onto.document.tree.move'](context(admin), {
			project_id: PROJECT_ID,
			document_id: DOCUMENT_ID,
			new_parent_id: PARENT_ID,
			new_position: 0
		});

		expect(mocks.moveDocument).toHaveBeenCalledWith(
			admin,
			PROJECT_ID,
			DOCUMENT_ID,
			{ newParentId: PARENT_ID, newPosition: 0 },
			'actor-1'
		);
		expect(mocks.logUpdate).toHaveBeenCalledOnce();
		expect(result).toEqual({
			project_id: PROJECT_ID,
			document_id: DOCUMENT_ID,
			structure: {
				version: 4,
				root: [
					{
						id: PARENT_ID,
						order: 0,
						children: [{ id: DOCUMENT_ID, order: 0 }]
					}
				]
			},
			message: `Moved document ${DOCUMENT_ID} in doc structure.`
		});
	});

	it('classifies an unlinked exact parent as a pre-commit validation failure', async () => {
		mocks.moveDocument.mockRejectedValueOnce(
			new Error('Parent document is not linked in the document tree.')
		);

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.tree.move'](context(moveAdmin()), {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				new_parent_id: PARENT_ID,
				new_position: 0
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: 'Parent document is not linked in the document tree.'
		});
		expect(mocks.logUpdate).not.toHaveBeenCalled();
	});

	it('attaches an existing document without entering the document-create branch', async () => {
		const result = await EXTERNAL_OP_HANDLERS['onto.task.docs.create_or_attach'](context(), {
			task_id: TASK_ID,
			document_id: DOCUMENT_ID,
			role: ' primary '
		});

		expect(mocks.loadCoreEntityForAccess).toHaveBeenNthCalledWith(
			1,
			expect.anything(),
			'task',
			TASK_ID,
			'write'
		);
		expect(mocks.loadCoreEntityForAccess).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			'document',
			DOCUMENT_ID,
			'write'
		);
		expect(mocks.createEdge).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'document',
				dst_id: DOCUMENT_ID,
				rel: 'task_has_document',
				props: expect.objectContaining({ role: 'primary', origin_task_id: TASK_ID })
			}),
			project
		);
		expect(result).toMatchObject({
			document: {
				id: DOCUMENT_ID,
				project_id: PROJECT_ID,
				title: 'Launch notes',
				project_name: 'Fixture project'
			},
			edge: expect.objectContaining({ id: EDGE_ID, rel: 'task_has_document' }),
			message: 'Linked document "Launch notes" to task.'
		});
	});
});
