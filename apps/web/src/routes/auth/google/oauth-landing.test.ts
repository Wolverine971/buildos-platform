// apps/web/src/routes/auth/google/oauth-landing.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleCallbackMock } = vi.hoisted(() => ({
	handleCallbackMock: vi.fn()
}));

vi.mock('$lib/utils/google-oauth', () => ({
	GoogleOAuthHandler: class MockGoogleOAuthHandler {
		handleCallback = handleCallbackMock;
	}
}));

vi.mock('$lib/server/security-event-logger', () => ({
	getSecurityEventLogOptions: () => ({}),
	getSecurityRequestContext: () => ({}),
	logSecurityEvent: vi.fn().mockResolvedValue(undefined)
}));

import { load as loginCallback } from './login-callback/+page.server';
import { load as registerCallback } from './register-callback/+page.server';

function callbackEvent(path: string) {
	const cookies = new Map([
		['buildos_oauth_state', 'state-1'],
		['buildos_legal_acceptance', 'legal-token']
	]);
	return {
		url: new URL(`https://build-os.com${path}?code=abc&state=state-1`),
		request: new Request(`https://build-os.com${path}`),
		platform: undefined,
		locals: { supabase: {} },
		cookies: {
			get: (name: string) => cookies.get(name),
			delete: vi.fn()
		}
	} as any;
}

describe('Google OAuth sign-in landing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		handleCallbackMock.mockResolvedValue(undefined);
	});

	// Home is /today for every sign-in path. The OAuth state's own redirect (a Try in BuildOS
	// launch, an invite) still wins inside the handler; successPath is only the fallback.
	it('lands Google sign-in on Today when no redirect rides the state', async () => {
		await loginCallback(callbackEvent('/auth/google/login-callback'));

		expect(handleCallbackMock).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({ redirectPath: '/auth/login', successPath: '/today' })
		);
	});

	it('lands Google sign-up on Today too (Today routes a new account into onboarding)', async () => {
		await registerCallback(callbackEvent('/auth/google/register-callback'));

		expect(handleCallbackMock).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({
				redirectPath: '/auth/register',
				successPath: '/today',
				isRegistration: true,
				legalAcceptanceToken: 'legal-token'
			})
		);
	});
});
