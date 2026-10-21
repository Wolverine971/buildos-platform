// apps/web/src/lib/server/auth-redirects.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	decodeOAuthStateRedirect,
	postLoginRedirectPath,
	redirectToLogin,
	withPostLoginRedirect
} from './auth-redirects';
import { load as loginLoad } from '../../routes/auth/login/+page.server';
import { load as registerLoad } from '../../routes/auth/register/+page.server';
import { load as invitesLoad } from '../../routes/invites/+page.server';

const CHAT_LINK = '/today?chat=12345678-1234-4321-9876-123456789abc';

function signedInVisit(load: typeof loginLoad | typeof registerLoad, path: string) {
	return load({
		url: new URL(path, 'https://build-os.com'),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ session: {}, user: { id: 'u' } })
		}
	} as any);
}

describe('redirectToLogin', () => {
	it.each([
		'/today',
		'/history?chat=12345678-1234-4321-9876-123456789abc',
		'/projects/p?tab=tasks&chat=12345678-1234-4321-9876-123456789abc'
	])('preserves %s', (path) => {
		expect(() => redirectToLogin(new URL(path, 'https://build-os.com'))).toThrow(
			expect.objectContaining({
				status: 303,
				location: `/auth/login?redirect=${encodeURIComponent(path)}`
			})
		);
	});
	it('keeps a resume target when the visitor is already signed in', async () => {
		const target = '/today?chat=12345678-1234-4321-9876-123456789abc';
		await expect(
			loginLoad({
				url: new URL(
					`/auth/login?redirect=${encodeURIComponent(target)}`,
					'https://build-os.com'
				),
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ session: {}, user: { id: 'u' } })
				}
			} as any)
		).rejects.toMatchObject({ status: 303, location: target });
	});
	it('refuses an off-site target for an already signed-in visitor', async () => {
		await expect(
			loginLoad({
				url: new URL('https://build-os.com/auth/login?redirect=https://evil.example'),
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ session: {}, user: { id: 'u' } })
				}
			} as any)
		).rejects.toMatchObject({ status: 303, location: '/today' });
	});

	it.each([
		'/auth/login',
		'/auth/login?redirect=%2Fauth%2Fregister',
		'/auth/register?redirect=/today',
		'/auth/logout',
		'/auth',
		'/%61uth/login',
		'/login',
		'/register?redirect=/auth/login',
		'//evil.example/today',
		'https://build-os.com/today'
	])('sends a signed-in visitor to Today instead of %s', async (target) => {
		await expect(
			signedInVisit(loginLoad, `/auth/login?redirect=${encodeURIComponent(target)}`)
		).rejects.toMatchObject({ status: 303, location: '/today' });
	});
});

describe('sign-up keeps the link for a signed-in visitor', () => {
	it('follows a validated redirect like sign-in does', async () => {
		await expect(
			signedInVisit(registerLoad, `/auth/register?redirect=${encodeURIComponent(CHAT_LINK)}`)
		).rejects.toMatchObject({ status: 303, location: CHAT_LINK });
	});

	it.each(['/auth/login', 'https://evil.example', ''])(
		'falls back to Today for %j',
		async (target) => {
			await expect(
				signedInVisit(registerLoad, `/auth/register?redirect=${encodeURIComponent(target)}`)
			).rejects.toMatchObject({ status: 303, location: '/today' });
		}
	);

	it('shows the form to a signed-out visitor', async () => {
		await expect(
			registerLoad({
				url: new URL('https://build-os.com/auth/register'),
				locals: { safeGetSession: vi.fn().mockResolvedValue({ session: null, user: null }) }
			} as any)
		).resolves.toBeUndefined();
	});
});

describe('invites sign-in', () => {
	it('keeps the path and query', async () => {
		await expect(
			invitesLoad({
				url: new URL('https://build-os.com/invites?message=hi'),
				locals: { safeGetSession: vi.fn().mockResolvedValue({ user: null }) }
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: `/auth/login?redirect=${encodeURIComponent('/invites?message=hi')}`
		});
	});
});

describe('post-login redirect helpers', () => {
	const state = (redirect: unknown) =>
		Buffer.from(JSON.stringify({ nonce: 'n', redirect })).toString('base64url');

	it('decodes the OAuth state link and validates it', () => {
		expect(decodeOAuthStateRedirect(state(CHAT_LINK))).toBe(CHAT_LINK);
		expect(decodeOAuthStateRedirect(state('https://evil.example/x'))).toBeNull();
		expect(decodeOAuthStateRedirect(state(null))).toBeNull();
		expect(decodeOAuthStateRedirect('not-base64-json')).toBeNull();
		expect(decodeOAuthStateRedirect(null)).toBeNull();
	});

	it('refuses sign-in screens as post-login targets', () => {
		expect(postLoginRedirectPath(CHAT_LINK)).toBe(CHAT_LINK);
		expect(postLoginRedirectPath('/auth/login')).toBeNull();
		expect(postLoginRedirectPath('/authors')).toBe('/authors');
	});

	it('appends the validated link to a status path', () => {
		expect(withPostLoginRedirect('/auth/login?error=google_failed', CHAT_LINK)).toBe(
			`/auth/login?error=google_failed&redirect=${encodeURIComponent(CHAT_LINK)}`
		);
		expect(withPostLoginRedirect('/auth/login?error=google_failed', null)).toBe(
			'/auth/login?error=google_failed'
		);
		expect(withPostLoginRedirect('/auth/login?error=x', '/auth/register')).toBe(
			'/auth/login?error=x'
		);
		expect(withPostLoginRedirect('/auth/login?error=x', '//evil.example')).toBe(
			'/auth/login?error=x'
		);
	});
});
