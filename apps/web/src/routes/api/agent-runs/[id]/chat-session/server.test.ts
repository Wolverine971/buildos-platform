// apps/web/src/routes/api/agent-runs/[id]/chat-session/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAgentRunChatSession: vi.fn()
}));

vi.mock('$lib/server/agent-run-chat-session.service', () => ({
	createAgentRunChatSession: mocks.createAgentRunChatSession
}));

import { POST } from './+server';

const USER_ID = 'user-1';

function createSupabaseMock(run: Record<string, unknown> | null, error: unknown = null) {
	return {
		from: vi.fn(() => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({ data: run, error }))
			};
			return builder;
		})
	};
}

function makeLocals(supabase: unknown, user: { id: string } | null = { id: USER_ID }) {
	return {
		supabase,
		safeGetSession: vi.fn(async () => ({ user }))
	};
}

describe('POST /api/agent-runs/[id]/chat-session', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAgentRunChatSession.mockResolvedValue({
			created: false,
			seeded: true,
			chat_session_id: 'chat-session-1',
			session: { id: 'chat-session-1', context_type: 'project', entity_id: 'project-1' },
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
	});

	it('requires authentication', async () => {
		const response = await POST({
			params: { id: 'run-1' },
			locals: makeLocals(createSupabaseMock(null), null)
		} as any);

		expect(response.status).toBe(401);
		expect(mocks.createAgentRunChatSession).not.toHaveBeenCalled();
	});

	it('returns not found when the run is missing or not owned by the user', async () => {
		const response = await POST({
			params: { id: 'run-1' },
			locals: makeLocals(createSupabaseMock(null))
		} as any);

		expect(response.status).toBe(404);
		expect(mocks.createAgentRunChatSession).not.toHaveBeenCalled();
	});

	it('opens a shared chat session for an owned run', async () => {
		const run = {
			id: 'run-1',
			user_id: USER_ID,
			status: 'proposal_ready',
			context_type: 'project',
			project_id: 'project-1'
		};
		const response = await POST({
			params: { id: 'run-1' },
			locals: makeLocals(createSupabaseMock(run))
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.chat_session_id).toBe('chat-session-1');
		expect(mocks.createAgentRunChatSession).toHaveBeenCalledWith({
			supabase: expect.any(Object),
			run,
			userId: USER_ID,
			origin: 'agent_run_context'
		});
	});

	it('returns 201 when the shared service creates a new session', async () => {
		mocks.createAgentRunChatSession.mockResolvedValueOnce({
			created: true,
			seeded: true,
			chat_session_id: 'new-session',
			session: { id: 'new-session', context_type: 'global', entity_id: null },
			context_type: 'global',
			entity_id: null,
			project_id: null
		});

		const response = await POST({
			params: { id: 'run-1' },
			locals: makeLocals(createSupabaseMock({ id: 'run-1', user_id: USER_ID }))
		} as any);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.data.chat_session_id).toBe('new-session');
	});
});
