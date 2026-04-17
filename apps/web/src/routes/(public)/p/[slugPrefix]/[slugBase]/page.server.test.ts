// apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

function makeLocals(user: { id: string; email: string | null } | null = null) {
	return {
		safeGetSession: vi.fn(async () => (user ? { user, session: {} } : {}))
	};
}

describe('nested public page route', () => {
	it('loads the page by combining prefix and base into the stored slug', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						data: {
							page: {
								slug: 'dj-wayne-julian-pod-390',
								slug_prefix: 'dj-wayne',
								slug_base: 'julian-pod-390',
								url_path: '/p/dj-wayne/julian-pod-390',
								title: 'Julian Pod 390'
							}
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);

		const { load } = await import('./+page.server');
		const result = await load({
			params: { slugPrefix: 'dj-wayne', slugBase: 'julian-pod-390' },
			locals: makeLocals(),
			fetch: fetchMock
		} as any);

		expect(fetchMock).toHaveBeenCalledWith('/api/public/pages/dj-wayne-julian-pod-390');
		expect(result).toMatchObject({
			page: expect.objectContaining({
				slug_prefix: 'dj-wayne',
				slug_base: 'julian-pod-390',
				url_path: '/p/dj-wayne/julian-pod-390'
			}),
			currentUser: null
		});
	});

	it('returns currentUser when the viewer is authenticated', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						data: {
							page: {
								slug: 'dj-wayne-julian-pod-390',
								slug_prefix: 'dj-wayne',
								slug_base: 'julian-pod-390',
								url_path: '/p/dj-wayne/julian-pod-390'
							}
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);

		const { load } = await import('./+page.server');
		const result = await load({
			params: { slugPrefix: 'dj-wayne', slugBase: 'julian-pod-390' },
			locals: makeLocals({ id: 'user-42', email: 'dj@example.com' }),
			fetch: fetchMock
		} as any);

		expect(result).toMatchObject({
			currentUser: { id: 'user-42', email: 'dj@example.com' }
		});
	});
});
