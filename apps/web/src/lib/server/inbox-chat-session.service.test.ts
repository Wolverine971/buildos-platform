// apps/web/src/lib/server/inbox-chat-session.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAgentRunChatSession: vi.fn()
}));

vi.mock('./agent-run-chat-session.service', () => ({
	createAgentRunChatSession: mocks.createAgentRunChatSession
}));

import { createInboxChatSession } from './inbox-chat-session.service';

const USER_ID = 'user-1';

function createSupabaseMock(sourcePayload: Record<string, unknown> | null) {
	return {
		from: vi.fn((table: string) => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({
					data: table === 'agent_runs' ? sourcePayload : null,
					error: null
				}))
			};
			return builder;
		})
	};
}

describe('createInboxChatSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAgentRunChatSession.mockResolvedValue({
			created: false,
			seeded: true,
			session: { id: 'shared-session', context_type: 'project', entity_id: 'project-1' },
			chat_session_id: 'shared-session',
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
	});

	it('delegates agent_run inbox items to the shared agent-run chat service', async () => {
		const run = {
			id: 'run-1',
			user_id: USER_ID,
			status: 'proposal_ready',
			project_id: 'project-1',
			context_type: 'project'
		};
		const item = {
			id: 'inbox-1',
			source_type: 'agent_run' as const,
			source_ref_id: 'run-1',
			source_status: 'proposal_ready',
			user_id: USER_ID,
			project_id: 'project-1',
			audience: 'user' as const,
			status: 'pending' as const,
			title: 'Update project START HERE',
			summary: 'Review proposed Start Here updates.',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-06-29T12:00:00.000Z',
			updated_at: '2026-06-29T12:00:00.000Z',
			decided_at: null,
			blocked_reason: null,
			snoozed_until: null,
			expires_at: null
		};
		const supabase = createSupabaseMock(run);

		const result = await createInboxChatSession({
			supabase,
			item,
			userId: USER_ID
		});

		expect(result).toMatchObject({
			created: false,
			chat_session_id: 'shared-session',
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1',
			item,
			source_payload: run
		});
		expect(mocks.createAgentRunChatSession).toHaveBeenCalledWith({
			supabase,
			run,
			userId: USER_ID,
			origin: 'ai_inbox',
			inbox: {
				id: 'inbox-1',
				title: 'Update project START HERE',
				summary: 'Review proposed Start Here updates.',
				source_status: 'proposal_ready',
				project_id: 'project-1'
			}
		});
	});
});
