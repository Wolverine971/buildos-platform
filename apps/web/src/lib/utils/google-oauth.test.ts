// apps/web/src/lib/utils/google-oauth.test.ts
import { describe, expect, it, vi } from 'vitest';

const { consumeLegalAcceptanceIntentMock, createAdminSupabaseClientMock } = vi.hoisted(() => ({
	consumeLegalAcceptanceIntentMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn()
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
