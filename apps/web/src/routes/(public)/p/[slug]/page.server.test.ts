// apps/web/src/routes/(public)/p/[slug]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

function makeLocals(user: { id: string; email: string | null } | null = null) {
	return {
		safeGetSession: vi.fn(async () => (user ? { user, session: {} } : {}))
	};
}

describe('legacy public page route', () => {
	it('redirects combined slugs to the nested canonical path', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				params: { slug: 'dj-wayne-julian-pod-390' },
				locals: makeLocals(),
				fetch: async () =>
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
			} as any)
		).rejects.toMatchObject({
			status: 301,
			location: '/p/dj-wayne/julian-pod-390'
		});
	});

	it('returns a legacy single-slug page without redirect when no prefix/base stored', async () => {
		const { load } = await import('./+page.server');
		const result = await load({
			params: { slug: 'legacy-page' },
			locals: makeLocals({ id: 'user-1', email: 'user@example.com' }),
			fetch: async () =>
				new Response(
					JSON.stringify({
						success: true,
						data: {
							page: {
								slug: 'legacy-page',
								slug_prefix: null,
								slug_base: null,
								url_path: '/p/legacy-page'
							}
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		} as any);

		expect(result).toMatchObject({
			page: expect.objectContaining({ slug: 'legacy-page' }),
			currentUser: { id: 'user-1', email: 'user@example.com' }
		});
	});

	it('falls through to the author index when the slug is a username-only URL', async () => {
		const { load } = await import('./+page.server');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: false, error: 'Public page not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: true,
						data: {
							author: { slug_prefix: 'dj-wayne', name: 'DJ Wayne', page_count: 1 },
							pages: [
								{
									id: 'page-1',
									slug: 'dj-wayne-julian-pod-390',
									slug_prefix: 'dj-wayne',
									slug_base: 'julian-pod-390',
									url_path: '/p/dj-wayne/julian-pod-390',
									title: 'Julian Pod 390'
								}
							]
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);

		const result = await load({
			params: { slug: 'dj-wayne' },
			locals: makeLocals(),
			fetch: fetchMock
		} as any);

		expect(result).toMatchObject({
			authorIndex: expect.objectContaining({
				author: expect.objectContaining({ slug_prefix: 'dj-wayne' }),
				pages: expect.arrayContaining([
					expect.objectContaining({ slug_prefix: 'dj-wayne' })
				])
			}),
			currentUser: null
		});
	});
});
