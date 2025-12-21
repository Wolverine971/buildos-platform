/**
 * Public Projects List API
 *
 * Returns a list of all public example projects (is_public = true).
 * Used by the homepage to randomly select an example project to display.
 *
 * GET /api/public/projects
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     projects: [
 *       { id, name, description, props, start_at, end_at }
 *     ]
 *   }
 * }
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async () => {
	try {
		// Use admin client to bypass RLS and fetch public projects
		const supabase = createAdminSupabaseClient();

		const { data: projects, error } = await supabase
			.from('onto_projects')
			.select('id, name, description, props, start_at, end_at')
			.eq('is_public', true)
			.order('name');

		if (error) {
			console.error('[Public Projects API] Error fetching projects:', error);
			return json(
				{ success: false, error: 'Failed to fetch public projects' },
				{ status: 500 }
			);
		}

		return json({
			success: true,
			data: {
				projects: projects || []
			}
		});
	} catch (err) {
		console.error('[Public Projects API] Unexpected error:', err);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
