// apps/web/src/lib/utils/bind-abort-signal.test.ts
import { describe, expect, it, vi } from 'vitest';
import { bindAbortSignal } from './bind-abort-signal';

describe('bindAbortSignal', () => {
	it('returns the original promise when no signal is provided', () => {
		const promise = Promise.resolve('done');
		expect(bindAbortSignal(promise)).toBe(promise);
	});

	it('rejects immediately with AbortError when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			bindAbortSignal(Promise.resolve('done'), controller.signal)
		).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('rejects only the consumer when the signal aborts', async () => {
		let resolveUnderlying!: (value: string) => void;
		const underlying = new Promise<string>((resolve) => {
			resolveUnderlying = resolve;
		});
		const controller = new AbortController();
		const bound = bindAbortSignal(underlying, controller.signal);

		controller.abort();
		await expect(bound).rejects.toMatchObject({ name: 'AbortError' });

		resolveUnderlying('still completed');
		await expect(underlying).resolves.toBe('still completed');
	});

	it('preserves settlement and removes the abort listener', async () => {
		const controller = new AbortController();
		const removeListener = vi.spyOn(controller.signal, 'removeEventListener');

		await expect(bindAbortSignal(Promise.resolve(42), controller.signal)).resolves.toBe(42);
		expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));

		const failure = new Error('failed');
		await expect(bindAbortSignal(Promise.reject(failure), controller.signal)).rejects.toBe(
			failure
		);
	});
});
