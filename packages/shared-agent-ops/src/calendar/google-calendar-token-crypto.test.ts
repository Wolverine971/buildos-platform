// packages/shared-agent-ops/src/calendar/google-calendar-token-crypto.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	getActiveGoogleCalendarTokenKeyVersion,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';

const key = 'shared-calendar-test-key-material-at-least-32-bytes';
const context: GoogleCalendarTokenContext = {
	userId: 'user-1',
	connectionId: 'connection-1',
	providerAccountId: 'google-sub-1',
	oauthClientKind: 'google_calendar'
};

afterEach(() => vi.unstubAllEnvs());

describe('shared Google Calendar token encryption', () => {
	it('runs in a plain Node worker using the same versioned envelope', () => {
		vi.stubEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1', key);
		const ciphertext = encryptGoogleCalendarToken('refresh-token', context);
		expect(getActiveGoogleCalendarTokenKeyVersion()).toBe(1);
		expect(ciphertext).toMatch(/^enc:calendar:v1\./);
		expect(ciphertext).not.toContain('refresh-token');
		expect(decryptGoogleCalendarToken(ciphertext, context)).toBe('refresh-token');
	});

	it('accepts a host-specific key resolver without mutating process environment', () => {
		vi.stubEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1', 'wrong-key');
		const resolveKey = vi.fn(() => key);
		const ciphertext = encryptGoogleCalendarToken('access-token', context, resolveKey);
		expect(decryptGoogleCalendarToken(ciphertext, context, resolveKey)).toBe('access-token');
		expect(resolveKey).toHaveBeenCalledWith(1);
		expect(process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1).toBe('wrong-key');
	});

	it.each([
		{ userId: 'other-user' },
		{ connectionId: 'other-connection' },
		{ providerAccountId: 'other-account' },
		{ oauthClientKind: 'google_shared_login' as const }
	])('rejects ciphertext rebound to another identity: %j', (changedIdentity) => {
		const ciphertext = encryptGoogleCalendarToken('token', context, () => key);
		expect(() =>
			decryptGoogleCalendarToken(ciphertext, { ...context, ...changedIdentity }, () => key)
		).toThrow('Unable to decrypt');
	});

	it.each([undefined, '', 'short'])('fails closed for an unavailable/short key', (secret) => {
		expect(() => encryptGoogleCalendarToken('token', context, () => secret)).toThrow();
	});

	it('rejects legacy/plaintext/double-encrypted values and incomplete context', () => {
		for (const token of ['enc:v1.legacy', 'plaintext', 'enc:calendar:v0.YQ']) {
			expect(() => decryptGoogleCalendarToken(token, context, () => key)).toThrow();
		}
		const ciphertext = encryptGoogleCalendarToken('token', context, () => key);
		expect(() => encryptGoogleCalendarToken(ciphertext, context, () => key)).toThrow(
			'already encrypted'
		);
		expect(() =>
			encryptGoogleCalendarToken('token', { ...context, connectionId: '' }, () => key)
		).toThrow('Complete Calendar connection');
	});
});
