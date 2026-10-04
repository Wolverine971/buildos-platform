// apps/web/src/routes/oauth/token/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	exchange: vi.fn(),
	logRouteError: vi.fn(async () => {})
}));

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }));
vi.mock('$lib/server/security-event-logger', () => ({ getSecurityEventLogOptions: () => ({}) }));
vi.mock('$lib/server/route-error', () => ({ logRouteError: mocks.logRouteError }));
vi.mock('$lib/server/agent-call/oauth-rate-limit', () => ({
	checkOAuthRateLimit: () => ({ allowed: true }),
	OAUTH_RATE_LIMITS: { token: {} }
}));
vi.mock('$lib/server/agent-call/oauth-connector.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/agent-call/oauth-connector.service')>()),
	exchangeOAuthAuthorizationCode: mocks.exchange,
	exchangeOAuthRefreshToken: mocks.exchange
}));

import { OAuthConnectorError } from '$lib/server/agent-call/oauth-connector.service';
import { POST } from './+server';

function exchange(grantType = 'authorization_code') {
	const event = {
		request: new Request('https://build-os.com/oauth/token', {
			method: 'POST',
			body: new URLSearchParams({ grant_type: grantType, code: 'fixture-secret' })
		}),
		getClientAddress: () => '127.0.0.1'
	} as Parameters<typeof POST>[0];
	return POST(event);
}

describe('POST /oauth/token', () => {
	beforeEach(() => vi.clearAllMocks());

	it.each(['authorization_code', 'refresh_token'])(
		'returns server_error and logs safe diagnostics for a failed %s exchange',
		async (grantType) => {
			mocks.exchange.mockRejectedValueOnce(
				new OAuthConnectorError(
					'BuildOS could not complete the token exchange. Try again later.',
					500,
					'server_error',
					undefined,
					false,
					'42725'
				)
			);
			const response = await exchange(grantType);
			expect(response.status).toBe(500);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('www-authenticate')).toBeNull();
			expect(await response.json()).toEqual({
				error: 'server_error',
				error_description: 'BuildOS could not complete the token exchange. Try again later.'
			});
			expect(mocks.logRouteError).toHaveBeenCalledWith(expect.anything(), expect.any(Error), {
				operation: 'oauth.token',
				severity: 'error',
				status: 500,
				metadata: { oauth_error: 'server_error', database_code: '42725' }
			});
			const [, loggedError, loggedOptions] = mocks.logRouteError.mock.calls[0] as unknown as [
				unknown,
				Error,
				unknown
			];
			expect(loggedError.message).toBe('OAuth token exchange failed');
			expect(JSON.stringify(loggedOptions)).not.toContain('fixture-secret');
		}
	);

	it('retains actionable invalid_grant for rejected credentials', async () => {
		mocks.exchange.mockRejectedValueOnce(
			new OAuthConnectorError(
				'Credential exchange failed; authorize again',
				400,
				'invalid_grant'
			)
		);
		const response = await exchange();
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('invalid_grant');
		expect(mocks.logRouteError).not.toHaveBeenCalled();
	});

	it('returns access and refresh tokens with no-store after successful consent', async () => {
		mocks.exchange.mockResolvedValueOnce({
			accessToken: 'fixture-access',
			refreshToken: 'fixture-refresh',
			scope: 'buildos.read offline_access',
			expiresIn: 3600
		});
		const response = await exchange();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			access_token: 'fixture-access',
			refresh_token: 'fixture-refresh',
			token_type: 'Bearer',
			scope: 'buildos.read offline_access',
			expires_in: 3600
		});
	});
});
