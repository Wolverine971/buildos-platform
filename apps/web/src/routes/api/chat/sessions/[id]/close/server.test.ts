import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({ classify: vi.fn(), snapshot: vi.fn() }));
vi.mock('$lib/server/chat-classification.service', () => ({
	queueChatSessionClassification: mocks.classify
}));
vi.mock('$lib/server/project-context-snapshot.service', () => ({
	queueProjectContextSnapshot: mocks.snapshot
}));

const projectId = '170ad75c-cef6-4a4d-b927-6e4f81775408';
function close({ activity = true, accessible = true, context = 'project' } = {}) {
	const from = vi.fn((table: string) => {
		const data =
			table === 'chat_sessions'
				? {
						id: 'session',
						user_id: 'user',
						message_count: activity ? 1 : 0,
						context_type: context,
						entity_id: projectId
					}
				: table === 'chat_messages'
					? []
					: accessible
						? { id: projectId }
						: null;
		const query = {
			select: vi.fn(),
			eq: vi.fn(),
			order: vi.fn(),
			limit: vi.fn(),
			single: vi.fn(),
			maybeSingle: vi.fn()
		};
		for (const name of ['select', 'eq', 'order'] as const) query[name].mockReturnValue(query);
		for (const name of ['single', 'maybeSingle', 'limit'] as const)
			query[name].mockResolvedValue({ data, error: null });
		return query;
	});
	return POST({
		params: { id: 'session' },
		request: new Request('http://localhost/api/chat/sessions/session/close', {
			method: 'POST',
			body: '{}'
		}),
		locals: { supabase: { from }, safeGetSession: async () => ({ user: { id: 'user' } }) }
	} as unknown as Parameters<typeof POST>[0]);
}

describe('chat-close project freshness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.classify.mockResolvedValue({ queued: true });
		mocks.snapshot.mockResolvedValue({ queued: true });
	});
	it('queues a forced project refresh even when classification fails', async () => {
		mocks.classify.mockRejectedValue(new Error('classification unavailable'));
		const response = await close();
		expect(response.status).toBe(200);
		expect(mocks.snapshot).toHaveBeenCalledWith({
			projectId,
			userId: 'user',
			force: true,
			reason: 'chat_session_close',
			revisionKey: 'close-session-unknown'
		});
		expect((await response.json()).data.snapshotQueued).toBe(true);
	});
	it.each([{ activity: false }, { accessible: false }, { context: 'global' }])(
		'does not queue an irrelevant or inaccessible project: %j',
		async (options) => {
			await close(options);
			expect(mocks.snapshot).not.toHaveBeenCalled();
		}
	);
});
