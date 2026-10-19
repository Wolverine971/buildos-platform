import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatSessionLoadError, loadChatSessionWithStatus } from './agent-chat-session-load';
import { buildAgentChatSessionSnapshot } from './agent-chat-session';

vi.mock('./agent-chat-session', () => ({
	buildAgentChatSessionSnapshot: vi.fn((payload) => payload)
}));

describe('status-preserving chat restore', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('uses the shared snapshot builder and passes cancellation to its single fetch', async () => {
		const data = { session: { id: 'session' }, messages: [] };
		const fetchMock = vi.fn(async () => Response.json({ success: true, data }));
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();
		expect(await loadChatSessionWithStatus('session', { signal: controller.signal })).toEqual(
			data
		);
		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			'/api/chat/sessions/session?includeVoiceNotes=1',
			{
				cache: 'no-store',
				signal: controller.signal
			}
		);
		expect(buildAgentChatSessionSnapshot).toHaveBeenCalledWith(data);
	});

	it.each([403, 404, 500])(
		'carries HTTP %s without guessing from error prose',
		async (status) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({ success: false, error: 'Unavailable' }, { status })
				)
			);
			await expect(loadChatSessionWithStatus('session')).rejects.toMatchObject({
				status,
				message: 'Unavailable'
			});
			expect(buildAgentChatSessionSnapshot).not.toHaveBeenCalled();
		}
	);

	it('preserves network errors as ordinary errors', async () => {
		const error = new TypeError('Failed to fetch');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw error;
			})
		);
		await expect(loadChatSessionWithStatus('session')).rejects.toBe(error);
		expect(error).not.toBeInstanceOf(ChatSessionLoadError);
	});
});
