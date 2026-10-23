// packages/shared-agent-ops/src/gateway/op-execution-gateway.guest-lane.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR = 'actor-sam';
const OTHER_ACTOR = 'actor-dj';
const MINE = 'project-mine';
const THEIRS = 'project-theirs';
const CALLER = 'caller-1';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-sam'),
	fetchProjectSummaries: vi.fn()
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

import {
	applyGuestAgentLane,
	GUEST_AGENT_DAILY_WRITE_LIMIT,
	GUEST_LANE_REASON
} from './op-execution-gateway.guest-lane';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

function summary(id: string, isShared: boolean, accessLevel: 'read' | 'write' | 'admin') {
	return {
		id,
		name: isShared ? '9takes' : 'My project',
		is_shared: isShared,
		access_level: accessLevel,
		owner_actor_id: isShared ? OTHER_ACTOR : ACTOR
	};
}

type Rows = {
	tasks?: Record<string, { id: string; project_id: string; created_by: string }>;
	documents?: Record<string, { id: string; project_id: string; created_by: string }>;
	assignees?: Array<{ task_id: string; assignee_actor_id: string }>;
	agentAccess?: string | null;
	/** The owner's standing approval: every editor's agents can write. */
	editorAgentsWrite?: boolean;
	recentLogs?: number;
};

/** A tiny chainable fake that answers the handful of queries the lane makes. */
function fakeAdmin(rows: Rows) {
	const inserted: Array<{ table: string; row: unknown }> = [];
	const from = (table: string) => {
		const filters: Record<string, unknown> = {};
		const builder: any = {
			select: () => builder,
			eq: (column: string, value: unknown) => {
				filters[column] = value;
				return builder;
			},
			is: () => builder,
			in: () => builder,
			gte: () => builder,
			contains: () => builder,
			limit: () => builder,
			maybeSingle: async () => {
				if (table === 'onto_tasks')
					return { data: rows.tasks?.[String(filters.id)] ?? null, error: null };
				if (table === 'onto_documents')
					return { data: rows.documents?.[String(filters.id)] ?? null, error: null };
				if (table === 'onto_project_members')
					return {
						data:
							rows.agentAccess === null
								? null
								: { agent_access: rows.agentAccess ?? 'read' },
						error: null
					};
				if (table === 'onto_actors') return { data: { user_id: 'user-dj' }, error: null };
				if (table === 'users') return { data: { name: 'Sam' }, error: null };
				return { data: null, error: null };
			},
			insert: async (row: unknown) => {
				inserted.push({ table, row });
				return { error: null };
			},
			then: (resolve: (value: unknown) => void) => {
				if (table === 'onto_task_assignees') {
					const data = (rows.assignees ?? []).filter(
						(row) =>
							row.task_id === filters.task_id &&
							row.assignee_actor_id === filters.assignee_actor_id
					);
					return resolve({ data, error: null });
				}
				if (table === 'onto_project_logs')
					return resolve({ count: rows.recentLogs ?? 0, error: null });
				if (table === 'onto_project_members')
					return resolve({
						data:
							rows.agentAccess === null
								? []
								: [
										{
											project_id: THEIRS,
											role_key: 'editor',
											access: 'write',
											agent_access: rows.agentAccess ?? 'read'
										}
									],
						error: null
					});
				if (table === 'project_agent_settings')
					return resolve({
						data: rows.editorAgentsWrite
							? [{ project_id: THEIRS, editor_agents_write: true }]
							: [],
						error: null
					});
				if (table === 'user_notifications') return resolve({ data: [], error: null });
				return resolve({ data: [], error: null });
			}
		};
		return builder;
	};
	return { admin: { from }, inserted };
}

const baseScope = { mode: 'read_write' as const, write_project_ids: [MINE, THEIRS] };

async function run(op: string, args: Record<string, unknown>, rows: Rows, scope = baseScope) {
	const { admin, inserted } = fakeAdmin(rows);
	const result = await applyGuestAgentLane({
		admin,
		userId: 'user-sam',
		callerId: CALLER,
		op,
		args,
		scope
	});
	return { result, inserted };
}

async function refusal(op: string, args: Record<string, unknown>, rows: Rows) {
	try {
		await run(op, args, rows);
	} catch (error) {
		expect(error).toBeInstanceOf(ExternalToolGatewayError);
		return (error as ExternalToolGatewayError).details?.reason;
	}
	throw new Error('expected a refusal');
}

describe('guest-agent lane', () => {
	beforeEach(() => {
		mocks.fetchProjectSummaries.mockResolvedValue([
			summary(MINE, false, 'admin'),
			summary(THEIRS, true, 'write')
		]);
	});

	it('leaves scope alone when nothing is shared with the user', async () => {
		mocks.fetchProjectSummaries.mockResolvedValue([summary(MINE, false, 'admin')]);
		const { result } = await run('onto.goal.update', { goal_id: 'g1' }, {});
		expect(result.write_project_ids).toEqual([MINE, THEIRS]);
	});

	it('drops shared projects for any op outside the lane, so handlers refuse them', async () => {
		const { result } = await run('onto.goal.update', { goal_id: 'g1' }, {});
		expect(result.write_project_ids).toEqual([MINE]);
		const project = await run('onto.project.update', { project_id: THEIRS }, {});
		expect(project.result.write_project_ids).toEqual([MINE]);
	});

	it("keeps the user's own projects writable for lane ops", async () => {
		const { result } = await run('onto.task.create', { project_id: MINE }, {});
		expect(result.write_project_ids).toEqual([MINE]);
	});

	it('lets the agent add a task or document in a shared project when agents can write', async () => {
		for (const op of ['onto.task.create', 'onto.document.create']) {
			const { result } = await run(op, { project_id: THEIRS }, { agentAccess: 'write' });
			expect(result.write_project_ids).toEqual([MINE, THEIRS]);
		}
	});

	it("refuses when the owner set this member's agents to read", async () => {
		expect(
			await refusal('onto.task.create', { project_id: THEIRS }, { agentAccess: 'read' })
		).toBe(GUEST_LANE_REASON.agentWriteOff);
	});

	it("lets editors' agents write when the owner's standing approval is on", async () => {
		const { result } = await run(
			'onto.task.create',
			{ project_id: THEIRS },
			{ agentAccess: 'read', editorAgentsWrite: true }
		);
		expect(result.write_project_ids).toContain(THEIRS);
		// The owner turning this person's agents off still wins.
		expect(
			await refusal(
				'onto.task.create',
				{ project_id: THEIRS },
				{ agentAccess: 'off', editorAgentsWrite: true }
			)
		).toBe(GUEST_LANE_REASON.agentWriteOff);
	});

	it('marks archive refusals so the agent can say so', async () => {
		const { admin } = fakeAdmin({
			agentAccess: 'write',
			tasks: { t1: { id: 't1', project_id: THEIRS, created_by: ACTOR } }
		});
		await expect(
			applyGuestAgentLane({
				admin,
				userId: 'user-sam',
				callerId: CALLER,
				op: 'onto.task.update',
				args: { task_id: 't1', archived: true },
				scope: baseScope
			})
		).rejects.toMatchObject({
			details: { reason: GUEST_LANE_REASON.outsideLane, action: 'archive' }
		});
	});

	it('lets the agent change a task the person created', async () => {
		const { result } = await run(
			'onto.task.update',
			{ task_id: 't1' },
			{
				agentAccess: 'write',
				tasks: { t1: { id: 't1', project_id: THEIRS, created_by: ACTOR } }
			}
		);
		expect(result.write_project_ids).toContain(THEIRS);
	});

	it('lets the agent change a task assigned to the person', async () => {
		const { result } = await run(
			'onto.task.update',
			{ task_id: 't2' },
			{
				agentAccess: 'write',
				tasks: { t2: { id: 't2', project_id: THEIRS, created_by: OTHER_ACTOR } },
				assignees: [{ task_id: 't2', assignee_actor_id: ACTOR }]
			}
		);
		expect(result.write_project_ids).toContain(THEIRS);
	});

	it("refuses to change the owner's task or document", async () => {
		expect(
			await refusal(
				'onto.task.update',
				{ task_id: 't3' },
				{
					agentAccess: 'write',
					tasks: { t3: { id: 't3', project_id: THEIRS, created_by: OTHER_ACTOR } }
				}
			)
		).toBe(GUEST_LANE_REASON.outsideLane);
		expect(
			await refusal(
				'onto.document.update',
				{ document_id: 'd1' },
				{
					agentAccess: 'write',
					documents: { d1: { id: 'd1', project_id: THEIRS, created_by: OTHER_ACTOR } }
				}
			)
		).toBe(GUEST_LANE_REASON.outsideLane);
	});

	it("refuses attaching the owner's document to the person's own task", async () => {
		expect(
			await refusal(
				'onto.task.docs.create_or_attach',
				{ task_id: 't1', document_id: 'd1' },
				{
					agentAccess: 'write',
					tasks: { t1: { id: 't1', project_id: THEIRS, created_by: ACTOR } },
					documents: { d1: { id: 'd1', project_id: THEIRS, created_by: OTHER_ACTOR } }
				}
			)
		).toBe(GUEST_LANE_REASON.outsideLane);
	});

	it('pauses changes after the daily limit and tells the owner once', async () => {
		const rows: Rows = { agentAccess: 'write', recentLogs: GUEST_AGENT_DAILY_WRITE_LIMIT };
		const { admin, inserted } = fakeAdmin(rows);
		await expect(
			applyGuestAgentLane({
				admin,
				userId: 'user-sam',
				callerId: CALLER,
				op: 'onto.task.create',
				args: { project_id: THEIRS },
				scope: baseScope
			})
		).rejects.toMatchObject({ details: { reason: GUEST_LANE_REASON.dailyLimit } });
		expect(inserted).toHaveLength(1);
		expect(inserted[0]).toMatchObject({
			table: 'user_notifications',
			row: { user_id: 'user-dj', event_type: 'agent.guest_lane.paused' }
		});
	});

	it('never adds a shared project the call scope did not already allow', async () => {
		const { result } = await run(
			'onto.task.create',
			{ project_id: THEIRS },
			{ agentAccess: 'write' },
			{ mode: 'read_write', write_project_ids: [MINE] }
		);
		expect(result.write_project_ids).toEqual([MINE]);
	});
});
