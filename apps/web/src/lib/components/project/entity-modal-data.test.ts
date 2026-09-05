// apps/web/src/lib/components/project/entity-modal-data.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEntityModalData, prepareEntityModalData } from './entity-modal-data';

vi.mock('$app/environment', () => ({ browser: true }));

describe('entity modal request handoff', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}'))
		);
	});
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('starts on click and consumes the same request only once', async () => {
		prepareEntityModalData('task', 'task-1');
		expect(fetch).toHaveBeenCalledTimes(1);
		const first = await fetchEntityModalData('task', 'task-1');
		expect(fetch).toHaveBeenCalledTimes(1);
		const reopened = await fetchEntityModalData('task', 'task-1');
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(reopened).not.toBe(first);
	});

	it('forwards editor cancellation even after response headers arrive', async () => {
		prepareEntityModalData('document', 'doc-1');
		const requestSignal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
		const editor = new AbortController();
		await fetchEntityModalData('document', 'doc-1', editor.signal);
		vi.runOnlyPendingTimers();
		expect(requestSignal.aborted).toBe(false);
		editor.abort();
		expect(requestSignal.aborted).toBe(true);
	});

	it('expires an abandoned opening and fetches fresh data on a later open', async () => {
		prepareEntityModalData('goal', 'goal-1');
		const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
		vi.advanceTimersByTime(10_000);
		expect(signal.aborted).toBe(true);
		await fetchEntityModalData('goal', 'goal-1');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('aborts an obsolete opening and bounds abandoned requests', () => {
		prepareEntityModalData('task', 'same');
		const oldSignal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
		prepareEntityModalData('task', 'same');
		expect(oldSignal.aborted).toBe(true);
		const replacementSignal = vi.mocked(fetch).mock.calls[1]![1]!.signal!;
		for (let i = 0; i < 4; i++) prepareEntityModalData('task', String(i));
		expect(replacementSignal.aborted).toBe(true);
	});

	it('retries failed preparation and leaves unsupported editors alone', async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
		prepareEntityModalData('task', 'failed');
		await Promise.resolve();
		await fetchEntityModalData('task', 'failed');
		expect(fetch).toHaveBeenCalledTimes(2);
		prepareEntityModalData('plan', 'plan-1');
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
