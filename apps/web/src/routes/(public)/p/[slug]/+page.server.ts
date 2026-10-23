// apps/web/src/routes/(public)/p/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { builderHandleForAuthorSlug } from '$lib/server/builder-profile/builder-profile.service';

export const load: PageServerLoad = async ({ params, fetch, locals }) => {
	const slug = params.slug?.trim().toLowerCase();
	if (!slug) {
		throw error(404, 'Public page not found');
	}

	const session = await locals.safeGetSession();
	const currentUser = session?.user
		? { id: session.user.id, email: session.user.email ?? null }
		: null;

	const response = await fetch(`/api/public/pages/${slug}`);
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const redirectSlug = payload?.details?.redirect_slug;
		if (typeof redirectSlug === 'string' && redirectSlug.trim()) {
			throw redirect(301, `/p/${redirectSlug}`);
		}

		// A published builder page replaces the author index.
		let builderHandle: string | null = null;
		try {
			builderHandle = await builderHandleForAuthorSlug(createAdminSupabaseClient() as any, slug);
		} catch {
			builderHandle = null;
		}
		if (builderHandle) throw redirect(302, `/@${builderHandle}`);

		// Fall through to the author index. The slug may be a username-only
		// URL (e.g. /p/david) pointing at an author's public-pages collection.
		const authorResponse = await fetch(`/api/public/authors/${slug}/pages`);
		if (authorResponse.ok) {
			const authorPayload = await authorResponse.json().catch(() => null);
			const author = authorPayload?.data?.author;
			const authorPages = authorPayload?.data?.pages;
			if (author && Array.isArray(authorPages) && authorPages.length > 0) {
				return { authorIndex: { author, pages: authorPages }, currentUser };
			}
		}

		throw error(404, payload?.error || 'Public page not found');
	}

	const page = payload?.data?.page;
	if (!page) {
		throw error(404, 'Public page not found');
	}

	if (
		typeof page.slug_prefix === 'string' &&
		page.slug_prefix.trim() &&
		typeof page.slug_base === 'string' &&
		page.slug_base.trim()
	) {
		throw redirect(301, `/p/${page.slug_prefix}/${page.slug_base}`);
	}

	return { page, currentUser };
};
