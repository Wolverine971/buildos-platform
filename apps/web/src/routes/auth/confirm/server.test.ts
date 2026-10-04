// apps/web/src/routes/auth/confirm/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const tryLaunch = `/?${new URLSearchParams({
	open: 'agent-chat',
	skill: 'going_viral',
	prompt: 'Use the Going Viral skill.\n\nStarting ask: help me post'
})}`;

function confirmUrl(params: Record<string, string>) {
	return new URL(`https://build-os.com/auth/confirm?${new URLSearchParams(params)}`);
}

async function runConfirm(
	url: URL,
	{
		exchangeError = null,
		verifyError = null,
		session = null
	}: { exchangeError?: unknown; verifyError?: unknown; session?: unknown } = {}
) {
	const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: exchangeError });
	const verifyOtp = vi.fn().mockResolvedValue({ error: verifyError });
	const safeGetSession = vi.fn().mockResolvedValue({ session, user: null });
	try {
		await GET({
			url,
			locals: { supabase: { auth: { exchangeCodeForSession, verifyOtp } }, safeGetSession }
		} as any);
	} catch (error: any) {
		return {
			status: error.status,
			location: error.location as string,
			exchangeCodeForSession,
			verifyOtp
		};
	}
	throw new Error('Expected redirect');
}

describe('GET /auth/confirm', () => {
	it('signs in with the PKCE code and forwards to the Try launch', async () => {
		const result = await runConfirm(confirmUrl({ next: tryLaunch, code: 'auth-code' }));

		expect(result.exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
		expect(result.status).toBe(303);
		expect(result.location).toBe(tryLaunch);
	});

	it.each(['signup', 'email', 'recovery', 'magiclink'])(
		'never verifies a bare token_hash (type=%s): it is not bound to this browser',
		async (type) => {
			const result = await runConfirm(confirmUrl({ next: tryLaunch, token_hash: 'hash', type }));

			expect(result.verifyOtp).not.toHaveBeenCalled();
			expect(result.exchangeCodeForSession).not.toHaveBeenCalled();
			expect(result.location.startsWith('/auth/login?')).toBe(true);
		}
	);

	it('sends a failed exchange to sign-in with the launch kept as the redirect', async () => {
		const result = await runConfirm(confirmUrl({ next: tryLaunch, code: 'used-code' }), {
			exchangeError: { code: 'flow_state_not_found' }
		});
		const location = new URL(result.location, 'https://build-os.com');

		expect(location.pathname).toBe('/auth/login');
		expect(location.searchParams.get('error')).toBe('email_link_failed');
		expect(location.searchParams.get('redirect')).toBe(tryLaunch);
	});

	it('forwards a second click that already has a session', async () => {
		const result = await runConfirm(confirmUrl({ next: tryLaunch, code: 'used-code' }), {
			exchangeError: { code: 'flow_state_not_found' },
			session: { access_token: 'token' }
		});

		expect(result.location).toBe(tryLaunch);
	});

	it.each(['https://evil.example/', '//evil.example/', '/\\evil.example'])(
		'never forwards off-site (%j)',
		async (next) => {
			const result = await runConfirm(confirmUrl({ next, code: 'auth-code' }));

			expect(result.location).toBe('/today');
		}
	);
});
