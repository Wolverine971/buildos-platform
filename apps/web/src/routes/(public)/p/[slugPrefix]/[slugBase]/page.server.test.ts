// apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

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
			fetch: fetchMock
		} as any);

		expect(fetchMock).toHaveBeenCalledWith('/api/public/pages/dj-wayne-julian-pod-390');
		expect(result).toEqual({
			page: expect.objectContaining({
				slug_prefix: 'dj-wayne',
				slug_base: 'julian-pod-390',
				url_path: '/p/dj-wayne/julian-pod-390'
			})
		});
	});
});
