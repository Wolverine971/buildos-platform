// apps/web/src/routes/projects/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { safeGetSession } = locals;

	// Add proper dependency tracking
	depends('app:auth');

	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/');
	}

	// Return minimal data for immediate page render
	// All project data will be fetched client-side
	return {
		user
	};
};

export const actions: Actions = {
	createProject: async ({ locals, request }) => {
		const { safeGetSession, supabase } = locals;
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const today = new Date().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		// Single optimized database operation
		// Generate a unique slug upfront to avoid the update step
		const projectId = crypto.randomUUID();

		const { data: project, error: createError } = await supabase
			.from('projects')
			.insert({
				id: projectId, // Set ID explicitly
				user_id: user.id,
				name: 'New Project',
				description: `Created on ${today}`,
				status: 'active',
				slug: projectId, // Set slug to ID immediately
				start_date: null,
				end_date: null,
				tags: [],
				context: null,
				executive_summary: null
			})
			.select('id, slug')
			.single();

		if (createError) {
			console.error('Error creating project:', createError);
			return fail(500, { error: 'Failed to create project' });
		}

		if (!project?.id) {
			return fail(500, { error: 'Project creation failed - no ID returned' });
		}

		// Immediate redirect - no second database call needed
		throw redirect(303, `/projects/${project.id}`);
	}
};
