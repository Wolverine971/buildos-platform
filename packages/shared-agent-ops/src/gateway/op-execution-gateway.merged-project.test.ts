// packages/shared-agent-ops/src/gateway/op-execution-gateway.merged-project.test.ts
//
// Tasker 122: a project combined into another is archived and points at its
// destination. Gateway calls aimed at it (MCP connectors, worker writes) are
// refused and say where it went, without revealing projects the user can't see.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DEST_ID = '22222222-2222-4222-8222-222222222222';
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
	buildAllowedProjectSet,
	explainMergedProjectRefusal,
	PROJECT_MERGED_INTO_ANOTHER,
	ProjectOutsideScopeError
} from './op-execution-gateway.access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { runGatewayWriteOp } from './op-execution-gateway.worker';

function project(id: string, name: string) {
	return {
		id,
		name,
		description: null,
		type_key: 'project.generic',
		state_key: 'active',
		updated_at: '2026-10-17T00:00:00.000Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false
	} as never;
}

/** The archived source is never in the summaries (they skip archived projects). */
const visibleProjects = [project(DEST_ID, 'DJ Internal')];

function admin(answer: unknown | Error) {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn !== 'get_project_route_redirect') throw new Error(`unexpected rpc ${fn}`);
			if (answer instanceof Error) throw answer;
			return { data: answer, error: null };
		})
	};
}

function context(adminClient: unknown, projectIds?: string[]) {
	return {
		admin: adminClient,
		userId: USER_ID,
		scope: { mode: 'read_write', ...(projectIds ? { project_ids: projectIds } : {}) }
	} as never;
}

function outsideScope(projectId: string): ExternalToolGatewayError {
	try {
		assertAccessibleProject(
			buildAllowedProjectSet({ mode: 'read_write' }, visibleProjects),
			projectId
		);
	} catch (error) {
		if (error instanceof ExternalToolGatewayError) return error;
		throw error;
	}
	throw new Error('Expected a refusal');
}

describe('writes into a combined project', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchProjectSummaries.mockResolvedValue(visibleProjects);
	});

	it('keeps the plain refusal shape for a project outside the visible set', () => {
		const error = outsideScope(SOURCE_ID);
		expect(error).toBeInstanceOf(ProjectOutsideScopeError);
		expect(error.code).toBe('FORBIDDEN');
		expect(error.message).toBe('Project is outside the allowed call scope');
		expect(error.details).toBeUndefined();
	});

	it('names the destination when the source was combined into a project the caller can use', async () => {
		const client = admin({ status: 'merged', destination_project_id: DEST_ID });
		const explained = await explainMergedProjectRefusal(
			context(client),
			outsideScope(SOURCE_ID)
		);
		expect(explained.code).toBe('FORBIDDEN');
		expect(explained.message).toContain('combined into "DJ Internal"');
		expect(explained.message).toContain(DEST_ID);
		expect(explained.details).toEqual({
			reason: PROJECT_MERGED_INTO_ANOTHER,
			project_id: SOURCE_ID,
			destination_project_id: DEST_ID,
			destination_project_name: 'DJ Internal'
		});
		expect(client.rpc).toHaveBeenCalledWith('get_project_route_redirect', {
			p_project_id: SOURCE_ID,
			p_actor_id: 'actor-1'
		});
	});

	it('never names a destination outside the connector grant', async () => {
		const client = admin({ status: 'merged', destination_project_id: DEST_ID });
		const explained = await explainMergedProjectRefusal(
			context(client, [STRANGER_ID]),
			outsideScope(SOURCE_ID)
		);
		expect(explained.message).toContain('not available to this connector');
		expect(JSON.stringify(explained)).not.toContain('DJ Internal');
		expect(explained.details).toMatchObject({
			reason: PROJECT_MERGED_INTO_ANOTHER,
			destination_project_id: DEST_ID
		});
	});

	it.each([
		['not merged', null],
		['the RPC failing', new Error('network')],
		['a malformed answer', { status: 'merged', destination_project_id: 'nope' }]
	])('keeps the plain refusal on %s', async (_, answer) => {
		const original = outsideScope(STRANGER_ID);
		expect(await explainMergedProjectRefusal(context(admin(answer)), original)).toBe(original);
	});

	it('passes every other error through without a lookup', async () => {
		const client = admin({ status: 'merged', destination_project_id: DEST_ID });
		const other = new ExternalToolGatewayError('VALIDATION_ERROR', 'title is required');
		expect(await explainMergedProjectRefusal(context(client), other)).toBe(other);
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it('refuses a worker task create aimed at the combined source, pointing at the destination', async () => {
		const client = admin({ status: 'merged', destination_project_id: DEST_ID });
		const result = await runGatewayWriteOp({
			admin: client as never,
			userId: USER_ID,
			scope: { mode: 'read_write' } as never,
			op: 'onto.task.create',
			args: { project_id: SOURCE_ID, title: 'Draft the follow-up' }
		});
		expect(result.ok).toBe(false);
		expect(result.error).toMatchObject({
			code: 'FORBIDDEN',
			details: { reason: PROJECT_MERGED_INTO_ANOTHER, destination_project_id: DEST_ID }
		});
		expect(result.error?.message).toContain('DJ Internal');
	});
});
