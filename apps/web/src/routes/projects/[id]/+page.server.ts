// src/routes/projects/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({
	params,
	locals: { supabase, safeGetSession },
	url,
	depends
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	let projectId = params.id;

	// Check if the parameter might be a slug instead of an ID
	// UUIDs have a specific format, if it doesn't match, treat it as a slug
	const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		projectId
	);

	if (!isUUID) {
		// Try to find the project by slug
		const { data: projectBySlug, error: slugError } = await supabase
			.from('projects')
			.select('id')
			.eq('slug', projectId)
			.eq('user_id', userId)
			.single();

		if (projectBySlug && !slugError) {
			// Redirect to the new ID-based URL, preserving query params
			const redirectUrl = `/projects/${projectBySlug.id}${url.search}`;
			throw redirect(307, redirectUrl);
		}
		// If no project found by slug, continue with normal 404 handling
	}
	const activeTab = url.searchParams.get('tab') || 'overview';

	// Define minimal dependencies
	depends(`projects:${projectId}`);

	try {
		// Only fetch minimal project data needed for initial render
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('*')
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (projectError || !project) {
			throw error(404, 'Project not found');
		}

		// Fetch project calendar if it exists (use maybeSingle to handle no results gracefully)
		const { data: projectCalendar, error: calendarError } = await supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', project.id)
			.maybeSingle();

		// Check if this is the user's first project (lightweight query)
		const { count: projectCount } = await supabase
			.from('projects')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId);

		const isFirstProject = projectCount ? projectCount <= 1 : false;

		return {
			// Minimal project data for immediate render
			project,
			projectCalendar: projectCalendar || null,
			user: {
				id: userId
			},
			isFirstProject,
			activeTab
		};
	} catch (err) {
		console.error('Error in project page server load:', err);
		throw error(500, 'Failed to load project data');
	}
};
