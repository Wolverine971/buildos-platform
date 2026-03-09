// apps/web/src/routes/(public)/p/[slug]/page.server.test.ts
import { describe, expect, it } from 'vitest';

describe('legacy public page route', () => {
	it('redirects combined slugs to the nested canonical path', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				params: { slug: 'dj-wayne-julian-pod-390' },
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
});
