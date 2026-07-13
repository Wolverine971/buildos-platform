// apps/web/src/routes/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

describe('public home route', () => {
	it('serves the landing page to anonymous visitors', async () => {
		const { load } = await import('./+page.server');
		const safeGetSession = vi.fn(async () => ({ session: null, user: null }));

		const result = await load({
			locals: { safeGetSession },
			url: new URL('https://build-os.com/')
		} as any);

		expect(result).toEqual({});
		expect(safeGetSession).toHaveBeenCalledOnce();
	});

	it('redirects a completed visitor to /today and preserves query state', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({
						session: {},
						user: { id: 'user-1', onboarding_completed_at: '2026-01-01T00:00:00.000Z' }
					}))
				},
				url: new URL('https://build-os.com/?message=Welcome')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/today?message=Welcome'
		});
	});

	it('routes an un-onboarded visitor into /onboarding and preserves query state', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({
						session: {},
						user: { id: 'user-1', onboarding_completed_at: null }
					}))
				},
				url: new URL('https://build-os.com/?message=Welcome')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/onboarding?message=Welcome'
		});
	});
});
