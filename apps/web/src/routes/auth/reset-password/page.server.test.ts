// apps/web/src/routes/auth/reset-password/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/security-event-logger', () => ({
	getSecurityEventLogOptions: () => ({}),
	getSecurityRequestContext: () => ({}),
	logSecurityEvent: vi.fn()
}));

import { actions, load } from './+page.server';

describe('reset password', () => {
	it('shows fixed copy for a link error instead of the URL text', async () => {
		const url = new URL('https://build-os.com/auth/reset-password');
		url.searchParams.set('error_description', 'Your account is locked. Verify at evil.co');

		const result = await load({
			url,
			request: new Request(url),
			platform: undefined,
			locals: { safeGetSession: vi.fn(), supabase: {} }
		} as any);

		expect(result).toEqual({
			hasRecoverySession: false,
			recoveryError:
				'This password reset link is invalid or expired. Please request a new one.'
		});
	});

	it('confirms the update on the page instead of losing it in a login bounce', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const form = new FormData();
		form.set('password', 'new-password');
		form.set('confirmPassword', 'new-password');

		const result = await actions.default!({
			request: new Request('https://build-os.com/auth/reset-password', {
				method: 'POST',
				body: form
			}),
			platform: undefined,
			locals: {
				supabase: { auth: { updateUser } },
				safeGetSession: vi.fn(async () => ({ session: { user: { id: 'user-1' } } }))
			}
		} as any);

		expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' });
		expect(result).toEqual({ passwordUpdated: true });
	});
});
