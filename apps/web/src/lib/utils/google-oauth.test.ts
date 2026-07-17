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
				location:
					'/auth/login?message=Account%20already%20exists.%20Please%20sign%20in%20instead.'
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
				location:
					'/auth/register?error=We%20could%20not%20verify%20your%20policy%20acceptance.%20Please%20try%20again.'
			});
		}
	});
});
