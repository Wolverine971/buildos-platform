// apps/web/src/routes/projects/[id]/organize/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	loadOrganizeSnapshot,
	OrganizeSnapshotError
} from '$lib/server/organize/organize-snapshot';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user)
		redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	if (!isValidUUID(params.id)) error(400, 'Invalid project ID');
	const withId = url.searchParams.get('with');
	if (withId && (!isValidUUID(withId) || withId === params.id))
		error(400, 'Choose a different project.');
	try {
		// Authorize each independently; the second project is never implicitly granted.
		const [primary, secondary] = await Promise.all([
			loadOrganizeSnapshot(locals.supabase, params.id),
			withId ? loadOrganizeSnapshot(locals.supabase, withId) : null
		]);
		return {
			project: primary.project,
			secondaryProject: secondary?.project ?? null,
			relatedProjects: primary.related_projects
		};
	} catch (cause) {
		if (cause instanceof OrganizeSnapshotError) error(cause.status, cause.message);
		error(500, 'Could not load Organize.');
	}
};
