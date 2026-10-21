// apps/web/src/lib/components/agent/agent-chat-history.svelte.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
	before: [] as Array<(navigation: { complete: Promise<void> }) => void>,
	after: [] as Array<(navigation: { type: string }) => void>
}));
// Mirrors SvelteKit: every entry carries `sveltekit:history`; a push gets a new value,
// a replace keeps the current one.
const entry = vi.hoisted(() => ({ index: 1 }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/state', async () => await import('./__fixtures__/chat-history-state.svelte'));
vi.mock('$app/navigation', async () => {
	const { page } = await import('./__fixtures__/chat-history-state.svelte');
	return {
		beforeNavigate: (callback: (navigation: { complete: Promise<void> }) => void) =>
			hooks.before.push(callback),
		afterNavigate: (callback: (navigation: { type: string }) => void) =>
			hooks.after.push(callback),
		pushState: vi.fn((url: string | URL, state: App.PageState) => {
			page.state = state;
			entry.index += 1;
			window.history.replaceState(
				{ 'sveltekit:history': entry.index },
				'',
				url || window.location.href
			);
		}),
		replaceState: vi.fn((url: string | URL, state: App.PageState) => {
			page.state = state;
			window.history.replaceState(
				{ 'sveltekit:history': entry.index },
				'',
				url || window.location.href
			);
		})
	};
});

import { pushState, replaceState } from '$app/navigation';
import { page, navigating } from './__fixtures__/chat-history-state.svelte';
import ChatHistoryHarness from './__fixtures__/ChatHistoryHarness.svelte';
import { waitForChatHistorySettled } from './agent-chat-history.svelte';
import { getChatUrlSessionId, suspendChatUrlSync } from './agent-chat-url.svelte';

async function flush() {
	await tick();
	await Promise.resolve();
	await tick();
}
function pop(state: App.PageState = {}, url = '/today') {
	entry.index -= 1;
	window.history.replaceState({ 'sveltekit:history': entry.index }, '', url);
	page.state = state;
	window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('chat shallow history', () => {
	let base: App.PageState;
	beforeEach(() => {
		hooks.before.length = 0;
		hooks.after.length = 0;
		base = {};
		page.state = {};
		navigating.to = null;
		entry.index = 1;
		window.history.replaceState({ 'sveltekit:history': entry.index }, '', '/today');
		vi.clearAllMocks();
		vi.spyOn(history, 'back').mockImplementation(() => {
			queueMicrotask(() => pop(base));
		});
	});
	afterEach(async () => {
		cleanup();
		await flush();
		await waitForChatHistorySettled();
		vi.restoreAllMocks();
	});

	it('pushes once when opened and only replaces as messages/session become available', async () => {
		const component = render(ChatHistoryHarness);
		await flush();
		expect(pushState).toHaveBeenCalledOnce();
		expect(window.location.search).toBe('');
		await component.rerender({ sessionId: 'session-1' });
		await flush();
		expect(window.location.search).toBe('?chat=session-1');
		await component.rerender({ sessionId: 'session-1' });
		expect(pushState).toHaveBeenCalledOnce();
	});

	it('Back calls the normal close path once without another Back', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		pop();
		await flush();
		expect(onBack).toHaveBeenCalledOnce();
		expect(history.back).not.toHaveBeenCalled();
		expect(window.location.search).toBe('');
	});

	it('X pops its entry and suppresses the resulting Back callback', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		await fireEvent.click(screen.getByText('Close chat'));
		await flush();
		expect(history.back).toHaveBeenCalledOnce();
		expect(onBack).not.toHaveBeenCalled();
		expect(page.state.agentChat).toBeUndefined();
		expect(window.location.search).toBe('');
	});

	it('minimize pops once without closing again, and resume adds one new entry', async () => {
		const onBack = vi.fn();
		const component = render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		await fireEvent.click(screen.getByText('Close chat'));
		await component.rerender({ visible: false });
		await flush();
		expect(onBack).not.toHaveBeenCalled();
		expect(history.back).toHaveBeenCalledOnce();
		await component.rerender({ visible: true });
		await flush();
		expect(pushState).toHaveBeenCalledTimes(2);
		expect(window.location.search).toBe('?chat=session-1');
	});

	it('marks a new page without adding history; X strips instead of popping', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		hooks.before.forEach((callback) => callback({ complete: Promise.resolve() }));
		navigating.to = { url: new URL('https://build-os.com/projects') };
		window.history.replaceState({}, '', '/projects?filter=active');
		page.state = { desktopCard: 'project' };
		await flush();
		hooks.after.forEach((callback) => callback({ type: 'link' }));
		navigating.to = null;
		await flush();
		expect(page.state).toEqual({
			desktopCard: 'project',
			agentChat: 'chat',
			agentChatPushed: undefined
		});
		expect(onBack).not.toHaveBeenCalled();
		expect(window.location.search).toBe('?filter=active&chat=session-1');
		await fireEvent.click(screen.getByText('Close chat'));
		await flush();
		expect(history.back).not.toHaveBeenCalled();
		expect(window.location.search).toBe('?filter=active');
		expect(page.state.desktopCard).toBe('project');
	});

	it('preserves the original pushed entry when Back walks between pages', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		const original = { ...page.state };
		hooks.before.forEach((callback) => callback({ complete: Promise.resolve() }));
		page.state = original;
		hooks.after.forEach((callback) => callback({ type: 'popstate' }));
		await flush();
		expect(page.state.agentChatPushed).toBe(true);
		expect(onBack).not.toHaveBeenCalled();
		pop();
		await flush();
		expect(onBack).toHaveBeenCalledOnce();
	});

	it('does not pop while a navigation is in flight', async () => {
		const component = render(ChatHistoryHarness, { sessionId: 'session-1' });
		await flush();
		navigating.to = { url: new URL('https://build-os.com/projects') };
		await component.rerender({ visible: false });
		await flush();
		expect(history.back).not.toHaveBeenCalled();
		expect(getChatUrlSessionId()).toBeNull();
	});

	it('resumes Back handling after a cancelled navigation', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		const complete = Promise.reject(new Error('navigation cancelled'));
		hooks.before.forEach((callback) => callback({ complete }));
		await flush();
		pop();
		await flush();
		expect(onBack).toHaveBeenCalledOnce();
	});

	it('does not auto-close or restore the old URL while an incoming link is being cleaned', async () => {
		const onBack = vi.fn();
		const component = render(ChatHistoryHarness, { sessionId: 'old', onBack });
		await flush();
		const resume = suspendChatUrlSync();
		hooks.before.forEach((callback) => callback({ complete: Promise.resolve() }));
		page.state = {};
		window.history.replaceState({}, '', '/projects');
		hooks.after.forEach((callback) => callback({ type: 'goto' }));
		await flush();
		expect(onBack).not.toHaveBeenCalled();
		expect(window.location.search).toBe('');
		component.unmount();
		resume();
		await flush();
		expect(history.back).not.toHaveBeenCalled();
	});

	it('X runs the host close only after its Back step lands', async () => {
		// Hold the Back until the test releases it, as a real browser does.
		let land: () => void = () => {};
		vi.spyOn(history, 'back').mockImplementation(() => {
			land = () => pop(base);
		});
		const onClosed = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onClosed });
		await flush();
		await fireEvent.click(screen.getByText('Close chat'));
		await flush();
		// A host goto/invalidate started now would be cancelled by the coming popstate.
		expect(onClosed).not.toHaveBeenCalled();
		land();
		await flush();
		expect(onClosed).toHaveBeenCalledOnce();
		await waitForChatHistorySettled();
	});

	it('runs the host close right away when there is no Back step to wait for', async () => {
		const onClosed = vi.fn();
		render(ChatHistoryHarness, { embedded: true, sessionId: 'session-1', onClosed });
		await flush();
		await fireEvent.click(screen.getByText('Close chat'));
		expect(onClosed).toHaveBeenCalledOnce();
		expect(history.back).not.toHaveBeenCalled();
	});

	it('a page rewriting its URL without the chat marker is not Back', async () => {
		const onBack = vi.fn();
		render(ChatHistoryHarness, { sessionId: 'session-1', onBack });
		await flush();
		// e.g. /briefs: replaceState(url, {}) on the same entry after a data refresh.
		replaceState('/today?date=2026-10-20', {});
		await flush();
		expect(onBack).not.toHaveBeenCalled();
		expect(page.state.agentChat).toBe('chat');
		expect(page.state.agentChatPushed).toBe(true);
		expect(window.location.search).toBe('?date=2026-10-20&chat=session-1');
		// Real Back still closes.
		pop();
		await flush();
		expect(onBack).toHaveBeenCalledOnce();
	});

	it('a replacing navigation keeps the Back step the chat pushed', async () => {
		render(ChatHistoryHarness, { sessionId: 'session-1' });
		await flush();
		hooks.before.forEach((callback) => callback({ complete: new Promise(() => {}) }));
		// goto(..., { replaceState: true }): same entry, new URL and state.
		window.history.replaceState({ 'sveltekit:history': entry.index }, '', '/today?tab=2');
		page.state = {};
		await flush();
		hooks.after.forEach((callback) => callback({ type: 'goto' }));
		await flush();
		expect(page.state.agentChatPushed).toBe(true);
		await fireEvent.click(screen.getByText('Close chat'));
		await flush();
		expect(history.back).toHaveBeenCalledOnce();
	});

	it('embedded surfaces claim/release the URL without adding history', async () => {
		const component = render(ChatHistoryHarness, { embedded: true, sessionId: 'session-1' });
		await flush();
		expect(pushState).not.toHaveBeenCalled();
		expect(window.location.search).toBe('?chat=session-1');
		await component.rerender({ visible: false });
		await flush();
		expect(window.location.search).toBe('');
		expect(history.back).not.toHaveBeenCalled();
	});

	it('returns to the desktop card entry before the card collapses its own depth', async () => {
		base = {
			desktopCard: 'project',
			desktopDepth: 2,
			desktopPeek: { kind: 'task', id: 'task' },
			desktopPeekPushed: true
		};
		page.state = { ...base };
		render(ChatHistoryHarness, { sessionId: 'session-1' });
		await flush();
		expect(page.state.desktopDepth).toBe(2);
		await fireEvent.click(screen.getByText('Close chat'));
		await flush();
		expect(page.state).toEqual(base);
		const go = vi.spyOn(history, 'go').mockImplementation(() => {});
		// ProjectDesktop.closeCard uses this exact depth, unaffected by the chat.
		history.go(-(page.state.desktopDepth ?? 1));
		expect(go).toHaveBeenCalledWith(-2);
		expect(history.back).toHaveBeenCalledOnce();
	});
});
