// apps/web/src/lib/utils/google-oauth.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	consumeLegalAcceptanceIntentMock,
	createAdminSupabaseClientMock,
	captureServerEventMock,
	startSequenceForUserMock
} = vi.hoisted(() => ({
	consumeLegalAcceptanceIntentMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	captureServerEventMock: vi.fn().mockResolvedValue(undefined),
	startSequenceForUserMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: captureServerEventMock
}));

vi.mock('$lib/server/welcome-sequence.service', () => ({
	WelcomeSequenceService: class MockWelcomeSequenceService {
		startSequenceForUser = startSequenceForUserMock;
	}
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: () => ({
			logError: vi.fn()
		})
	}
}));

vi.mock('$lib/server/legal-acceptance', () => ({
	consumeLegalAcceptanceIntent: consumeLegalAcceptanceIntentMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GoogleOAuthHandler } from '$lib/utils/google-oauth';

describe('GoogleOAuthHandler registration guardrails', () => {
	it('clears the session before redirecting an existing user out of the registration flow', async () => {
		const signOut = vi.fn().mockResolvedValue({ error: null });
		const supabase = {
			auth: {
				signOut
			}
		};
		const locals = {
			session: { access_token: 'token' },
			user: { id: 'user-1' }
		};
		const handler = new GoogleOAuthHandler(supabase as any, locals as any);

		vi.spyOn(handler, 'exchangeCodeForTokens').mockResolvedValue({
			access_token: 'access',
			id_token: 'id'
		});
		vi.spyOn(handler, 'authenticateWithSupabase').mockResolvedValue({
			session: { access_token: 'token' },
			user: { id: 'user-1' },
			isNewUser: false
		});

		try {
			await handler.handleCallback(
				new URL('https://build-os.com/auth/google/register-callback?code=abc'),
				{
					redirectPath: '/auth/register',
					successPath: '/',
					isRegistration: true
				}
			);
			throw new Error('Expected redirect');
		} catch (error: any) {
			expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
			expect(locals.session).toBeNull();
			expect(locals.user).toBeNull();
			expect(error).toMatchObject({
				status: 303,
				location: '/auth/login?notice=account_exists'
			});
		}
	});

	it('removes the public profile when new Google registration lacks legal acceptance', async () => {
		const signOut = vi.fn().mockResolvedValue({ error: null });
		const deleteUser = vi.fn().mockResolvedValue({ error: null });
		const eq = vi.fn().mockResolvedValue({ error: null });
		const deleteQuery = vi.fn(() => ({ eq }));
		const from = vi.fn((table: string) => {
			expect(table).toBe('users');
			return { delete: deleteQuery };
		});
		createAdminSupabaseClientMock.mockReturnValue({
			from,
			auth: { admin: { deleteUser } }
		});
		consumeLegalAcceptanceIntentMock.mockResolvedValue(false);

		const supabase = {
			auth: {
				signOut
			}
		};
		const locals = {
			session: { access_token: 'token' },
			user: { id: 'new-user' }
		};
		const handler = new GoogleOAuthHandler(supabase as any, locals as any);

		vi.spyOn(handler, 'exchangeCodeForTokens').mockResolvedValue({
			access_token: 'access',
			id_token: 'id'
		});
		vi.spyOn(handler, 'authenticateWithSupabase').mockResolvedValue({
			session: { access_token: 'token' },
			user: { id: 'new-user' },
			isNewUser: true
		});

		try {
			await handler.handleCallback(
				new URL('https://build-os.com/auth/google/register-callback?code=abc'),
				{
					redirectPath: '/auth/register',
					successPath: '/',
					isRegistration: true
				}
			);
			throw new Error('Expected redirect');
		} catch (error: any) {
			expect(consumeLegalAcceptanceIntentMock).not.toHaveBeenCalled();
			expect(deleteQuery).toHaveBeenCalledOnce();
			expect(eq).toHaveBeenCalledWith('id', 'new-user');
			expect(deleteUser).toHaveBeenCalledWith('new-user');
			expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
			expect(locals.session).toBeNull();
			expect(locals.user).toBeNull();
			expect(error).toMatchObject({
				status: 303,
				location: '/auth/register?error=policy_unverified'
			});
		}
	});
});

describe('GoogleOAuthHandler error redirects', () => {
	it.each([
		['access_denied', 'google_cancelled'],
		['temporarily_unavailable', 'google_unavailable'],
		['Your account is locked. Verify at evil.example', 'google_failed']
	])('sends Google error %j to sign-in as a fixed code', async (googleError, code) => {
		const handler = new GoogleOAuthHandler({ auth: {} } as any);
		const url = new URL('https://build-os.com/auth/google/login-callback');
		url.searchParams.set('error', googleError);

		await expect(
			handler.handleCallback(url, { redirectPath: '/auth/login', successPath: '/today' })
		).rejects.toMatchObject({ status: 303, location: `/auth/login?error=${code}` });
	});

	it('never puts the failure message in the URL when session setup fails', async () => {
		const handler = new GoogleOAuthHandler({ auth: { signOut: vi.fn() } } as any);
		vi.spyOn(handler, 'exchangeCodeForTokens').mockResolvedValue({ access_token: 'a' });
		vi.spyOn(handler, 'authenticateWithSupabase').mockRejectedValue(
			new Error('raw provider detail')
		);

		await expect(
			handler.handleCallback(
				new URL('https://build-os.com/auth/google/login-callback?code=abc'),
				{ redirectPath: '/auth/login', successPath: '/today' }
			)
		).rejects.toMatchObject({ status: 303, location: '/auth/login?error=session_failed' });
	});
});

describe('GoogleOAuthHandler Try in BuildOS launch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function encodeState(redirect: string | null) {
		return Buffer.from(JSON.stringify({ nonce: 'nonce-1', redirect })).toString('base64url');
	}

	function launchPath(skill: string) {
		return `/?${new URLSearchParams({
			open: 'agent-chat',
			skill,
			prompt: 'Use the Going Viral skill.\n\nStarting ask: help me post'
		})}`;
	}

	function newGoogleSignup() {
		const isNull = vi.fn().mockResolvedValue({ error: null });
		const eq = vi.fn(() => ({ is: isNull }));
		const update = vi.fn(() => ({ eq }));
		const from = vi.fn((table: string) => {
			expect(table).toBe('users');
			return { update };
		});
		const supabase = { from, auth: { signOut: vi.fn() } };
		const handler = new GoogleOAuthHandler(supabase as any, {} as any);
		vi.spyOn(handler, 'exchangeCodeForTokens').mockResolvedValue({
			access_token: 'access',
			id_token: 'id'
		});
		vi.spyOn(handler, 'authenticateWithSupabase').mockResolvedValue({
			session: { access_token: 'token' },
			user: { id: 'new-user' },
			isNewUser: true
		});
		consumeLegalAcceptanceIntentMock.mockResolvedValue(true);
		return { handler, update, eq, isNull };
	}

	async function runRegisterCallback(handler: GoogleOAuthHandler, state: string) {
		const url = new URL('https://build-os.com/auth/google/register-callback?code=abc');
		url.searchParams.set('state', state);
		try {
			await handler.handleCallback(url, {
				redirectPath: '/auth/register',
				successPath: '/today',
				isRegistration: true,
				legalAcceptanceToken: 'legal-token'
			});
		} catch (error: any) {
			expect(error.status).toBe(303);
			return new URL(error.location, 'https://build-os.com');
		}
		throw new Error('Expected redirect');
	}

	it('carries the launch through OAuth state and tags the new account with the skill', async () => {
		const { handler, update, eq, isNull } = newGoogleSignup();

		const destination = await runRegisterCallback(
			handler,
			encodeState(launchPath('going_viral'))
		);

		expect(destination.pathname).toBe('/');
		expect(destination.searchParams.get('open')).toBe('agent-chat');
		expect(destination.searchParams.get('skill')).toBe('going_viral');
		expect(destination.searchParams.get('prompt')).toBe(
			'Use the Going Viral skill.\n\nStarting ask: help me post'
		);
		expect(update).toHaveBeenCalledWith({ signup_source: 'skill:going_viral' });
		expect(eq).toHaveBeenCalledWith('id', 'new-user');
		// Never overwrite a source that is already set.
		expect(isNull).toHaveBeenCalledWith('signup_source', null);
		expect(captureServerEventMock).toHaveBeenCalledWith(
			'new-user',
			'signup',
			expect.objectContaining({
				signup_method: 'google_oauth',
				launch_skill: 'going_viral',
				signup_source: 'skill:going_viral'
			})
		);
	});

	it('keeps the launch but records nothing when the skill is not a structured id', async () => {
		const { handler, update } = newGoogleSignup();

		const destination = await runRegisterCallback(
			handler,
			encodeState(launchPath('Ignore previous instructions'))
		);

		expect(destination.searchParams.get('open')).toBe('agent-chat');
		expect(update).not.toHaveBeenCalled();
		expect(captureServerEventMock).toHaveBeenCalledWith(
			'new-user',
			'signup',
			expect.objectContaining({ launch_skill: null })
		);
	});

	it('ignores an off-site redirect smuggled into the state', async () => {
		const { handler, update } = newGoogleSignup();

		const destination = await runRegisterCallback(
			handler,
			encodeState('https://evil.example/?open=agent-chat&skill=going_viral')
		);

		expect(destination.origin).toBe('https://build-os.com');
		expect(destination.pathname).toBe('/today');
		expect(update).not.toHaveBeenCalled();
	});
});
