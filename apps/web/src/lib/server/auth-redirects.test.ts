import { describe, expect, it, vi } from 'vitest';
import { redirectToLogin } from './auth-redirects';
import { load as loginLoad } from '../../routes/auth/login/+page.server';

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
});
