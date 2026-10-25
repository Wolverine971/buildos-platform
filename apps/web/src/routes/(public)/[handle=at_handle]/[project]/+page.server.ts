// apps/web/src/routes/(public)/[handle=at_handle]/[project]/+page.server.ts
//
// A project's own page: build-os.com/@handle/<project>. One RPC returns the builder
// page as this visitor may see it plus the one Live project (its year of activity,
// published updates, public docs, who builds it). Logged-out responses are cacheable
// for a few minutes, like the builder page; anything personal is not.

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadBuilderProject } from '$lib/server/builder-profile/builder-profile.service';
import { isProjectPageSlug } from '$lib/builder-profile/project-pages';

export const load: PageServerLoad = async ({ params, locals, setHeaders, url }) => {
	const handle = params.handle.slice(1).toLowerCase();
	const slug = params.project.toLowerCase();
	if (!isProjectPageSlug(slug)) throw error(404, 'No project here');
	const { user } = await locals.safeGetSession();

	let result;
	try {
		result = await loadBuilderProject(locals.supabase as any, handle, slug);
	} catch (err) {
		console.error('[BuilderProfile] project page load failed', err);
		throw error(500, 'This page could not load. Try again in a moment.');
	}
	if (!result.found) throw error(404, 'No project here');

	if (user) {
		setHeaders({ 'cache-control': 'private, no-store' });
	} else {
		setHeaders({
			'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
		});
	}

	return { view: result, origin: url.origin };
};
