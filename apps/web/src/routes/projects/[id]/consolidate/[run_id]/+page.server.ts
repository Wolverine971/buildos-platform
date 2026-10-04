// apps/web/src/routes/projects/[id]/consolidate/[run_id]/+page.server.ts
// One consolidation run of this project and its sub-projects.
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	ConsolidationError,
	loadConsolidationView
} from '$lib/server/consolidation/consolidation.service';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user)
		redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	if (!isValidUUID(params.id) || !isValidUUID(params.run_id)) error(400, 'Invalid link');
	let view;
	try {
		view = await loadConsolidationView(
			createAdminSupabaseClient(),
			locals.supabase,
			user.id,
			params.run_id
		);
	} catch (err) {
		if (err instanceof ConsolidationError) error(err.status, err.message);
		throw err;
	}
	if (view.run.root_project_id !== params.id)
		redirect(303, `/projects/${view.run.root_project_id}/consolidate/${params.run_id}`);
	const { data: project } = await locals.supabase
		.from('onto_projects')
		.select('name')
		.eq('id', params.id)
		.maybeSingle();
	return { view, projectName: project?.name ?? 'Project' };
};
