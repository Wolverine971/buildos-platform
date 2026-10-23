// apps/web/src/routes/(public)/[handle=at_handle]/+page.server.ts
//
// A builder page: build-os.com/@handle. One RPC returns the page as this visitor may
// see it (logged out, signed in, someone the owner works with, or the owner's draft).
// Logged-out responses are cacheable for a few minutes; anything personal is not.

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadBuilderProfile } from '$lib/server/builder-profile/builder-profile.service';

export const load: PageServerLoad = async ({ params, locals, setHeaders, url }) => {
	const handle = params.handle.slice(1).toLowerCase();
	const { user } = await locals.safeGetSession();

	let result;
	try {
		result = await loadBuilderProfile(locals.supabase as any, handle);
	} catch (err) {
		console.error('[BuilderProfile] load failed', err);
		throw error(500, 'This page could not load. Try again in a moment.');
	}
	if (!result.found) throw error(404, 'No page here');

	if (user) {
		setHeaders({ 'cache-control': 'private, no-store' });
	} else {
		setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' });
	}

	return {
		view: result,
		handle,
		origin: url.origin,
		signedIn: Boolean(user)
	};
};
