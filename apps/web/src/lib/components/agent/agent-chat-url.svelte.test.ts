// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock(
	'$app/state',
	async () => await import('../projects/desktop/__fixtures__/page-state.svelte')
);
vi.mock('$app/navigation', async () => {
	const { page } = await import('../projects/desktop/__fixtures__/page-state.svelte');
	return {
		replaceState: vi.fn((url: string | URL, state: App.PageState) => {
			window.history.replaceState({}, '', url);
			page.state = state;
		})
	};
});

import { replaceState } from '$app/navigation';
import { page } from '../projects/desktop/__fixtures__/page-state.svelte';
import {
	buildChatResumeUrl,
	claimChatUrl,
	getChatUrlSessionId,
	releaseChatUrl,
	suspendChatUrlSync,
	syncChatUrl
} from './agent-chat-url.svelte';

describe('chat URL ownership', () => {
	beforeEach(() => {
		window.history.replaceState({}, '', '/projects?filter=active#tasks');
		page.state = {
			desktopCard: 'project',
			desktopDepth: 2,
			desktopPeek: { kind: 'task', id: 'task' }
		};
		vi.clearAllMocks();
	});
	afterEach(() => {
		for (const id of ['embedded', 'global', 'other']) releaseChatUrl(id);
	});

	it('hands the URL back in claim order and removes it after the last release', () => {
		claimChatUrl('embedded', 'session-1');
		claimChatUrl('global', 'session-2');
		expect(getChatUrlSessionId()).toBe('session-2');
		expect(new URL(window.location.href).searchParams.get('chat')).toBe('session-2');
		releaseChatUrl('global');
		expect(new URL(window.location.href).searchParams.get('chat')).toBe('session-1');
		releaseChatUrl('embedded');
		expect(new URL(window.location.href).searchParams.has('chat')).toBe(false);
	});

	it('refreshes an existing claim without retaining an obsolete session', () => {
		claimChatUrl('embedded', 'old');
		claimChatUrl('global', 'global');
		claimChatUrl('embedded', 'new');
		expect(getChatUrlSessionId()).toBe('new');
		releaseChatUrl('embedded');
		expect(getChatUrlSessionId()).toBe('global');
	});

	it('leaves the URL untouched when a non-owner releases', () => {
		claimChatUrl('embedded', 'session-1');
		claimChatUrl('global', 'session-2');
		vi.mocked(replaceState).mockClear();
		releaseChatUrl('embedded');
		releaseChatUrl('other');
		expect(replaceState).not.toHaveBeenCalled();
		expect(getChatUrlSessionId()).toBe('session-2');
	});

	it('preserves other parameters, the hash and every desktop state key', () => {
		const state = { ...page.state };
		claimChatUrl('global', 'session-1');
		expect(window.location.search).toBe('?filter=active&chat=session-1');
		expect(window.location.hash).toBe('#tasks');
		expect(page.state).toEqual(state);
		releaseChatUrl('global');
		expect(window.location.search).toBe('?filter=active');
		expect(page.state).toEqual(state);
	});

	it('preserves an incoming link until its navigation has finished', () => {
		const resume = suspendChatUrlSync();
		claimChatUrl('global', 'old');
		expect(window.location.search).toBe('?filter=active');
		releaseChatUrl('global');
		claimChatUrl('other', 'new');
		resume();
		resume();
		expect(getChatUrlSessionId()).toBe('new');
		expect(new URL(window.location.href).searchParams.get('chat')).toBe('new');
	});

	it('uses the browser URL when syncing after a page change', () => {
		claimChatUrl('global', 'session-1');
		window.history.replaceState({}, '', '/today?view=week#agenda');
		syncChatUrl();
		expect(window.location.pathname + window.location.search + window.location.hash).toBe(
			'/today?view=week&chat=session-1#agenda'
		);
	});

	it.each([
		'https://build-os.com/today?view=week#agenda',
		'https://build-os.com/today?view=week&chat=old#agenda'
	])('builds a resume URL without mutating %s', (value) => {
		const base = new URL(value);
		expect(buildChatResumeUrl(base, 'session-1')).toBe(
			'https://build-os.com/today?view=week&chat=session-1#agenda'
		);
		expect(base.href).toBe(value);
	});
});
