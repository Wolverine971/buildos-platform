// apps/web/src/routes/api/onto/projects/+server.ts
/**
 * GET /api/onto/projects
 * Returns project summaries with basic counts for dashboard views
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Json } from '$lib/database.schema';

type ProjectRow = {
	id: string;
	name: string;
	description: string | null;
	type_key: string;
	state_key: string;
	props: Json;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
};

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const supabase = locals.supabase;

		// Get user's actor ID first
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Ontology API] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: projects, error: projectsError } = await supabase
			.from('onto_projects')
			.select(
				'id, name, description, type_key, state_key, props, facet_context, facet_scale, facet_stage, created_at, updated_at'
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (projectsError) {
			console.error('[Ontology API] Failed to fetch projects:', projectsError);
			return ApiResponse.databaseError(projectsError);
		}

		const summaries = await Promise.all(
			(projects || []).map(async (project: ProjectRow) => {
				const [taskHead, outputHead] = await Promise.all([
					supabase
						.from('onto_tasks')
						.select('id', { head: true, count: 'exact' })
						.eq('project_id', project.id),
					supabase
						.from('onto_outputs')
						.select('id', { head: true, count: 'exact' })
						.eq('project_id', project.id)
				]);

				return {
					...project,
					task_count: taskHead.count ?? 0,
					output_count: outputHead.count ?? 0
				};
			})
		);

		return ApiResponse.success({
			projects: summaries
		});
	} catch (err) {
		console.error('[Ontology API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
