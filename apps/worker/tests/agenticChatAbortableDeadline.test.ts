// apps/worker/tests/agenticChatAbortableDeadline.test.ts
import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	runWithAbortableDeadline,
	settleWithin
} from '../src/workers/agentic-chat/shared/abortable-deadline';
import { deferred } from './helpers/deferred';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('abortable operation deadline', () => {
	it('does not start work when the parent has already cancelled', async () => {
		const parent = new AbortController();
		const reason = new Error('lease lost');
		parent.abort(reason);
		const run = vi.fn(() => Promise.resolve('should not run'));

		await expect(
			runWithAbortableDeadline({
				parentSignal: parent.signal,
				timeoutMs: 100,
				createTimeoutError: () => new Error('deadline'),
				run
			})
		).rejects.toBe(reason);
		expect(run).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(['resolve', 'reject', 'throw'] as const)(
		'releases the timer and parent listener after an operation ends via %s',
		async (outcome) => {
			const parent = new AbortController();
			const failure = new Error('operation failed');
			let childSignal!: AbortSignal;
			const createTimeoutError = vi.fn(() => new Error('deadline'));
			const pending = runWithAbortableDeadline({
				parentSignal: parent.signal,
				timeoutMs: 100,
				createTimeoutError,
				run(signal) {
					childSignal = signal;
					if (outcome === 'throw') throw failure;
					return outcome === 'reject'
						? Promise.reject(failure)
						: Promise.resolve('saved');
				}
			});

			if (outcome === 'resolve') await expect(pending).resolves.toBe('saved');
			else await expect(pending).rejects.toBe(failure);
			expect(vi.getTimerCount()).toBe(0);
			expect(getEventListeners(parent.signal, 'abort')).toHaveLength(0);
			parent.abort(new Error('later cancellation'));
			await vi.advanceTimersByTimeAsync(100);
			expect(childSignal.aborted).toBe(false);
			expect(createTimeoutError).not.toHaveBeenCalled();
		}
	);

	it.each(['parent cancellation', 'deadline'] as const)(
		'ends work that ignores abort on %s and handles its late rejection',
		async (trigger) => {
			const parent = new AbortController();
			const operation = deferred<string>();
			const reason = new Error(trigger);
			let childSignal!: AbortSignal;
			const pending = runWithAbortableDeadline({
				parentSignal: parent.signal,
				timeoutMs: 100,
				createTimeoutError: () => reason,
				run(signal) {
					childSignal = signal;
					return operation.promise;
				}
			});
			const rejected = expect(pending).rejects.toBe(reason);

			await vi.advanceTimersByTimeAsync(99);
			expect(childSignal.aborted).toBe(false);
			if (trigger === 'deadline') await vi.advanceTimersByTimeAsync(1);
			else parent.abort(reason);
			await rejected;
			expect(childSignal.reason).toBe(reason);
			expect(parent.signal.aborted).toBe(trigger === 'parent cancellation');
			expect(vi.getTimerCount()).toBe(0);
			expect(getEventListeners(parent.signal, 'abort')).toHaveLength(0);

			// An abandoned network request can still fail later. Vitest reports an
			// unhandled rejection if the deadline wrapper stops observing it.
			operation.reject(new Error('late transport failure'));
			await vi.advanceTimersByTimeAsync(0);
		}
	);
});

describe('bounded shutdown settling', () => {
	it.each(['resolve', 'reject'] as const)(
		'counts a promise that will %s as settled and clears the shutdown timer',
		async (outcome) => {
			const operation = deferred<void>();
			const pending = settleWithin(operation.promise, 100);
			await vi.advanceTimersByTimeAsync(99);
			if (outcome === 'resolve') operation.resolve();
			else operation.reject(new Error('operation failed'));
			await expect(pending).resolves.toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		}
	);

	it('stops waiting at the deadline even when the operation never settles', async () => {
		const operation = deferred<void>();
		let result: boolean | undefined;
		const pending = settleWithin(operation.promise, 100).then((settled) => (result = settled));
		await vi.advanceTimersByTimeAsync(99);
		expect(result).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		await expect(pending).resolves.toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		operation.reject(new Error('failure after shutdown stopped waiting'));
		await vi.advanceTimersByTimeAsync(0);
	});
});
