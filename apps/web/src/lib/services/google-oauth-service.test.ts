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

import { GoogleOAuthService } from './google-oauth-service';

function createJsonResponse(body: Record<string, unknown>, ok = true) {
	return {
		ok,
		status: ok ? 200 : 400,
		statusText: ok ? 'OK' : 'Bad Request',
		json: vi.fn().mockResolvedValue(body),
		text: vi.fn().mockResolvedValue(JSON.stringify(body))
	};
}

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
	const updateMock = vi.fn(() => ({ eq: updateEqMock }));
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
		const updatePayload = updateMock.mock.calls[0][0];
		expect(decryptCalendarToken(updatePayload.access_token).value).toBe('new-access-token');
		expect(decryptCalendarToken(updatePayload.refresh_token).value).toBe(
			'existing-refresh-token'
		);
	});
});
