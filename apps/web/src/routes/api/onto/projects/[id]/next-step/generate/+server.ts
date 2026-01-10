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
import { logOntologyApiError } from '../../../../shared/error-logging';

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

		// Resolve actor for access verification
		const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

		if (actorResult.error || !actorResult.data) {
			console.error('[NextStep Generate] Failed to get actor:', actorResult.error);
			await logOntologyApiError({
				supabase,
				error: actorResult.error || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/projects/${projectId}/next-step/generate`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_actor_resolve'
			});
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[NextStep Generate] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/next-step/generate`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_next_step_access'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// Verify project exists and user has access
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, description, state_key, type_key')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/projects/${projectId}/next-step/generate`,
					method: 'POST',
					userId: user.id,
					projectId,
					entityType: 'project',
					operation: 'project_next_step_access',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project not found');
		}

		// Generate the next step
		console.log(`🎯 Generating next step for project ${projectId}...`);

		const result = await generateProjectNextStep(supabase, projectId, user.id);

		if (!result.success) {
			console.error('[NextStep Generate] Generation failed:', result.error);
			await logOntologyApiError({
				supabase,
				error: new Error(result.error || 'Next step generation failed'),
				endpoint: `/api/onto/projects/${projectId}/next-step/generate`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_next_step_generate'
			});
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
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/next-step/generate`,
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_next_step_generate'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
