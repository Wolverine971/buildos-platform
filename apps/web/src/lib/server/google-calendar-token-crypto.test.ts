// apps/web/src/lib/server/google-calendar-token-crypto.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	getActiveGoogleCalendarTokenKeyVersion,
	isEncryptedGoogleCalendarToken,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';

const originalKey = process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;

const context: GoogleCalendarTokenContext = {
	userId: 'user-1',
	connectionId: 'connection-1',
	providerAccountId: 'google-sub-1',
	oauthClientKind: 'google_calendar'
};

afterEach(() => {
	if (originalKey === undefined) {
		delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;
	} else {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 = originalKey;
	}
});

describe('google-calendar-token-crypto', () => {
	it('round-trips a token through the versioned connection envelope', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 =
			'test-google-calendar-connection-key-material';

		const encrypted = encryptGoogleCalendarToken('refresh-token-1', context);

		expect(getActiveGoogleCalendarTokenKeyVersion()).toBe(1);
		expect(isEncryptedGoogleCalendarToken(encrypted)).toBe(true);
		expect(encrypted).not.toContain('refresh-token-1');
		expect(decryptGoogleCalendarToken(encrypted, context)).toBe('refresh-token-1');
	});

	it('binds ciphertext to the exact connection and provider identity', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 =
			'test-google-calendar-connection-key-material';
		const encrypted = encryptGoogleCalendarToken('access-token-1', context);

		expect(() =>
			decryptGoogleCalendarToken(encrypted, {
				...context,
				connectionId: 'connection-2'
			})
		).toThrow('Unable to decrypt');
		expect(() =>
			decryptGoogleCalendarToken(encrypted, {
				...context,
				oauthClientKind: 'google_shared_login'
			})
		).toThrow('Unable to decrypt');
	});

	it('fails closed without a dedicated versioned key', () => {
		delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;

		expect(() => encryptGoogleCalendarToken('access-token-1', context)).toThrow(
			'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1'
		);
	});

	it('rejects an undersized dedicated key', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 = 'too-short';

		expect(() => encryptGoogleCalendarToken('access-token-1', context)).toThrow(
			'at least 32 bytes'
		);
	});

	it('does not accept the legacy Calendar envelope', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 =
			'test-google-calendar-connection-key-material';

		expect(isEncryptedGoogleCalendarToken('enc:v1.legacy')).toBe(false);
		expect(() => decryptGoogleCalendarToken('enc:v1.legacy', context)).toThrow(
			'expected encrypted format'
		);
	});
});
