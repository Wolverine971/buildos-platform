// apps/web/src/lib/voice/voice-note-sink.cleanup.test.ts
// @vitest-environment jsdom
//
// Old unattached voice drafts are cleared in the background. That was one request per page
// load; the drafts it clears are a day old, so twice a day per browser is plenty.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanup = vi.fn(async () => ({ deletedGroupIds: [], deletedVoiceNotes: 0 }));
vi.mock('$lib/services/voice-note-groups.service', async (original) => ({
	...(await original<typeof import('$lib/services/voice-note-groups.service')>()),
	cleanupVoiceNoteGroups: cleanup
}));

/** A fresh page load: the module's once-per-load flag starts over, storage stays. */
async function pageLoad() {
	vi.resetModules();
	const { scheduleVoiceDraftCleanup } = await import('./voice-note-sink');
	scheduleVoiceDraftCleanup();
	await vi.advanceTimersByTimeAsync(2000);
}

describe('scheduleVoiceDraftCleanup', () => {
	beforeEach(() => {
		localStorage.clear();
		cleanup.mockClear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-20T09:00:00.000Z'));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('asks once, then not again until half a day has passed', async () => {
		await pageLoad();
		expect(cleanup).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date('2026-11-20T15:00:00.000Z'));
		await pageLoad();
		await pageLoad();
		expect(cleanup).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date('2026-11-20T21:30:00.000Z'));
		await pageLoad();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});

	it('asks again on the next load when the cleanup failed', async () => {
		cleanup.mockRejectedValueOnce(new Error('offline'));
		await pageLoad();
		await pageLoad();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});
});
