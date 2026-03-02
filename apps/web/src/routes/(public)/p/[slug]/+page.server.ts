// apps/web/src/routes/(public)/p/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const slug = params.slug?.trim().toLowerCase();
	if (!slug) {
		throw error(404, 'Public page not found');
	}

	const response = await fetch(`/api/public/pages/${slug}`);
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const redirectSlug = payload?.details?.redirect_slug;
		if (typeof redirectSlug === 'string' && redirectSlug.trim()) {
			throw redirect(301, `/p/${redirectSlug}`);
		}
		throw error(404, payload?.error || 'Public page not found');
	}

	const page = payload?.data?.page;
	if (!page) {
		throw error(404, 'Public page not found');
	}

	return { page };
};
