// apps/web/src/lib/components/agent/load-agent-chat-modal.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./AgentChatModal.svelte', () => ({ default: 'AgentChatModalStub' }));

type IdleWindow = Omit<Window, 'requestIdleCallback' | 'cancelIdleCallback'> & {
	requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
	cancelIdleCallback?: (handle: number) => void;
};

describe('load-agent-chat-modal', () => {
	afterEach(() => {
		delete (window as IdleWindow).requestIdleCallback;
		delete (window as IdleWindow).cancelIdleCallback;
		vi.resetModules();
	});

	it('memoizes the chunk promise across launch surfaces', async () => {
		const { loadAgentChatModal } = await import('./load-agent-chat-modal');
		const first = loadAgentChatModal();
		expect(loadAgentChatModal()).toBe(first);
		expect((await first).default).toBe('AgentChatModalStub');
	});

	it('schedules the idle preload and lets the caller cancel it', async () => {
		const idleWindow = window as IdleWindow;
		idleWindow.requestIdleCallback = vi.fn(() => 7);
		idleWindow.cancelIdleCallback = vi.fn();
		const { preloadAgentChatModal } = await import('./load-agent-chat-modal');

		const cancel = preloadAgentChatModal();
		expect(idleWindow.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
			timeout: 3500
		});

		cancel();
		expect(idleWindow.cancelIdleCallback).toHaveBeenCalledWith(7);
	});

	it('falls back to a timeout when requestIdleCallback is unavailable', async () => {
		const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
		const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
		const { preloadAgentChatModal } = await import('./load-agent-chat-modal');

		const cancel = preloadAgentChatModal();
		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2500);

		cancel();
		expect(clearTimeoutSpy).toHaveBeenCalled();
		setTimeoutSpy.mockRestore();
		clearTimeoutSpy.mockRestore();
	});
});
