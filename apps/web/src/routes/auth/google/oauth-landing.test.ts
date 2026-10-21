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
			expect.objectContaining({
				redirectPath: '/auth/login',
				successPath: '/today',
				isRegistration: false,
				legalAcceptanceToken: 'legal-token'
			})
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

	describe('an expired or replayed attempt (state mismatch)', () => {
		const LINK = '/today?chat=12345678-1234-4321-9876-123456789abc';
		const stateFor = (redirect: string) =>
			Buffer.from(JSON.stringify({ nonce: 'n', redirect })).toString('base64url');
		function mismatchEvent(path: string, state: string | null) {
			const event = callbackEvent(path);
			event.url = new URL(`https://build-os.com${path}?code=abc`);
			if (state) event.url.searchParams.set('state', state);
			return event;
		}

		it.each([
			['/auth/google/login-callback', loginCallback, '/auth/login'],
			['/auth/google/register-callback', registerCallback, '/auth/register']
		] as const)('%s keeps the validated link for the retry', async (path, load, screen) => {
			await expect(load(mismatchEvent(path, stateFor(LINK)))).rejects.toMatchObject({
				status: 303,
				location: `${screen}?error=state_mismatch&redirect=${encodeURIComponent(LINK)}`
			});
			expect(handleCallbackMock).not.toHaveBeenCalled();
		});

		it.each([
			['no state', null],
			['an off-site link', stateFor('https://evil.example/x')],
			['garbage', 'not-a-state']
		])('omits the link when the state has %s', async (_label, state) => {
			await expect(
				loginCallback(mismatchEvent('/auth/google/login-callback', state))
			).rejects.toMatchObject({ status: 303, location: '/auth/login?error=state_mismatch' });
		});
	});
});
