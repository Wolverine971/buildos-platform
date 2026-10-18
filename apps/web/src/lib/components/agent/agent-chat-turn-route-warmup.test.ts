// apps/web/src/lib/components/agent/agent-chat-turn-route-warmup.test.ts
//
// S12: opening the chat boots the turn-admission function so the first send
// does not pay its cold start. The GET is fire-and-forget and rate-limited per tab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	resetAgentChatTurnRouteWarmupForTests,
	warmAgentChatStreamTransport,
	warmAgentChatTurnRoute
} from './agent-chat-session';

const WARM_URL = '/api/agent/v2/turns?warm=1';

function warmCalls(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.filter(([url]) => String(url) === WARM_URL);
}

describe('turn route warm-up', () => {
	beforeEach(() => {
		resetAgentChatTurnRouteWarmupForTests();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('chat open sends one GET to the turn route without waiting on it', async () => {
		// Never settles: the warm-up must not hold up the open path.
		const fetchMock = vi.fn((url: string) =>
			url === WARM_URL ? new Promise(() => {}) : Promise.resolve({ ok: true })
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(warmAgentChatStreamTransport()).resolves.toEqual(expect.any(Boolean));

		expect(warmCalls(fetchMock)).toEqual([
			[
				WARM_URL,
				expect.objectContaining({
					method: 'GET',
					cache: 'no-store',
					credentials: 'same-origin'
				})
			]
		]);
	});

	it('skips a re-warm inside the reuse window and warms again after it', () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
		vi.stubGlobal('fetch', fetchMock);

		expect(warmAgentChatTurnRoute({ nowMs: 1_000_000 })).toBe(true);
		expect(warmAgentChatTurnRoute({ nowMs: 1_000_000 + 59_999 })).toBe(false);
		expect(warmAgentChatTurnRoute({ nowMs: 1_000_000 + 60_000 })).toBe(true);
		expect(warmCalls(fetchMock)).toHaveLength(2);
	});

	it('a warm-up that never landed lets the next open try again', async () => {
		const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('closed', 'AbortError'));
		fetchMock.mockResolvedValue({ ok: true, status: 204 });
		vi.stubGlobal('fetch', fetchMock);

		expect(warmAgentChatTurnRoute({ nowMs: 1_000 })).toBe(true);
		await Promise.resolve();
		await Promise.resolve();
		expect(warmAgentChatTurnRoute({ nowMs: 2_000 })).toBe(true);
		expect(warmCalls(fetchMock)).toHaveLength(2);
	});

	it('does nothing once the open is already cancelled, and never throws', () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();
		controller.abort();

		expect(warmAgentChatTurnRoute({ signal: controller.signal })).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();

		vi.stubGlobal(
			'fetch',
			vi.fn(() => {
				throw new TypeError('fetch unavailable');
			})
		);
		expect(warmAgentChatTurnRoute()).toBe(false);
	});
});
