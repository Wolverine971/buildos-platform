// apps/web/src/lib/server/security-event-logger.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import type { SecurityEventInput } from './security-event-logger';
import {
	getSecurityEventLogOptions,
	logSecurityEvent,
	logSecurityEventAsync,
	logSecurityEventBlocking,
	sanitizeSecurityMetadata
} from './security-event-logger';

const baseEvent: SecurityEventInput = {
	eventType: 'auth.login.succeeded',
	category: 'auth',
	outcome: 'success',
	severity: 'info',
	actorType: 'user',
	actorUserId: '00000000-0000-0000-0000-000000000001',
	metadata: {
		flow: 'password'
	}
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

function useAdminInsert(insertResult: Promise<{ error: null }> | { error: null }) {
	const insert = vi.fn(() => insertResult);
	const from = vi.fn(() => ({ insert }));
	createAdminSupabaseClientMock.mockReturnValue({ from });
	return { from, insert };
}

describe('security event logger delivery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns immediately for default background delivery', async () => {
		const pendingInsert = deferred<{ error: null }>();
		const { insert } = useAdminInsert(pendingInsert.promise);

		const result = await Promise.race([
			logSecurityEvent(baseEvent).then(() => 'returned'),
			new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20))
		]);

		expect(result).toBe('returned');
		expect(insert).toHaveBeenCalledTimes(1);

		pendingInsert.resolve({ error: null });
		await pendingInsert.promise;
	});

	it('waits for explicit blocking delivery', async () => {
		const pendingInsert = deferred<{ error: null }>();
		useAdminInsert(pendingInsert.promise);
		let resolved = false;

		const promise = logSecurityEventBlocking(baseEvent).then(() => {
			resolved = true;
		});

		await Promise.resolve();
		expect(resolved).toBe(false);

		pendingInsert.resolve({ error: null });
		await promise;
		expect(resolved).toBe(true);
	});

	it('bounds high-signal event waits instead of waiting indefinitely', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const pendingInsert = deferred<{ error: null }>();
		useAdminInsert(pendingInsert.promise);

		const result = await Promise.race([
			logSecurityEvent(
				{
					...baseEvent,
					eventType: 'auth.oauth.state_mismatch',
					outcome: 'blocked',
					severity: 'medium'
				},
				{ timeoutMs: 5 }
			).then(() => 'returned'),
			new Promise((resolve) => setTimeout(() => resolve('timed-out'), 50))
		]);

		expect(result).toBe('returned');
		expect(warnSpy).toHaveBeenCalledWith(
			'[SecurityEvent] Security event write exceeded bounded wait',
			expect.objectContaining({
				eventType: 'auth.oauth.state_mismatch',
				timeoutMs: 5
			})
		);

		pendingInsert.resolve({ error: null });
		await pendingInsert.promise;
		warnSpy.mockRestore();
	});

	it('registers background writes with waitUntil when available', async () => {
		const waitUntil = vi.fn();
		useAdminInsert(Promise.resolve({ error: null }));

		await logSecurityEvent(baseEvent, { waitUntil });

		expect(waitUntil).toHaveBeenCalledTimes(1);
		await waitUntil.mock.calls[0][0];
	});

	it('extracts waitUntil from SvelteKit platform shapes', () => {
		const waitUntil = vi.fn();
		const options = getSecurityEventLogOptions({ context: { waitUntil } });
		const promise = Promise.resolve();

		options.waitUntil?.(promise);

		expect(waitUntil).toHaveBeenCalledWith(promise);
	});

	it('supports explicit fire-and-forget logging helper', () => {
		const { insert } = useAdminInsert(Promise.resolve({ error: null }));

		logSecurityEventAsync(baseEvent);

		expect(insert).toHaveBeenCalledTimes(1);
	});
});

describe('security metadata sanitization', () => {
	it('redacts denied keys while keeping safe audit values', () => {
		expect(
			sanitizeSecurityMetadata({
				password: 'secret',
				accessToken: 'token',
				emailDomain: 'example.com',
				contentLength: 42
			})
		).toEqual({
			password: '[redacted]',
			accessToken: '[redacted]',
			emailDomain: 'example.com',
			contentLength: 42
		});
	});
});
