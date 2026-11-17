// apps/web/src/lib/server/google-calendar-token-crypto.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	decryptGoogleCalendarToken as decryptSharedToken,
	encryptGoogleCalendarToken as encryptSharedToken
} from '@buildos/shared-agent-ops/calendar/google-calendar-token-crypto';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	resolveWebGoogleCalendarTokenKey,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';

const { privateEnv } = vi.hoisted(() => ({ privateEnv: {} as Record<string, string> }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

const keyName = 'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1';
const kitKey = 'sveltekit-calendar-key-material-at-least-32-bytes';
const processKey = 'process-calendar-key-material-at-least-32-bytes';
const context: GoogleCalendarTokenContext = {
	userId: 'user-1',
	connectionId: 'connection-1',
	providerAccountId: 'google-sub-1',
	oauthClientKind: 'google_calendar'
};

beforeEach(() => {
	for (const name of Object.keys(privateEnv)) delete privateEnv[name];
	vi.stubEnv(keyName, processKey);
});
afterEach(() => vi.unstubAllEnvs());

// Envelope validation and identity binding belong to the shared package suite.
// Exercise the web adapter's actual responsibility with the real crypto on both
// sides: a round trip through this wrapper alone could use the wrong key twice.
describe('web Calendar encryption key selection', () => {
	it('uses the SvelteKit key for encryption and decryption when both hosts supply a key', () => {
		privateEnv[keyName] = kitKey;
		const webToken = encryptGoogleCalendarToken('refresh-token', context);
		expect(decryptSharedToken(webToken, context, () => kitKey)).toBe('refresh-token');
		expect(() => decryptSharedToken(webToken, context, () => processKey)).toThrow();

		const workerToken = encryptSharedToken('access-token', context, () => kitKey);
		expect(decryptGoogleCalendarToken(workerToken, context)).toBe('access-token');
		expect(process.env[keyName]).toBe(processKey);
	});

	it.each([undefined, '', ' \n\t '])(
		'uses the process key when the SvelteKit value is %j',
		(kitValue) => {
			if (kitValue !== undefined) privateEnv[keyName] = kitValue;
			const webToken = encryptGoogleCalendarToken('refresh-token', context);
			expect(decryptSharedToken(webToken, context, () => processKey)).toBe('refresh-token');
			const workerToken = encryptSharedToken('access-token', context, () => processKey);
			expect(decryptGoogleCalendarToken(workerToken, context)).toBe('access-token');
		}
	);

	it('does not hide an invalid configured SvelteKit key behind the process fallback', () => {
		privateEnv[keyName] = 'too-short';
		expect(() => encryptGoogleCalendarToken('refresh-token', context)).toThrow(
			'at least 32 bytes'
		);
		const workerToken = encryptSharedToken('access-token', context, () => processKey);
		expect(() => decryptGoogleCalendarToken(workerToken, context)).toThrow('at least 32 bytes');
	});

	it('fails closed when neither environment supplies the key', () => {
		vi.stubEnv(keyName, undefined);
		expect(() => encryptGoogleCalendarToken('refresh-token', context)).toThrow(keyName);
		const workerToken = encryptSharedToken('access-token', context, () => processKey);
		expect(() => decryptGoogleCalendarToken(workerToken, context)).toThrow(keyName);
	});

	it('looks up the requested envelope version instead of silently falling back to V1', () => {
		vi.stubEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V2', undefined);
		expect(resolveWebGoogleCalendarTokenKey(2)).toBeUndefined();
		vi.stubEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V2', processKey);
		expect(resolveWebGoogleCalendarTokenKey(2)).toBe(processKey);
		privateEnv.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V2 = kitKey;
		expect(resolveWebGoogleCalendarTokenKey(2)).toBe(kitKey);
	});
});
