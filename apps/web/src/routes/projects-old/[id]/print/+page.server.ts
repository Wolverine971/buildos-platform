// apps/web/src/routes/projects/[id]/print/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const projectId = params.id;

	// Fetch project with context
	const { data: project, error: projectError } = await supabase
		.from('projects')
		.select('id, name, slug, status, start_date, end_date, context, created_at, updated_at')
		.eq('id', projectId)
		.eq('user_id', user.id)
		.single();

	if (projectError || !project) {
		throw error(404, 'Project not found');
	}

	return {
		project
	};
};
