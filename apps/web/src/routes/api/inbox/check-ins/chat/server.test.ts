// apps/web/src/routes/api/inbox/check-ins/chat/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createCheckInChatSession: vi.fn(),
	requireProjectMemberAccess: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/server/inbox-check-ins.service', () => {
	class CheckInChatError extends Error {
		constructor(
			readonly status: number,
			readonly code: string,
			message: string
		) {
			super(message);
		}
	}
	return { CheckInChatError, createCheckInChatSession: mocks.createCheckInChatSession };
});

import { POST } from './+server';
import { CheckInChatError } from '$lib/server/inbox-check-ins.service';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeEvent(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
	const url = 'http://localhost/api/inbox/check-ins/chat';
	return {
		url: new URL(url),
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			supabase: { from: vi.fn() },
			safeGetSession: vi.fn(async () => ({ user }))
		}
	} as any;
}

describe('POST /api/inbox/check-ins/chat', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-1'
		});
	});

	it('checks write access and opens an assistant-first project chat', async () => {
		mocks.createCheckInChatSession.mockResolvedValue({
			chat_session_id: 'session-1',
			context_type: 'project',
			entity_id: PROJECT_ID,
			created: true
		});
		const event = makeEvent({
			project_id: PROJECT_ID,
			task_ids: [TASK_A, TASK_B, TASK_A],
			tz: 'America/New_York'
		});

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.data).toEqual({
			chat_session_id: 'session-1',
			context_type: 'project',
			entity_id: PROJECT_ID,
			created: true
		});
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: PROJECT_ID, requiredAccess: 'write' })
		);
		expect(mocks.createCheckInChatSession).toHaveBeenCalledWith({
			supabase: event.locals.supabase,
			userId: 'user-1',
			projectId: PROJECT_ID,
			taskIds: [TASK_A, TASK_B],
			timeZone: 'America/New_York'
		});
	});

	it('returns 200 when it reopens an existing chat', async () => {
		mocks.createCheckInChatSession.mockResolvedValue({
			chat_session_id: 'existing',
			context_type: 'project',
			entity_id: PROJECT_ID,
			created: false
		});
		const response = await POST(makeEvent({ project_id: PROJECT_ID, task_ids: [TASK_A] }));
		expect(response.status).toBe(200);
	});

	it('validates the project and task ids', async () => {
		expect((await POST(makeEvent({ project_id: 'nope', task_ids: [TASK_A] }))).status).toBe(
			400
		);
		expect((await POST(makeEvent({ project_id: PROJECT_ID, task_ids: [] }))).status).toBe(400);
		expect(
			(await POST(makeEvent({ project_id: PROJECT_ID, task_ids: [TASK_A, 'bad'] }))).status
		).toBe(400);
		expect(mocks.createCheckInChatSession).not.toHaveBeenCalled();
	});

	it('stops at the access check', async () => {
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ success: false }), { status: 403 })
		});
		const response = await POST(makeEvent({ project_id: PROJECT_ID, task_ids: [TASK_A] }));
		expect(response.status).toBe(403);
		expect(mocks.createCheckInChatSession).not.toHaveBeenCalled();
	});

	it('maps a check-in refusal to its status', async () => {
		mocks.createCheckInChatSession.mockRejectedValue(
			new CheckInChatError(409, 'NOTHING_OPEN', 'These tasks are already answered')
		);
		const response = await POST(makeEvent({ project_id: PROJECT_ID, task_ids: [TASK_A] }));
		const json = await response.json();
		expect(response.status).toBe(409);
		expect(json.error).toBe('These tasks are already answered');
	});

	it('requires a session', async () => {
		const response = await POST(
			makeEvent({ project_id: PROJECT_ID, task_ids: [TASK_A] }, null)
		);
		expect(response.status).toBe(401);
	});
});
