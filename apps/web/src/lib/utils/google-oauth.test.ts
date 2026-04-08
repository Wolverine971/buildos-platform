// apps/web/src/lib/utils/google-oauth.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleOAuthHandler } from '$lib/utils/google-oauth';

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: () => ({
			logError: vi.fn()
		})
	}
}));

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
});
