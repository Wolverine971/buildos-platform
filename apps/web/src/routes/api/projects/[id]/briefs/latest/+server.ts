// apps/web/src/routes/api/projects/[id]/briefs/latest/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// First, verify the project belongs to the user
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (projectError) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (project.user_id !== user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Get the latest brief for this project
		const { data: brief, error: briefError } = await supabase
			.from('project_daily_briefs')
			.select('*')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.order('brief_date', { ascending: false })
			.limit(1)
			.single();

		if (briefError) {
			if (briefError.code === 'PGRST116') {
				// No brief found - this is okay
				return json({ brief: null });
			}
			console.error('Error fetching latest project brief:', briefError);
			return json({ error: briefError.message }, { status: 500 });
		}

		return json({ brief });
	} catch (err) {
		console.error('Error in GET /api/projects/[id]/briefs/latest:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
