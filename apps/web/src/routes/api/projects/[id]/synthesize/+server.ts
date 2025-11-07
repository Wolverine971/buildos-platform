// apps/web/src/routes/api/projects/[id]/synthesize/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
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
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { regenerate = false, includeDeleted = false, options } = await request.json();

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden('Forbidden');
		}

		// Initialize services
		const activityLogger = new ActivityLogger(supabase);
		const synthesisService = new ProjectSynthesisService(supabase, activityLogger);

		// Generate synthesis with options
		const synthesisResult = await synthesisService.synthesizeProject(params.id, user.id, {
			regenerate,
			includeDeleted,
			synthesisOptions: options
		});

		// Return in a format that matches what the frontend expects
		return ApiResponse.success({
			synthesis: {
				id: synthesisResult.id,
				synthesis_content: {
					operations: synthesisResult.operations,
					insights: synthesisResult.insights,
					comparison: synthesisResult.comparison,
					summary: synthesisResult.summary
				},
				created_at: new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Error in project synthesis:', error);
		return ApiResponse.internalError(error, 'Failed to synthesize project');
	}
};

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden('Forbidden');
		}

		// Get existing synthesis - use limit(1) to always get an array
		const { data: syntheses, error: synthesisError } = await supabase
			.from('project_synthesis')
			.select('*')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.in('status', ['completed', 'success', 'draft'])
			.order('created_at', { ascending: false })
			.limit(1);

		if (synthesisError) {
			console.error('Error fetching synthesis:', synthesisError);
			return ApiResponse.internalError(synthesisError, 'Failed to fetch synthesis');
		}

		// Return the first synthesis if exists, otherwise null
		return ApiResponse.success({
			synthesis: syntheses && syntheses.length > 0 ? syntheses[0] : null
		});
	} catch (error) {
		console.error('Error fetching project synthesis:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// Update existing synthesis (save edited operations)
export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { synthesis_id, synthesis_content, status = 'draft' } = await request.json();

		// If no synthesis_id provided, get the most recent one
		let targetSynthesisId = synthesis_id;

		if (!targetSynthesisId) {
			// Get the most recent synthesis for backward compatibility
			const { data: recentSynthesis, error: fetchError } = await supabase
				.from('project_synthesis')
				.select('id')
				.eq('project_id', params.id)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			if (fetchError || !recentSynthesis) {
				return ApiResponse.notFound('Synthesis');
			}

			targetSynthesisId = recentSynthesis.id;
		}

		// Verify project ownership and synthesis exists
		const { data: synthesis, error: synthError } = await supabase
			.from('project_synthesis')
			.select('id, project_id, user_id')
			.eq('id', targetSynthesisId)
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.single();

		if (synthError || !synthesis) {
			return ApiResponse.notFound('Synthesis');
		}

		// Update the specific synthesis
		const { data: updatedSynthesis, error: updateError } = await supabase
			.from('project_synthesis')
			.update({
				synthesis_content,
				status,
				updated_at: new Date().toISOString()
			})
			.eq('id', targetSynthesisId)
			.eq('user_id', user.id)
			.select()
			.single();

		if (updateError) {
			console.error('Error updating synthesis:', updateError);
			return ApiResponse.internalError(updateError, 'Failed to update synthesis');
		}

		return ApiResponse.success({
			synthesis: updatedSynthesis
		});
	} catch (error) {
		console.error('Error updating synthesis:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// Delete synthesis
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden('Forbidden');
		}

		// Get the most recent synthesis first
		const { data: syntheses, error: fetchError } = await supabase
			.from('project_synthesis')
			.select('id')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.limit(1);

		if (fetchError) {
			console.error('Error fetching synthesis:', fetchError);
			return ApiResponse.internalError(fetchError, 'Failed to fetch synthesis');
		}

		if (!syntheses || syntheses.length === 0) {
			return ApiResponse.notFound('Synthesis');
		}

		const synthesisToDelete = syntheses[0];

		// Delete only the most recent synthesis
		const { error: deleteError } = await supabase
			.from('project_synthesis')
			.delete()
			.eq('id', synthesisToDelete.id)
			.eq('user_id', user.id);

		if (deleteError) {
			console.error('Error deleting synthesis:', deleteError);
			return ApiResponse.internalError(deleteError, 'Failed to delete synthesis');
		}

		return ApiResponse.success({
			message: 'Synthesis deleted successfully',
			deletedId: synthesisToDelete.id
		});
	} catch (error) {
		console.error('Error deleting synthesis:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
