import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const EDGE_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const project = {
	id: PROJECT_ID,
	name: 'Fixture project',
	owner_actor_id: '66666666-6666-4666-8666-666666666666',
	access_level: 'admin',
	access_role: 'owner'
};

const mocks = vi.hoisted(() => ({
	loadEntityForAccess: vi.fn(),
	loadVisibleProjects: vi.fn(),
	assertVisibleEntityProject: vi.fn(),
	assertProjectWriteAccess: vi.fn(),
	logCreate: vi.fn(async () => undefined),
	logUpdate: vi.fn(async () => undefined)
}));

vi.mock('./op-execution-gateway.entity-access', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.entity-access')>()),
	loadEntityForAccess: mocks.loadEntityForAccess
}));

vi.mock('./op-execution-gateway.access', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.access')>()),
	loadVisibleProjects: mocks.loadVisibleProjects,
	assertVisibleEntityProject: mocks.assertVisibleEntityProject,
	assertProjectWriteAccess: mocks.assertProjectWriteAccess
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: mocks.logCreate,
	logUpdateAsync: mocks.logUpdate
}));

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';

function context(admin: unknown) {
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

function edge(overrides: Record<string, unknown> = {}) {
	return {
		id: EDGE_ID,
		project_id: PROJECT_ID,
		src_kind: 'task',
		src_id: TASK_ID,
		dst_kind: 'goal',
		dst_id: GOAL_ID,
		rel: 'supports_goal',
		props: {},
		created_at: '2026-08-11T00:00:00.000Z',
		...overrides
	};
}

function linkAdmin(existing: Record<string, unknown> | null) {
	const equalityChecks: Array<[string, unknown]> = [];
	const existingQuery: Record<string, any> = {};
	existingQuery.select = vi.fn(() => existingQuery);
	existingQuery.eq = vi.fn((column: string, value: unknown) => {
		equalityChecks.push([column, value]);
		return existingQuery;
	});
	existingQuery.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
	const inserted = edge({ props: { source: 'worker', original_rel: 'helps_with' } });
	const insertQuery: Record<string, any> = {};
	insertQuery.select = vi.fn(() => insertQuery);
	insertQuery.single = vi.fn().mockResolvedValue({ data: inserted, error: null });
	const fromResult = {
		...existingQuery,
		insert: vi.fn(() => insertQuery)
	};
	return {
		admin: { from: vi.fn(() => fromResult) },
		equalityChecks,
		insert: fromResult.insert,
		inserted
	};
}

describe('edge gateway handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadEntityForAccess.mockImplementation(
			async (_context: unknown, kind: string, id: string) => ({
				kind,
				entity: { id, project_id: PROJECT_ID },
				project,
				projectId: PROJECT_ID
			})
		);
		mocks.loadVisibleProjects.mockResolvedValue({
			projects: [project],
			projectMap: new Map([[PROJECT_ID, project]])
		});
		mocks.assertVisibleEntityProject.mockReturnValue(project);
	});

	it('queries the full canonical edge identity before deciding the link already exists', async () => {
		const existing = edge({ props: { existing: true } });
		const fixture = linkAdmin(existing);

		const result = await EXTERNAL_OP_HANDLERS['onto.edge.link'](context(fixture.admin), {
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'goal',
			dst_id: GOAL_ID,
			rel: 'supports_goal',
			props: { ignored_on_existing: true }
		});

		expect(fixture.equalityChecks).toEqual([
			['project_id', PROJECT_ID],
			['src_kind', 'task'],
			['src_id', TASK_ID],
			['dst_kind', 'goal'],
			['dst_id', GOAL_ID],
			['rel', 'supports_goal']
		]);
		expect(fixture.insert).not.toHaveBeenCalled();
		expect(mocks.logCreate).not.toHaveBeenCalled();
		expect(result).toEqual({
			created: 0,
			edge: existing,
			message: 'Entities were already linked.'
		});
	});

	it('normalizes an invented relationship and records the created canonical edge', async () => {
		const fixture = linkAdmin(null);

		const result = await EXTERNAL_OP_HANDLERS['onto.edge.link'](context(fixture.admin), {
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'goal',
			dst_id: GOAL_ID,
			rel: 'Helps With',
			props: { source: 'worker' }
		});

		expect(fixture.insert).toHaveBeenCalledWith({
			project_id: PROJECT_ID,
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'goal',
			dst_id: GOAL_ID,
			rel: 'supports_goal',
			props: { source: 'worker', original_rel: 'helps_with' }
		});
		expect(mocks.logCreate).toHaveBeenCalledOnce();
		expect(result).toEqual({
			created: 1,
			edge: fixture.inserted,
			message: 'Linked entities successfully.'
		});
	});

	it('deletes one exact edge after enforcing its project write scope', async () => {
		const deletedEdge = edge();
		const selectQuery: Record<string, any> = {};
		selectQuery.select = vi.fn(() => selectQuery);
		selectQuery.eq = vi.fn(() => selectQuery);
		selectQuery.maybeSingle = vi.fn().mockResolvedValue({ data: deletedEdge, error: null });
		const deleteEq = vi.fn().mockResolvedValue({ error: null });
		const deleteQuery = { delete: vi.fn(() => ({ eq: deleteEq })) };
		const admin = {
			from: vi.fn().mockReturnValueOnce(selectQuery).mockReturnValueOnce(deleteQuery)
		};

		const result = await EXTERNAL_OP_HANDLERS['onto.edge.unlink'](context(admin), {
			edge_id: EDGE_ID
		});

		expect(mocks.assertVisibleEntityProject).toHaveBeenCalledWith(expect.any(Map), PROJECT_ID);
		expect(mocks.assertProjectWriteAccess).toHaveBeenCalledWith(project, expect.anything());
		expect(deleteQuery.delete).toHaveBeenCalledOnce();
		expect(deleteEq).toHaveBeenCalledWith('id', EDGE_ID);
		expect(mocks.logUpdate).toHaveBeenCalledOnce();
		expect(result).toEqual({
			deleted: true,
			edge_id: EDGE_ID,
			edge: deletedEdge,
			message: 'Unlinked entities successfully.'
		});
	});
});
