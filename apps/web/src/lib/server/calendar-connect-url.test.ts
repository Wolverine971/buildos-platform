// apps/web/src/lib/server/calendar-connect-url.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateCalendarAuthUrl } = vi.hoisted(() => ({
	generateCalendarAuthUrl: vi.fn(() => 'https://accounts.google.com/legacy')
}));

vi.mock('$lib/services/google-oauth-service', () => ({
	GoogleOAuthService: vi.fn().mockImplementation(function () {
		return { generateCalendarAuthUrl };
	})
}));

import { createCalendarConnectUrl } from './calendar-connect-url';

const supabase = {} as never;

function connectionService() {
	const createAuthorizationUrl = vi.fn(async () => 'https://accounts.google.com/dedicated');
	return { service: { createAuthorizationUrl }, createAuthorizationUrl };
}

describe('createCalendarConnectUrl', () => {
	beforeEach(() => {
		generateCalendarAuthUrl.mockClear();
	});

	it('starts every new grant on the dedicated client under the all-users switch', async () => {
		const { service, createAuthorizationUrl } = connectionService();
		const url = await createCalendarConnectUrl({
			supabase,
			userId: 'new-user',
			origin: 'https://build-os.com',
			redirectPath: '/profile?tab=calendar&calendar=1',
			env: {
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS: 'true'
			},
			createConnectionService: () => service
		});

		expect(url).toBe('https://accounts.google.com/dedicated');
		expect(createAuthorizationUrl).toHaveBeenCalledWith({
			userId: 'new-user',
			redirectUri: 'https://build-os.com/auth/google/calendar-callback',
			redirectPath: '/profile?tab=calendar&calendar=1',
			connectionId: null
		});
		expect(generateCalendarAuthUrl).not.toHaveBeenCalled();
	});

	it('keeps excluded legacy users on the shared sign-in client', async () => {
		const { service, createAuthorizationUrl } = connectionService();
		const url = await createCalendarConnectUrl({
			supabase,
			userId: 'legacy-user',
			origin: 'https://build-os.com',
			redirectPath: '/profile?tab=calendar&calendar=1',
			env: {
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS: 'legacy-user'
			},
			createConnectionService: () => service
		});

		expect(url).toBe('https://accounts.google.com/legacy');
		expect(generateCalendarAuthUrl).toHaveBeenCalledWith(
			'https://build-os.com/auth/google/calendar-callback',
			'legacy-user',
			{ redirectPath: '/profile?tab=calendar&calendar=1' }
		);
		expect(createAuthorizationUrl).not.toHaveBeenCalled();
	});

	it('uses the legacy flow while multi-account Calendar is off', async () => {
		const { service, createAuthorizationUrl } = connectionService();
		await createCalendarConnectUrl({
			supabase,
			userId: 'new-user',
			origin: 'https://build-os.com',
			redirectPath: '/profile?tab=calendar',
			env: {},
			createConnectionService: () => service
		});

		expect(generateCalendarAuthUrl).toHaveBeenCalledOnce();
		expect(createAuthorizationUrl).not.toHaveBeenCalled();
	});
});
