// apps/web/src/routes/api/onto/projects/[id]/next-step/generate/+server.ts
/**
 * POST /api/onto/projects/[id]/next-step/generate
 *
 * Generates a contextual "next step" recommendation for a project
 * by analyzing:
 * - Project name, description, and current state
 * - Tasks (status, priority, due dates)
 * - Goals and their progress
 * - Plans and their status
 * - Recent activity
 * - Milestones and deadlines
 *
 * @see /apps/web/docs/features/project-activity-logging/NEXT_STEP_GENERATION_FLOW.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { generateProjectNextStep } from '$lib/services/next-step-generation.service';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		// Resolve actor for ownership verification
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[NextStep Generate] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Verify project exists and user has access
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, description, state_key, created_by, type_key')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// Generate the next step
		console.log(`🎯 Generating next step for project ${projectId}...`);

		const result = await generateProjectNextStep(supabase, projectId, user.id);

		if (!result.success) {
			console.error('[NextStep Generate] Generation failed:', result.error);
			return ApiResponse.error(result.error || 'Failed to generate next step', 500);
		}

		console.log(`✅ Next step generated for project ${projectId}`);

		return ApiResponse.success({
			next_step_short: result.nextStepShort,
			next_step_long: result.nextStepLong,
			next_step_source: 'ai',
			next_step_updated_at: new Date().toISOString()
		});
	} catch (err) {
		console.error('[NextStep Generate] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
