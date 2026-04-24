// apps/web/src/lib/server/calendar-token-crypto.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildEncryptedCalendarTokenPatch,
	decodeStoredCalendarTokens,
	decryptCalendarToken,
	encryptCalendarToken,
	isEncryptedCalendarToken
} from './calendar-token-crypto';

const originalEnv = {
	PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY: process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY,
	PRIVATE_SUPABASE_SERVICE_KEY: process.env.PRIVATE_SUPABASE_SERVICE_KEY,
	PRIVATE_GOOGLE_CLIENT_SECRET: process.env.PRIVATE_GOOGLE_CLIENT_SECRET
};

afterEach(() => {
	if (originalEnv.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY === undefined) {
		delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY;
	} else {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY =
			originalEnv.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY;
	}

	if (originalEnv.PRIVATE_SUPABASE_SERVICE_KEY === undefined) {
		delete process.env.PRIVATE_SUPABASE_SERVICE_KEY;
	} else {
		process.env.PRIVATE_SUPABASE_SERVICE_KEY = originalEnv.PRIVATE_SUPABASE_SERVICE_KEY;
	}

	if (originalEnv.PRIVATE_GOOGLE_CLIENT_SECRET === undefined) {
		delete process.env.PRIVATE_GOOGLE_CLIENT_SECRET;
	} else {
		process.env.PRIVATE_GOOGLE_CLIENT_SECRET = originalEnv.PRIVATE_GOOGLE_CLIENT_SECRET;
	}
});

describe('calendar-token-crypto', () => {
	it('encrypts and decrypts calendar tokens with a dedicated key', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-calendar-key';

		const encrypted = encryptCalendarToken('refresh-token-123');

		expect(encrypted).toBeTruthy();
		expect(isEncryptedCalendarToken(encrypted)).toBe(true);
		expect(decryptCalendarToken(encrypted).value).toBe('refresh-token-123');
	});

	it('preserves plaintext values while marking them for upgrade', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-calendar-key';

		const decoded = decodeStoredCalendarTokens({
			access_token: 'plain-access',
			refresh_token: 'plain-refresh'
		});

		expect(decoded.access_token).toBe('plain-access');
		expect(decoded.refresh_token).toBe('plain-refresh');
		expect(decoded.requiresEncryptionUpgrade).toBe(true);
	});

	it('can decrypt tokens encrypted with the fallback server-secret key', () => {
		delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY;
		process.env.PRIVATE_SUPABASE_SERVICE_KEY = 'service-secret';
		process.env.PRIVATE_GOOGLE_CLIENT_SECRET = 'google-secret';

		const encrypted = encryptCalendarToken('access-token-xyz');

		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'new-dedicated-key';

		expect(decryptCalendarToken(encrypted).value).toBe('access-token-xyz');
	});

	it('builds encrypted patches without changing null token fields', () => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-calendar-key';

		const patch = buildEncryptedCalendarTokenPatch({
			access_token: 'plain-access',
			refresh_token: null
		});

		expect(isEncryptedCalendarToken(patch.access_token)).toBe(true);
		expect(patch.refresh_token).toBeNull();
	});
});
