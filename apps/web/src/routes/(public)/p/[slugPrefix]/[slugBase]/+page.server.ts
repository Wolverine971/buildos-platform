// apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch, locals }) => {
	const slugPrefix = params.slugPrefix?.trim().toLowerCase();
	const slugBase = params.slugBase?.trim().toLowerCase();
	if (!slugPrefix || !slugBase) {
		throw error(404, 'Public page not found');
	}

	const session = await locals.safeGetSession();
	const currentUser = session?.user
		? { id: session.user.id, email: session.user.email ?? null }
		: null;

	const response = await fetch(`/api/public/pages/${slugPrefix}-${slugBase}`);
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

	return { page, currentUser };
};
