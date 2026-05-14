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
import { createAdminSupabaseClient } from '$lib/supabase/admin';

function pickPublicProjectProps(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const props: Record<string, unknown> = {};
	if (typeof record.commander === 'string') props.commander = record.commander;
	return Object.keys(props).length > 0 ? props : null;
}

export const GET: RequestHandler = async () => {
	try {
		const admin = createAdminSupabaseClient();
		const { data: projects, error } = await admin
			.from('onto_projects')
			.select('id, name, description, props, start_at, end_at')
			.eq('is_public', true)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('name');

		if (error) {
			console.error('[Public Projects API] Error fetching projects:', error);
			return ApiResponse.internalError(error, 'Failed to fetch public projects');
		}

		// Public example projects list churns very rarely (manual is_public flip).
		// Public cache: 1 hour fresh, 1 day SWR — homepage example picker.
		const publicProjects = (projects ?? []).map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description ?? null,
			props: pickPublicProjectProps(project.props),
			start_at: project.start_at ?? null,
			end_at: project.end_at ?? null
		}));

		return ApiResponse.cached({ projects: publicProjects }, undefined, 3600, {
			public: true,
			staleWhileRevalidate: 86400
		});
	} catch (err) {
		console.error('[Public Projects API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};
