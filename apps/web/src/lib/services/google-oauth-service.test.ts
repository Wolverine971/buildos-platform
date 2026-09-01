// apps/web/src/lib/services/google-oauth-service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptCalendarToken } from '$lib/server/calendar-token-crypto';

vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logAPIError: vi.fn(),
			logDatabaseError: vi.fn()
		}))
	}
}));

import {
	GoogleOAuthConnectionError,
	GoogleOAuthService,
	isGoogleOAuthReconnectError,
	safeGoogleOAuthErrorDiagnostic
} from './google-oauth-service';

function createJsonResponse(body: Record<string, unknown>, ok = true) {
	return {
		ok,
		status: ok ? 200 : 400,
		statusText: ok ? 'OK' : 'Bad Request',
		json: vi.fn().mockResolvedValue(body),
		text: vi.fn().mockResolvedValue(JSON.stringify(body))
	};
}

type CalendarTokenUpdatePayload = {
	access_token: string;
	refresh_token: string;
};

function createTokenSupabase(existingToken: { id: string; refresh_token: string } | null) {
	const selectBuilder: any = {
		select: vi.fn(() => selectBuilder),
		eq: vi.fn(() => selectBuilder),
		single: vi.fn().mockResolvedValue({
			data: existingToken,
			error: existingToken ? null : { code: 'PGRST116' }
		})
	};
	const updateEqMock = vi.fn().mockResolvedValue({ error: null });
	const updateMock = vi.fn((_payload: CalendarTokenUpdatePayload) => ({ eq: updateEqMock }));
	const insertMock = vi.fn().mockResolvedValue({ error: null });

	return {
		supabase: {
			from: vi.fn(() => ({
				...selectBuilder,
				update: updateMock,
				insert: insertMock
			}))
		},
		insertMock,
		updateMock
	};
}

describe('GoogleOAuthService calendar token exchange', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	const originalEnv = {
		PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY: process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY,
		PRIVATE_GOOGLE_CLIENT_ID: process.env.PRIVATE_GOOGLE_CLIENT_ID,
		PRIVATE_GOOGLE_CLIENT_SECRET: process.env.PRIVATE_GOOGLE_CLIENT_SECRET
	};

	beforeEach(() => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'calendar-token-test-key';
		process.env.PRIVATE_GOOGLE_CLIENT_ID = 'google-client-id';
		process.env.PRIVATE_GOOGLE_CLIENT_SECRET = 'google-client-secret';
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		if (originalEnv.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY === undefined) {
			delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY;
		} else {
			process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY =
				originalEnv.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY;
		}
		if (originalEnv.PRIVATE_GOOGLE_CLIENT_ID === undefined) {
			delete process.env.PRIVATE_GOOGLE_CLIENT_ID;
		} else {
			process.env.PRIVATE_GOOGLE_CLIENT_ID = originalEnv.PRIVATE_GOOGLE_CLIENT_ID;
		}
		if (originalEnv.PRIVATE_GOOGLE_CLIENT_SECRET === undefined) {
			delete process.env.PRIVATE_GOOGLE_CLIENT_SECRET;
		} else {
			process.env.PRIVATE_GOOGLE_CLIENT_SECRET = originalEnv.PRIVATE_GOOGLE_CLIENT_SECRET;
		}
	});

	it('signs short-lived Calendar OAuth state and rejects forged, unsigned, or expired state', () => {
		const service = new GoogleOAuthService({} as any, {
			clientId: 'google-client-id',
			clientSecret: 'state-signing-secret'
		});
		const now = Date.now();
		const authUrl = new URL(
			service.generateCalendarAuthUrl(
				'https://app.example.com/auth/google/calendar-callback',
				'user-1',
				{ redirectPath: '/profile?tab=calendar' }
			)
		);
		const state = authUrl.searchParams.get('state');

		expect(service.verifyCalendarState(state, now)).toMatchObject({
			userId: 'user-1',
			redirectPath: '/profile?tab=calendar'
		});
		expect(service.verifyCalendarState(`${state}tampered`, now)).toBeNull();
		expect(service.verifyCalendarState('dXNlci0x', now)).toBeNull();
		expect(service.verifyCalendarState(state, now + 11 * 60_000)).toBeNull();
		expect(authUrl.searchParams.get('include_granted_scopes')).toBe('false');
	});

	it('rejects a Calendar token response containing an unrelated high-risk scope', async () => {
		fetchMock.mockResolvedValueOnce(
			createJsonResponse({
				access_token: 'over-scoped-token',
				refresh_token: 'refresh-token',
				expires_in: 3600,
				token_type: 'Bearer',
				scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive'
			})
		);
		const { supabase, insertMock, updateMock } = createTokenSupabase(null);
		const service = new GoogleOAuthService(supabase as any);

		await expect(
			service.exchangeCodeForTokens(
				'code-1',
				'https://app.example.com/auth/google/calendar-callback',
				'user-1'
			)
		).resolves.toEqual({
			success: false,
			error: 'Google returned an unexpected OAuth scope set. Please reconnect Google Calendar.'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(insertMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('does not save a first-time calendar connection without a refresh token', async () => {
		fetchMock
			.mockResolvedValueOnce(
				createJsonResponse({
					access_token: 'new-access-token',
					expires_in: 3600,
					token_type: 'Bearer',
					scope: 'https://www.googleapis.com/auth/calendar'
				})
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					id: 'google-user-1',
					email: 'user@example.com'
				})
			);
		const { supabase, insertMock, updateMock } = createTokenSupabase(null);
		const service = new GoogleOAuthService(supabase as any);

		const result = await service.exchangeCodeForTokens(
			'code-1',
			'https://app.example.com/auth/google/calendar-callback',
			'user-1',
			'user@example.com'
		);

		expect(result).toEqual({
			success: false,
			error: 'No refresh token received from Google. Please reconnect Google Calendar.'
		});
		expect(insertMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('preserves an existing refresh token when Google omits it on reconnect', async () => {
		fetchMock
			.mockResolvedValueOnce(
				createJsonResponse({
					access_token: 'new-access-token',
					expires_in: 3600,
					token_type: 'Bearer',
					scope: 'https://www.googleapis.com/auth/calendar'
				})
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					id: 'google-user-1',
					email: 'user@example.com'
				})
			);
		const { supabase, updateMock } = createTokenSupabase({
			id: 'token-row-1',
			refresh_token: 'existing-refresh-token'
		});
		const service = new GoogleOAuthService(supabase as any);

		const result = await service.exchangeCodeForTokens(
			'code-1',
			'https://app.example.com/auth/google/calendar-callback',
			'user-1',
			'user@example.com'
		);

		expect(result).toEqual({ success: true });
		expect(updateMock).toHaveBeenCalledTimes(1);
		const [updatePayload] = updateMock.mock.calls[0]!;
		expect(decryptCalendarToken(updatePayload.access_token).value).toBe('new-access-token');
		expect(decryptCalendarToken(updatePayload.refresh_token).value).toBe(
			'existing-refresh-token'
		);
	});

	it('removes only legacy webhook state when disconnecting a legacy calendar grant', async () => {
		const operations: Array<{
			table: string;
			action: string;
			filters: Array<[string, unknown]>;
		}> = [];
		const supabase = {
			from: vi.fn((table: string) => {
				const operation = {
					table,
					action: 'select',
					filters: [] as Array<[string, unknown]>
				};
				operations.push(operation);
				const builder: any = {
					delete: () => {
						operation.action = 'delete';
						return builder;
					},
					eq: (column: string, value: unknown) => {
						operation.filters.push([column, value]);
						return builder;
					},
					is: (column: string, value: unknown) => {
						operation.filters.push([column, value]);
						return builder;
					},
					then: (resolve: (value: { error: null }) => unknown) =>
						Promise.resolve({ error: null }).then(resolve)
				};
				return builder;
			})
		};
		const service = new GoogleOAuthService(supabase as any);

		await service.disconnectCalendar('user-1');

		expect(operations).toContainEqual({
			table: 'calendar_webhook_channels',
			action: 'delete',
			filters: [
				['user_id', 'user-1'],
				['calendar_source_id', null]
			]
		});
		expect(operations).toContainEqual({
			table: 'user_calendar_tokens',
			action: 'delete',
			filters: [['user_id', 'user-1']]
		});
	});

	it('recognizes reconnect errors across service boundaries', () => {
		expect(
			isGoogleOAuthReconnectError(
				new GoogleOAuthConnectionError('Reconnect Google Calendar', true)
			)
		).toBe(true);
		expect(
			isGoogleOAuthReconnectError({
				name: 'GoogleOAuthConnectionError',
				requiresReconnection: true
			})
		).toBe(true);
		expect(isGoogleOAuthReconnectError(new Error('Temporary provider timeout'))).toBe(false);
	});

	it('reduces provider failures to credential-safe diagnostics', () => {
		const credentialSentinel = 'CLIENT_SECRET_MUST_NEVER_REACH_LOGS';
		const diagnostic = safeGoogleOAuthErrorDiagnostic({
			name: 'GaxiosError',
			message: `invalid_grant ${credentialSentinel}`,
			stack: credentialSentinel,
			code: 'ETIMEDOUT',
			response: {
				status: 400,
				data: {
					error: 'invalid_grant',
					error_description: credentialSentinel
				},
				config: {
					data: `client_secret=${credentialSentinel}`
				}
			}
		});

		expect(diagnostic).toEqual({
			name: 'GaxiosError',
			code: 'ETIMEDOUT',
			status: 400,
			providerCode: 'invalid_grant'
		});
		expect(JSON.stringify(diagnostic)).not.toContain(credentialSentinel);

		const hostileDiagnostic = safeGoogleOAuthErrorDiagnostic({
			name: credentialSentinel,
			code: credentialSentinel,
			status: 401,
			response: { data: { error: credentialSentinel } }
		});
		expect(hostileDiagnostic).toEqual({ name: 'ProviderError', status: 401 });
		expect(JSON.stringify(hostileDiagnostic)).not.toContain(credentialSentinel);
	});
});
