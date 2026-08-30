// apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/lifecycle.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	isLegacyDetachedLifecycleEnabled,
	registerLegacyTurnPromise,
	shouldCloseLegacySseSink
} from './lifecycle.server';

describe('legacy HTTP stream lifecycle', () => {
	it('keeps detached lifecycle registration off unless explicitly enabled', () => {
		expect(isLegacyDetachedLifecycleEnabled(undefined)).toBe(false);
		expect(isLegacyDetachedLifecycleEnabled('false')).toBe(false);
		expect(isLegacyDetachedLifecycleEnabled('1')).toBe(true);
		expect(isLegacyDetachedLifecycleEnabled('TRUE')).toBe(true);
	});

	it('registers a turn promise only when the feature and Vercel request context are available', () => {
		const register = vi.fn();
		const promise = Promise.resolve();

		expect(
			registerLegacyTurnPromise(promise, {
				enabled: false,
				isAvailable: () => true,
				register
			})
		).toBe(false);
		expect(
			registerLegacyTurnPromise(promise, {
				enabled: true,
				isAvailable: () => false,
				register
			})
		).toBe(false);
		expect(register).not.toHaveBeenCalled();

		expect(
			registerLegacyTurnPromise(promise, {
				enabled: true,
				isAvailable: () => true,
				register
			})
		).toBe(true);
		expect(register).toHaveBeenCalledOnce();
		expect(register).toHaveBeenCalledWith(promise);
	});

	it('registers through the installed Vercel request-context implementation', () => {
		const symbol = Symbol.for('@vercel/request-context');
		const previousProvider = Reflect.get(globalThis, symbol);
		const waitUntil = vi.fn();
		Reflect.set(globalThis, symbol, {
			get: () => ({ waitUntil })
		});
		const promise = Promise.resolve();

		try {
			expect(registerLegacyTurnPromise(promise, { enabled: true })).toBe(true);
			expect(waitUntil).toHaveBeenCalledOnce();
			expect(waitUntil).toHaveBeenCalledWith(promise);
		} finally {
			if (previousProvider === undefined) {
				Reflect.deleteProperty(globalThis, symbol);
			} else {
				Reflect.set(globalThis, symbol, previousProvider);
			}
		}
	});

	it('preserves the legacy detached stream behavior until waitUntil registration succeeds', () => {
		expect(
			shouldCloseLegacySseSink({
				streamDetached: false,
				detachedLifecycleRegistered: false
			})
		).toBe(true);
		expect(
			shouldCloseLegacySseSink({
				streamDetached: true,
				detachedLifecycleRegistered: false
			})
		).toBe(false);
		expect(
			shouldCloseLegacySseSink({
				streamDetached: true,
				detachedLifecycleRegistered: true
			})
		).toBe(true);
	});
});
