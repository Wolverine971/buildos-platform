// apps/web/src/routes/api/projects/[id]/synthesize/apply/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { ProjectSynthesisService } from '$lib/services/projectSynthesis.service';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { operations } = await request.json();
		const actorId = await ensureActorId(supabase, user.id);

		if (!operations || !Array.isArray(operations)) {
			return ApiResponse.badRequest('Invalid operations provided');
		}

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('Forbidden');
		}

		// Initialize services
		const activityLogger = new ActivityLogger(supabase);
		const synthesisService = new ProjectSynthesisService(supabase, activityLogger);

		// Execute operations
		const results = await synthesisService.executeOperations(operations, user.id);

		// Update synthesis status to 'applied' if we have successful operations
		if (results.successful.length > 0) {
			try {
				await supabase
					.from('project_synthesis')
					.update({ status: 'applied', applied_at: new Date().toISOString() })
					.eq('project_id', params.id)
					.eq('user_id', user.id)
					.eq('status', 'pending');
			} catch (statusUpdateError) {
				console.warn('Failed to update synthesis status:', statusUpdateError);
				// Don't fail the entire request for status update issues
			}
		}

		// Log the completion
		await activityLogger.logActivity(user.id, 'project_synthesis_applied', {
			project_id: params.id,
			successful_operations: results.successful.length,
			failed_operations: results.failed.length,
			total_operations: operations.length
		});

		return ApiResponse.success({
			success: true,
			successful: results.successful,
			failed: results.failed,
			summary: {
				total: operations.length,
				successful: results.successful.length,
				failed: results.failed.length
			}
		});
	} catch (error) {
		console.error('Error applying synthesis operations:', error);

		// Try to log the failure
		try {
			const activityLogger = new ActivityLogger(supabase);
			await activityLogger.logActivity(user.id, 'project_synthesis_apply_failed', {
				project_id: params.id,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		} catch (logError) {
			console.warn('Failed to log synthesis apply failure:', logError);
		}

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to apply synthesis operations'
		);
	}
};
