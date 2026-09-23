// apps/web/src/lib/server/background.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const { waitUntilMock } = vi.hoisted(() => ({ waitUntilMock: vi.fn() }));
vi.mock('@vercel/functions', () => ({ waitUntil: waitUntilMock }));

import { runAfterResponse } from './background';

describe('runAfterResponse', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		waitUntilMock.mockReset();
	});

	it('hands the work to waitUntil so Vercel keeps the invocation alive', async () => {
		runAfterResponse(Promise.resolve('done'), 'test work');

		expect(waitUntilMock).toHaveBeenCalledTimes(1);
		await expect(waitUntilMock.mock.calls[0]?.[0]).resolves.toBe('done');
	});

	it('logs a rejection instead of leaking an unhandled rejection', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		runAfterResponse(Promise.reject(new Error('boom')), 'failing work');
		await waitUntilMock.mock.calls[0]?.[0];

		expect(errorSpy).toHaveBeenCalledWith(
			'[background] failing work failed:',
			expect.objectContaining({ message: 'boom' })
		);
	});

	it('still runs the work when waitUntil is unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		waitUntilMock.mockImplementation(() => {
			throw new TypeError('no request context');
		});
		const work = vi.fn(async () => 'ran');

		expect(() => runAfterResponse(work(), 'local work')).not.toThrow();
		expect(work).toHaveBeenCalled();
	});
});
