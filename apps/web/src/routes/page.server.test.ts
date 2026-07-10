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

	it('redirects authenticated visitors to the dashboard and preserves query state', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({
						session: {},
						user: { id: 'user-1' }
					}))
				},
				url: new URL('https://build-os.com/?message=Welcome')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?message=Welcome'
		});
	});
});
