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
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { data: projects, error } = await locals.supabase
			.from('onto_projects')
			.select('id, name, description, props, start_at, end_at')
			.eq('is_public', true)
			.is('deleted_at', null)
			.order('name');

		if (error) {
			console.error('[Public Projects API] Error fetching projects:', error);
			return ApiResponse.internalError(error, 'Failed to fetch public projects');
		}

		return ApiResponse.success({
			projects: projects || []
		});
	} catch (err) {
		console.error('[Public Projects API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};
