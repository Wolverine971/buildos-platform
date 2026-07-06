// apps/worker/tests/vapidConfig.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_VAPID_SUBJECT, validateVapidDetails } from '../src/config/vapid';

describe('VAPID configuration validation', () => {
	it('accepts URL-safe Base64 keys with expected decoded lengths', () => {
		const publicKey = Buffer.alloc(65).toString('base64url');
		const privateKey = Buffer.alloc(32).toString('base64url');

		expect(validateVapidDetails(publicKey, privateKey, DEFAULT_VAPID_SUBJECT)).toEqual([]);
	});

	it('rejects partial VAPID configuration', () => {
		expect(validateVapidDetails('public-key', undefined, DEFAULT_VAPID_SUBJECT)).toEqual([
			'Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together for push notifications'
		]);
	});

	it('rejects placeholder keys before web-push can throw during module import', () => {
		const errors = validateVapidDetails('invalid=', 'invalid', DEFAULT_VAPID_SUBJECT);

		expect(errors).toContain('VAPID_PUBLIC_KEY must be URL safe Base 64 without "=" padding');
		expect(errors).toContain('VAPID_PRIVATE_KEY must decode to 32 bytes');
	});
});
