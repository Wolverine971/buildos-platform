// apps/web/src/lib/utils/launch-draft-stash.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildDraftLaunchPath,
	LAUNCH_PREVIEW_CHARS,
	stashLaunchDraft,
	takeLaunchDraft
} from './launch-draft-stash';
import { readAgentChatLaunchRequest } from '$lib/components/layout/agent-chat-launch-params';

function launchFromPath(path: string) {
	return readAgentChatLaunchRequest(new URL(path, 'https://build-os.com'));
}

afterEach(() => {
	localStorage.clear();
	vi.useRealTimers();
});

describe('buildDraftLaunchPath', () => {
	it('carries a short draft whole in the URL with nothing stashed', () => {
		const path = buildDraftLaunchPath('  Plan my book launch  ');
		expect(launchFromPath(path)).toMatchObject({
			draft: 'Plan my book launch',
			stashId: null
		});
		expect(localStorage.length).toBe(0);
	});

	it('stashes a long paste and puts a preview plus its id in the URL', () => {
		const paste = `${'notes '.repeat(400)}end`;
		const launch = launchFromPath(buildDraftLaunchPath(paste));
		expect(launch?.draft.length).toBeLessThanOrEqual(LAUNCH_PREVIEW_CHARS + 3);
		expect(launch?.stashId).toMatch(/^[a-z0-9]{16}$/);
		expect(takeLaunchDraft(launch!.stashId!)).toBe(paste);
	});

	it('keeps the encoded signup redirect under the Google state cap', () => {
		const path = buildDraftLaunchPath('ünïcode & spaces\n'.repeat(500));
		expect(path.length).toBeLessThan(2000);
	});
});

describe('takeLaunchDraft', () => {
	it('hands the draft over once', () => {
		const id = stashLaunchDraft('my notes')!;
		expect(takeLaunchDraft(id)).toBe('my notes');
		expect(takeLaunchDraft(id)).toBeNull();
	});

	it('ignores another id and leaves the stash in place', () => {
		const id = stashLaunchDraft('my notes')!;
		expect(takeLaunchDraft('zzzzzzzzzzzzzzzz')).toBeNull();
		expect(takeLaunchDraft(id)).toBe('my notes');
	});

	it('drops a draft older than a day', () => {
		vi.useFakeTimers();
		const id = stashLaunchDraft('old notes')!;
		vi.advanceTimersByTime(25 * 60 * 60 * 1000);
		expect(takeLaunchDraft(id)).toBeNull();
	});
});
