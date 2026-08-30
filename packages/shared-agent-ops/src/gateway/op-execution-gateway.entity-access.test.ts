// packages/shared-agent-ops/src/gateway/op-execution-gateway.entity-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	assertProjectWriteAccess: vi.fn(),
	assertVisibleEntityProject: vi.fn(),
	loadVisibleProjects: vi.fn()
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId
}));

vi.mock('./op-execution-gateway.access', () => ({
	assertProjectWriteAccess: mocks.assertProjectWriteAccess,
	assertVisibleEntityProject: mocks.assertVisibleEntityProject,
	loadVisibleProjects: mocks.loadVisibleProjects
}));

import { loadCoreEntityForAccess } from './op-execution-gateway.entity-access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

const archivedProject = {
	id: PROJECT_ID,
	name: 'Archived project',
	description: null,
	type_key: 'project.default',
	state_key: 'paused',
	props: {},
	created_by: ACTOR_ID,
	created_at: '2026-07-01T00:00:00.000Z',
	updated_at: '2026-07-02T00:00:00.000Z',
	archived_at: '2026-07-03T00:00:00.000Z',
	deleted_at: null
};

function createAdmin() {
	const filters: Array<[string, unknown]> = [];
	const builder = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		is: vi.fn((column: string, value: unknown) => {
			filters.push([column, value]);
			return builder;
		}),
		not: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => ({ data: archivedProject, error: null }))
	};
	return {
		admin: { from: vi.fn(() => builder) },
		filters
	};
}

function context(projectIds: string[]) {
	const { admin, filters } = createAdmin();
	return {
		context: {
			admin,
			userId: 'user-1',
			scope: {
				mode: 'read_write',
				project_ids: projectIds,
				write_project_ids: projectIds
			}
		} as never,
		filters
	};
}

describe('project fallback access fencing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureActorId.mockResolvedValue(ACTOR_ID);
		mocks.loadVisibleProjects.mockResolvedValue({ projects: [], projectMap: new Map() });
		mocks.assertVisibleEntityProject.mockImplementation(() => {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Project not found');
		});
	});

	it('does not widen an explicit project scope through the archived-project fallback', async () => {
		const { context: executionContext } = context([OTHER_PROJECT_ID]);

		await expect(
			loadCoreEntityForAccess(executionContext, 'project', PROJECT_ID, 'write', {
				includeArchived: true
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });

		expect(mocks.ensureActorId).not.toHaveBeenCalled();
		expect(mocks.assertProjectWriteAccess).not.toHaveBeenCalled();
	});

	it('allows an in-scope archived project while retaining the soft-delete fence', async () => {
		const { context: executionContext, filters } = context([PROJECT_ID]);

		const result = await loadCoreEntityForAccess(
			executionContext,
			'project',
			PROJECT_ID,
			'write',
			{ includeArchived: true }
		);

		expect(filters).toContainEqual(['deleted_at', null]);
		expect(result.project.id).toBe(PROJECT_ID);
		expect(result.project.access_role).toBe('owner');
		expect(mocks.assertProjectWriteAccess).toHaveBeenCalledOnce();
	});
});
