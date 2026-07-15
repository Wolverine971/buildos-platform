// apps/web/src/routes/api/onto/tasks/[id]/move/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	logUpdateAsync: vi.fn(async () => undefined),
	queueProjectLoopBurstAsync: vi.fn(),
	shouldSkipProjectLoopBurst: vi.fn(() => false),
	captureServerEvent: vi.fn(async () => undefined)
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	getChangeSourceFromRequest: vi.fn(() => 'chat'),
	getChatSessionIdFromRequest: vi.fn(() => 'chat-session-1'),
	logUpdateAsync: mocks.logUpdateAsync
}));

vi.mock('$lib/server/project-loop-burst.service', () => ({
	queueProjectLoopBurstAsync: mocks.queueProjectLoopBurstAsync,
	shouldSkipProjectLoopBurst: mocks.shouldSkipProjectLoopBurst
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

const TASK_ID = 'd32bb5db-fc5a-4970-a341-88473ac7abdd';
const SOURCE_ID = '2dcdb7d3-e1c5-4619-8d2a-6e733dae71cf';
const DESTINATION_ID = '31021625-1377-4715-9fb4-f93102974628';

function request(body: Record<string, unknown>) {
	return new Request(`http://localhost/api/onto/tasks/${TASK_ID}/move`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-Change-Source': 'chat' },
		body: JSON.stringify(body)
	});
}

function locals(rpcResult: { data?: unknown; error?: unknown }) {
	return {
		safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
		supabase: {
			rpc: vi
				.fn()
				.mockResolvedValue({ data: rpcResult.data ?? null, error: rpcResult.error ?? null })
		}
	};
}

describe('POST /api/onto/tasks/[id]/move', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldSkipProjectLoopBurst.mockReturnValue(false);
	});

	it('returns an impact preview without emitting mutation side effects', async () => {
		const { POST } = await import('./+server');
		const routeLocals = locals({
			data: {
				status: 'confirmation_required',
				requires_user_action: true,
				confirmation_token: 'preview-token',
				task: {
					id: TASK_ID,
					title: 'Move me',
					project_id: SOURCE_ID,
					description: 'Large task body that should not enter tool context',
					props: { internal: 'large' }
				},
				source_project: { id: SOURCE_ID, name: 'Source' },
				destination_project: { id: DESTINATION_ID, name: 'Destination' },
				impact: { relationships_to_detach: 1 }
			}
		});

		const response = await POST({
			params: { id: TASK_ID },
			request: request({
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID
			}),
			locals: routeLocals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			confirmation_token: 'preview-token'
		});
		expect(payload.data.task).not.toHaveProperty('description');
		expect(payload.data.task).not.toHaveProperty('props');
		expect(mocks.logUpdateAsync).not.toHaveBeenCalled();
		expect(mocks.queueProjectLoopBurstAsync).not.toHaveBeenCalled();
		expect(mocks.captureServerEvent).not.toHaveBeenCalled();
	});

	it('records both project sides after the atomic move succeeds', async () => {
		const { POST } = await import('./+server');
		const routeLocals = locals({
			data: {
				status: 'moved',
				requires_user_action: false,
				task: {
					id: TASK_ID,
					title: 'Move me',
					project_id: DESTINATION_ID,
					description: 'Large task body that should not enter tool context',
					props: { migrated: true }
				},
				task_before: {
					id: TASK_ID,
					title: 'Move me',
					project_id: SOURCE_ID,
					props: { goal_id: 'old-goal' }
				},
				source_project: { id: SOURCE_ID, name: 'Source' },
				destination_project: { id: DESTINATION_ID, name: 'Destination' },
				applied: { relationships_detached: 0 }
			}
		});

		const response = await POST({
			params: { id: TASK_ID },
			request: request({
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID
			}),
			locals: routeLocals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).not.toHaveProperty('task_before');
		expect(payload.data.task).not.toHaveProperty('description');
		expect(payload.data.task).not.toHaveProperty('props');
		expect(routeLocals.supabase.rpc).toHaveBeenCalledWith('onto_task_move_atomic', {
			p_task_id: TASK_ID,
			p_expected_source_project_id: SOURCE_ID,
			p_destination_project_id: DESTINATION_ID,
			p_confirmation_token: null
		});
		expect(mocks.logUpdateAsync).toHaveBeenCalledTimes(2);
		expect(mocks.logUpdateAsync.mock.calls[0]?.[4]).toMatchObject({
			project_id: SOURCE_ID,
			props: { goal_id: 'old-goal' }
		});
		expect(mocks.queueProjectLoopBurstAsync).toHaveBeenCalledTimes(2);
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'task_moved',
			expect.objectContaining({ task_id: TASK_ID })
		);
	});

	it('does not enqueue burst loops when the caller suppresses them', async () => {
		mocks.shouldSkipProjectLoopBurst.mockReturnValue(true);
		const { POST } = await import('./+server');
		const routeRequest = request({
			expected_source_project_id: SOURCE_ID,
			destination_project_id: DESTINATION_ID
		});
		const routeLocals = locals({
			data: {
				status: 'moved',
				requires_user_action: false,
				task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID },
				source_project: { id: SOURCE_ID, name: 'Source' },
				destination_project: { id: DESTINATION_ID, name: 'Destination' }
			}
		});

		const response = await POST({
			params: { id: TASK_ID },
			request: routeRequest,
			locals: routeLocals
		} as any);

		expect(response.status).toBe(200);
		expect(mocks.shouldSkipProjectLoopBurst).toHaveBeenCalledWith(routeRequest);
		expect(mocks.queueProjectLoopBurstAsync).not.toHaveBeenCalled();
		expect(mocks.logUpdateAsync).toHaveBeenCalledTimes(2);
	});

	it('maps dual-project authorization failures to forbidden', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			params: { id: TASK_ID },
			request: request({
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID
			}),
			locals: locals({ error: { message: 'task_move_access_denied', code: '42501' } })
		} as any);

		expect(response.status).toBe(403);
	});

	it('maps archived destinations and concurrent impact changes to conflicts', async () => {
		const { POST } = await import('./+server');
		for (const message of ['task_move_destination_archived', 'task_move_impact_changed']) {
			const response = await POST({
				params: { id: TASK_ID },
				request: request({
					expected_source_project_id: SOURCE_ID,
					destination_project_id: DESTINATION_ID
				}),
				locals: locals({ error: { message, code: 'P0001' } })
			} as any);

			expect(response.status).toBe(409);
		}
	});

	it('rejects an unexpected RPC status instead of treating it as success', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			params: { id: TASK_ID },
			request: request({
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID
			}),
			locals: locals({ data: { status: 'mystery', requires_user_action: false } })
		} as any);

		expect(response.status).toBe(500);
	});
});
