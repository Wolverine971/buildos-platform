import { beforeEach, describe, expect, it, vi } from 'vitest';

const GRANTED_ID = '11111111-1111-4111-8111-111111111111';
const NEW_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-1'),
	fetchProjectSummaries: vi.fn()
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

import {
	assertAccessibleProject,
	assertVisibleEntityProject,
	buildAllowedProjectSet,
	loadVisibleProjects,
	PROJECT_NOT_GRANTED_TO_CONNECTOR
} from './op-execution-gateway.access';
import { listProjects, searchProjects } from './op-execution-gateway.projects';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

function project(id: string, name: string, state_key = 'active') {
	return {
		id,
		name,
		description: `${name} description`,
		type_key: 'project.generic',
		state_key,
		updated_at: '2026-09-22T00:00:00.000Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false
	} as never;
}

const userProjects = [project(GRANTED_ID, 'Granted'), project(NEW_PROJECT_ID, 'Book project')];

function captureError(run: () => unknown): ExternalToolGatewayError {
	try {
		run();
	} catch (error) {
		if (error instanceof ExternalToolGatewayError) return error;
		throw error;
	}
	throw new Error('Expected an ExternalToolGatewayError');
}

function connectorContext(projectIds?: string[]) {
	return {
		admin: {},
		userId: USER_ID,
		callerId: '55555555-5555-4555-8555-555555555555',
		scope: {
			mode: 'read_only',
			...(projectIds ? { project_ids: projectIds } : {})
		}
	} as never;
}

describe('connector project scope denials', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchProjectSummaries.mockResolvedValue(userProjects);
	});

	it('tells the agent to ask for a grant when the user owns the ungranted project', () => {
		const projectMap = buildAllowedProjectSet(
			{ mode: 'read_only', project_ids: [GRANTED_ID] },
			userProjects
		);

		const error = captureError(() => assertAccessibleProject(projectMap, NEW_PROJECT_ID));
		expect(error.code).toBe('FORBIDDEN');
		expect(error.message).toContain('has not been granted access');
		expect(error.details).toEqual({
			reason: PROJECT_NOT_GRANTED_TO_CONNECTOR,
			project_id: NEW_PROJECT_ID
		});
		// Never leaks the name of the project the connector cannot see.
		expect(JSON.stringify(error.details)).not.toContain('Book project');
	});

	it('keeps the old dead-end message for projects the user cannot see', () => {
		const projectMap = buildAllowedProjectSet(
			{ mode: 'read_only', project_ids: [GRANTED_ID] },
			userProjects
		);

		const error = captureError(() => assertAccessibleProject(projectMap, STRANGER_ID));
		expect(error.code).toBe('FORBIDDEN');
		expect(error.message).toBe('Project is outside the allowed call scope');
		expect(error.details).toBeUndefined();
	});

	it('gives entity denials the same grant reason for ungranted owned projects', () => {
		const projectMap = buildAllowedProjectSet(
			{ mode: 'read_only', project_ids: [GRANTED_ID] },
			userProjects
		);

		expect(
			captureError(() => assertVisibleEntityProject(projectMap, NEW_PROJECT_ID)).details
		).toMatchObject({ reason: PROJECT_NOT_GRANTED_TO_CONNECTOR });
		expect(
			captureError(() => assertVisibleEntityProject(projectMap, STRANGER_ID)).message
		).toBe('Entity is outside the allowed call scope');
	});

	it('treats an unscoped caller as having everything the user can see', () => {
		const projectMap = buildAllowedProjectSet({ mode: 'read_only' }, userProjects);
		expect(assertAccessibleProject(projectMap, NEW_PROJECT_ID).id).toBe(NEW_PROJECT_ID);
		expect(projectMap.ungrantedProjectIds.size).toBe(0);
	});

	it('counts ungranted projects when loading the visible set', async () => {
		const visible = await loadVisibleProjects(connectorContext([GRANTED_ID]));
		expect(visible.projects.map((entry) => entry.id)).toEqual([GRANTED_ID]);
		expect(visible.ungrantedProjectCount).toBe(1);
	});

	it('adds a count-only connector_scope note to project list and search', async () => {
		const listed = await listProjects(connectorContext([GRANTED_ID]), {});
		expect(listed.connector_scope).toMatchObject({
			reason: PROJECT_NOT_GRANTED_TO_CONNECTOR,
			ungranted_project_count: 1
		});
		expect(JSON.stringify(listed.connector_scope)).not.toContain('Book project');

		const searched = await searchProjects(connectorContext([GRANTED_ID]), {
			query: 'book'
		});
		expect(searched.total).toBe(0);
		expect(searched.connector_scope).toMatchObject({ ungranted_project_count: 1 });
	});

	it('omits the note when nothing is hidden from the connector', async () => {
		const listed = await listProjects(connectorContext(), {});
		expect(listed.total).toBe(2);
		expect(listed).not.toHaveProperty('connector_scope');
	});
});
