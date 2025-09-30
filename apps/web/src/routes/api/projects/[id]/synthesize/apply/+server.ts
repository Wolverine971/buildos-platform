// apps/web/src/routes/api/projects/[id]/synthesize/apply/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProjectSynthesisService } from '$lib/services/projectSynthesis.service';
import { ActivityLogger } from '$lib/utils/activityLogger';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { operations } = await request.json();

		if (!operations || !Array.isArray(operations)) {
			return json({ error: 'Invalid operations provided' }, { status: 400 });
		}

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (project.user_id !== user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
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

		return json({
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

		return json(
			{
				error: 'Failed to apply synthesis operations',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
